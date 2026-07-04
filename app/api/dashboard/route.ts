import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import dbConnect from "@/database/mongoose"
import Book from "@/database/models/book.model"
import ChatMessage from "@/database/models/chat-message.model"
import { logger } from "@/lib/logger"
import { serializeDocumentSummary, type DocumentSummary } from "@/lib/document-view"

export async function GET() {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        await dbConnect()

        const books = await Book.find({ userId }).sort({ createdAt: -1 }).lean()
        const serializedBooks: DocumentSummary[] = books.map(serializeDocumentSummary)

        let totalMessages = 0
        try {
            totalMessages = await ChatMessage.countDocuments({ userId })
        } catch (error) {
            logger.warn("Dashboard chat message count failed; returning zero.", error)
        }

        const readyBooks = serializedBooks.filter((book) => book.processingStatus === "ready").length
        const processingBooks = serializedBooks.filter((book) =>
            book.processingStatus === "queued" || book.processingStatus === "processing"
        ).length
        const failedBooks = serializedBooks.filter((book) => book.processingStatus === "failed").length

        return NextResponse.json({
            success: true,
            stats: {
                totalBooks: serializedBooks.length,
                readyBooks,
                processingBooks,
                failedBooks,
                totalMessages,
            },
            recentBooks: serializedBooks.slice(0, 6),
            documents: serializedBooks,
            failedRecent: serializedBooks
                .filter((book) => book.processingStatus === "failed")
                .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
                .slice(0, 5),
        }, { status: 200 })
    } catch (error) {
        logger.error("Dashboard metrics failed:", error)
        return NextResponse.json({
            error: "We could not load dashboard metrics right now.",
        }, { status: 500 })
    }
}
