import mongoose from "mongoose"
import dbConnect from "@/database/mongoose"
import Book from "@/database/models/book.model"
import Chunk from "@/database/models/chunk.model"
import { processDocument } from "@/lib/document-processing"

const requestedId = process.argv[2]

const main = async () => {
    if (!requestedId) {
        throw new Error("Usage: npm run reprocess:document -- <documentId|latest-failed>")
    }

    await dbConnect()
    const book = requestedId === "latest-failed"
        ? await Book.findOne({ processingStatus: "failed" }).sort({ updatedAt: -1 })
        : mongoose.isValidObjectId(requestedId)
            ? await Book.findById(requestedId)
            : null

    if (!book) throw new Error("The requested failed document was not found.")

    await processDocument({
        pdfUrl: book.pdfUrl,
        storagePublicId: book.storagePublicId,
        documentId: String(book._id),
        title: book.title,
        author: book.author,
        documentName: book.documentName,
        fileSize: book.fileSize,
        userId: book.userId,
    })

    const [updated, chunkCount] = await Promise.all([
        Book.findById(book._id).select("processingStatus processingStage processingError pageCount chunkCount"),
        Chunk.countDocuments({ userId: book.userId, documentId: String(book._id) }),
    ])
    console.log({
        documentId: String(book._id),
        status: updated?.processingStatus,
        stage: updated?.processingStage,
        pages: updated?.pageCount,
        chunks: updated?.chunkCount,
        persistedChunks: chunkCount,
        error: updated?.processingError?.code || null,
    })
}

main()
    .catch((error) => {
        console.error(error instanceof Error ? error.message : "Document reprocessing failed")
        process.exitCode = 1
    })
    .finally(async () => {
        await mongoose.disconnect().catch(() => undefined)
    })
