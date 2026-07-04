import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import AiTrace from "@/database/models/ai-trace.model"
import Book from "@/database/models/book.model"
import ChatMessage from "@/database/models/chat-message.model"
import Chunk from "@/database/models/chunk.model"
import Conversation from "@/database/models/conversation.model"
import dbConnect from "@/database/mongoose"
import { isAdmin } from "@/lib/admin"

export async function GET() {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    await dbConnect()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const [documentStatuses, chunks, conversations, messages, traces] = await Promise.all([
        Book.aggregate<{ _id: string; count: number }>([
            { $group: { _id: "$processingStatus", count: { $sum: 1 } } },
        ]),
        Chunk.countDocuments(),
        Conversation.countDocuments(),
        ChatMessage.countDocuments(),
        AiTrace.aggregate<{
            requests: number
            errors: number
            cacheHits: number
            inputTokens: number
            outputTokens: number
            cost: number
            averageRelevance: number
            faithfulness: number
            averageDurationMs: number
        }>([
            { $match: { createdAt: { $gte: since } } },
            {
                $group: {
                    _id: null,
                    requests: { $sum: 1 },
                    errors: { $sum: { $cond: [{ $eq: ["$status", "error"] }, 1, 0] } },
                    cacheHits: { $sum: { $cond: ["$cacheHit", 1, 0] } },
                    inputTokens: { $sum: "$inputTokens" },
                    outputTokens: { $sum: "$outputTokens" },
                    cost: { $sum: "$estimatedCostUsd" },
                    averageRelevance: { $avg: "$averageRelevance" },
                    faithfulness: { $avg: "$faithfulnessScore" },
                    averageDurationMs: { $avg: "$durationMs" },
                },
            },
        ]),
    ])

    const trace = traces[0] || {
        requests: 0,
        errors: 0,
        cacheHits: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        averageRelevance: 0,
        faithfulness: 0,
        averageDurationMs: 0,
    }
    return NextResponse.json({
        success: true,
        generatedAt: new Date().toISOString(),
        documents: Object.fromEntries(documentStatuses.map((status) => [status._id, status.count])),
        chunks,
        conversations,
        messages,
        last24Hours: {
            ...trace,
            errorRate: trace.requests ? trace.errors / trace.requests : 0,
            cacheHitRate: trace.requests ? trace.cacheHits / trace.requests : 0,
        },
    })
}
