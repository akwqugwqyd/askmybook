import mongoose, { type Document, type Model, Schema } from "mongoose"

export type ConversationScope = "selected" | "all"

export interface IConversation extends Document {
    userId: string
    title: string
    scope: ConversationScope
    documentIds: string[]
    lastMessageAt: Date
    createdAt: Date
    updatedAt: Date
}

const ConversationSchema = new Schema<IConversation>(
    {
        userId: { type: String, required: true, index: true },
        title: { type: String, required: true, trim: true, maxlength: 120 },
        scope: { type: String, enum: ["selected", "all"], required: true },
        documentIds: { type: [String], default: [] },
        lastMessageAt: { type: Date, default: Date.now },
    },
    { timestamps: true },
)

ConversationSchema.index({ userId: 1, lastMessageAt: -1 })

const Conversation: Model<IConversation> =
    mongoose.models.Conversation
    || mongoose.model<IConversation>("Conversation", ConversationSchema)

export default Conversation
