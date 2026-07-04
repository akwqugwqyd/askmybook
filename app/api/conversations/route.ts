import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import mongoose from "mongoose"
import dbConnect from "@/database/mongoose"
import Conversation from "@/database/models/conversation.model"
import ChatMessage from "@/database/models/chat-message.model"
import { logger } from "@/lib/logger"

export async function GET() {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        await dbConnect()
        const conversations = await Conversation.find({ userId })
            .sort({ lastMessageAt: -1 })
            .limit(50)
            .lean()

        return NextResponse.json({ success: true, conversations })
    } catch (error) {
        logger.error("Conversation list failed:", error)
        return NextResponse.json({ error: "Conversations could not be loaded." }, { status: 500 })
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const conversationId = req.nextUrl.searchParams.get("conversationId")?.trim() || ""
        if (!mongoose.isValidObjectId(conversationId)) {
            return NextResponse.json({ error: "Invalid conversation identifier." }, { status: 400 })
        }

        await dbConnect()
        const conversation = await Conversation.findOne({ _id: conversationId, userId })
            .select("_id")
            .lean()
        if (!conversation) {
            return NextResponse.json({ error: "Conversation not found." }, { status: 404 })
        }

        await ChatMessage.deleteMany({ userId, conversationId })
        await Conversation.deleteOne({ _id: conversationId, userId })

        return NextResponse.json({ success: true })
    } catch (error) {
        logger.error("Conversation deletion failed:", error)
        return NextResponse.json({ error: "Conversation could not be deleted." }, { status: 500 })
    }
}
