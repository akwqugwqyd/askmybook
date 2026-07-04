import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import mongoose from "mongoose"
import dbConnect from "@/database/mongoose"
import Book from "@/database/models/book.model"
import { processDocument } from "@/lib/document-processing"
import { logger } from "@/lib/logger"
import { CURRENT_EMBEDDING_VERSION, CURRENT_INDEXING_VERSION } from "@/lib/ai-config"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(
    _req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        if (!mongoose.isValidObjectId(id)) {
            return NextResponse.json({ error: "Invalid document identifier." }, { status: 400 })
        }

        await dbConnect()

        const book = await Book.findOne({ _id: id, userId })
        if (!book) return NextResponse.json({ error: "Document not found." }, { status: 404 })

        if (
            book.processingStatus === "ready"
            && (book.indexingVersion || 1) >= CURRENT_INDEXING_VERSION
            && (book.embeddingVersion || 1) === CURRENT_EMBEDDING_VERSION
        ) {
            return NextResponse.json({ success: true, book, message: "Document is already ready." }, { status: 200 })
        }

        const processingIsFresh = book.processingStatus === "processing"
            && book.processingStartedAt
            && Date.now() - book.processingStartedAt.getTime() < 15 * 60 * 1000
        if (processingIsFresh) {
            return NextResponse.json({
                success: true,
                book,
                message: "Document is already processing.",
            }, { status: 202 })
        }

        await processDocument({
            pdfUrl: book.pdfUrl,
            storagePublicId: book.storagePublicId,
            documentId: book._id.toString(),
            title: book.title,
            author: book.author,
            documentName: book.documentName || `${book.title}.pdf`,
            fileSize: book.fileSize || 0,
            userId,
        })

        const updatedBook = await Book.findOne({ _id: id, userId })
        return NextResponse.json({ success: true, book: updatedBook }, { status: 200 })
    } catch (error) {
        logger.error("Book processing endpoint failed:", error)
        return NextResponse.json({
            error: "Document processing failed. Check its status for details and retry.",
        }, { status: 500 })
    }
}
