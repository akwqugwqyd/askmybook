"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { AlertCircle, CheckCircle2, FileText, LoaderCircle, UploadCloud, X } from "lucide-react"

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

const titleFromFile = (name: string) =>
    name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()

const hasPdfSignature = async (file: File): Promise<boolean> => {
    const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer())
    return new TextDecoder("ascii").decode(bytes) === "%PDF-"
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
            !(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))
            || file.size > 50 * 1024 * 1024,
        )
        if (invalid) {
            setPageError("Every file must be a PDF no larger than 50MB.")
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
                if (!await hasPdfSignature(item.file)) {
                    throw new Error("The file contents do not match a valid PDF.")
                }

                const intentResponse = await fetch("/api/upload", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        fileName: item.file.name,
                        fileSize: item.file.size,
                        contentType: item.file.type || "application/pdf",
                    }),
                })
                const intent = await intentResponse.json() as UploadIntent
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
                const upload = await uploadResponse.json()
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
                    }),
                })
                const created = await createResponse.json()
                if (!createResponse.ok) throw new Error(created.error || "Document record could not be created.")
                documentId = created.book._id
                update(item.id, { documentId })
            }

            update(item.id, { state: "processing" })
            const processResponse = await fetch(`/api/books/${documentId}/process`, { method: "POST" })
            const processed = await processResponse.json()
            if (!processResponse.ok) throw new Error(processed.error || "Document processing failed.")
            if (processed.book?.processingStatus === "failed") {
                throw new Error(processed.book.processingError?.message || "Document processing failed.")
            }
            update(item.id, {
                state: processed.book?.processingStatus === "ready" ? "ready" : "processing",
            })
        } catch (error) {
            update(item.id, {
                state: "failed",
                error: error instanceof Error ? error.message : "This document could not be processed.",
            })
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

        // A small worker pool keeps memory and third-party API pressure bounded.
        const queue = [...pending]
        const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
            while (queue.length) {
                const item = queue.shift()
                if (item) await processItem(item)
            }
        })
        await Promise.all(workers)
        setRunning(false)
    }

    return (
        <main className="min-h-screen bg-[#0d0c0a] px-4 py-10 sm:px-7">
            <div className="mx-auto max-w-3xl">
                <Link href="/dashboard" className="text-xs text-[#82766a] hover:text-[#e8c97a]">← Knowledge base</Link>
                <header className="mt-6">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#806f53]">Document ingestion</p>
                    <h1 className="mt-2 font-[var(--font-ibm-plex-serif)] text-3xl text-[#f0e6d0]">Add to your knowledge base</h1>
                    <p className="mt-2 text-sm leading-6 text-[#7d7267]">
                        Upload several PDFs at once. Each file is extracted, chunked, and indexed independently.
                    </p>
                </header>

                {pageError && (
                    <div className="mt-6 flex gap-2 rounded-xl border border-[#55302d] bg-[#241513] px-4 py-3 text-sm text-[#d58c84]">
                        <AlertCircle size={17} className="mt-0.5 shrink-0" /> {pageError}
                    </div>
                )}

                <label
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                        event.preventDefault()
                        addFiles(event.dataTransfer.files)
                    }}
                    className="mt-7 flex cursor-pointer flex-col items-center rounded-2xl border border-dashed border-[#453b30] bg-[#141210] px-6 py-12 text-center hover:border-[#806b42]">
                    <input
                        type="file"
                        accept=".pdf,application/pdf"
                        multiple
                        disabled={running}
                        className="hidden"
                        onChange={(event) => event.target.files && addFiles(event.target.files)}
                    />
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#211c14] text-[#e8c97a]"><UploadCloud size={22} /></span>
                    <p className="mt-4 text-sm font-medium text-[#dfd2bd]">Drop PDFs here, or browse</p>
                    <p className="mt-1 text-xs text-[#6f665d]">Multiple files · up to 50MB each</p>
                </label>

                {items.length > 0 && (
                    <section className="mt-6 overflow-hidden rounded-2xl border border-[#2c2721] bg-[#12100e]">
                        <div className="border-b border-[#2c2721] px-5 py-4">
                            <label className="text-[11px] uppercase tracking-[0.16em] text-[#756a60]">Author (optional, applies to all)</label>
                            <input
                                value={author}
                                onChange={(event) => setAuthor(event.target.value)}
                                disabled={running}
                                placeholder="Author or organization"
                                maxLength={160}
                                className="mt-2 w-full rounded-lg border border-[#393128] bg-[#171410] px-3 py-2.5 text-sm text-[#e4d7c2] outline-none focus:border-[#806b42]"
                            />
                        </div>
                        <div className="divide-y divide-[#27221d]">
                            {items.map((item) => (
                                <div key={item.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[28px_1fr_auto] sm:items-center">
                                    <FileText size={18} className="text-[#8d806f]" />
                                    <div className="min-w-0">
                                        <input
                                            value={item.title}
                                            disabled={running || item.state === "ready"}
                                            maxLength={200}
                                            onChange={(event) => update(item.id, { title: event.target.value })}
                                            className="w-full truncate bg-transparent text-sm text-[#dfd2bd] outline-none disabled:opacity-80"
                                        />
                                        <p className="mt-1 text-[11px] text-[#655c53]">
                                            {item.file.name} · {(item.file.size / 1024 / 1024).toFixed(1)}MB
                                        </p>
                                        {item.error && <p className="mt-1 text-xs text-[#c87c74]">{item.error}</p>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {(item.state === "uploading" || item.state === "processing") && (
                                            <span className="flex items-center gap-2 text-xs text-[#c7a967]">
                                                <LoaderCircle size={14} className="animate-spin" />
                                                {item.state === "uploading" ? "Uploading" : "Indexing"}
                                            </span>
                                        )}
                                        {item.state === "ready" && <CheckCircle2 size={17} className="text-[#88a978]" />}
                                        {item.state === "failed" && <AlertCircle size={17} className="text-[#c87c74]" />}
                                        {item.state === "pending" && !running && (
                                            <button onClick={() => setItems((current) => current.filter((value) => value.id !== item.id))} aria-label="Remove file" className="p-1 text-[#776b60]">
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
                    <p className="text-xs text-[#71675d]">
                        {running
                            ? "Keep this page open while files are indexed."
                            : completed
                                ? `${completed} document${completed === 1 ? "" : "s"} ready.`
                                : "Files are account-isolated and processed by your configured AI providers."}
                    </p>
                    <div className="flex gap-2">
                        {completed > 0 && !running && (
                            <Link href="/dashboard" className="rounded-xl border border-[#3a332b] px-4 py-2.5 text-sm text-[#cfc2ad]">View library</Link>
                        )}
                        <button
                            onClick={() => void start()}
                            disabled={running || !items.some((item) => item.state === "pending" || item.state === "failed")}
                            className="rounded-xl bg-[#e8c97a] px-5 py-2.5 text-sm font-semibold text-[#17130e] disabled:opacity-35">
                            {running ? "Processing…" : `Process ${items.filter((item) => item.state === "pending" || item.state === "failed").length || ""} document${items.filter((item) => item.state === "pending" || item.state === "failed").length === 1 ? "" : "s"}`}
                        </button>
                    </div>
                </div>
            </div>
        </main>
    )
}
