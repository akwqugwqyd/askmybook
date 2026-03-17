// @ts-ignore
import PDFParser from "pdf2json"
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"
import { OpenAIEmbeddings } from "@langchain/openai"
import { PineconeStore } from "@langchain/pinecone"
import { Document } from "@langchain/core/documents"
import pineconeClient from "./pinecone"

const parsePDF = (buffer: Buffer): Promise<string> => {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser()
        pdfParser.on("pdfParser_dataError", reject)
        pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
            const text = pdfData.Pages.map((page: any) =>
                page.Texts.map((t: any) =>
                    decodeURIComponent(t.R.map((r: any) => r.T).join(""))
                ).join(" ")
            ).join("\n")
            resolve(text)
        })
        pdfParser.parseBuffer(buffer)
    })
}

export const processAndEmbedPDF = async (pdfUrl: string, bookId: string) => {
    const response = await fetch(pdfUrl)

    const buffer = Buffer.from(await response.arrayBuffer())
 
    if (buffer.length === 0) throw new Error("Empty PDF buffer")

    const text = await parsePDF(buffer)
    
    const docs = [new Document({ pageContent: text, metadata: { bookId } })]

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
    })
    const chunks = await splitter.splitDocuments(docs)

    const embeddings = new OpenAIEmbeddings({
        openAIApiKey: process.env.OPENAI_API_KEY,
        model: "text-embedding-3-small",
    })

    const pineconeIndex = pineconeClient.index(process.env.PINECONE_INDEX!)

    await PineconeStore.fromDocuments(chunks, embeddings, {
        pineconeIndex,
        namespace: bookId,
    })

    console.log(`✅ Book ${bookId} processed and embedded successfully`)
}

