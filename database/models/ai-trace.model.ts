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
    gradedChunks?: number
    relevantChunks?: number
    citationCount: number
    averageRelevance?: number
    faithfulnessScore?: number
    verificationStatus?: string
    qualityMode?: string
    phoenixTraceId?: string
    nodeDurationsMs?: Record<string, number>
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
    gradedChunks: { type: Number },
    relevantChunks: { type: Number },
    citationCount: { type: Number, default: 0 },
    averageRelevance: { type: Number },
    faithfulnessScore: { type: Number },
    verificationStatus: { type: String },
    qualityMode: { type: String },
    phoenixTraceId: { type: String, index: true, sparse: true },
    nodeDurationsMs: { type: Map, of: Number },
    errorCode: { type: String },
    createdAt: { type: Date, default: Date.now },
})

AiTraceSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 })
AiTraceSchema.index({ userId: 1, createdAt: -1 })

const AiTrace: Model<IAiTrace> =
    mongoose.models.AiTrace || mongoose.model<IAiTrace>("AiTrace", AiTraceSchema)

export default AiTrace
