import mongoose from "mongoose"
import type { UploadApiErrorResponse, UploadApiResponse } from "cloudinary"
import cloudinary from "@/lib/cloudinary"
import dbConnect from "@/database/mongoose"
import Book from "@/database/models/book.model"
import Chunk from "@/database/models/chunk.model"
import RagCache from "@/database/models/rag-cache.model"
import User from "@/database/models/user.model"
import { processDocument } from "@/lib/document-processing"
import { streamAgenticRag } from "@/lib/agentic-rag"
import { checkRequestLimit } from "@/lib/ai-rate-limit"
import { deleteDocumentVectors } from "@/lib/vector-store"

const createPdf = (text: string): Buffer => {
    const escaped = text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")
    const stream = `BT /F1 18 Tf 72 720 Td (${escaped}) Tj ET`
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

const main = async () => {
    const runId = `rag-smoke-${Date.now()}`
    const userId = `user-${runId}`
    const publicId = `ai-book-smoke/${runId}`
    const documentName = "rag-smoke.pdf"
    const verificationToken = "amber-739"
    const pdf = createPdf(`Verification token: ${verificationToken}.`)
    let documentId = ""

    try {
        await dbConnect()
        const upload = await uploadPdf(pdf, publicId)
        const book = await Book.create({
            title: "RAG smoke test",
            author: "Automated verification",
            pdfUrl: upload.secure_url,
            storagePublicId: publicId,
            userId,
            documentName,
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
            documentName,
            fileSize: pdf.length,
            userId,
        })

        const [processed, persistedChunks] = await Promise.all([
            Book.findById(documentId).lean(),
            Chunk.countDocuments({ userId, documentId }),
        ])
        if (processed?.processingStatus !== "ready" || persistedChunks < 1) {
            throw new Error("Document did not reach ready state with persisted chunks.")
        }

        let finalAnswer = ""
        let citationCount = 0
        for await (const update of streamAgenticRag(
            "What is the verification token?",
            { userId, documentIds: [documentId] },
        )) {
            if (!update.finalAnswer) continue
            finalAnswer = update.finalAnswer
            citationCount = update.citations?.length || 0
        }
        const containsInlineCitation = /\([^()\n,]+,\s*page\s+[^)\n]+\)/i.test(finalAnswer)
        if (
            !finalAnswer.toLowerCase().includes(verificationToken)
            || citationCount < 1
            || containsInlineCitation
        ) {
            console.error({
                finalAnswer,
                citationCount,
                containsInlineCitation,
            })
            throw new Error("Grounded answer or citation verification failed.")
        }

        const rateLimitResults = []
        for (let index = 0; index < 11; index += 1) {
            rateLimitResults.push(await checkRequestLimit(userId))
        }
        if (
            rateLimitResults.slice(0, 10).some((result) => !result.allowed)
            || rateLimitResults[10]?.allowed
        ) {
            throw new Error("The 10-request daily rate limit verification failed.")
        }

        console.table({
            extraction: "ok",
            chunkPersistence: `${persistedChunks} chunk(s)`,
            vectorIndexing: "ok",
            filteredRetrieval: "ok",
            groundedAnswer: "ok",
            citations: `${citationCount} citation(s)`,
            rateLimit: "10 requests / 24 hours",
        })
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
    console.error(error instanceof Error ? error.message : "RAG smoke test failed")
    process.exitCode = 1
})
