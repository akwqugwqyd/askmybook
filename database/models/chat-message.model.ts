import mongoose, { Schema, Document, Model } from "mongoose"

export interface ChatCitation {
    document: string
    documentId?: string
    page: string
    chunkId?: string
    excerpt?: string
    relevance?: number
}

export interface IChatMessage extends Document {
    userId: string
    conversationId: string
    role: "user" | "assistant"
    content: string
    citations: ChatCitation[]
    status?: string
    createdAt: Date
    updatedAt: Date
}

const ChatCitationSchema = new Schema<ChatCitation>(
    {
        document: { type: String, required: true },
        documentId: { type: String },
        page: { type: String, required: true },
        chunkId: { type: String },
        excerpt: { type: String },
        relevance: { type: Number },
    },
    { _id: false },
)

const ChatMessageSchema: Schema<IChatMessage> = new Schema(
    {
        userId: {
            type: String,
            required: [true, "User ID is required"],
            index: true,
        },
        conversationId: {
            type: String,
            required: [true, "Conversation ID is required"],
            index: true,
        },
        role: {
            type: String,
            enum: ["user", "assistant"],
            required: [true, "Role is required"],
        },
        content: {
            type: String,
            required: [true, "Content is required"],
        },
        citations: {
            type: [ChatCitationSchema],
            default: [],
        },
        status: {
            type: String,
        },
    },
    {
        timestamps: true,
    },
)

ChatMessageSchema.index({ userId: 1, conversationId: 1, createdAt: 1 })

const ChatMessage: Model<IChatMessage> =
    mongoose.models.ChatMessage || mongoose.model<IChatMessage>("ChatMessage", ChatMessageSchema)

export default ChatMessage
