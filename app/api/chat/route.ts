import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import mongoose from "mongoose"
import { checkRequestLimit, getUserRequestStatus } from "@/lib/ai-rate-limit"
import { logger } from "@/lib/logger"
import { ragQualityMode, streamAgenticRag, type AgenticRagGraphUpdate } from "@/lib/agentic-rag"
import dbConnect from "@/database/mongoose"
import Book from "@/database/models/book.model"
import Chunk from "@/database/models/chunk.model"
import ChatMessage from "@/database/models/chat-message.model"
import Conversation, { type ConversationScope } from "@/database/models/conversation.model"
import { answerCacheKey, getCachedAnswer, setCachedAnswer } from "@/lib/rag-cache"
import { createTraceId, estimateCost, estimateTokens, recordTrace } from "@/lib/telemetry"
import { chatRequestSchema } from "@/lib/validation"
import { CURRENT_EMBEDDING_VERSION, CURRENT_INDEXING_VERSION } from "@/lib/ai-config"
import { activePhoenixContext, withRagTrace } from "@/lib/phoenix-observability"

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

const directIntentReply = (message: string): string | null => {
    const normalized = message
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s'?]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()

    if (!normalized) return null

    const isShort = normalized.split(" ").length <= 8
    if (isShort && /^(hi|hii|hello|hey|yo|sup|good morning|good afternoon|good evening)( there)?$/.test(normalized)) {
        return "Hello. Ask me a question about your uploaded documents, and I will answer with supporting citations when the documents contain the evidence."
    }

    if (isShort && /^(thanks|thank you|thx|ty|appreciate it|nice|great|ok|okay)$/.test(normalized)) {
        return "You are welcome. Send me the next document question whenever you are ready."
    }

    if (isShort && /^(bye|goodbye|see you|see ya|later)$/.test(normalized)) {
        return "Goodbye. Your conversations and uploaded documents will be here when you come back."
    }

    if (/^(what can you do|what do you do|help|how does this work|how can you help)( me)?\??$/.test(normalized)) {
        return "I can search your uploaded documents, answer questions grounded in their contents, compare sources, summarize selected files, and show citations for the supporting pages."
    }

    return null
}

const isDocumentOverviewIntent = (message: string): boolean => {
    const normalized = message
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s'?]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()

    return /^(what is|what's|tell me about|summari[sz]e|explain|describe)\s+(this|the|these|selected|uploaded)?\s*(document|documents|pdf|pdfs|file|files)\s*(about)?$/.test(normalized)
        || /^(what is|what's)\s+(this|the|these|selected|uploaded)\s*(about)$/.test(normalized)
}

const sentenceFromText = (text: string): string =>
    text
        .replace(/\s+/g, " ")
        .trim()
        .split(/(?<=[.!?])\s+/)
        .find((sentence) => sentence.length >= 50)
        ?.slice(0, 320)
        || text.replace(/\s+/g, " ").trim().slice(0, 320)

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

        const directReply = directIntentReply(message)
        if (directReply) {
            const requestStatus = await getUserRequestStatus(userId)
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
            await Promise.all([
                ChatMessage.create({
                    userId,
                    conversationId,
                    role: "user",
                    content: message,
                    citations: [],
                }),
                ChatMessage.create({
                    userId,
                    conversationId,
                    role: "assistant",
                    content: directReply,
                    citations: [],
                    status: "direct_intent",
                }),
                Conversation.updateOne({ _id: conversationId, userId }, { lastMessageAt: new Date() }),
            ])

            return new Response(`${JSON.stringify({
                type: "final",
                reply: directReply,
                requestStatus,
                conversationId,
                citations: [],
            } satisfies ChatStreamEvent)}\n`, {
                headers: {
                    "Content-Type": "application/x-ndjson; charset=utf-8",
                    "Cache-Control": "no-cache, no-transform",
                    Connection: "keep-alive",
                    "X-Content-Type-Options": "nosniff",
                    "X-Trace-Id": traceId,
                },
            })
        }

        const documentQuery = scope === "all"
            ? {
                userId,
                processingStatus: "ready" as const,
                indexingVersion: { $gte: CURRENT_INDEXING_VERSION },
                embeddingVersion: CURRENT_EMBEDDING_VERSION,
            }
            : {
                userId,
                _id: { $in: documentIds },
                processingStatus: "ready" as const,
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

        if (isDocumentOverviewIntent(message)) {
            const requestStatus = await getUserRequestStatus(userId)
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
            const chunkGroups = await Promise.all(ownedDocuments.map(async (document) => {
                const id = String(document._id)
                const chunks = await Chunk.find({ userId, documentId: id })
                    .sort({ chunkIndex: 1 })
                    .limit(3)
                    .select("content pageNumber documentName documentId chunkIndex")
                    .lean()
                return { document, chunks }
            }))

            const sections = chunkGroups.map(({ document, chunks }) => {
                const title = String(document.title || document.documentName || "Selected document")
                if (chunks.length === 0) return `${title}: I could not find extracted text chunks for this document.`
                const points = chunks
                    .map((chunk) => sentenceFromText(chunk.content))
                    .filter(Boolean)
                    .slice(0, 3)
                return [
                    `${title}:`,
                    ...points.map((point) => `- ${point}`),
                ].join("\n")
            })
            const overviewReply = ownedDocuments.length === 1
                ? `This document appears to be about:\n\n${sections[0]}`
                : `Here is what the selected documents appear to be about:\n\n${sections.join("\n\n")}`
            const overviewCitations = chunkGroups.flatMap(({ document, chunks }) =>
                chunks.slice(0, 2).map((chunk) => ({
                    document: String(document.documentName || document.title || "Selected document"),
                    documentId: String(document._id),
                    page: chunk.pageNumber ? String(chunk.pageNumber) : "unknown",
                    chunkId: String(chunk._id),
                    excerpt: sentenceFromText(chunk.content),
                    relevance: 1,
                })),
            )

            await Promise.all([
                ChatMessage.create({
                    userId,
                    conversationId,
                    role: "user",
                    content: message,
                    citations: [],
                }),
                ChatMessage.create({
                    userId,
                    conversationId,
                    role: "assistant",
                    content: overviewReply,
                    citations: overviewCitations,
                    status: "document_overview",
                }),
                Conversation.updateOne({ _id: conversationId, userId }, { lastMessageAt: new Date() }),
            ])

            return new Response(`${JSON.stringify({
                type: "final",
                reply: overviewReply,
                requestStatus,
                conversationId,
                citations: overviewCitations,
            } satisfies ChatStreamEvent)}\n`, {
                headers: {
                    "Content-Type": "application/x-ndjson; charset=utf-8",
                    "Cache-Control": "no-cache, no-transform",
                    Connection: "keep-alive",
                    "X-Content-Type-Options": "nosniff",
                    "X-Trace-Id": traceId,
                },
            })
        }

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

        logger.info(`[CHAT] Starting grounded retrieval after ${Date.now() - startedAt}ms setup`, {
            userId,
            conversationId,
            scope,
            documentCount: documentIds.length,
        })

        const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
                let finalReply = ""
                let phoenixTraceId: string | undefined
                try {
                    await withRagTrace({
                        traceId,
                        userId,
                        conversationId,
                        documentCount: documentIds.length,
                        qualityMode: ragQualityMode,
                        operation: cachedAnswer ? "cache_hit" : "grounded_chat",
                    }, async () => {
                        phoenixTraceId = activePhoenixContext().traceId
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
                        logger.info(`[CHAT] Cached answer ready in ${Date.now() - startedAt}ms`, {
                            traceId,
                            conversationId,
                        })
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
                            retrievedChunks: 0,
                            gradedChunks: 0,
                            relevantChunks: 0,
                            citationCount: cachedAnswer.citations.length,
                            averageRelevance: cachedAnswer.citations.length
                                ? cachedAnswer.citations.reduce((sum, citation) => sum + (citation.relevance || 0), 0)
                                    / cachedAnswer.citations.length
                                : undefined,
                            verificationStatus: "not_evaluated_cache_hit",
                            qualityMode: ragQualityMode,
                            phoenixTraceId,
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
                        logger.info(`[CHAT] Final answer ready in ${Date.now() - startedAt}ms`, {
                            traceId,
                            conversationId,
                            node: update.node,
                        })
                        const citations = update.citations ?? []
                        const diagnostics = update.diagnostics
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
                            retrievedChunks: diagnostics?.retrievedChunkCount ?? 0,
                            gradedChunks: diagnostics?.gradedChunkCount,
                            relevantChunks: diagnostics?.relevantChunkCount,
                            citationCount: citations.length,
                            averageRelevance: citations.length
                                ? citations.reduce((sum, citation) => sum + (citation.relevance || 0), 0)
                                    / citations.length
                                : undefined,
                            faithfulnessScore: diagnostics?.verificationStatus === "supported"
                                ? 1
                                : diagnostics?.verificationStatus === "unsupported"
                                    ? 0
                                    : undefined,
                            verificationStatus: diagnostics?.verificationStatus,
                            qualityMode: diagnostics?.qualityMode ?? ragQualityMode,
                            phoenixTraceId,
                            nodeDurationsMs: diagnostics?.nodeDurationsMs,
                        })
                    }
                    })

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
                        verificationStatus: "pipeline_error",
                        qualityMode: ragQualityMode,
                        phoenixTraceId,
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
