import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai"
import { PineconeStore } from "@langchain/pinecone"
import pineconeClient from "@/lib/pinecone"
import { checkRequestLimit, getUserRequestStatus } from "@/lib/requestLimit"
import { logger } from "@/lib/logger"

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        // Check request limit
        const limitCheck = await checkRequestLimit(userId)
        const status = await getUserRequestStatus(userId)

        if (!limitCheck.allowed) {
            logger.warn(`Request limit exceeded for user ${userId}`)
            return NextResponse.json({
                success: false,
                error: "Free tier limit reached (3 requests per 24 hours)",
                message: `You've used all ${limitCheck.limit} free requests today. Please try again tomorrow.`,
                requestStatus: status,
            }, { status: 429 })
        }

        const { message, bookId } = await req.json()
        if (!message || !bookId) return NextResponse.json({ error: "Message and bookId required" }, { status: 400 })

        const embeddings = new OpenAIEmbeddings({
            openAIApiKey: process.env.OPENAI_API_KEY,
            model: "text-embedding-3-small",
        })

        const pineconeIndex = pineconeClient.index(process.env.PINECONE_INDEX!)

        const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
            pineconeIndex,
            namespace: bookId,
        })

        const relevantDocs = await vectorStore.similaritySearch(message, 4)
        
        if (relevantDocs.length === 0) {
            return NextResponse.json({
                success: true,
                reply: "I couldn't find relevant information in the book to answer your question. Please try rephrasing or ask something else.",
                requestStatus: status,
            }, { status: 200 })
        }

        const context = relevantDocs.map(doc => doc.pageContent).join("\n\n")

        const llm = new ChatOpenAI({
            openAIApiKey: process.env.OPENAI_API_KEY,
            modelName: "gpt-3.5-turbo",
            temperature: 0.7,
        })

        const response = await llm.invoke([
            {
                role: "system",
                content: `You are an AI assistant that answers questions based on the following book content.
Only answer based on the provided context. If the answer isn't in the context, say so.

Context:
${context}`
            },
            {
                role: "user",
                content: message,
            }
        ])

        const reply = typeof response.content === 'string' ? response.content : String(response.content)

        return NextResponse.json({
            success: true,
            reply,
            requestStatus: status,
        }, { status: 200 })

    } catch (error) {
        logger.error("Chat API Error:", error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return NextResponse.json({ error: errorMessage }, { status: 500 })
    }
}


