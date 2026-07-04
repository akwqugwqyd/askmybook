import { PDFParse } from "pdf-parse"
import { OpenAIEmbeddings } from "@langchain/openai"
import { PineconeStore } from "@langchain/pinecone"
import { createHash } from "node:crypto"
import pineconeClient from "./pinecone"
import dbConnect from "@/database/mongoose"
import Book from "@/database/models/book.model"
import Chunk from "@/database/models/chunk.model"
import { extractScannedPdfWithOcr } from "@/lib/pdf-ocr"
import { createDocumentChunks } from "@/lib/chunking"
import { clearDocumentCache } from "@/lib/rag-cache"
import { CURRENT_EMBEDDING_VERSION, CURRENT_INDEXING_VERSION, EMBEDDING_MODEL } from "@/lib/ai-config"
import { signedDocumentUrl } from "@/lib/cloudinary-storage"
import { deleteDocumentVectors } from "@/lib/vector-store"

interface ProcessDocumentOptions {
    pdfUrl: string
    storagePublicId?: string
    documentId: string
    title: string
    author: string
    documentName: string
    fileSize: number
    userId: string
}

interface ParsedPdfPage {
    pageNumber: number
    text: string
}

const normalizeExtractedText = (value: string): string =>
    value.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()

const parsePDFPages = async (
    buffer: Buffer,
): Promise<{
    pages: ParsedPdfPage[]
    totalPages: number
    metadata: Record<string, string | undefined>
}> => {
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    try {
        const info = await parser.getInfo().catch(() => null)
        const result = await parser.getText()
        const infoData = info?.info as Record<string, unknown> | undefined
        return {
            totalPages: result.total,
            metadata: {
                pdfTitle: typeof infoData?.Title === "string" ? infoData.Title : undefined,
                pdfAuthor: typeof infoData?.Author === "string" ? infoData.Author : undefined,
                creator: typeof infoData?.Creator === "string" ? infoData.Creator : undefined,
                producer: typeof infoData?.Producer === "string" ? infoData.Producer : undefined,
                creationDate: typeof infoData?.CreationDate === "string" ? infoData.CreationDate : undefined,
            },
            pages: result.pages
            .map((page) => ({
                pageNumber: page.num,
                text: normalizeExtractedText(page.text),
            }))
            .filter((page) => page.text.length > 0),
        }
    } finally {
        await parser.destroy()
    }
}

type ProcessingStage = "claim" | "download" | "extract" | "ocr" | "embed" | "vector" | "persist"

const processingErrorDetails = (
    error: unknown,
    stage: ProcessingStage,
): { message: string; code: string } => {
    const message = error instanceof Error ? error.message : ""
    if (message.includes("empty")) return { message: "The uploaded PDF is empty.", code: "EMPTY_PDF" }
    if (message.includes("50MB")) return { message: "The PDF exceeds the 50MB processing limit.", code: "PDF_TOO_LARGE" }
    if (message.includes("valid PDF")) return { message: "The uploaded file is not a valid PDF.", code: "INVALID_PDF" }
    if (message.includes("No readable text")) {
        return {
            message: "No text layer was found. This appears to be a scanned PDF and requires OCR.",
            code: "OCR_REQUIRED",
        }
    }
    if (message.includes("OCR_DISABLED")) {
        return { message: "This scanned PDF needs OCR, but OCR is disabled.", code: "OCR_DISABLED" }
    }
    if (message.includes("OCR_LIMIT_EXCEEDED")) {
        return {
            message: "This scanned PDF exceeds the configured OCR page or file-size limit.",
            code: "OCR_LIMIT_EXCEEDED",
        }
    }
    if (message.includes("OCR_EMPTY")) {
        return { message: "OCR could not find readable text in this scanned PDF.", code: "OCR_EMPTY" }
    }
    if (message.includes("OCR_INCOMPLETE")) {
        return {
            message: "OCR output was incomplete for this scanned PDF. Reduce the file size or page count and retry.",
            code: "OCR_INCOMPLETE",
        }
    }
    if (message.includes("No searchable text")) {
        return { message: "No searchable text chunks could be created.", code: "EMPTY_CHUNKS" }
    }

    const messages: Record<ProcessingStage, string> = {
        claim: "Document processing could not be started.",
        download: "The stored PDF could not be downloaded. Please upload it again.",
        extract: "Text extraction failed for this PDF.",
        ocr: "OCR failed for this scanned PDF. Please retry.",
        embed: "Embedding generation failed. Please retry.",
        vector: "Vector indexing failed. Please retry.",
        persist: "The search index was created, but its document record could not be finalized. Please retry.",
    }
    return { message: messages[stage], code: `${stage.toUpperCase()}_FAILED` }
}

const updateDocumentFailure = async (
    documentId: string,
    error: unknown,
    stage: ProcessingStage,
): Promise<void> => {
    const details = processingErrorDetails(error, stage)
    await dbConnect()
    await Book.findByIdAndUpdate(documentId, {
        processingStatus: "failed",
        processingStage: stage,
        processingError: {
            ...details,
            occurredAt: new Date(),
        },
    })
}

export const processDocument = async ({
    pdfUrl,
    storagePublicId,
    documentId,
    title,
    author,
    documentName,
    fileSize,
    userId,
}: ProcessDocumentOptions): Promise<void> => {
    let claimed = false
    let stage: ProcessingStage = "claim"
    try {
        await dbConnect()
        const staleBefore = new Date(Date.now() - 15 * 60 * 1000)
        const claimedBook = await Book.findOneAndUpdate({
            _id: documentId,
            userId,
            $or: [
                { processingStatus: { $in: ["queued", "failed"] } },
                { processingStatus: "processing", processingStartedAt: { $lt: staleBefore } },
                {
                    processingStatus: "ready",
                    $or: [
                        { indexingVersion: { $exists: false } },
                        { indexingVersion: { $lt: CURRENT_INDEXING_VERSION } },
                        { embeddingVersion: { $ne: CURRENT_EMBEDDING_VERSION } },
                    ],
                },
            ],
        }, {
            processingStatus: "processing",
            processingError: undefined,
            processingStartedAt: new Date(),
            $inc: { processingAttempts: 1 },
        }, { returnDocument: "after" })
        if (!claimedBook) throw new Error("Document is already ready or actively processing.")
        claimed = true

        stage = "download"
        await Book.updateOne({ _id: documentId, userId }, { processingStage: stage })
        const response = await fetch(signedDocumentUrl(pdfUrl, storagePublicId), {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                Accept: "application/pdf",
            },
            signal: AbortSignal.timeout(30_000),
        })

        if (!response.ok) {
            throw new Error(`Could not fetch PDF for processing (${response.status} ${response.statusText}).`)
        }

        const buffer = Buffer.from(await response.arrayBuffer())
        if (buffer.length === 0) throw new Error("The uploaded PDF is empty.")
        if (buffer.length > 50 * 1024 * 1024) throw new Error("The PDF exceeds the 50MB processing limit.")
        if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
            throw new Error("The uploaded file is not a valid PDF.")
        }

        stage = "extract"
        await Book.updateOne({ _id: documentId, userId }, { processingStage: stage })
        const extraction = await parsePDFPages(buffer)
        let pages = extraction.pages
        let extractionMethod: "text" | "ocr" = "text"
        if (pages.length === 0) {
            stage = "ocr"
            await Book.updateOne({ _id: documentId, userId }, { processingStage: stage })
            pages = await extractScannedPdfWithOcr(buffer, documentName, extraction.totalPages)
            extractionMethod = "ocr"
        }
        const embeddingModel = EMBEDDING_MODEL
        const embeddingVersion = CURRENT_EMBEDDING_VERSION
        const checksum = createHash("sha256").update(buffer).digest("hex")
        await Book.updateOne({ _id: documentId, userId }, { processingStage: "chunk" })
        const chunks = await createDocumentChunks(pages, {
            userId,
            documentId,
            title,
            author,
            documentName,
            fileSize,
            embeddingModel,
            embeddingVersion,
        })
        if (chunks.length === 0) throw new Error("No searchable text chunks could be created.")

        stage = "embed"
        await Book.updateOne({ _id: documentId, userId }, { processingStage: stage })
        const embeddings = new OpenAIEmbeddings({
            openAIApiKey: process.env.OPENAI_API_KEY,
            model: embeddingModel,
        })

        stage = "vector"
        await Book.updateOne({ _id: documentId, userId }, { processingStage: stage })
        const pineconeIndex = pineconeClient.index(process.env.PINECONE_INDEX!)
        const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
            pineconeIndex,
            namespace: userId,
        })
        const vectorIds = chunks.map((_, index) => `${documentId}:${index}`)

        // Retries are idempotent: remove the previous document representation first.
        await deleteDocumentVectors(userId, documentId)
        await Chunk.deleteMany({ userId, documentId })
        await clearDocumentCache(userId)

        await vectorStore.addDocuments(chunks, { ids: vectorIds })
        stage = "persist"
        await Book.updateOne({ _id: documentId, userId }, { processingStage: stage })
        await Chunk.insertMany(chunks.map((chunk, index) => ({
            userId,
            documentId,
            documentName,
            vectorId: vectorIds[index],
            chunkIndex: index,
            pageNumber: Number((chunk.metadata as Record<string, unknown>).pageNumber) || undefined,
            content: chunk.pageContent,
            contentLength: chunk.pageContent.length,
            tokenCount: Number((chunk.metadata as Record<string, unknown>).tokenCount) || 0,
            sectionTitle: String((chunk.metadata as Record<string, unknown>).sectionTitle || "") || undefined,
            embeddingModel,
            embeddingVersion,
            contentHash: createHash("sha256").update(chunk.pageContent).digest("hex"),
        })), { ordered: true })

        await Book.findByIdAndUpdate(documentId, {
            processingStatus: "ready",
            processingStage: "complete",
            processingError: undefined,
            processedAt: new Date(),
            pageCount: pages.length,
            chunkCount: chunks.length,
            fileSize,
            documentName,
            indexingVersion: CURRENT_INDEXING_VERSION,
            embeddingModel,
            embeddingVersion,
            extractionMethod,
            checksum,
            metadata: extraction.metadata,
        })
    } catch (error) {
        if (claimed) await updateDocumentFailure(documentId, error, stage)
        throw error
    }
}
