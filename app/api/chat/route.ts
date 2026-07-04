import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import mongoose from "mongoose"
import { checkRequestLimit, getUserRequestStatus } from "@/lib/ai-rate-limit"
import { logger } from "@/lib/logger"
import { streamAgenticRag, type AgenticRagGraphUpdate } from "@/lib/agentic-rag"
import dbConnect from "@/database/mongoose"
import Book from "@/database/models/book.model"
import ChatMessage from "@/database/models/chat-message.model"
import Conversation, { type ConversationScope } from "@/database/models/conversation.model"
import { answerCacheKey, getCachedAnswer, setCachedAnswer } from "@/lib/rag-cache"
import { createTraceId, estimateCost, estimateTokens, recordTrace } from "@/lib/telemetry"
import { chatRequestSchema } from "@/lib/validation"
import { CURRENT_EMBEDDING_VERSION, CURRENT_INDEXING_VERSION } from "@/lib/ai-config"

export const runtime = "nodejs"
export const maxDuration = 300

type RequestStatus = Awaited<ReturnType<typeof getUserRequestStatus>>
type ChatStreamEvent =
    | { type: "status"; status: string; node?: string; conversationId?: string }
    | {
        type: "final"
        reply: string
        requestStatus: RequestStatus
        conversationId: string
        citations?: AgenticRagGraphUpdate["citations"]
      }
    | { type: "error"; error: string; requestStatus?: RequestStatus }

const encodeEvent = (event: ChatStreamEvent): Uint8Array =>
    new TextEncoder().encode(`${JSON.stringify(event)}\n`)

export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        const conversationId = req.nextUrl.searchParams.get("conversationId")?.trim()
        if (!conversationId) {
            return NextResponse.json({ error: "conversationId is required." }, { status: 400 })
        }

        await dbConnect()
        const conversation = await Conversation.findOne({ _id: conversationId, userId }).lean()
        if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 })
        const messages = await ChatMessage.find({ userId, conversationId })
            .sort({ createdAt: 1 })
            .limit(200)
            .lean()
        return NextResponse.json({ success: true, conversation, messages })
    } catch (error) {
        logger.error("Chat history load error:", error)
        return NextResponse.json({ error: "We could not load this conversation." }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        const traceId = createTraceId()
        const startedAt = Date.now()

        const parsed = chatRequestSchema.safeParse(await req.json())
        if (!parsed.success) return NextResponse.json({ error: "Invalid chat request." }, { status: 400 })
        const body = parsed.data
        const message = body.message

        await dbConnect()
        const existingConversationId = body.conversationId || ""
        let scope: ConversationScope
        let documentIds: string[]
        let conversation

        if (existingConversationId) {
            if (!mongoose.isValidObjectId(existingConversationId)) {
                return NextResponse.json({ error: "Invalid conversation." }, { status: 400 })
            }
            conversation = await Conversation.findOne({ _id: existingConversationId, userId })
            if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 })
            scope = conversation.scope
            documentIds = conversation.documentIds
        } else {
            scope = body.scope
            documentIds = [...new Set(body.documentIds)]
            if (scope === "selected" && documentIds.length === 0) {
                return NextResponse.json({
                    error: "Select at least one document.",
                }, { status: 400 })
            }
        }

        const documentQuery = scope === "all"
            ? {
                userId,
                processingStatus: "ready",
                indexingVersion: { $gte: CURRENT_INDEXING_VERSION },
                embeddingVersion: CURRENT_EMBEDDING_VERSION,
            }
            : {
                userId,
                _id: { $in: documentIds },
                processingStatus: "ready",
                indexingVersion: { $gte: CURRENT_INDEXING_VERSION },
                embeddingVersion: CURRENT_EMBEDDING_VERSION,
            }
        const ownedDocuments = await Book.find(documentQuery)
            .select("_id title documentName embeddingVersion")
            .lean()
        if (scope === "selected" && ownedDocuments.length !== documentIds.length) {
            return NextResponse.json({
                error: "Every selected document must exist, belong to you, and be ready.",
            }, { status: 409 })
        }
        if (ownedDocuments.length === 0) {
            return NextResponse.json({ error: "No processed documents are available to search." }, { status: 409 })
        }
        documentIds = ownedDocuments.map((document) => String(document._id))

        const cacheKey = answerCacheKey(
            message,
            documentIds,
            Math.max(...ownedDocuments.map((document) => document.embeddingVersion || 1)),
        )
        const limitCheck = await checkRequestLimit(userId)
        const requestStatus = await getUserRequestStatus(userId)
        if (!limitCheck.allowed) {
            return NextResponse.json({
                error: "Daily limit of 10 chat requests reached. Please try again after the limit resets.",
                requestStatus,
            }, { status: 429 })
        }
        const cachedAnswer = existingConversationId
            ? null
            : await getCachedAnswer(userId, cacheKey)

        if (!conversation) {
            conversation = await Conversation.create({
                userId,
                title: message.slice(0, 80),
                scope,
                documentIds: scope === "all" ? [] : documentIds,
                lastMessageAt: new Date(),
            })
        }
        const conversationId = String(conversation._id)
        const history = existingConversationId
            ? await ChatMessage.find({ userId, conversationId })
                .sort({ createdAt: -1 })
                .limit(6)
                .lean()
            : []
        const conversationContext = history.reverse()
            .map((item) => `${item.role === "user" ? "User" : "Assistant"}: ${item.content.slice(0, 1200)}`)
            .join("\n")

        await Promise.all([
            ChatMessage.create({
                userId,
                conversationId,
                role: "user",
                content: message,
                citations: [],
            }),
            Conversation.updateOne({ _id: conversationId, userId }, { lastMessageAt: new Date() }),
        ])

        logger.info("[CHAT] Starting grounded retrieval", {
            userId,
            conversationId,
            scope,
            documentCount: documentIds.length,
        })

        const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
                let finalReply = ""
                try {
                    if (cachedAnswer) {
                        finalReply = cachedAnswer.reply
                        await ChatMessage.create({
                            userId,
                            conversationId,
                            role: "assistant",
                            content: finalReply,
                            citations: cachedAnswer.citations,
                            status: "cache_hit",
                        })
                        controller.enqueue(encodeEvent({
                            type: "final",
                            reply: finalReply,
                            requestStatus,
                            conversationId,
                            citations: cachedAnswer.citations,
                        }))
                        const outputTokens = estimateTokens(finalReply)
                        await recordTrace({
                            traceId,
                            userId,
                            route: "/api/chat",
                            status: "success",
                            durationMs: Date.now() - startedAt,
                            modelName: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
                            documentCount: documentIds.length,
                            cacheHit: true,
                            inputTokens: estimateTokens(message),
                            outputTokens,
                            estimatedCostUsd: 0,
                            retrievedChunks: cachedAnswer.citations.length,
                            citationCount: cachedAnswer.citations.length,
                            averageRelevance: cachedAnswer.citations.length
                                ? cachedAnswer.citations.reduce((sum, citation) => sum + (citation.relevance || 0), 0)
                                    / cachedAnswer.citations.length
                                : undefined,
                            faithfulnessScore: 1,
                        })
                        return
                    }

                    controller.enqueue(encodeEvent({
                        type: "status",
                        status: "Searching your documents...",
                        node: "start",
                        conversationId,
                    }))

                    for await (const update of streamAgenticRag(
                        message,
                        { userId, documentIds },
                        conversationContext,
                    )) {
                        controller.enqueue(encodeEvent({
                            type: "status",
                            status: update.status,
                            node: update.node,
                            conversationId,
                        }))
                        if (!update.finalAnswer || finalReply) continue

                        finalReply = update.finalAnswer
                        await ChatMessage.create({
                            userId,
                            conversationId,
                            role: "assistant",
                            content: finalReply,
                            citations: update.citations ?? [],
                            status: update.status,
                        })
                        if (!existingConversationId) {
                            await setCachedAnswer(userId, cacheKey, {
                                reply: finalReply,
                                citations: update.citations ?? [],
                            })
                        }
                        controller.enqueue(encodeEvent({
                            type: "final",
                            reply: finalReply,
                            requestStatus,
                            conversationId,
                            citations: update.citations,
                        }))
                        const citations = update.citations ?? []
                        const inputTokens = update.tokenUsage?.inputTokens
                            || estimateTokens(`${conversationContext}\n${message}`)
                        const outputTokens = update.tokenUsage?.outputTokens
                            || estimateTokens(finalReply)
                        await recordTrace({
                            traceId,
                            userId,
                            route: "/api/chat",
                            status: "success",
                            durationMs: Date.now() - startedAt,
                            modelName: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
                            documentCount: documentIds.length,
                            cacheHit: false,
                            inputTokens,
                            outputTokens,
                            estimatedCostUsd: estimateCost(inputTokens, outputTokens),
                            retrievedChunks: citations.length,
                            citationCount: citations.length,
                            averageRelevance: citations.length
                                ? citations.reduce((sum, citation) => sum + (citation.relevance || 0), 0)
                                    / citations.length
                                : undefined,
                            faithfulnessScore: update.status === "Complete" ? 1 : 0.5,
                        })
                    }

                    if (!finalReply) throw new Error("The answer pipeline did not return a final response.")
                } catch (streamError) {
                    logger.error("Chat stream error:", streamError)
                    await recordTrace({
                        traceId,
                        userId,
                        route: "/api/chat",
                        status: "error",
                        durationMs: Date.now() - startedAt,
                        modelName: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
                        documentCount: documentIds.length,
                        cacheHit: false,
                        inputTokens: estimateTokens(message),
                        outputTokens: 0,
                        estimatedCostUsd: 0,
                        retrievedChunks: 0,
                        citationCount: 0,
                        errorCode: "CHAT_STREAM_FAILED",
                    })
                    controller.enqueue(encodeEvent({
                        type: "error",
                        error: "The document search could not be completed. Your question was saved; please retry.",
                        requestStatus,
                    }))
                } finally {
                    controller.close()
                }
            },
        })

        return new Response(stream, {
            headers: {
                "Content-Type": "application/x-ndjson; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
                "X-Content-Type-Options": "nosniff",
                "X-Trace-Id": traceId,
            },
        })
    } catch (error) {
        logger.error("Chat API error:", error)
        return NextResponse.json({ error: "The chat request could not be completed." }, { status: 500 })
    }
}
