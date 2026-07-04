import type { ProcessingStatus } from "@/database/models/book.model"
import { CURRENT_EMBEDDING_VERSION, CURRENT_INDEXING_VERSION } from "@/lib/ai-config"

export interface DocumentSummary {
    _id: string
    title: string
    author: string
    documentName: string
    processingStatus: ProcessingStatus
    processingStage?: string
    pageCount: number
    chunkCount: number
    fileSize: number
    processingError?: { message: string; code?: string }
    createdAt: string
    updatedAt: string
}

interface DocumentLike {
    _id: unknown
    title?: unknown
    author?: unknown
    documentName?: unknown
    processingStatus?: unknown
    processingStage?: unknown
    processingError?: { message?: unknown; code?: unknown }
    indexingVersion?: unknown
    embeddingVersion?: unknown
    pageCount?: unknown
    chunkCount?: unknown
    fileSize?: unknown
    createdAt?: unknown
    updatedAt?: unknown
}

const text = (value: unknown, fallback: string): string =>
    typeof value === "string" && value.trim() ? value : fallback

const count = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0

const date = (value: unknown): string => {
    if (value instanceof Date) return value.toISOString()
    if (typeof value === "string") return value
    return new Date(0).toISOString()
}

const status = (value: unknown): ProcessingStatus =>
    value === "queued" || value === "processing" || value === "failed" ? value : "ready"

export const serializeDocumentSummary = (document: DocumentLike): DocumentSummary => {
    const rawStatus = status(document.processingStatus)
    const needsReindex = rawStatus === "ready"
        && (
            typeof document.indexingVersion !== "number"
            || document.indexingVersion < CURRENT_INDEXING_VERSION
            || typeof document.embeddingVersion !== "number"
            || document.embeddingVersion !== CURRENT_EMBEDDING_VERSION
        )

    return {
        _id: String(document._id),
        title: text(document.title, "Untitled"),
        author: text(document.author, "Unknown author"),
        documentName: text(document.documentName, "document.pdf"),
        processingStatus: needsReindex ? "failed" : rawStatus,
        processingStage: typeof document.processingStage === "string" ? document.processingStage : undefined,
        pageCount: count(document.pageCount),
        chunkCount: count(document.chunkCount),
        fileSize: count(document.fileSize),
        processingError: needsReindex
            ? {
                message: "This document needs to be re-indexed for multi-document search.",
                code: "INDEX_UPGRADE_REQUIRED",
            }
            : document.processingError?.message
                ? {
                    message: String(document.processingError.message),
                    code: typeof document.processingError.code === "string"
                        ? document.processingError.code
                        : undefined,
                }
                : undefined,
        createdAt: date(document.createdAt),
        updatedAt: date(document.updatedAt),
    }
}
