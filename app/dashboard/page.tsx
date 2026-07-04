"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Check, FileText, Library, LoaderCircle, MessageSquareText, RefreshCw, Trash2, Upload } from "lucide-react"

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
    ready: "border-[#34452d] bg-[#182017] text-[#9fbd8e]",
    queued: "border-[#51452d] bg-[#211c13] text-[#c7a967]",
    processing: "border-[#51452d] bg-[#211c13] text-[#c7a967]",
    failed: "border-[#55302d] bg-[#241513] text-[#d58c84]",
}

export default function DashboardPage() {
    const [data, setData] = useState<DashboardData | null>(null)
    const [selected, setSelected] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [retryingIds, setRetryingIds] = useState<string[]>([])
    const readyIds = useMemo(
        () => data?.documents.filter((document) => document.processingStatus === "ready").map((document) => document._id) || [],
        [data],
    )

    const load = async () => {
        try {
            const response = await fetch("/api/dashboard", { cache: "no-store" })
            const result = await response.json() as DashboardData
            if (!response.ok) throw new Error(result.error || "Dashboard could not be loaded.")
            setData(result)
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Dashboard could not be loaded.")
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
            const response = await fetch(`/api/books/${id}/process`, { method: "POST" })
            const result = await response.json()
            if (!response.ok) setError(result.error || "Processing could not be restarted.")
        } catch {
            setError("Processing could not be restarted. Check your connection and retry.")
        } finally {
            setRetryingIds((current) => current.filter((value) => value !== id))
            await load()
        }
    }

    const remove = async (document: DashboardDocument) => {
        if (!window.confirm(`Delete “${document.title}” and its vectors, chunks, and scoped chats?`)) return
        const response = await fetch(`/api/books/${document._id}`, { method: "DELETE" })
        const result = await response.json()
        if (!response.ok) {
            setError(result.error || "Document could not be deleted.")
            return
        }
        setSelected((current) => current.filter((id) => id !== document._id))
        await load()
    }

    if (loading) return <main className="min-h-[70vh] grid place-items-center text-[#81766a]">Loading your knowledge base…</main>

    return (
        <main className="min-h-screen bg-[#0d0c0a] px-4 py-10 sm:px-7">
            <div className="mx-auto max-w-6xl">
                <header className="flex flex-wrap items-end justify-between gap-5">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-[#806f53]">Private workspace</p>
                        <h1 className="mt-2 font-[var(--font-ibm-plex-serif)] text-3xl text-[#f0e6d0]">Your knowledge base</h1>
                        <p className="mt-2 text-sm text-[#7d7267]">Manage sources, monitor indexing, and choose what the assistant can search.</p>
                    </div>
                    <div className="flex gap-2">
                        <Link href="/chat?scope=all" className="flex items-center gap-2 rounded-xl border border-[#3a332b] px-4 py-2.5 text-sm text-[#d7c9b4] hover:bg-[#171410]">
                            <Library size={15} /> Ask everything
                        </Link>
                        <Link href="/books/new" className="flex items-center gap-2 rounded-xl bg-[#e8c97a] px-4 py-2.5 text-sm font-semibold text-[#17130e]">
                            <Upload size={15} /> Upload
                        </Link>
                    </div>
                </header>

                {error && <div className="mt-6 rounded-xl border border-[#55302d] bg-[#241513] px-4 py-3 text-sm text-[#d58c84]">{error}</div>}

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
                                        ? "border-[#4f2d29] bg-[#1b1110]"
                                        : "border-[#2c2721] bg-[#141210]"
                                }`}>
                                    <p className="text-xs text-[#756a60]">{label}</p>
                                    <p className="mt-2 text-2xl text-[#eee2cd]">{value}</p>
                                </div>
                            ))}
                        </section>

                        <section className="mt-8 overflow-hidden rounded-2xl border border-[#2c2721] bg-[#12100e]">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2c2721] px-4 py-3.5 sm:px-5">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setSelected(selected.length === readyIds.length ? [] : readyIds)}
                                        className="grid h-5 w-5 place-items-center rounded border border-[#4a4035] text-[#e8c97a]">
                                        {readyIds.length > 0 && selected.length === readyIds.length && <Check size={13} />}
                                    </button>
                                    <p className="text-sm text-[#bdb09d]">
                                        {selected.length ? `${selected.length} selected` : `${data.documents.length} documents`}
                                    </p>
                                </div>
                                {selected.length > 0 && (
                                    <Link
                                        href={`/chat?documents=${selected.join(",")}`}
                                        className="flex items-center gap-2 rounded-lg bg-[#e8c97a] px-3.5 py-2 text-xs font-semibold text-[#17130e]">
                                        <MessageSquareText size={14} /> Ask selected
                                    </Link>
                                )}
                            </div>

                            {data.documents.length === 0 ? (
                                <div className="px-6 py-16 text-center">
                                    <FileText size={28} className="mx-auto text-[#4e463e]" />
                                    <p className="mt-4 text-sm text-[#b8aa97]">No documents yet</p>
                                    <p className="mt-1 text-xs text-[#6e655c]">Upload PDFs to build your private, searchable knowledge base.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-[#27221d]">
                                    {data.documents.map((document) => {
                                        const canSelect = document.processingStatus === "ready"
                                        return (
                                            <div key={document._id} className="grid gap-4 px-4 py-4 sm:grid-cols-[28px_1fr_auto_auto] sm:items-center sm:px-5">
                                                <button
                                                    disabled={!canSelect}
                                                    onClick={() => toggle(document._id)}
                                                    aria-label={`Select ${document.title}`}
                                                    className="grid h-5 w-5 place-items-center rounded border border-[#4a4035] text-[#e8c97a] disabled:opacity-25">
                                                    {selected.includes(document._id) && <Check size={13} />}
                                                </button>
                                                <div className="min-w-0">
                                                    <Link href={`/books/${document._id}`} className="truncate text-sm font-medium text-[#e4d7c2] hover:text-[#e8c97a]">
                                                        {document.title}
                                                    </Link>
                                                    <p className="mt-1 truncate text-xs text-[#6f665d]">
                                                        {document.author} · {document.pageCount || 0} pages · {document.chunkCount || 0} chunks
                                                    </p>
                                                    {document.processingStatus === "processing" && document.processingStage && (
                                                        <p className="mt-1 text-[10px] capitalize text-[#c7a967]">
                                                            {document.processingStage} stage
                                                        </p>
                                                    )}
                                                    {document.processingError?.message && (
                                                        <div className="mt-2 flex items-start gap-1.5 text-xs text-[#cf7f76]">
                                                            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                                                            <span>
                                                                {document.processingError.message}
                                                                {document.processingError.code && (
                                                                    <span className="ml-1 text-[9px] uppercase tracking-wider text-[#7e5752]">
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
                                                            className="flex items-center gap-1.5 rounded-lg border border-[#40382e] px-2.5 py-1.5 text-[10px] text-[#c5b9a9] hover:bg-[#211d18] disabled:opacity-50">
                                                            {retryingIds.includes(document._id)
                                                                ? <LoaderCircle size={13} className="animate-spin" />
                                                                : <RefreshCw size={13} />}
                                                            Retry
                                                        </button>
                                                    )}
                                                    <button onClick={() => void remove(document)} aria-label="Delete document" className="rounded-lg p-2 text-[#91615d] hover:bg-[#241513]">
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
