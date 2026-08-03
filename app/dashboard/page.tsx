"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Check, FileText, Library, LoaderCircle, MessageSquareText, RefreshCw, Trash2, Upload } from "lucide-react"
import RecoveryPanel from "@/components/RecoveryPanel"

type Status = "queued" | "processing" | "ready" | "failed"
interface DashboardDocument {
    _id: string
    title: string
    author: string
    processingStatus: Status
    processingStage?: string
    pageCount: number
    chunkCount: number
    processingError?: { message?: string; code?: string }
    createdAt: string
}
interface DashboardData {
    success: boolean
    stats: {
        totalBooks: number
        readyBooks: number
        processingBooks: number
        failedBooks: number
        totalMessages: number
    }
    documents: DashboardDocument[]
    error?: string
}

const statusStyle: Record<Status, string> = {
    ready: "border-[#8ff5d3]/30 bg-[#8ff5d3]/10 text-[#a7ffe1]",
    queued: "border-[#91d9ff]/30 bg-[#91d9ff]/10 text-[#b8e9ff]",
    processing: "border-[#91d9ff]/30 bg-[#91d9ff]/10 text-[#b8e9ff]",
    failed: "border-[#ffad9a]/30 bg-[#ff927a]/10 text-[#ffb5a4]",
}

const friendlyRequestError = (error: unknown, fallback: string): string => {
    const message = error instanceof Error ? error.message : ""
    if (/failed to fetch|networkerror|load failed/i.test(message)) return "We could not reach the service. Check your connection and try again."
    if (/unexpected token|json/i.test(message)) return fallback
    return message || fallback
}

const withoutDocument = (current: DashboardData, documentId: string): DashboardData => {
    const document = current.documents.find((item) => item._id === documentId)
    if (!document) return current

    const stats = { ...current.stats, totalBooks: Math.max(0, current.stats.totalBooks - 1) }
    if (document.processingStatus === "ready") stats.readyBooks = Math.max(0, stats.readyBooks - 1)
    if (document.processingStatus === "failed") stats.failedBooks = Math.max(0, stats.failedBooks - 1)
    if (document.processingStatus === "queued" || document.processingStatus === "processing") {
        stats.processingBooks = Math.max(0, stats.processingBooks - 1)
    }

    return {
        ...current,
        stats,
        documents: current.documents.filter((item) => item._id !== documentId),
    }
}

export default function DashboardPage() {
    const [data, setData] = useState<DashboardData | null>(null)
    const [selected, setSelected] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [retryingIds, setRetryingIds] = useState<string[]>([])
    const deletingIds = useRef(new Set<string>())
    const readyIds = useMemo(
        () => data?.documents.filter((document) => document.processingStatus === "ready").map((document) => document._id) || [],
        [data],
    )

    const load = async () => {
        setError("")
        try {
            const response = await fetch("/api/dashboard", { cache: "no-store" })
            const result = await response.json().catch(() => ({})) as DashboardData
            if (!response.ok) throw new Error(result.error || "Dashboard could not be loaded.")
            const visibleResult = [...deletingIds.current].reduce(
                (current, documentId) => withoutDocument(current, documentId),
                result,
            )
            setData(visibleResult)
        } catch (loadError) {
            setError(friendlyRequestError(loadError, "Your knowledge base could not be loaded. Please try again."))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { void load() }, [])

    useEffect(() => {
        if (!data?.documents.some((document) =>
            document.processingStatus === "queued" || document.processingStatus === "processing")) return
        const interval = window.setInterval(() => void load(), 4000)
        return () => window.clearInterval(interval)
    }, [data])

    const toggle = (id: string) => {
        setSelected((current) => current.includes(id)
            ? current.filter((item) => item !== id)
            : [...current, id])
    }

    const retry = async (id: string) => {
        setError("")
        setRetryingIds((current) => [...current, id])
        setData((current) => current ? {
            ...current,
            documents: current.documents.map((document) =>
                document._id === id
                    ? { ...document, processingStatus: "processing", processingError: undefined }
                    : document),
        } : current)
        try {
            const response = await fetch("/api/process-document", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ documentId: id }),
            })
            const result = await response.json().catch(() => ({})) as { error?: string }
            if (!response.ok) setError(result.error || "Processing could not be restarted.")
        } catch (retryError) {
            setError(friendlyRequestError(retryError, "Processing could not be restarted. Please try again."))
        } finally {
            setRetryingIds((current) => current.filter((value) => value !== id))
            await load()
        }
    }

    const remove = async (document: DashboardDocument) => {
        if (!window.confirm(`Delete “${document.title}” and its vectors, chunks, and scoped chats?`)) return
        setError("")
        deletingIds.current.add(document._id)
        setSelected((current) => current.filter((id) => id !== document._id))
        setData((current) => current ? withoutDocument(current, document._id) : current)

        try {
            const response = await fetch(`/api/books/${document._id}`, { method: "DELETE" })
            const result = await response.json().catch(() => ({})) as { error?: string }
            if (!response.ok) throw new Error(result.error || "Document could not be deleted.")
            deletingIds.current.delete(document._id)
            void load()
        } catch (deleteError) {
            deletingIds.current.delete(document._id)
            const message = friendlyRequestError(deleteError, "Document could not be deleted. Please try again.")
            await load()
            setError(message)
        }
    }

    if (loading) return (
        <main className="app-frame grid min-h-[70vh] place-items-center px-5">
            <div className="flex items-center gap-3 text-sm text-[#9bb7c9]"><LoaderCircle size={17} className="animate-spin text-[#8ff5d3]" /> Loading your knowledge base</div>
        </main>
    )

    if (!data && error) return (
        <main className="app-frame grid min-h-[70vh] place-items-center px-5 py-10">
            <RecoveryPanel title="Your knowledge base is taking a moment" message={error} onRetry={() => void load()} />
        </main>
    )

    return (
        <main className="app-frame min-h-screen px-4 py-10 sm:px-7">
            <div className="mx-auto max-w-6xl">
                <header className="flex flex-wrap items-end justify-between gap-5">
                    <div>
                        <p className="eyebrow">Workspace</p>
                        <h1 className="font-display mt-2 text-4xl tracking-[-0.04em] text-[#effaff]">Knowledge base</h1>
                        <p className="mt-2 text-sm text-[#9bb7c9]">Manage documents, follow indexing, and choose what chat can search.</p>
                    </div>
                    <div className="flex gap-2">
                        <Link href="/chat?scope=all" className="button-secondary flex items-center gap-2 px-4 py-2.5 text-sm">
                            <Library size={15} /> Ask everything
                        </Link>
                        <Link href="/books/new" className="button-primary flex items-center gap-2 px-4 py-2.5 text-sm">
                            <Upload size={15} /> Upload
                        </Link>
                    </div>
                </header>

                {error && <div className="mt-6"><RecoveryPanel compact message={error} onRetry={() => void load()} /></div>}

                {data && (
                    <>
                        <section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-5">
                            {[
                                ["Documents", data.stats.totalBooks],
                                ["Ready", data.stats.readyBooks],
                                ["Indexing", data.stats.processingBooks],
                                ["Failed", data.stats.failedBooks],
                                ["Messages", data.stats.totalMessages],
                            ].map(([label, value]) => (
                                <div key={label} className={`rounded-xl border p-4 ${
                                    label === "Failed" && Number(value) > 0
                                        ? "border-[#ffad9a]/25 bg-[#ff927a]/10"
                                        : "shell-card"
                                }`}>
                                    <p className="text-xs text-[#91adbf]">{label}</p>
                                    <p className="mt-2 text-2xl font-semibold text-[#effaff]">{value}</p>
                                </div>
                            ))}
                        </section>

                        <section className="shell-card mt-8 overflow-hidden rounded-2xl">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#b7e6ff]/12 px-4 py-3.5 sm:px-5">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setSelected(selected.length === readyIds.length ? [] : readyIds)}
                                        className="grid h-5 w-5 place-items-center rounded border border-[#8fc7e1]/45 text-[#8ff5d3]">
                                        {readyIds.length > 0 && selected.length === readyIds.length && <Check size={13} />}
                                    </button>
                                    <p className="text-sm text-[#c9e1ef]">
                                        {selected.length ? `${selected.length} selected` : `${data.documents.length} documents`}
                                    </p>
                                </div>
                                {selected.length > 0 && (
                                    <Link
                                        href={`/chat?documents=${selected.join(",")}`}
                                        className="button-primary flex items-center gap-2 px-3.5 py-2 text-xs">
                                        <MessageSquareText size={14} /> Ask selected
                                    </Link>
                                )}
                            </div>

                            {data.documents.length === 0 ? (
                                <div className="px-6 py-16 text-center">
                                    <FileText size={28} className="mx-auto text-[#8ff5d3]" />
                                    <p className="mt-4 text-sm font-semibold text-[#dff2fb]">No sources yet</p>
                                    <p className="mt-1 text-xs text-[#8faabd]">Upload documents, data files, or images to make your knowledge base searchable.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-[#b7e6ff]/10">
                                    {data.documents.map((document) => {
                                        const canSelect = document.processingStatus === "ready"
                                        return (
                                            <div key={document._id} className="grid gap-4 px-4 py-4 sm:grid-cols-[28px_1fr_auto_auto] sm:items-center sm:px-5">
                                                <button
                                                    disabled={!canSelect}
                                                    onClick={() => toggle(document._id)}
                                                    aria-label={`Select ${document.title}`}
                                                    className="grid h-5 w-5 place-items-center rounded border border-[#8fc7e1]/45 text-[#8ff5d3] disabled:opacity-25">
                                                    {selected.includes(document._id) && <Check size={13} />}
                                                </button>
                                                <div className="min-w-0">
                                                    <Link href={`/books/${document._id}`} className="truncate text-sm font-semibold text-[#e8f7ff] hover:text-[#a7ffe1]">
                                                        {document.title}
                                                    </Link>
                                                    <p className="mt-1 truncate text-xs text-[#8aa8ba]">
                                                        {document.author} · {document.pageCount || 0} pages · {document.chunkCount || 0} chunks
                                                    </p>
                                                    {document.processingStatus === "processing" && document.processingStage && (
                                                        <p className="mt-1 text-[10px] capitalize text-[#a7ffe1]">
                                                            {document.processingStage} stage
                                                        </p>
                                                    )}
                                                    {document.processingError?.message && (
                                                        <div className="mt-2 flex items-start gap-1.5 text-xs text-[#ffb5a4]">
                                                            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                                                            <span>
                                                                {document.processingError.message}
                                                                {document.processingError.code && (
                                                                    <span className="ml-1 text-[9px] uppercase tracking-wider text-[#d58e80]">
                                                                        {document.processingError.code}
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                                <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] capitalize ${statusStyle[document.processingStatus]}`}>
                                                    {document.processingStatus}
                                                </span>
                                                <div className="flex justify-end gap-1">
                                                    {document.processingStatus === "failed" && (
                                                        <button
                                                            onClick={() => void retry(document._id)}
                                                            disabled={retryingIds.includes(document._id)}
                                                            aria-label="Retry processing"
                                                            title="Retry indexing"
                                                            className="button-secondary flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] disabled:opacity-50">
                                                            {retryingIds.includes(document._id)
                                                                ? <LoaderCircle size={13} className="animate-spin" />
                                                                : <RefreshCw size={13} />}
                                                            Retry
                                                        </button>
                                                    )}
                                                    <button onClick={() => void remove(document)} aria-label="Delete document" className="rounded-lg p-2 text-[#ffad9a] hover:bg-[#ff927a]/10">
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </section>
                    </>
                )}
            </div>
        </main>
    )
}
