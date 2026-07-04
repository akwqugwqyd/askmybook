import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import mongoose from "mongoose"
import dbConnect from "@/database/mongoose"
import Book from "@/database/models/book.model"
import Chunk from "@/database/models/chunk.model"
import ChatMessage from "@/database/models/chat-message.model"
import Conversation from "@/database/models/conversation.model"
import cloudinary from "@/lib/cloudinary"
import { logger } from "@/lib/logger"
import { clearDocumentCache } from "@/lib/rag-cache"
import { deleteDocumentVectors } from "@/lib/vector-store"

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        if (!mongoose.isValidObjectId(id)) {
            return NextResponse.json({ error: "Invalid document identifier" }, { status: 400 })
        }

        await dbConnect()

        const book = await Book.findOne({ _id: id, userId })
        if (!book) return NextResponse.json({ error: "Document not found" }, { status: 404 })

        return NextResponse.json({ success: true, book }, { status: 200 })

    } catch {
        return NextResponse.json({
            error: "We could not load this document right now. Please try again.",
        }, { status: 500 })
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        if (!mongoose.isValidObjectId(id)) {
            return NextResponse.json({ error: "Invalid document identifier" }, { status: 400 })
        }

        await dbConnect()

        const book = await Book.findOne({ _id: id, userId })
        if (!book) return NextResponse.json({ error: "Document not found" }, { status: 404 })

        const selectedConversations = await Conversation.find({
            userId,
            scope: "selected",
            documentIds: id,
        }).select("_id").lean()
        const citedConversationIds = await ChatMessage.distinct("conversationId", {
            userId,
            "citations.documentId": id,
        })
        const conversationIds = [...new Set([
            ...selectedConversations.map((conversation) => String(conversation._id)),
            ...citedConversationIds.map(String).filter(Boolean),
        ])]

        await deleteDocumentVectors(userId, id, { includeLegacyNamespace: true })

        if (book.storagePublicId) {
            await cloudinary.uploader.destroy(book.storagePublicId, {
                resource_type: "raw",
                type: "authenticated",
                invalidate: true,
            })
        }

        await Promise.all([
            Chunk.deleteMany({ userId, documentId: id }),
            ChatMessage.deleteMany({
                userId,
                conversationId: { $in: conversationIds },
            }),
            Conversation.deleteMany({ _id: { $in: conversationIds }, userId }),
            Book.deleteOne({ _id: id, userId }),
            clearDocumentCache(userId),
        ])

        return NextResponse.json({ success: true }, { status: 200 })

    } catch (error) {
        logger.error("Document deletion failed:", error)
        return NextResponse.json({
            error: "We could not safely finish deleting this document. Please retry.",
        }, { status: 500 })
    }
}


