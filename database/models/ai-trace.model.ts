import mongoose, { Schema, type Document, type Model } from "mongoose"

export interface IAiTrace extends Document {
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
    createdAt: Date
}

const AiTraceSchema = new Schema<IAiTrace>({
    traceId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    route: { type: String, required: true },
    status: { type: String, enum: ["success", "error"], required: true },
    durationMs: { type: Number, required: true },
    modelName: { type: String },
    documentCount: { type: Number, default: 0 },
    cacheHit: { type: Boolean, default: false },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    estimatedCostUsd: { type: Number, default: 0 },
    retrievedChunks: { type: Number, default: 0 },
    citationCount: { type: Number, default: 0 },
    averageRelevance: { type: Number },
    faithfulnessScore: { type: Number },
    errorCode: { type: String },
    createdAt: { type: Date, default: Date.now, index: true },
})

AiTraceSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 })
AiTraceSchema.index({ userId: 1, createdAt: -1 })

const AiTrace: Model<IAiTrace> =
    mongoose.models.AiTrace || mongoose.model<IAiTrace>("AiTrace", AiTraceSchema)

export default AiTrace
