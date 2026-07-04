import mongoose, { Schema, type Document, type Model } from "mongoose"

export interface IRagCache extends Document {
    userId: string
    cacheType: "query" | "answer"
    key: string
    value: unknown
    expiresAt: Date
    createdAt: Date
    updatedAt: Date
}

const RagCacheSchema = new Schema<IRagCache>(
    {
        userId: { type: String, required: true, index: true },
        cacheType: { type: String, enum: ["query", "answer"], required: true },
        key: { type: String, required: true },
        value: { type: Schema.Types.Mixed, required: true },
        expiresAt: { type: Date, required: true, index: { expires: 0 } },
    },
    { timestamps: true },
)

RagCacheSchema.index({ userId: 1, cacheType: 1, key: 1 }, { unique: true })

const RagCache: Model<IRagCache> =
    mongoose.models.RagCache || mongoose.model<IRagCache>("RagCache", RagCacheSchema)

export default RagCache
