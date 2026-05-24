import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import pineconeClient from "@/lib/pinecone"
import { logger } from "@/lib/logger"

/**
 * DEBUG ENDPOINT: Check if vectors exist for a book in Pinecone
 * GET /api/debug/vectors?bookId=xxx
 */
export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const bookId = req.nextUrl.searchParams.get("bookId")
        if (!bookId) {
            return NextResponse.json({ error: "bookId query parameter required" }, { status: 400 })
        }

        const pineconeIndex = pineconeClient.index(process.env.PINECONE_INDEX!)

        // Try to get stats for this namespace
        const stats = await pineconeIndex.describeIndexStats()

        const namespaceStats = stats.namespaces?.[bookId]

        if (!namespaceStats) {
            logger.warn(`No vectors found for bookId: ${bookId}`)
            return NextResponse.json({
                success: false,
                message: "No vectors found in Pinecone for this book",
                bookId,
                suggestion: "PDF processing may have failed. Check server logs.",
                allNamespaces: Object.keys(stats.namespaces || {}),
            })
        }

        logger.info(`Found vectors for bookId: ${bookId}`)
        return NextResponse.json({
            success: true,
            bookId,
            vectorCount: namespaceStats.recordCount || 0,
            message: "Vectors found! PDF is ready for querying.",
        })

    } catch (error) {
        logger.error("Debug vectors error:", error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return NextResponse.json({ error: errorMessage }, { status: 500 })
    }
}
