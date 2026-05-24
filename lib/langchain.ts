// @ts-ignore
import PDFParser from "pdf2json"
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"
import { OpenAIEmbeddings } from "@langchain/openai"
import { PineconeStore } from "@langchain/pinecone"
import { Document } from "@langchain/core/documents"
import pineconeClient from "./pinecone"
import cloudinary from "./cloudinary"

const parsePDF = (buffer: Buffer): Promise<string> => {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser()
        pdfParser.on("pdfParser_dataError", reject)
        pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
            const text = pdfData.Pages.map((page: any) =>
                page.Texts.map((t: any) => {
                    const raw = t.R.map((r: any) => r.T).join("")
                    try {
                        return decodeURIComponent(raw)
                    } catch {
                        return raw
                    }
                }).join(" ")
            ).join("\n")
            resolve(text)
        })
        pdfParser.parseBuffer(buffer)
    })
}

export const processAndEmbedPDF = async (pdfUrl: string, bookId: string) => {
    try {
        console.log(`🔄 Starting PDF processing for bookId: ${bookId}`)
        console.log(`📥 Cloudinary URL: ${pdfUrl}`)
        
        let fetchUrl = pdfUrl
        
        // If it's a Cloudinary URL, generate a signed URL for authentication
        if (pdfUrl.includes("cloudinary")) {
            console.log(`\n🔐 Generating signed URL for authenticated access...`)
            
            try {
                // Extract public_id from Cloudinary URL
                // Format: https://res.cloudinary.com/{cloud}/image/upload/v{version}/{public_id}
                // OR: https://res.cloudinary.com/{cloud}/raw/upload/v{version}/{public_id}
                const match = pdfUrl.match(/\/(?:image|raw)\/(?:authenticated\/)?upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/)
                
                if (match && match[1]) {
                    const publicId = match[1]
                    console.log(`  📁 Extracted public ID: ${publicId}`)
                    
                    // Generate signed URL valid for 10 minutes
                    const signedUrl = cloudinary.url(publicId, {
                        resource_type: "raw",
                        type: "authenticated",
                        sign_url: true,
                        expires_at: Math.floor(Date.now() / 1000) + 600, // 10 minutes
                    })
                    
                    console.log(`  ✅ Generated signed URL (valid for 10 min)`)
                    fetchUrl = signedUrl
                } else {
                    console.warn(`  ⚠️ Could not extract public_id from URL, using original`)
                }
            } catch (parseError) {
                console.warn(`  ⚠️ Failed to generate signed URL: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
            }
        }
        
        // Fetch the PDF
        console.log(`\n📥 Fetching PDF...`)
        const response = await fetch(fetchUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Accept": "application/pdf",
            },
        })
        
        console.log(`  Status: ${response.status} ${response.statusText}`)
        console.log(`  Content-Type: ${response.headers.get("content-type")}`)
        console.log(`  Content-Length: ${response.headers.get("content-length")}`)
        
        if (!response.ok) {
            console.error(`❌ FETCH FAILED: ${response.status} ${response.statusText}`)
            throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`)
        }

        const buffer = Buffer.from(await response.arrayBuffer())
        
        if (buffer.length === 0) {
            throw new Error("Empty PDF buffer - PDF might be corrupted")
        }

        console.log(`✅ PDF fetched successfully: ${buffer.length} bytes`)

        const text = await parsePDF(buffer)
        
        if (!text || text.trim().length === 0) {
            throw new Error("Failed to extract text from PDF - PDF might be empty or corrupted")
        }
        
        console.log(`✂️ Extracted text: ${text.length} characters`)

        const docs = [new Document({ pageContent: text, metadata: { bookId } })]

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1500,
            chunkOverlap: 300,
        })
        const chunks = await splitter.splitDocuments(docs)
        
        console.log(`📦 Created ${chunks.length} chunks`)

        const embeddings = new OpenAIEmbeddings({
            openAIApiKey: process.env.OPENAI_API_KEY,
            model: "text-embedding-3-small",
        })

        const pineconeIndexName = process.env.PINECONE_INDEX!
        console.log(`🔗 Getting Pinecone index: ${pineconeIndexName}`)
        
        const pineconeIndex = pineconeClient.index(pineconeIndexName)
        console.log(`🔗 Index retrieved successfully`)
        
        console.log(`🔗 Creating PineconeStore with ${chunks.length} chunks`)
        console.log(`🔗 Using namespace: ${bookId}`)
        console.log(`🔗 Chunks preview: ${chunks.slice(0, 1).map(c => c.pageContent.substring(0, 50)).join(" | ")}...`)
        
        try {
            await PineconeStore.fromDocuments(chunks, embeddings, {
                pineconeIndex,
                namespace: bookId,
            })
            console.log(`✅ All chunks uploaded to Pinecone successfully`)
        } catch (pineconeError) {
            console.error(`❌ Pinecone upload failed:`, pineconeError)
            throw new Error(`Pinecone vector upload failed: ${pineconeError instanceof Error ? pineconeError.message : String(pineconeError)}`)
        }

        console.log(`✅ SUCCESS! Book ${bookId} processed and embedded successfully`)
    } catch (error) {
        console.error(`❌ ERROR in processAndEmbedPDF for bookId ${bookId}:`, error)
        throw error
    }
}

