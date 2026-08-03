"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { CheckCircle2, FileText, LoaderCircle, RefreshCw, UploadCloud, X } from "lucide-react"
import { contentTypeFromFile, isSupportedDocumentUpload, supportedDocumentAccept } from "@/lib/document-types"
import RecoveryPanel from "@/components/RecoveryPanel"

type UploadState = "pending" | "uploading" | "processing" | "ready" | "failed"
interface UploadItem {
    id: string
    file: File
    title: string
    state: UploadState
    documentId?: string
    error?: string
}

interface UploadIntent {
    uploadUrl: string
    publicId: string
    fields: Record<string, string | number>
    error?: string
}

interface CloudinaryUploadResult {
    public_id?: string
    resource_type?: string
    type?: string
    secure_url?: string
    error?: {
        message?: string
    }
}

interface ApiResult {
    error?: string
    book?: {
        _id: string
        processingStatus?: UploadState
        processingError?: {
            message?: string
        }
    }
}

const titleFromFile = (name: string) =>
    name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()

const hasPdfSignature = async (file: File): Promise<boolean> => {
    const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer())
    return new TextDecoder("ascii").decode(bytes) === "%PDF-"
}

const readJsonResponse = async <T,>(response: Response, fallbackError: string): Promise<T> => {
    const contentType = response.headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
        return response.json() as Promise<T>
    }

    // Error pages from a proxy or deployment should never be shown to users.
    const statusMessage = response.status === 404
        ? "The processing service is unavailable. Refresh the page and retry."
        : fallbackError
    await response.text()
    throw new Error(statusMessage)
}

const friendlyUploadError = (error: unknown): string => {
    const message = error instanceof Error ? error.message : ""
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
        return "We could not reach the upload service. Check your connection, then retry this file."
    }
    if (/timeout|timed out/i.test(message)) {
        return "This took longer than expected. Your file is still listed here, so you can retry safely."
    }
    return message || "This file could not be processed. Retry it, or remove it and try again later."
}

export default function NewDocumentsPage() {
    const [items, setItems] = useState<UploadItem[]>([])
    const [author, setAuthor] = useState("")
    const [running, setRunning] = useState(false)
    const [pageError, setPageError] = useState("")
    const completed = useMemo(() => items.filter((item) => item.state === "ready").length, [items])

    const addFiles = (files: FileList | File[]) => {
        setPageError("")
        const incoming = Array.from(files)
        const invalid = incoming.find((file) =>
            !isSupportedDocumentUpload(file.name, file.type)
            || file.size > 50 * 1024 * 1024,
        )
        if (invalid) {
            setPageError("Upload PDF, DOCX, TXT, MD, HTML, CSV, JSON, or image files up to 50MB each.")
            return
        }
        setItems((current) => [
            ...current,
            ...incoming.map((file) => ({
                id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
                file,
                title: titleFromFile(file.name) || "Untitled document",
                state: "pending" as const,
            })),
        ])
    }

    const update = (id: string, patch: Partial<UploadItem>) => {
        setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))
    }

    const processItem = async (item: UploadItem) => {
        try {
            let documentId = item.documentId
            if (!documentId) {
                update(item.id, { state: "uploading", error: undefined })
                if (item.file.name.toLowerCase().endsWith(".pdf") && !await hasPdfSignature(item.file)) {
                    throw new Error("The file contents do not match a valid PDF.")
                }

                const intentResponse = await fetch("/api/upload", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        fileName: item.file.name,
                        fileSize: item.file.size,
                        contentType: contentTypeFromFile(item.file.name, item.file.type),
                    }),
                })
                const intent = await readJsonResponse<UploadIntent>(
                    intentResponse,
                    "Upload could not be authorized. Check the server upload configuration.",
                )
                if (!intentResponse.ok) {
                    throw new Error(intent.error || "Upload could not be authorized.")
                }

                const formData = new FormData()
                Object.entries(intent.fields).forEach(([key, value]) => {
                    formData.append(key, String(value))
                })
                formData.append("file", item.file)
                const uploadResponse = await fetch(intent.uploadUrl, {
                    method: "POST",
                    body: formData,
                })
                const upload = await readJsonResponse<CloudinaryUploadResult>(
                    uploadResponse,
                    "Cloudinary upload failed. Check Cloudinary credentials and signed upload settings.",
                )
                if (!uploadResponse.ok) {
                    throw new Error(upload.error?.message || "Cloudinary upload failed.")
                }
                if (
                    upload.public_id !== intent.publicId
                    || upload.resource_type !== "raw"
                    || upload.type !== "authenticated"
                ) {
                    throw new Error("Cloudinary returned an invalid upload reference.")
                }

                const createResponse = await fetch("/api/books", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: item.title.trim(),
                        author: author.trim() || "Unknown author",
                        pdfUrl: upload.secure_url,
                        storagePublicId: upload.public_id,
                        documentName: item.file.name,
                        fileSize: item.file.size,
                        contentType: contentTypeFromFile(item.file.name, item.file.type),
                    }),
                })
                const created = await readJsonResponse<ApiResult>(
                    createResponse,
                    "Document record could not be created.",
                )
                if (!createResponse.ok) throw new Error(created.error || "Document record could not be created.")
                if (!created.book?._id) throw new Error("Document record could not be created.")
                documentId = created.book._id
                update(item.id, { documentId })
            }

            update(item.id, { state: "processing" })
            const processResponse = await fetch("/api/process-document", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ documentId }),
            })
            const processed = await readJsonResponse<ApiResult>(
                processResponse,
                "Document processing failed.",
            )
            if (!processResponse.ok) throw new Error(processed.error || "Document processing failed.")
            if (processed.book?.processingStatus === "failed") {
                throw new Error(processed.book.processingError?.message || "Document processing failed.")
            }
            update(item.id, {
                state: processed.book?.processingStatus === "ready" ? "ready" : "processing",
            })
        } catch (error) {
            update(item.id, { state: "failed", error: friendlyUploadError(error) })
        }
    }

    const start = async () => {
        const pending = items.filter((item) => item.state === "pending" || item.state === "failed")
        if (!pending.length) return
        if (pending.some((item) => !item.title.trim())) {
            setPageError("Every document needs a title.")
            return
        }
        setRunning(true)
        setPageError("")
        try {
            // A small worker pool keeps memory and third-party API pressure bounded.
            const queue = [...pending]
            const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
                while (queue.length) {
                    const item = queue.shift()
                    if (item) await processItem(item)
                }
            })
            await Promise.all(workers)
        } finally {
            setRunning(false)
        }
    }

    return (
        <main className="app-frame min-h-screen px-4 py-10 sm:px-7">
            <div className="mx-auto max-w-3xl">
                <Link href="/dashboard" className="text-xs font-semibold text-[#9bc2d8] hover:text-[#a7ffe1]">← Knowledge base</Link>
                <header className="mt-6">
                    <p className="eyebrow">Documents</p>
                    <h1 className="font-display mt-2 text-4xl tracking-[-0.04em] text-[#effaff]">Add documents</h1>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-[#9bb6c9]">
                        Upload documents, data files, or images. Each file is processed independently and can be searched after indexing.
                    </p>
                </header>

                {pageError && (
                    <div className="mt-6"><RecoveryPanel compact message={pageError} onRetry={() => setPageError("")} retryLabel="Dismiss" /></div>
                )}

                <label
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                        event.preventDefault()
                        addFiles(event.dataTransfer.files)
                    }}
                    className="shell-card mt-7 flex cursor-pointer flex-col items-center rounded-[1.5rem] border border-dashed border-[#87dcca]/45 px-6 py-12 text-center transition hover:-translate-y-0.5 hover:border-[#8ff5d3] hover:bg-[#15334a]/80">
                    <input
                        type="file"
                        accept={supportedDocumentAccept}
                        multiple
                        disabled={running}
                        className="hidden"
                        onChange={(event) => event.target.files && addFiles(event.target.files)}
                    />
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#8ff5d3]/14 text-[#8ff5d3]"><UploadCloud size={22} /></span>
                    <p className="mt-4 text-sm font-bold text-[#e6f6ff]">Drop files here, or browse</p>
                    <p className="mt-1 text-xs text-[#8eabc0]">PDF, DOCX, text, data, and images · up to 50MB each</p>
                </label>

                {items.length > 0 && (
                    <section className="shell-card mt-6 overflow-hidden rounded-2xl">
                        <div className="border-b border-[#b7e6ff]/12 px-5 py-4">
                            <label className="eyebrow">Author or organisation (optional)</label>
                            <input
                                value={author}
                                onChange={(event) => setAuthor(event.target.value)}
                                disabled={running}
                                placeholder="Author or organization"
                                maxLength={160}
                                className="mt-2 w-full rounded-xl border border-[#b7e6ff]/18 bg-[#071b2b]/75 px-3 py-2.5 text-sm text-[#e4f5ff] outline-none placeholder:text-[#718da1] focus:border-[#8ff5d3]"
                            />
                        </div>
                        <div className="divide-y divide-[#b7e6ff]/10">
                            {items.map((item) => (
                                <div key={item.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[28px_1fr_auto] sm:items-center">
                                    <FileText size={18} className="text-[#8ddfc8]" />
                                    <div className="min-w-0">
                                        <input
                                            value={item.title}
                                            disabled={running || item.state === "ready"}
                                            maxLength={200}
                                            onChange={(event) => update(item.id, { title: event.target.value })}
                                            className="w-full truncate bg-transparent text-sm font-semibold text-[#e7f7ff] outline-none disabled:opacity-80"
                                        />
                                        <p className="mt-1 text-[11px] text-[#8ca9bb]">
                                            {item.file.name} · {(item.file.size / 1024 / 1024).toFixed(1)}MB
                                        </p>
                                        {item.error && <p className="mt-1 text-xs leading-5 text-[#ffad9a]">{item.error}</p>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {(item.state === "uploading" || item.state === "processing") && (
                                            <span className="flex items-center gap-2 text-xs font-semibold text-[#a7ffe1]">
                                                <LoaderCircle size={14} className="animate-spin" />
                                                {item.state === "uploading" ? "Uploading" : "Indexing"}
                                            </span>
                                        )}
                                        {item.state === "ready" && <CheckCircle2 size={17} className="text-[#8ff5d3]" />}
                                        {item.state === "failed" && (
                                            <button
                                                onClick={() => void processItem(item)}
                                                disabled={running}
                                                className="button-secondary inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px]">
                                                <RefreshCw size={12} /> Retry
                                            </button>
                                        )}
                                        {item.state === "pending" && !running && (
                                            <button onClick={() => setItems((current) => current.filter((value) => value.id !== item.id))} aria-label="Remove file" className="p-1 text-[#8ca9bb] hover:text-[#ffad9a]">
                                                <X size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <div className="mt-6 flex items-center justify-between gap-4">
                    <p className="text-xs leading-5 text-[#8daabd]">
                        {running
                            ? "Keep this page open while files are indexed."
                            : completed
                                ? `${completed} document${completed === 1 ? "" : "s"} ready.`
                                : ""}
                    </p>
                    <div className="flex gap-2">
                        {completed > 0 && !running && (
                            <Link href="/dashboard" className="button-secondary px-4 py-2.5 text-sm">View library</Link>
                        )}
                        <button
                            onClick={() => void start()}
                            disabled={running || !items.some((item) => item.state === "pending" || item.state === "failed")}
                            className="button-primary px-5 py-2.5 text-sm">
                            {running ? "Processing…" : `Process ${items.filter((item) => item.state === "pending" || item.state === "failed").length || ""} document${items.filter((item) => item.state === "pending" || item.state === "failed").length === 1 ? "" : "s"}`}
                        </button>
                    </div>
                </div>
            </div>
        </main>
    )
}
