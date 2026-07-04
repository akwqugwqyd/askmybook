import mongoose, { type Document, type Model, Schema } from "mongoose"

export interface IChunk extends Document {
    userId: string
    documentId: string
    documentName: string
    vectorId: string
    chunkIndex: number
    pageNumber?: number
    content: string
    contentLength: number
    tokenCount: number
    sectionTitle?: string
    embeddingModel: string
    embeddingVersion: number
    contentHash: string
    createdAt: Date
    updatedAt: Date
}

const ChunkSchema = new Schema<IChunk>(
    {
        userId: { type: String, required: true, index: true },
        documentId: { type: String, required: true, index: true },
        documentName: { type: String, required: true },
        vectorId: { type: String, required: true, unique: true },
        chunkIndex: { type: Number, required: true },
        pageNumber: { type: Number },
        content: { type: String, required: true },
        contentLength: { type: Number, required: true },
        tokenCount: { type: Number, required: true },
        sectionTitle: { type: String },
        embeddingModel: { type: String, required: true },
        embeddingVersion: { type: Number, required: true },
        contentHash: { type: String, required: true },
    },
    { timestamps: true },
)

ChunkSchema.index({ userId: 1, documentId: 1, chunkIndex: 1 }, { unique: true })

const Chunk: Model<IChunk> =
    mongoose.models.Chunk || mongoose.model<IChunk>("Chunk", ChunkSchema)

export default Chunk
