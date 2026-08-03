import { z } from "zod"
import { isSupportedDocumentUpload } from "@/lib/document-types"

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier")

export const chatRequestSchema = z.object({
    message: z.string().trim().min(1).max(8_000)
        .transform((value) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")),
    conversationId: objectId.optional(),
    scope: z.enum(["selected", "all"]).default("selected"),
    documentIds: z.array(objectId).max(25).default([]),
})

export const createDocumentSchema = z.object({
    title: z.string().trim().min(1).max(200),
    author: z.string().trim().min(1).max(160),
    pdfUrl: z.string().url().max(2_048),
    documentName: z.string().trim().min(1).max(255),
    fileSize: z.number().int().positive().max(50 * 1024 * 1024),
    storagePublicId: z.string().trim().min(1).max(512),
    contentType: z.string().trim().max(160).default("application/octet-stream"),
})

export const uploadIntentSchema = z.object({
    fileName: z.string().trim().min(1).max(255),
    fileSize: z.number().int().positive().max(50 * 1024 * 1024),
    contentType: z.string().trim().max(160).default("application/octet-stream"),
}).refine(
    ({ fileName, contentType }) => isSupportedDocumentUpload(fileName, contentType),
    { message: "Unsupported file type. Upload PDF, DOCX, TXT, MD, HTML, CSV, JSON, PNG, JPG, WEBP, or GIF." },
)
