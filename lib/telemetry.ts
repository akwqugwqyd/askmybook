import { randomUUID } from "node:crypto"
import AiTrace from "@/database/models/ai-trace.model"
import dbConnect from "@/database/mongoose"
import { logger } from "@/lib/logger"

export const createTraceId = (): string => randomUUID()

export const estimateTokens = (text: string): number =>
    Math.max(1, Math.ceil(text.length / 4))

export const estimateCost = (inputTokens: number, outputTokens: number): number => {
    const inputPerMillion = Number(process.env.AI_INPUT_COST_PER_MILLION || 0)
    const outputPerMillion = Number(process.env.AI_OUTPUT_COST_PER_MILLION || 0)
    return (inputTokens / 1_000_000) * inputPerMillion
        + (outputTokens / 1_000_000) * outputPerMillion
}

interface TraceInput {
    traceId: string
    userId: string
    route: string
    status: "success" | "error"
    durationMs: number
    modelName?: string
    documentCount: number
    cacheHit: boolean
    inputTokens: number
    outputTokens: number
    estimatedCostUsd: number
    retrievedChunks: number
    citationCount: number
    averageRelevance?: number
    faithfulnessScore?: number
    errorCode?: string
}

export const recordTrace = async (data: TraceInput): Promise<void> => {
    try {
        await dbConnect()
        await AiTrace.create(data)
        logger.info("AI trace completed", {
            traceId: data.traceId,
            route: data.route,
            status: data.status,
            durationMs: data.durationMs,
        })
    } catch (error) {
        logger.warn("AI trace persistence failed", error)
    }
}
