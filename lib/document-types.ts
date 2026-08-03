export type DocumentType = "pdf" | "docx" | "text" | "html" | "csv" | "json" | "image"

export const SUPPORTED_DOCUMENT_EXTENSIONS = [
    "pdf", "docx", "txt", "md", "markdown", "html", "htm", "csv", "json",
    "png", "jpg", "jpeg", "webp", "gif",
] as const

const extensionType: Record<string, DocumentType> = {
    pdf: "pdf",
    docx: "docx",
    txt: "text",
    md: "text",
    markdown: "text",
    html: "html",
    htm: "html",
    csv: "csv",
    json: "json",
    png: "image",
    jpg: "image",
    jpeg: "image",
    webp: "image",
    gif: "image",
}

const mimeTypesByDocumentType: Record<DocumentType, string[]> = {
    pdf: ["application/pdf"],
    docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    text: ["text/plain", "text/markdown", "text/x-markdown"],
    html: ["text/html", "application/xhtml+xml"],
    csv: ["text/csv", "application/csv", "application/vnd.ms-excel"],
    json: ["application/json", "text/json"],
    image: ["image/png", "image/jpeg", "image/webp", "image/gif"],
}

const defaultMimeType: Record<DocumentType, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    text: "text/plain",
    html: "text/html",
    csv: "text/csv",
    json: "application/json",
    image: "image/png",
}

export const documentTypeFromFile = (fileName: string): DocumentType | undefined => {
    const extension = fileName.trim().toLowerCase().split(".").pop() || ""
    return extensionType[extension]
}

export const isSupportedDocumentUpload = (fileName: string, contentType: string): boolean => {
    const type = documentTypeFromFile(fileName)
    if (!type) return false
    const normalizedContentType = contentType.trim().toLowerCase().split(";")[0]
    return !normalizedContentType
        || normalizedContentType === "application/octet-stream"
        || mimeTypesByDocumentType[type].includes(normalizedContentType)
}

export const contentTypeFromFile = (fileName: string, suppliedContentType?: string): string => {
    const normalizedContentType = suppliedContentType?.trim().toLowerCase().split(";")[0] || ""
    if (normalizedContentType && normalizedContentType !== "application/octet-stream") return normalizedContentType
    return defaultMimeType[documentTypeFromFile(fileName) || "text"]
}

export const cloudinaryAllowedFormats = SUPPORTED_DOCUMENT_EXTENSIONS.join(",")

export const supportedDocumentAccept = [
    ".pdf", ".docx", ".txt", ".md", ".markdown", ".html", ".htm", ".csv", ".json",
    ".png", ".jpg", ".jpeg", ".webp", ".gif",
].join(",")
