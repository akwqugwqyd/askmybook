import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import mongoose from "mongoose"
import dbConnect from "@/database/mongoose"
import Book from "@/database/models/book.model"
import { processDocument } from "@/lib/document-processing"
import { logger } from "@/lib/logger"
import { CURRENT_EMBEDDING_VERSION, CURRENT_INDEXING_VERSION } from "@/lib/ai-config"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: NextRequest) {
    let documentId = ""
    let userId = ""
    try {
        const { userId: authenticatedUserId } = await auth()
        if (!authenticatedUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        userId = authenticatedUserId
        const body = await request.json().catch(() => ({})) as { documentId?: unknown }
        documentId = typeof body.documentId === "string" ? body.documentId : ""
        if (!mongoose.isValidObjectId(documentId)) {
            return NextResponse.json({ error: "Invalid document identifier." }, { status: 400 })
        }

        await dbConnect()
        const book = await Book.findOne({ _id: documentId, userId })
        if (!book) return NextResponse.json({ error: "Document not found." }, { status: 404 })
        if (
            book.processingStatus === "ready"
            && (book.indexingVersion || 1) >= CURRENT_INDEXING_VERSION
            && (book.embeddingVersion || 1) === CURRENT_EMBEDDING_VERSION
        ) {
            return NextResponse.json({ success: true, book, message: "Document is already ready." })
        }

        const processingIsFresh = book.processingStatus === "processing"
            && book.processingStartedAt
            && Date.now() - book.processingStartedAt.getTime() < 15 * 60 * 1000
        if (processingIsFresh) {
            return NextResponse.json({ success: true, book, message: "Document is already processing." }, { status: 202 })
        }

        await processDocument({
            pdfUrl: book.pdfUrl,
            storagePublicId: book.storagePublicId,
            documentId: String(book._id),
            title: book.title,
            author: book.author,
            documentName: book.documentName || `${book.title}.pdf`,
            contentType: book.contentType || "application/pdf",
            fileSize: book.fileSize || 0,
            userId,
        })
        const updatedBook = await Book.findOne({ _id: documentId, userId })
        return NextResponse.json({ success: true, book: updatedBook })
    } catch (error) {
        logger.error("Document processing endpoint failed:", error)
        if (documentId && userId && mongoose.isValidObjectId(documentId)) {
            try {
                await dbConnect()
                const failedBook = await Book.findOne({ _id: documentId, userId })
                if (failedBook?.processingStatus === "failed" && failedBook.processingError?.message) {
                    return NextResponse.json({ error: failedBook.processingError.message, book: failedBook }, { status: 422 })
                }
            } catch (lookupError) {
                logger.warn("Failed document error lookup failed:", lookupError)
            }
        }
        return NextResponse.json({ error: "Document processing could not be completed. Please retry." }, { status: 500 })
    }
}
