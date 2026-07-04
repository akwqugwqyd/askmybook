import { createHash } from "node:crypto"
import RagCache from "@/database/models/rag-cache.model"
import dbConnect from "@/database/mongoose"
import { logger } from "@/lib/logger"

export interface CachedAnswer {
    reply: string
    citations: Array<{
        document: string
        documentId?: string
        page: string
        chunkId?: string
        excerpt?: string
        relevance?: number
    }>
}

const hash = (value: string): string =>
    createHash("sha256").update(value).digest("hex")

export const answerCacheKey = (
    question: string,
    documentIds: string[],
    embeddingVersion: number,
): string => hash(JSON.stringify({
    question: question.toLowerCase().replace(/\s+/g, " ").trim(),
    documents: [...documentIds].sort(),
    embeddingVersion,
    promptVersion: 2,
}))

export const getCachedAnswer = async (
    userId: string,
    key: string,
): Promise<CachedAnswer | null> => {
    try {
        await dbConnect()
        const entry = await RagCache.findOne({
            userId,
            cacheType: "answer",
            key,
            expiresAt: { $gt: new Date() },
        }).lean()
        return entry?.value as CachedAnswer | null
    } catch (error) {
        logger.warn("Answer cache read failed", error)
        return null
    }
}

export const setCachedAnswer = async (
    userId: string,
    key: string,
    value: CachedAnswer,
): Promise<void> => {
    try {
        await dbConnect()
        await RagCache.updateOne(
            { userId, cacheType: "answer", key },
            {
                $set: {
                    value,
                    expiresAt: new Date(Date.now() + Number(process.env.RAG_CACHE_TTL_MS || 3_600_000)),
                },
            },
            { upsert: true },
        )
    } catch (error) {
        logger.warn("Answer cache write failed", error)
    }
}

export const getCachedQueryRewrite = async (
    userId: string,
    question: string,
): Promise<string | null> => {
    try {
        await dbConnect()
        const entry = await RagCache.findOne({
            userId,
            cacheType: "query",
            key: hash(question.toLowerCase().trim()),
            expiresAt: { $gt: new Date() },
        }).lean()
        const value = entry?.value as { rewrittenQuestion?: unknown } | undefined
        return typeof value?.rewrittenQuestion === "string" ? value.rewrittenQuestion : null
    } catch (error) {
        logger.warn("Query cache read failed", error)
        return null
    }
}

export const setCachedQueryRewrite = async (
    userId: string,
    question: string,
    rewrittenQuestion: string,
): Promise<void> => {
    try {
        await dbConnect()
        await RagCache.updateOne(
            { userId, cacheType: "query", key: hash(question.toLowerCase().trim()) },
            {
                $set: {
                    value: { rewrittenQuestion },
                    expiresAt: new Date(Date.now() + Number(process.env.QUERY_CACHE_TTL_MS || 86_400_000)),
                },
            },
            { upsert: true },
        )
    } catch (error) {
        logger.warn("Query cache write failed", error)
    }
}

export const clearDocumentCache = async (userId: string): Promise<void> => {
    await dbConnect()
    await RagCache.deleteMany({ userId })
}
