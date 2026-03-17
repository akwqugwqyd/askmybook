import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai"
import { PineconeStore } from "@langchain/pinecone"
import pineconeClient from "@/lib/pinecone"

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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

        return NextResponse.json({
            success: true,
            reply: response.content,
        }, { status: 200 })

    } catch (error) {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}


