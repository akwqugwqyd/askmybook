"use client"

import Link from "next/link"
import {
    ArrowUp,
    BookOpen,
    Check,
    ChevronDown,
    FileText,
    Library,
    LoaderCircle,
    MessageSquare,
    PanelLeft,
    Plus,
    Search,
    Sparkles,
    Trash2,
    X,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

interface DocumentItem {
    _id: string
    title: string
    documentName: string
    processingStatus: "queued" | "processing" | "ready" | "failed"
    pageCount: number
}

interface Citation {
    document: string
    documentId?: string
    page: string
    excerpt?: string
    relevance?: number
}

interface Message {
    _id?: string
    role: "user" | "assistant"
    content: string
    citations?: Citation[]
}

interface Conversation {
    _id: string
    title: string
    scope: "selected" | "all"
    documentIds: string[]
    lastMessageAt?: string
}

interface StreamEvent {
    type: "status" | "final" | "error"
    status?: string
    reply?: string
    error?: string
    conversationId?: string
    citations?: Citation[]
}

const suggestions = [
    "Summarize the key ideas from the selected sources.",
    "What conclusions are supported by these documents?",
    "Compare the sources and identify disagreements.",
]

const withoutInlineCitations = (content: string): string =>
    content
        .replace(/\s*\([^()\n,]+,\s*page\s+[^)\n]+\)/gi, "")
        .replace(/[ \t]+\n/g, "\n")
        .trim()

const parseEvent = (line: string): StreamEvent | null => {
    try {
        const value = JSON.parse(line) as StreamEvent
        return value && typeof value.type === "string" ? value : null
    } catch {
        return null
    }
}

export default function KnowledgeChatPage() {
    const [documents, setDocuments] = useState<DocumentItem[]>([])
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [scope, setScope] = useState<"selected" | "all">("selected")
    const [conversationId, setConversationId] = useState("")
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState("")
    const [status, setStatus] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(true)
    const [sending, setSending] = useState(false)
    const [selectorOpen, setSelectorOpen] = useState(false)
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [activeCitation, setActiveCitation] = useState<Citation | null>(null)
    const [deletingIds, setDeletingIds] = useState<string[]>([])
    const messagesRef = useRef<HTMLDivElement>(null)

    const readyDocuments = useMemo(
        () => documents.filter((document) => document.processingStatus === "ready"),
        [documents],
    )
    const selectedDocuments = useMemo(
        () => readyDocuments.filter((document) => selectedIds.includes(document._id)),
        [readyDocuments, selectedIds],
    )
    const canSend = !sending
        && input.trim().length > 0
        && (Boolean(conversationId) || scope === "all" || selectedIds.length > 0)

    const openConversation = async (id: string) => {
        setError("")
        setStatus("")
        const response = await fetch(`/api/chat?conversationId=${encodeURIComponent(id)}`)
        const data = await response.json()
        if (!response.ok) {
            setError(data.error || "Conversation could not be opened.")
            return
        }
        setConversationId(id)
        setMessages(data.messages || [])
        setScope(data.conversation.scope)
        setSelectedIds(data.conversation.documentIds || [])
        setSidebarOpen(false)
        window.history.replaceState(null, "", `/chat?conversation=${id}`)
    }

    useEffect(() => {
        const load = async () => {
            try {
                const [documentResponse, conversationResponse] = await Promise.all([
                    fetch("/api/books", { cache: "no-store" }),
                    fetch("/api/conversations", { cache: "no-store" }),
                ])
                const [documentData, conversationData] = await Promise.all([
                    documentResponse.json(),
                    conversationResponse.json(),
                ])
                if (!documentResponse.ok) throw new Error(documentData.error || "Documents could not be loaded.")
                if (!conversationResponse.ok) {
                    throw new Error(conversationData.error || "Conversations could not be loaded.")
                }

                const loadedDocuments = (documentData.books || []) as DocumentItem[]
                setDocuments(loadedDocuments)
                setConversations(conversationData.conversations || [])

                const params = new URLSearchParams(window.location.search)
                const ids = (params.get("documents") || "").split(",").filter(Boolean)
                const validIds = ids.filter((id) =>
                    loadedDocuments.some((document) =>
                        document._id === id && document.processingStatus === "ready"),
                )
                if (validIds.length > 0) setSelectedIds(validIds)
                if (params.get("scope") === "all") setScope("all")
                const initialConversation = params.get("conversation")
                if (initialConversation) await openConversation(initialConversation)
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : "Workspace could not be loaded.")
            } finally {
                setLoading(false)
            }
        }
        void load()
    }, [])

    useEffect(() => {
        const container = messagesRef.current
        if (!container) return
        container.scrollTo({
            top: container.scrollHeight,
            behavior: messages.length > 1 ? "smooth" : "auto",
        })
    }, [messages, status])

    const startNewChat = () => {
        setConversationId("")
        setMessages([])
        setStatus("")
        setError("")
        setSidebarOpen(false)
        window.history.replaceState(null, "", "/chat")
    }

    const deleteConversation = async (conversation: Conversation) => {
        if (sending || deletingIds.includes(conversation._id)) return
        if (!window.confirm(`Delete “${conversation.title}” and all of its messages?`)) return

        setError("")
        setDeletingIds((current) => [...current, conversation._id])
        try {
            const response = await fetch(
                `/api/conversations?conversationId=${encodeURIComponent(conversation._id)}`,
                { method: "DELETE" },
            )
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || "Conversation could not be deleted.")

            setConversations((current) =>
                current.filter((item) => item._id !== conversation._id),
            )
            if (conversationId === conversation._id) startNewChat()
        } catch (deleteError) {
            setError(deleteError instanceof Error
                ? deleteError.message
                : "Conversation could not be deleted.")
        } finally {
            setDeletingIds((current) =>
                current.filter((id) => id !== conversation._id),
            )
        }
    }

    const toggleDocument = (id: string) => {
        if (conversationId) return
        setScope("selected")
        setSelectedIds((current) =>
            current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
        )
    }

    const finishAssistant = (content: string, citations: Citation[] = []) => {
        setMessages((current) => [
            ...current.filter((message) => message._id !== "pending"),
            { role: "assistant", content, citations },
        ])
    }

    const sendMessage = async (text?: string) => {
        const question = (text ?? input).trim()
        if (!question || sending || (!conversationId && scope === "selected" && selectedIds.length === 0)) return

        setSending(true)
        setError("")
        setInput("")
        setStatus("Preparing your question…")
        setMessages((current) => [
            ...current,
            { role: "user", content: question },
            { _id: "pending", role: "assistant", content: "" },
        ])

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: question,
                    conversationId: conversationId || undefined,
                    scope,
                    documentIds: scope === "selected" ? selectedIds : [],
                }),
            })
            if (!response.ok || !response.body) {
                const data = await response.json()
                throw new Error(data.error || "The question could not be submitted.")
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ""
            let nextConversationId = conversationId
            let receivedFinal = false

            while (true) {
                const { done, value } = await reader.read()
                buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
                const lines = buffer.split("\n")
                buffer = lines.pop() || ""

                for (const line of lines) {
                    const event = parseEvent(line)
                    if (!event) continue
                    if (event.conversationId && !nextConversationId) {
                        nextConversationId = event.conversationId
                        setConversationId(event.conversationId)
                        setConversations((current) => [{
                            _id: event.conversationId!,
                            title: question.slice(0, 80),
                            scope,
                            documentIds: scope === "selected" ? selectedIds : [],
                        }, ...current])
                        window.history.replaceState(null, "", `/chat?conversation=${event.conversationId}`)
                    }
                    if (event.type === "status" && event.status) setStatus(event.status)
                    if (event.type === "final" && event.reply) {
                        receivedFinal = true
                        setStatus("")
                        finishAssistant(event.reply, event.citations || [])
                    }
                    if (event.type === "error") throw new Error(event.error || "Answer generation failed.")
                }
                if (done) break
            }
            if (!receivedFinal) throw new Error("The answer stream ended before a response was completed.")
        } catch (sendError) {
            const message = sendError instanceof Error ? sendError.message : "Answer generation failed."
            setError(message)
            finishAssistant("I couldn’t complete that search. Your question is saved; please try again.")
        } finally {
            setSending(false)
            setStatus("")
        }
    }

    if (loading) {
        return (
            <main className="grid min-h-[calc(100vh-65px)] place-items-center bg-[#090908]">
                <div className="flex items-center gap-3 text-sm text-[#9a9186]">
                    <LoaderCircle size={17} className="animate-spin text-[#e8c97a]" />
                    Opening your workspace
                </div>
            </main>
        )
    }

    const selectorLabel = scope === "all"
        ? `Entire knowledge base · ${readyDocuments.length}`
        : selectedIds.length > 0
            ? `${selectedIds.length} source${selectedIds.length === 1 ? "" : "s"} selected`
            : "Select sources"

    return (
        <main className="h-[calc(100vh-65px)] overflow-hidden bg-[#090908] text-[#eee7dc]">
            <div className="mx-auto grid h-full min-h-0 max-w-[1500px] lg:grid-cols-[220px_minmax(0,1fr)]">
                {sidebarOpen && (
                    <button
                        aria-label="Close conversations"
                        className="fixed inset-0 z-30 bg-black/70 lg:hidden"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                <aside className={`fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col border-r border-[#292620] bg-[#0e0d0b] p-2.5 transition-transform lg:static lg:w-auto lg:translate-x-0 ${
                    sidebarOpen ? "translate-x-0" : "-translate-x-full"
                }`}>
                    <div className="flex items-center justify-between px-2 py-2 lg:hidden">
                        <span className="text-sm font-semibold">Conversations</span>
                        <button onClick={() => setSidebarOpen(false)} className="rounded-lg p-2 text-[#92887b]"><X size={17} /></button>
                    </div>
                    <button
                        onClick={startNewChat}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#e9cb7c] px-4 py-3 text-sm font-semibold text-[#17130d] hover:bg-[#f3d98f]">
                        <Plus size={16} /> New conversation
                    </button>
                    <div className="mt-6 flex items-center justify-between px-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#71695f]">Recent</p>
                        <MessageSquare size={13} className="text-[#5d574f]" />
                    </div>
                    <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
                        {conversations.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-[#2e2a24] px-3 py-5 text-xs leading-5 text-[#71695f]">
                                Your conversations will appear here after your first question.
                            </p>
                        ) : conversations.map((conversation) => {
                            const deleting = deletingIds.includes(conversation._id)
                            return (
                            <div
                                key={conversation._id}
                                className={`group flex items-center rounded-xl transition ${
                                    conversationId === conversation._id
                                        ? "bg-[#242019] text-[#f4ecdf]"
                                        : "text-[#aaa094] hover:bg-[#181612]"
                                }`}>
                                <button
                                    onClick={() => void openConversation(conversation._id)}
                                    className="min-w-0 flex-1 px-2.5 py-2.5 text-left">
                                    <span className="line-clamp-2 text-sm leading-5">{conversation.title}</span>
                                    <span className="mt-1.5 block text-[10px] text-[#6d655b]">
                                        {conversation.scope === "all"
                                            ? "Entire knowledge base"
                                            : `${conversation.documentIds.length} selected source${conversation.documentIds.length === 1 ? "" : "s"}`}
                                    </span>
                                </button>
                                <button
                                    aria-label={`Delete conversation ${conversation.title}`}
                                    title="Delete conversation"
                                    disabled={sending || deleting}
                                    onClick={() => void deleteConversation(conversation)}
                                    className="mr-2 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#6d655b] opacity-100 transition hover:bg-[#321c19] hover:text-[#db8e84] disabled:cursor-not-allowed disabled:opacity-40 lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100">
                                    {deleting
                                        ? <LoaderCircle size={14} className="animate-spin" />
                                        : <Trash2 size={14} />}
                                </button>
                            </div>
                            )
                        })}
                    </div>
                    <Link href="/dashboard" className="mt-3 flex items-center gap-2 rounded-xl border border-[#2e2a24] px-3 py-2.5 text-xs text-[#9a9186] hover:bg-[#181612]">
                        <Library size={14} /> Manage knowledge base
                    </Link>
                </aside>

                <section className="flex min-h-0 min-w-0 flex-col">
                    <header className="border-b border-[#292620] bg-[#0c0b0a]/95 px-4 py-3 backdrop-blur sm:px-6">
                        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-[#aaa094] hover:bg-[#1a1814] lg:hidden">
                                    <PanelLeft size={18} />
                                </button>
                                <div className="min-w-0">
                                    <h1 className="truncate text-sm font-semibold text-[#f3ebdf]">
                                        {conversationId
                                            ? conversations.find((conversation) => conversation._id === conversationId)?.title || "Document conversation"
                                            : "New grounded conversation"}
                                    </h1>
                                    <p className="mt-0.5 truncate text-[11px] text-[#756d63]">Answers use only the sources in this conversation.</p>
                                </div>
                            </div>

                            <div className="relative">
                                <button
                                    onClick={() => !conversationId && setSelectorOpen((open) => !open)}
                                    disabled={Boolean(conversationId)}
                                    className="flex max-w-[230px] items-center gap-2 rounded-xl border border-[#383229] bg-[#15130f] px-3 py-2 text-xs text-[#cfc4b5] hover:border-[#5a4c33] disabled:cursor-default disabled:opacity-75">
                                    <Library size={14} className="shrink-0 text-[#e9cb7c]" />
                                    <span className="truncate">{selectorLabel}</span>
                                    {!conversationId && <ChevronDown size={13} className="shrink-0" />}
                                </button>

                                {selectorOpen && (
                                    <div className="absolute right-0 z-20 mt-2 w-[min(360px,calc(100vw-32px))] rounded-2xl border border-[#383229] bg-[#14120f] p-2 shadow-2xl shadow-black/60">
                                        <div className="px-2 pb-2 pt-1">
                                            <p className="text-xs font-semibold text-[#e8dfd1]">Choose retrieval scope</p>
                                            <p className="mt-1 text-[10px] text-[#71695f]">This selection is locked after the first question.</p>
                                        </div>
                                        <button
                                            onClick={() => { setScope("all"); setSelectedIds([]); setSelectorOpen(false) }}
                                            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-[#211d17]">
                                            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#282116] text-[#e9cb7c]"><Library size={16} /></span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm text-[#e9dfd1]">Entire knowledge base</span>
                                                <span className="text-[10px] text-[#746b60]">{readyDocuments.length} indexed sources</span>
                                            </span>
                                            {scope === "all" && <Check size={15} className="text-[#e9cb7c]" />}
                                        </button>
                                        <div className="my-2 border-t border-[#29251f]" />
                                        <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#665f56]">Or select documents</p>
                                        <div className="max-h-64 overflow-y-auto">
                                            {readyDocuments.length === 0 ? (
                                                <div className="px-3 py-5 text-center text-xs text-[#746b60]">No indexed documents yet.</div>
                                            ) : readyDocuments.map((document) => (
                                                <button
                                                    key={document._id}
                                                    onClick={() => toggleDocument(document._id)}
                                                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[#211d17]">
                                                    <FileText size={15} className="shrink-0 text-[#81776a]" />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-sm text-[#d7ccbd]">{document.title}</span>
                                                        <span className="text-[10px] text-[#665f56]">{document.pageCount} pages</span>
                                                    </span>
                                                    <span className={`grid h-5 w-5 place-items-center rounded-md border ${
                                                        selectedIds.includes(document._id)
                                                            ? "border-[#e9cb7c] bg-[#e9cb7c] text-[#17130d]"
                                                            : "border-[#484137]"
                                                    }`}>
                                                        {selectedIds.includes(document._id) && <Check size={12} />}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                        <button onClick={() => setSelectorOpen(false)} className="mt-2 w-full rounded-xl bg-[#e9cb7c] px-3 py-2.5 text-xs font-semibold text-[#17130d]">
                                            Use selected sources
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </header>

                    <div
                        ref={messagesRef}
                        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 [scrollbar-gutter:stable] sm:px-6">
                        <div className="mx-auto max-w-4xl">
                            {messages.length === 0 ? (
                                <div className="mx-auto flex min-h-[55vh] max-w-2xl flex-col items-center justify-center text-center">
                                    <span className="grid h-14 w-14 place-items-center rounded-2xl border border-[#3a3329] bg-gradient-to-br from-[#252016] to-[#12100d] text-[#e9cb7c] shadow-xl shadow-black/30">
                                        <Sparkles size={23} />
                                    </span>
                                    <h2 className="mt-5 font-[var(--font-ibm-plex-serif)] text-3xl text-[#f2e9dc]">Ask your documents</h2>
                                    <p className="mt-3 max-w-lg text-sm leading-6 text-[#8c8276]">
                                        Choose the exact sources you trust. Every answer stays grounded and links back to supporting pages.
                                    </p>

                                    {readyDocuments.length === 0 ? (
                                        <div className="mt-7 rounded-2xl border border-[#3b3025] bg-[#17130f] p-5">
                                            <p className="text-sm text-[#d4c8b8]">You need one indexed document before asking questions.</p>
                                            <Link href="/dashboard" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#e9cb7c] px-4 py-2.5 text-xs font-semibold text-[#17130d]">
                                                <Library size={14} /> Fix document processing
                                            </Link>
                                        </div>
                                    ) : (
                                        <div className="mt-8 grid w-full gap-2 sm:grid-cols-3">
                                            {suggestions.map((suggestion) => (
                                                <button
                                                    key={suggestion}
                                                    onClick={() => void sendMessage(suggestion)}
                                                    disabled={scope === "selected" && selectedIds.length === 0}
                                                    className="rounded-2xl border border-[#312c25] bg-[#12110e] p-4 text-left text-xs leading-5 text-[#a99f92] transition hover:border-[#5d4e34] hover:bg-[#181510] disabled:cursor-not-allowed disabled:opacity-35">
                                                    {suggestion}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-8 pb-4">
                                    {messages.map((message, index) => {
                                        const pending = message._id === "pending"
                                        if (message.role === "user") {
                                            return (
                                                <article key={`user-${index}`} className="ml-auto max-w-[85%] sm:max-w-2xl">
                                                    <div className="rounded-2xl rounded-br-md bg-[#e9cb7c] px-4 py-3 text-sm leading-6 text-[#18130d]">
                                                        {message.content}
                                                    </div>
                                                </article>
                                            )
                                        }
                                        return (
                                            <article key={`assistant-${index}`} className="flex gap-3 sm:gap-4">
                                                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[#393128] bg-[#191611] text-[#e9cb7c]">
                                                    <Sparkles size={14} />
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    {pending ? (
                                                        <div className="flex items-center gap-2 py-1 text-sm text-[#9c9286]">
                                                            <LoaderCircle size={15} className="animate-spin text-[#e9cb7c]" />
                                                            {status || "Searching your sources…"}
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="whitespace-pre-wrap text-sm leading-7 text-[#ddd3c5]">
                                                                {withoutInlineCitations(message.content)}
                                                            </div>
                                                            {message.citations && message.citations.length > 0 && (
                                                                <div className="mt-4 rounded-2xl border border-[#2f2a23] bg-[#11100d] p-3">
                                                                    <div className="mb-2 flex items-center gap-2 px-1">
                                                                        <BookOpen size={13} className="text-[#e9cb7c]" />
                                                                        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#776f65]">
                                                                            {message.citations.length} supporting source{message.citations.length === 1 ? "" : "s"}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {message.citations.map((citation, citationIndex) => (
                                                                            <button
                                                                                key={`${citation.document}-${citation.page}-${citationIndex}`}
                                                                                onClick={() => setActiveCitation(citation)}
                                                                                className="group flex items-center gap-2 rounded-xl border border-[#393229] bg-[#17140f] px-3 py-2 text-left hover:border-[#6e5938]">
                                                                                <span className="grid h-5 min-w-5 place-items-center rounded-md bg-[#2c2519] text-[10px] font-semibold text-[#e9cb7c]">
                                                                                    {citationIndex + 1}
                                                                                </span>
                                                                                <span className="max-w-48 truncate text-[11px] text-[#bdb2a4]">{citation.document}</span>
                                                                                <span className="text-[10px] text-[#756c61]">p. {citation.page}</span>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </article>
                                        )
                                    })}
                                </div>
                            )}
                            <div aria-hidden="true" className="h-px" />
                        </div>
                    </div>

                    <footer className="border-t border-[#292620] bg-[#0c0b09]/95 px-4 py-2.5 backdrop-blur sm:px-6">
                        <div className="mx-auto max-w-3xl">
                            {error && (
                                <div className="mb-2 flex items-center justify-between rounded-xl border border-[#5a302d] bg-[#251412] px-3 py-2 text-xs text-[#e59a91]">
                                    <span>{error}</span>
                                    <button onClick={() => setError("")}><X size={14} /></button>
                                </div>
                            )}
                            {!conversationId && scope === "selected" && selectedDocuments.length > 0 && (
                                <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
                                    {selectedDocuments.map((document) => (
                                        <button
                                            key={document._id}
                                            onClick={() => toggleDocument(document._id)}
                                            className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#373027] bg-[#14120f] px-2.5 py-1 text-[10px] text-[#9f9588]">
                                            <FileText size={10} /> {document.title} <X size={10} />
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="flex items-end gap-1.5 rounded-xl border border-[#3a332a] bg-[#15130f] p-1.5 shadow-xl shadow-black/20 focus-within:border-[#806a43]">
                                <textarea
                                    value={input}
                                    onChange={(event) => setInput(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" && !event.shiftKey) {
                                            event.preventDefault()
                                            void sendMessage()
                                        }
                                    }}
                                    placeholder={scope === "selected" && selectedIds.length === 0 && !conversationId
                                        ? "Select sources before asking a question"
                                        : "Ask a question about your sources"}
                                    disabled={sending || (scope === "selected" && selectedIds.length === 0 && !conversationId)}
                                    rows={1}
                                    className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2.5 py-1.5 text-sm leading-6 text-[#f0e8dc] outline-none placeholder:text-[#625c54] disabled:cursor-not-allowed"
                                />
                                <button
                                    onClick={() => void sendMessage()}
                                    disabled={!canSend}
                                    aria-label="Send question"
                                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#e9cb7c] text-[#17130d] transition hover:bg-[#f3d98f] disabled:cursor-not-allowed disabled:bg-[#343028] disabled:text-[#71695e]">
                                    {sending ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowUp size={16} />}
                                </button>
                            </div>
                            <p className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-[#5f5951]">
                                <Search size={10} /> Grounded search · verify important claims in the cited page
                            </p>
                        </div>
                    </footer>
                </section>
            </div>

            {activeCitation && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center" onClick={() => setActiveCitation(null)}>
                    <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[#3b342b] bg-[#14120f] shadow-2xl" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-start justify-between border-b border-[#2d2922] px-5 py-4">
                            <div className="flex min-w-0 gap-3">
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#292217] text-[#e9cb7c]"><FileText size={16} /></span>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-[#eee5d8]">{activeCitation.document}</p>
                                    <p className="mt-1 text-[11px] text-[#81776b]">
                                        Page {activeCitation.page}
                                        {typeof activeCitation.relevance === "number"
                                            ? ` · ${(activeCitation.relevance * 100).toFixed(0)}% relevance`
                                            : ""}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setActiveCitation(null)} className="rounded-lg p-2 text-[#887f73] hover:bg-[#211d18]"><X size={16} /></button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto px-5 py-5">
                            <p className="whitespace-pre-wrap text-sm leading-7 text-[#cfc4b5]">
                                {activeCitation.excerpt || "No excerpt is available for this source."}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </main>
    )
}
