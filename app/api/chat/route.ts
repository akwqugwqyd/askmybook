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
                error: "Free tier limit reached (10 requests per 24 hours)",
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

        logger.info(`[CHAT] 1️⃣ Embedding user message...`)
        
        const indexName = process.env.PINECONE_INDEX!
        logger.info(`[CHAT] 2️⃣ Getting Pinecone index: ${indexName}`)
        
        const pineconeIndex = pineconeClient.index(indexName)
        logger.info(`[CHAT] 3️⃣ Index retrieved successfully`)

        logger.info(`[CHAT] 4️⃣ Creating PineconeStore for namespace: ${bookId}`)
        
        let vectorStore
        try {
            vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
                pineconeIndex,
                namespace: bookId,
            })
            logger.info(`[CHAT] ✅ PineconeStore created successfully`)
        } catch (storeError) {
            logger.error(`[CHAT] ❌ Failed to create PineconeStore:`, storeError)
            throw storeError
        }

        logger.info(`[CHAT] 5️⃣ Embedding question: "${message.substring(0, 100)}"`)
        
        let relevantDocs
        try {
            relevantDocs = await vectorStore.similaritySearch(message, 8)
            logger.info(`[CHAT] ✅ Similarity search completed`)
        } catch (searchError) {
            logger.error(`[CHAT] ❌ Similarity search failed:`, searchError)
            throw searchError
        }
        
        logger.info(`[CHAT] 6️⃣ Found ${relevantDocs.length} relevant documents`)
        
        if (relevantDocs.length === 0) {
            logger.warn(`[CHAT] ⚠️ NO DOCUMENTS FOUND - This likely means PDF was never embedded`)
            logger.warn(`[CHAT] Check: 1) Did PDF upload succeed? 2) Check /api/debug/vectors?bookId=${bookId}`)
        } else {
            logger.info(`[CHAT] ✅ Found chunks with content lengths: ${relevantDocs.map(d => d.pageContent.length).join(", ")}`)
        }
        
        const llm = new ChatOpenAI({
            openAIApiKey: process.env.OPENAI_API_KEY,
            modelName: "gpt-3.5-turbo",
            temperature: 0.7,
        })

        let systemPrompt: string
        let userMessage: string

        if (relevantDocs.length > 0) {
            // Answer based on PDF content - PRODUCTION GRADE
            const context = relevantDocs.map(doc => doc.pageContent).join("\n\n")
            systemPrompt = `You are an expert AI assistant analyzing a document. Your task is to answer questions based ONLY on the provided document content.

IMPORTANT INSTRUCTIONS:
1. Answer directly and confidently using ONLY the provided document content
2. Extract specific details, names, dates, numbers, skills from the document
3. Do NOT apologize or say you don't have access - you have the document content
4. Provide detailed, factual answers based on what's in the document
5. If information is not in the document, explicitly say "This information is not mentioned in the document"
6. Always cite relevant sections when answering

DOCUMENT CONTENT:
${context}

Remember: You have complete access to the document content above. Answer with confidence and specificity.`
            userMessage = message
        } else {
            // Answer as general knowledge question
            systemPrompt = `You are a helpful AI assistant. Answer the user's question using your general knowledge. Be concise and accurate.`
            userMessage = message
        }

        const response = await llm.invoke([
            {
                role: "system",
                content: systemPrompt
            },
            {
                role: "user",
                content: userMessage,
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


