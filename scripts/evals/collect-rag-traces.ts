import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import mongoose from "mongoose"
import type { UploadApiErrorResponse, UploadApiResponse } from "cloudinary"
import cloudinary from "@/lib/cloudinary"
import dbConnect from "@/database/mongoose"
import Book from "@/database/models/book.model"
import Chunk from "@/database/models/chunk.model"
import RagCache from "@/database/models/rag-cache.model"
import User from "@/database/models/user.model"
import { processDocument } from "@/lib/document-processing"
import {
    ragQualityMode,
    streamAgenticRag,
    type RagDiagnostics,
    type SourceCitation,
} from "@/lib/agentic-rag"
import { deleteDocumentVectors } from "@/lib/vector-store"
import { activePhoenixContext, withRagTrace } from "@/lib/phoenix-observability"
import { registerNodeObservability } from "../../instrumentation.node"

interface GoldenCase {
    id: string
    question: string
    reference: string
    expectedTerms: string[]
    answerable: boolean
    minimumCitations: number
}

interface GoldenDataset {
    version: string
    name: string
    document: {
        title: string
        author: string
        fileName: string
        content: string
    }
    cases: GoldenCase[]
}

interface CollectedCase extends GoldenCase {
    response: string
    retrievedContexts: string[]
    citations: SourceCitation[]
    deterministicPass: boolean
    deterministicFailures: string[]
    diagnostics?: Omit<RagDiagnostics, "contexts">
    applicationTraceId: string
    phoenixTraceId?: string
    phoenixSpanId?: string
}

const workspaceRoot = process.cwd()
const datasetPath = path.join(workspaceRoot, "scripts", "evals", "golden_dataset.json")
const tracesPath = path.join(workspaceRoot, "scripts", "evals", "traces.json")

const wrapPdfText = (text: string, maximumLineLength = 78): string[] => {
    const lines: string[] = []
    let line = ""

    for (const word of text.trim().split(/\s+/)) {
        const next = line ? `${line} ${word}` : word
        if (line && next.length > maximumLineLength) {
            lines.push(line)
            line = word
        } else {
            line = next
        }
    }
    if (line) lines.push(line)
    return lines
}

const escapePdfText = (value: string): string =>
    value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")

const createPdf = (text: string): Buffer => {
    const lines = wrapPdfText(text)
    const stream = [
        "BT",
        "/F1 12 Tf",
        "54 720 Td",
        ...lines.map((line, index) => `${index === 0 ? "" : "0 -16 Td "}(${escapePdfText(line)}) Tj`),
        "ET",
    ].join("\n")
    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    ]
    let pdf = "%PDF-1.4\n"
    const offsets = [0]
    objects.forEach((object, index) => {
        offsets.push(Buffer.byteLength(pdf))
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
    })
    const xrefOffset = Buffer.byteLength(pdf)
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    offsets.slice(1).forEach((offset) => {
        pdf += `${String(offset).padStart(10, "0")} 00000 n \n`
    })
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
    return Buffer.from(pdf)
}

const uploadPdf = (buffer: Buffer, publicId: string): Promise<UploadApiResponse> =>
    new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({
            resource_type: "raw",
            type: "authenticated",
            public_id: publicId,
            overwrite: true,
        }, (error?: UploadApiErrorResponse, result?: UploadApiResponse) => {
            if (error) reject(error)
            else if (result) resolve(result)
            else reject(new Error("Cloudinary upload returned no result."))
        }).end(buffer)
    })

const validateEnvironment = (): void => {
    const required = [
        "MONGODB_URI",
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET",
        "OPENAI_API_KEY",
        "PINECONE_API_KEY",
        "PINECONE_INDEX",
    ]
    const missing = required.filter((name) => !process.env[name]?.trim())
    if (missing.length > 0) {
        throw new Error(`Missing evaluation environment variables: ${missing.join(", ")}`)
    }
}

const deterministicChecks = (
    testCase: GoldenCase,
    response: string,
    citations: SourceCitation[],
    contexts: string[],
): string[] => {
    const failures: string[] = []
    const normalizedResponse = response.toLowerCase()
    const refused = /do not contain enough|does not contain enough|insufficient information|cannot determine/i
        .test(response)

    for (const term of testCase.expectedTerms) {
        if (!normalizedResponse.includes(term.toLowerCase())) failures.push(`missing expected term: ${term}`)
    }
    if (testCase.answerable && refused) failures.push("answerable case was refused")
    if (!testCase.answerable && !refused) failures.push("unanswerable case was not refused")
    if (citations.length < testCase.minimumCitations) {
        failures.push(`expected at least ${testCase.minimumCitations} citation(s), received ${citations.length}`)
    }
    if (testCase.answerable && contexts.length === 0) failures.push("no supporting context reached generation")
    return failures
}

const loadDataset = async (): Promise<GoldenDataset> =>
    JSON.parse(await readFile(datasetPath, "utf8")) as GoldenDataset

const main = async (): Promise<void> => {
    validateEnvironment()
    registerNodeObservability()

    const dataset = await loadDataset()
    const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="))?.split("=")[1]
    const configuredLimit = Number(limitArgument || process.env.EVAL_CASE_LIMIT || dataset.cases.length)
    const cases = dataset.cases.slice(0, Number.isFinite(configuredLimit) ? configuredLimit : dataset.cases.length)
    if (cases.length === 0) throw new Error("The golden dataset contains no selected evaluation cases.")

    const runId = `rag-eval-${Date.now()}`
    const userId = `eval-user-${randomUUID()}`
    const publicId = `ai-book-evals/${runId}`
    const pdf = createPdf(dataset.document.content)
    let documentId = ""

    try {
        await dbConnect()
        const upload = await uploadPdf(pdf, publicId)
        const book = await Book.create({
            title: dataset.document.title,
            author: dataset.document.author,
            pdfUrl: upload.secure_url,
            storagePublicId: publicId,
            userId,
            documentName: dataset.document.fileName,
            fileSize: pdf.length,
            processingStatus: "queued",
        })
        documentId = String(book._id)

        await processDocument({
            pdfUrl: book.pdfUrl,
            storagePublicId: publicId,
            documentId,
            title: book.title,
            author: book.author,
            documentName: dataset.document.fileName,
            fileSize: pdf.length,
            userId,
        })

        const processed = await Book.findById(documentId).lean()
        const chunkCount = await Chunk.countDocuments({ userId, documentId })
        if (processed?.processingStatus !== "ready" || chunkCount === 0) {
            throw new Error("Evaluation document did not complete extraction and indexing.")
        }

        const collected: CollectedCase[] = []
        for (const testCase of cases) {
            const applicationTraceId = `eval-${testCase.id}-${randomUUID()}`
            let response = ""
            let citations: SourceCitation[] = []
            let diagnostics: RagDiagnostics | undefined
            let phoenixTraceId: string | undefined
            let phoenixSpanId: string | undefined

            await withRagTrace({
                traceId: applicationTraceId,
                userId,
                conversationId: runId,
                documentCount: 1,
                qualityMode: ragQualityMode,
                operation: `evaluation:${testCase.id}`,
            }, async () => {
                const phoenixContext = activePhoenixContext()
                phoenixTraceId = phoenixContext.traceId
                phoenixSpanId = phoenixContext.spanId
                for await (const update of streamAgenticRag(testCase.question, { userId, documentIds: [documentId] })) {
                    if (!update.finalAnswer) continue
                    response = update.finalAnswer
                    citations = update.citations ?? []
                    diagnostics = update.diagnostics
                }
            })

            if (!response) throw new Error(`No final answer was produced for evaluation case ${testCase.id}.`)
            const retrievedContexts = diagnostics?.contexts ?? []
            const deterministicFailures = deterministicChecks(testCase, response, citations, retrievedContexts)
            const { contexts: _contexts, ...safeDiagnostics } = diagnostics ?? {
                qualityMode: ragQualityMode,
                verificationStatus: "not_applicable" as const,
                retrievedChunkCount: 0,
                gradedChunkCount: 0,
                relevantChunkCount: 0,
                contexts: [],
                nodeDurationsMs: {},
            }
            void _contexts

            collected.push({
                ...testCase,
                response,
                retrievedContexts,
                citations,
                deterministicPass: deterministicFailures.length === 0,
                deterministicFailures,
                diagnostics: safeDiagnostics,
                applicationTraceId,
                phoenixTraceId,
                phoenixSpanId,
            })
        }

        await mkdir(path.dirname(tracesPath), { recursive: true })
        await writeFile(tracesPath, JSON.stringify({
            schemaVersion: 1,
            datasetName: dataset.name,
            datasetVersion: dataset.version,
            generatedAt: new Date().toISOString(),
            ragQualityMode,
            cases: collected,
        }, null, 2), "utf8")

        console.table(collected.map((item) => ({
            case: item.id,
            deterministic: item.deterministicPass ? "pass" : "fail",
            citations: item.citations.length,
            contexts: item.retrievedContexts.length,
            verification: item.diagnostics?.verificationStatus,
        })))
        console.log(`Evaluation traces written to ${tracesPath}`)
    } finally {
        await Promise.allSettled([
            documentId
                ? deleteDocumentVectors(userId, documentId, { includeLegacyNamespace: true })
                : Promise.resolve(),
            documentId ? Chunk.deleteMany({ userId, documentId }) : Promise.resolve(),
            documentId ? Book.deleteOne({ _id: documentId, userId }) : Promise.resolve(),
            RagCache.deleteMany({ userId }),
            User.deleteOne({ userId }),
            cloudinary.uploader.destroy(publicId, {
                resource_type: "raw",
                type: "authenticated",
                invalidate: true,
            }),
        ])
        await mongoose.disconnect()
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : "RAG trace collection failed")
    process.exitCode = 1
})
