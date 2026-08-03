"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, FileText, LoaderCircle, Trash2 } from "lucide-react"
import type { IBook } from "@/database/models/book.model"
import { CURRENT_EMBEDDING_VERSION, CURRENT_INDEXING_VERSION } from "@/lib/ai-config"
import RecoveryPanel from "@/components/RecoveryPanel"

interface BookResponse {
    success?: boolean
    book?: IBook
    error?: string
    message?: string
}

export default function BookPage() {
    const { id } = useParams()
    const router = useRouter()
    const [book, setBook] = useState<IBook | null>(null)
    const [loading, setLoading] = useState(true)
    const [deleting, setDeleting] = useState(false)
    const [processing, setProcessing] = useState(false)
    const [processMessage, setProcessMessage] = useState("")
    const [error, setError] = useState("")
    const documentId = Array.isArray(id) ? id[0] : id
    const isReady = (book?.processingStatus === "ready" || !book?.processingStatus)
        && (book?.indexingVersion || 1) >= CURRENT_INDEXING_VERSION
        && (book?.embeddingVersion || 1) === CURRENT_EMBEDDING_VERSION
    const isPdf = book?.documentName?.toLowerCase().endsWith(".pdf")

    const fetchBook = useCallback(async () => {
        if (!documentId) return
        setError("")
        try {
            const response = await fetch(`/api/books/${documentId}`)
            const data = await response.json().catch(() => ({})) as BookResponse
            if (!response.ok || !data.success || !data.book) {
                throw new Error(data.error || "This document could not be loaded.")
            }
            setBook(data.book)
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "This document could not be loaded.")
        } finally {
            setLoading(false)
        }
    }, [documentId])

    const startProcessing = useCallback(async () => {
        if (!documentId || processing) return
        setError("")
        setProcessing(true)
        setProcessMessage("Processing this source now. Larger files can take a little while.")
        try {
            const response = await fetch("/api/process-document", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ documentId }),
            })
            const data = await response.json().catch(() => ({})) as BookResponse
            if (!response.ok || !data.success || !data.book) {
                throw new Error(data.error || "Processing could not be started.")
            }
            setBook(data.book)
            setProcessMessage(data.book.processingStatus === "ready"
                ? "Processing complete. Your source is ready to chat."
                : data.message || "Processing is underway. You can leave this page and check back soon.")
        } catch (processError) {
            const message = processError instanceof Error ? processError.message : "Processing could not be started."
            setError(message)
            setProcessMessage(message)
            await fetchBook()
        } finally {
            setProcessing(false)
        }
    }, [documentId, fetchBook, processing])

    useEffect(() => { void fetchBook() }, [fetchBook])

    useEffect(() => {
        if (book?.processingStatus === "queued") void startProcessing()
    }, [book?.processingStatus, startProcessing])

    useEffect(() => {
        if (book?.processingStatus !== "processing" || processing) return
        const interval = window.setInterval(() => void fetchBook(), 3_000)
        return () => window.clearInterval(interval)
    }, [book?.processingStatus, processing, fetchBook])

    const handleDelete = async () => {
        if (!window.confirm("Delete this source, its index, and related conversations?")) return
        setError("")
        setDeleting(true)
        try {
            const response = await fetch(`/api/books/${documentId}`, { method: "DELETE" })
            const data = await response.json().catch(() => ({})) as BookResponse
            if (!response.ok || !data.success) throw new Error(data.error || "This source could not be deleted.")
            router.push("/dashboard")
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : "This source could not be deleted. Please retry.")
        } finally {
            setDeleting(false)
        }
    }

    if (loading) {
        return (
            <main className="app-frame grid min-h-screen place-items-center">
                <div className="flex items-center gap-3 text-sm text-[#9bb7c9]"><LoaderCircle size={17} className="animate-spin text-[#8ff5d3]" /> Loading source</div>
            </main>
        )
    }

    if (error && !book) {
        return (
            <main className="app-frame grid min-h-screen place-items-center px-5 py-10">
                <RecoveryPanel title="This source could not be opened" message={error} onRetry={() => void fetchBook()} backHref="/dashboard" backLabel="Knowledge base" />
            </main>
        )
    }

    if (!book) {
        return (
            <main className="app-frame grid min-h-screen place-items-center px-5">
                <div className="text-center"><p className="text-sm text-[#d9effb]">Source not found.</p><Link href="/dashboard" className="mt-3 inline-flex text-xs font-semibold text-[#8ff5d3]">Return to knowledge base</Link></div>
            </main>
        )
    }

    return (
        <main className="app-frame min-h-screen px-5 py-10 sm:px-7">
            <div className="mx-auto max-w-3xl">
                <Link href="/dashboard" className="mb-7 inline-flex items-center gap-2 text-xs font-semibold text-[#9bc2d8] hover:text-[#a7ffe1]"><ArrowLeft size={14} /> Knowledge base</Link>
                {error && <div className="mb-5"><RecoveryPanel compact message={error} onRetry={() => { setError(""); void fetchBook() }} /></div>}

                <section className="shell-card overflow-hidden rounded-[1.7rem]">
                    <div className="flex flex-col md:flex-row">
                        <div className="relative grid h-52 w-full shrink-0 place-items-center overflow-hidden bg-[#0a2639] md:h-auto md:w-56">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(143,245,211,.18),transparent_46%),radial-gradient(circle_at_76%_75%,rgba(255,146,122,.15),transparent_42%)]" />
                            {book.coverImage ? <Image src={book.coverImage} alt={book.title} fill className="object-cover" /> : <FileText size={48} className="relative text-[#8ff5d3]" />}
                        </div>

                        <div className="flex flex-1 flex-col gap-4 p-6 sm:p-8">
                            <div>
                                <p className="eyebrow">Document details</p>
                                <h1 className="mt-2 text-2xl font-semibold leading-tight text-[#effaff]">{book.title}</h1>
                                <p className="mt-1 text-sm text-[#8ff5d3]">{book.author}</p>
                            </div>
                            <p className="text-xs text-[#8ba8ba]">Added {new Date(book.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

                            <div className="rounded-xl border border-[#b7e6ff]/14 bg-[#071b2b]/55 px-4 py-3">
                                <p className="eyebrow">Index status</p>
                                <p className={`mt-2 text-sm font-semibold ${isReady ? "text-[#8ff5d3]" : book.processingStatus === "failed" ? "text-[#ffad9a]" : "text-[#b8e9ff]"}`}>{isReady ? "Ready to chat" : book.processingStatus}</p>
                                {book.processingError?.message && <p className="mt-2 text-xs leading-5 text-[#ffad9a]">{book.processingError.message}</p>}
                                {book.pageCount > 0 && <p className="mt-2 text-xs text-[#8ba8ba]">{book.pageCount} source sections · {book.chunkCount} chunks indexed</p>}
                                {processMessage && <p className="mt-2 text-xs leading-5 text-[#a8c0d2]">{processMessage}</p>}
                                {(book.processingStatus === "queued" || book.processingStatus === "failed" || !isReady) && (
                                    <button onClick={() => void startProcessing()} disabled={processing} className="button-primary mt-3 px-3 py-2 text-xs">
                                        {processing ? "Processing..." : book.processingStatus === "failed" ? "Retry processing" : "Process now"}
                                    </button>
                                )}
                            </div>

                            <div className="mt-auto flex flex-wrap gap-3 pt-2">
                                {isPdf && <Link href={`/books/${documentId}/preview`} className="button-secondary px-4 py-3 text-center text-sm">Preview PDF</Link>}
                                {isReady ? <Link href={`/chat?documents=${documentId}`} className="button-primary flex-1 px-4 py-3 text-center text-sm">Ask this source</Link> : <button disabled className="flex-1 cursor-not-allowed rounded-xl bg-[#234357] px-4 py-3 text-sm font-semibold text-[#7694a5]">Chat unavailable</button>}
                                <button onClick={() => void handleDelete()} disabled={deleting} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#ffad9a]/35 px-4 py-3 text-sm text-[#ffb5a4] hover:bg-[#ff927a]/10 disabled:opacity-50"><Trash2 size={15} /> {deleting ? "Deleting" : "Delete"}</button>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    )
}
