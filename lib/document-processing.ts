import { OpenAIEmbeddings } from "@langchain/openai"
import { PineconeStore } from "@langchain/pinecone"
import { createHash } from "node:crypto"
import pineconeClient from "@/lib/pinecone"
import dbConnect from "@/database/mongoose"
import Book from "@/database/models/book.model"
import Chunk from "@/database/models/chunk.model"
import { createDocumentChunks } from "@/lib/chunking"
import { clearDocumentCache } from "@/lib/rag-cache"
import { CURRENT_EMBEDDING_VERSION, CURRENT_INDEXING_VERSION, EMBEDDING_MODEL } from "@/lib/ai-config"
import { signedDocumentUrl } from "@/lib/cloudinary-storage"
import { deleteDocumentVectors } from "@/lib/vector-store"
import { extractDocument } from "@/lib/document-extraction"

interface ProcessDocumentOptions {
    pdfUrl: string
    storagePublicId?: string
    documentId: string
    title: string
    author: string
    documentName: string
    contentType?: string
    fileSize: number
    userId: string
}

type ProcessingStage = "claim" | "download" | "extract" | "ocr" | "chunk" | "embed" | "vector" | "persist"

const processingErrorDetails = (error: unknown, stage: ProcessingStage): { message: string; code: string } => {
    const message = error instanceof Error ? error.message : ""
    if (message.includes("EMPTY_DOCUMENT")) return { message: "The uploaded document is empty.", code: "EMPTY_DOCUMENT" }
    if (message.includes("50MB")) return { message: "The document exceeds the 50MB processing limit.", code: "DOCUMENT_TOO_LARGE" }
    if (message.includes("INVALID_PDF")) return { message: "The uploaded file is not a valid PDF.", code: "INVALID_PDF" }
    if (message.includes("Unexpected token") || message.includes("JSON")) return { message: "This JSON file is not valid. Fix its syntax and upload it again.", code: "INVALID_JSON" }
    if (message.includes("zip") || message.includes("DOCX")) return { message: "This DOCX file could not be read. Re-export it and try again.", code: "INVALID_DOCX" }
    if (message.includes("UNSUPPORTED_FILE_TYPE")) return { message: "This file type is not supported.", code: "UNSUPPORTED_FILE_TYPE" }
    if (message.includes("EXTRACTED_TEXT_LIMIT_EXCEEDED")) return { message: "This document contains too much extracted text to index safely.", code: "EXTRACTED_TEXT_LIMIT_EXCEEDED" }
    if (message.includes("OCR_DISABLED")) return { message: "This scanned PDF needs OCR, but OCR is disabled.", code: "OCR_DISABLED" }
    if (message.includes("OCR_LIMIT_EXCEEDED") || message.includes("OCR_IMAGE_LIMIT_EXCEEDED")) return { message: "This file exceeds the configured OCR limit.", code: "OCR_LIMIT_EXCEEDED" }
    if (message.includes("OCR_EMPTY")) return { message: "OCR could not find readable text in this file.", code: "OCR_EMPTY" }
    if (message.includes("OCR_INCOMPLETE")) return { message: "OCR output was incomplete. Reduce the file size and retry.", code: "OCR_INCOMPLETE" }
    if (message.includes("No searchable text")) return { message: "No searchable text chunks could be created.", code: "EMPTY_CHUNKS" }

    const messages: Record<ProcessingStage, string> = {
        claim: "Document processing could not be started.",
        download: "The stored document could not be downloaded. Please upload it again.",
        extract: "Text extraction failed for this document.",
        ocr: "OCR failed for this document. Please retry.",
        chunk: "Text chunking failed for this document.",
        embed: "Embedding generation failed. Please retry.",
        vector: "Vector indexing failed. Please retry.",
        persist: "The search index was created, but its document record could not be finalized. Please retry.",
    }
    return { message: messages[stage], code: `${stage.toUpperCase()}_FAILED` }
}

const updateDocumentFailure = async (documentId: string, error: unknown, stage: ProcessingStage): Promise<void> => {
    await dbConnect()
    await Book.findByIdAndUpdate(documentId, {
        processingStatus: "failed",
        processingStage: stage,
        processingError: { ...processingErrorDetails(error, stage), occurredAt: new Date() },
    })
}

export const processDocument = async ({
    pdfUrl, storagePublicId, documentId, title, author, documentName, contentType = "application/pdf", fileSize, userId,
}: ProcessDocumentOptions): Promise<void> => {
    let claimed = false
    let stage: ProcessingStage = "claim"
    try {
        await dbConnect()
        const staleBefore = new Date(Date.now() - 15 * 60 * 1000)
        const claimedBook = await Book.findOneAndUpdate({
            _id: documentId,
            userId,
            $or: [
                { processingStatus: { $in: ["queued", "failed"] } },
                { processingStatus: "processing", processingStartedAt: { $lt: staleBefore } },
                { processingStatus: "ready", $or: [
                    { indexingVersion: { $exists: false } },
                    { indexingVersion: { $lt: CURRENT_INDEXING_VERSION } },
                    { embeddingVersion: { $ne: CURRENT_EMBEDDING_VERSION } },
                ] },
            ],
        }, {
            processingStatus: "processing", processingError: undefined, processingStartedAt: new Date(), $inc: { processingAttempts: 1 },
        }, { returnDocument: "after" })
        if (!claimedBook) throw new Error("Document is already ready or actively processing.")
        claimed = true

        stage = "download"
        await Book.updateOne({ _id: documentId, userId }, { processingStage: stage })
        const response = await fetch(signedDocumentUrl(pdfUrl, storagePublicId), {
            headers: { "User-Agent": "Mozilla/5.0", Accept: contentType || "application/octet-stream" },
            signal: AbortSignal.timeout(30_000),
        })
        if (!response.ok) throw new Error(`Could not fetch document for processing (${response.status} ${response.statusText}).`)
        const buffer = Buffer.from(await response.arrayBuffer())
        if (!buffer.length) throw new Error("EMPTY_DOCUMENT")
        if (buffer.length > 50 * 1024 * 1024) throw new Error("The document exceeds the 50MB processing limit.")

        stage = "extract"
        await Book.updateOne({ _id: documentId, userId }, { processingStage: stage })
        const extraction = await extractDocument(buffer, documentName, contentType)

        stage = "chunk"
        await Book.updateOne({ _id: documentId, userId }, { processingStage: stage })
        const embeddingModel = EMBEDDING_MODEL
        const embeddingVersion = CURRENT_EMBEDDING_VERSION
        const chunks = await createDocumentChunks(extraction.pages, {
            userId, documentId, title, author, documentName, fileSize, embeddingModel, embeddingVersion,
        })
        if (!chunks.length) throw new Error("No searchable text chunks could be created.")

        stage = "embed"
        await Book.updateOne({ _id: documentId, userId }, { processingStage: stage })
        const embeddings = new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_API_KEY, model: embeddingModel })
        stage = "vector"
        await Book.updateOne({ _id: documentId, userId }, { processingStage: stage })
        const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
            pineconeIndex: pineconeClient.index(process.env.PINECONE_INDEX!), namespace: userId,
        })
        const vectorIds = chunks.map((_, index) => `${documentId}:${index}`)
        await deleteDocumentVectors(userId, documentId)
        await Chunk.deleteMany({ userId, documentId })
        await clearDocumentCache(userId)
        await vectorStore.addDocuments(chunks, { ids: vectorIds })

        stage = "persist"
        await Book.updateOne({ _id: documentId, userId }, { processingStage: stage })
        await Chunk.insertMany(chunks.map((chunk, index) => ({
            userId,
            documentId,
            documentName,
            vectorId: vectorIds[index],
            chunkIndex: index,
            pageNumber: Number((chunk.metadata as Record<string, unknown>).pageNumber) || undefined,
            content: chunk.pageContent,
            contentLength: chunk.pageContent.length,
            tokenCount: Number((chunk.metadata as Record<string, unknown>).tokenCount) || 0,
            sectionTitle: String((chunk.metadata as Record<string, unknown>).sectionTitle || "") || undefined,
            embeddingModel,
            embeddingVersion,
            contentHash: createHash("sha256").update(chunk.pageContent).digest("hex"),
        })), { ordered: true })
        await Book.findByIdAndUpdate(documentId, {
            processingStatus: "ready", processingStage: "complete", processingError: undefined, processedAt: new Date(),
            pageCount: extraction.pages.length, chunkCount: chunks.length, fileSize, documentName,
            indexingVersion: CURRENT_INDEXING_VERSION, embeddingModel, embeddingVersion,
            extractionMethod: extraction.extractionMethod, checksum: createHash("sha256").update(buffer).digest("hex"), metadata: extraction.metadata,
        })
    } catch (error) {
        if (claimed) await updateDocumentFailure(documentId, error, stage)
        throw error
    }
}
