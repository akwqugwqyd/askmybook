"use client"

import Link from "next/link"
import { ArrowUp, Check, ChevronDown, FileText, LoaderCircle, PanelLeft, Plus, Trash2, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import RecoveryPanel from "@/components/RecoveryPanel"

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
}

interface StreamEvent {
    type: "status" | "final" | "error"
    status?: string
    reply?: string
    error?: string
    conversationId?: string
    citations?: Citation[]
}

const requestError = (error: unknown, fallback: string): string => {
    const message = error instanceof Error ? error.message : ""
    if (/failed to fetch|networkerror|load failed/i.test(message)) return "We could not reach the service. Check your connection and try again."
    if (/unexpected token|json/i.test(message)) return fallback
    return message || fallback
}

const parseEvent = (line: string): StreamEvent | null => {
    try {
        const event = JSON.parse(line) as StreamEvent
        return typeof event.type === "string" ? event : null
    } catch {
        return null
    }
}

const dedupeConversations = (items: Conversation[]): Conversation[] => {
    const seen = new Set<string>()
    return items.filter((conversation) => {
        if (seen.has(conversation._id)) return false
        seen.add(conversation._id)
        return true
    })
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
    const [sidebarVisible, setSidebarVisible] = useState(true)
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [selectorOpen, setSelectorOpen] = useState(false)
    const [activeCitation, setActiveCitation] = useState<Citation | null>(null)
    const [deletingIds, setDeletingIds] = useState<string[]>([])
    const [lastFailedQuestion, setLastFailedQuestion] = useState("")
    const messagesRef = useRef<HTMLDivElement>(null)

    const readyDocuments = useMemo(() => documents.filter((document) => document.processingStatus === "ready"), [documents])
    const selectedDocuments = useMemo(() => readyDocuments.filter((document) => selectedIds.includes(document._id)), [readyDocuments, selectedIds])
    const uniqueConversations = useMemo(() => dedupeConversations(conversations), [conversations])
    const canSend = !sending && input.trim().length > 0 && (Boolean(conversationId) || scope === "all" || selectedIds.length > 0)
    const selectorLabel = scope === "all" ? `All documents (${readyDocuments.length})` : selectedIds.length ? `${selectedIds.length} selected` : "Select documents"

    const openConversation = async (id: string) => {
        setError("")
        try {
            const response = await fetch(`/api/chat?conversationId=${encodeURIComponent(id)}`)
            const data = await response.json().catch(() => ({})) as { error?: string; messages?: Message[]; conversation?: Conversation }
            if (!response.ok || !data.conversation) throw new Error(data.error || "Conversation could not be opened.")
            setConversationId(id)
            setMessages(data.messages || [])
            setScope(data.conversation.scope)
            setSelectedIds(data.conversation.documentIds || [])
            setSidebarOpen(false)
            window.history.replaceState(null, "", `/chat?conversation=${id}`)
        } catch (openError) {
            setError(requestError(openError, "Conversation could not be opened. Please try again."))
        }
    }

    useEffect(() => {
        const loadWorkspace = async () => {
            try {
                const [documentResponse, conversationResponse] = await Promise.all([
                    fetch("/api/books", { cache: "no-store" }),
                    fetch("/api/conversations", { cache: "no-store" }),
                ])
                const [documentData, conversationData] = await Promise.all([
                    documentResponse.json().catch(() => ({})),
                    conversationResponse.json().catch(() => ({})),
                ]) as [{ books?: DocumentItem[]; error?: string }, { conversations?: Conversation[]; error?: string }]
                if (!documentResponse.ok) throw new Error(documentData.error || "Documents could not be loaded.")
                if (!conversationResponse.ok) throw new Error(conversationData.error || "Conversations could not be loaded.")
                const loadedDocuments = documentData.books || []
                const loadedConversations = dedupeConversations(conversationData.conversations || [])
                setDocuments(loadedDocuments)
                setConversations(loadedConversations)

                const params = new URLSearchParams(window.location.search)
                const requestedIds = (params.get("documents") || "").split(",").filter(Boolean)
                const validIds = requestedIds.filter((id) => loadedDocuments.some((document) => document._id === id && document.processingStatus === "ready"))
                if (validIds.length) setSelectedIds(validIds)
                if (params.get("scope") === "all") setScope("all")
                const initialConversation = params.get("conversation")
                const startsNewChat = params.has("scope") || params.has("documents")
                if (initialConversation) await openConversation(initialConversation)
                else if (!startsNewChat && loadedConversations[0]) await openConversation(loadedConversations[0]._id)
            } catch (loadError) {
                setError(requestError(loadError, "Your workspace could not be loaded. Please try again."))
            } finally {
                setLoading(false)
            }
        }
        void loadWorkspace()
    }, [])

    useEffect(() => {
        const container = messagesRef.current
        if (container) container.scrollTo({ top: container.scrollHeight, behavior: messages.length > 1 ? "smooth" : "auto" })
    }, [messages, status])

    const newChat = () => {
        setConversationId("")
        setMessages([])
        setStatus("")
        setError("")
        setLastFailedQuestion("")
        setSidebarOpen(false)
        window.history.replaceState(null, "", "/chat")
    }

    const toggleDocument = (id: string) => {
        if (conversationId) return
        setScope("selected")
        setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
    }

    const deleteConversation = async (conversation: Conversation) => {
        if (sending || deletingIds.includes(conversation._id)) return
        if (!window.confirm(`Delete "${conversation.title}"?`)) return
        setDeletingIds((current) => [...current, conversation._id])
        setError("")
        try {
            const response = await fetch(`/api/conversations?conversationId=${encodeURIComponent(conversation._id)}`, { method: "DELETE" })
            const data = await response.json().catch(() => ({})) as { error?: string }
            if (!response.ok) throw new Error(data.error || "Conversation could not be deleted.")
            setConversations((current) => current.filter((item) => item._id !== conversation._id))
            if (conversationId === conversation._id) newChat()
        } catch (deleteError) {
            setError(requestError(deleteError, "Conversation could not be deleted. Please try again."))
        } finally {
            setDeletingIds((current) => current.filter((id) => id !== conversation._id))
        }
    }

    const sendMessage = async (value?: string) => {
        const question = (value ?? input).trim()
        if (!question || !canSend) return
        setSending(true)
        setError("")
        setLastFailedQuestion("")
        setInput("")
        setStatus("Searching documents...")
        setMessages((current) => [...current, { role: "user", content: question }, { _id: "pending", role: "assistant", content: "" }])

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: question, conversationId: conversationId || undefined, scope, documentIds: scope === "selected" ? selectedIds : [] }),
            })
            if (!response.ok || !response.body) {
                const data = await response.json().catch(() => ({})) as { error?: string }
                throw new Error(data.error || "The question could not be sent.")
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ""
            let receivedFinal = false
            // React state remains unchanged inside this request's closure. Track the
            // streamed id locally so repeated status events cannot add the same
            // conversation to the sidebar more than once.
            let activeConversationId = conversationId
            while (true) {
                const { done, value: chunk } = await reader.read()
                buffer += decoder.decode(chunk || new Uint8Array(), { stream: !done })
                const lines = buffer.split("\n")
                buffer = lines.pop() || ""
                for (const line of lines) {
                    const event = parseEvent(line)
                    if (!event) continue
                    if (event.conversationId && !activeConversationId) {
                        activeConversationId = event.conversationId
                        setConversationId(activeConversationId)
                        setConversations((current) => dedupeConversations([
                            {
                                _id: activeConversationId,
                                title: question.slice(0, 80),
                                scope,
                                documentIds: scope === "selected" ? selectedIds : [],
                            },
                            ...current,
                        ]))
                        window.history.replaceState(null, "", `/chat?conversation=${activeConversationId}`)
                    }
                    if (event.type === "status" && event.status) setStatus(event.status)
                    if (event.type === "final" && event.reply) {
                        receivedFinal = true
                        setMessages((current) => [...current.filter((message) => message._id !== "pending"), { role: "assistant", content: event.reply!, citations: event.citations || [] }])
                    }
                    if (event.type === "error") throw new Error(event.error || "Answer generation failed.")
                }
                if (done) break
            }
            if (!receivedFinal) throw new Error("The answer was not completed.")
        } catch (sendError) {
            setMessages((current) => current.filter((message) => message._id !== "pending"))
            setInput(question)
            setLastFailedQuestion(question)
            setError(requestError(sendError, "The answer could not be generated. Please try again."))
        } finally {
            setSending(false)
            setStatus("")
        }
    }

    if (loading) return <main className="app-frame grid min-h-0 flex-1 place-items-center"><div className="flex items-center gap-3 text-sm text-[#9bb7c9]"><LoaderCircle size={17} className="animate-spin text-[#8ff5d3]" /> Loading chat</div></main>
    if (error && !documents.length && !conversations.length) return <main className="app-frame grid min-h-0 flex-1 place-items-center overflow-y-auto px-5"><RecoveryPanel title="Chat could not be loaded" message={error} onRetry={() => window.location.reload()} retryLabel="Reload" backHref="/dashboard" backLabel="Knowledge base" /></main>

    return (
        <main className="app-frame min-h-0 flex-1 overflow-hidden text-[#eaf7ff]">
            <div className={`grid h-full min-h-0 w-full ${sidebarVisible ? "lg:grid-cols-[250px_minmax(0,1fr)]" : "lg:grid-cols-1"}`}>
                {sidebarOpen && <button aria-label="Close sidebar" className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
                <aside className={`fixed inset-y-0 left-0 z-40 flex w-[270px] flex-col border-r border-[#b7e6ff]/12 bg-[#091d2d] p-3 transition-transform lg:static lg:min-h-0 lg:w-auto lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} ${sidebarVisible ? "lg:flex" : "lg:hidden"}`}>
                    <div className="mb-3 flex items-center justify-between lg:hidden"><span className="text-sm font-semibold">Conversations</span><button onClick={() => setSidebarOpen(false)} className="p-2 text-[#a8c0d2]"><X size={17} /></button></div>
                    <button onClick={newChat} className="button-primary flex items-center justify-center gap-2 px-4 py-2.5 text-sm"><Plus size={16} /> New chat</button>
                    <div className="mt-5 flex-1 overflow-y-auto">
                        <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7d9aaf]">Conversations</p>
                        {uniqueConversations.length === 0 ? <p className="px-2 py-3 text-xs leading-5 text-[#8faabd]">No conversations yet.</p> : (
                            <div className="space-y-1">
                                {uniqueConversations.map((conversation) => {
                                    const deleting = deletingIds.includes(conversation._id)
                                    return <div key={conversation._id} className={`group flex items-center rounded-lg ${conversationId === conversation._id ? "bg-[#b7e6ff]/10" : "hover:bg-[#b7e6ff]/6"}`}>
                                        <button onClick={() => void openConversation(conversation._id)} className="min-w-0 flex-1 px-3 py-2.5 text-left text-sm text-[#d9effb]"><span className="block truncate">{conversation.title}</span></button>
                                        <button aria-label="Delete conversation" disabled={deleting || sending} onClick={() => void deleteConversation(conversation)} className="mr-1 rounded-md p-2 text-[#7f9daf] hover:bg-[#ff927a]/10 hover:text-[#ffb5a4] disabled:opacity-40">{deleting ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}</button>
                                    </div>
                                })}
                            </div>
                        )}
                    </div>
                    <Link href="/dashboard" className="button-secondary mt-3 px-3 py-2.5 text-center text-xs">Manage documents</Link>
                </aside>

                <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
                    <header className="flex shrink-0 items-center justify-between border-b border-[#b7e6ff]/10 bg-[#071b2b]/75 px-4 py-3 backdrop-blur-xl sm:px-6">
                        <div className="flex items-center gap-2">
                            <button onClick={() => { setSidebarVisible((visible) => !visible); setSidebarOpen((open) => !sidebarVisible && !open) }} title={sidebarVisible ? "Hide sidebar" : "Show sidebar"} className="rounded-lg p-2 text-[#b8d3e2] hover:bg-[#b7e6ff]/10"><PanelLeft size={18} /></button>
                            <h1 className="text-sm font-semibold text-[#effaff]">Chat</h1>
                        </div>
                        <div className="relative">
                            <button disabled={Boolean(conversationId)} onClick={() => setSelectorOpen((open) => !open)} className="flex items-center gap-2 rounded-lg border border-[#b7e6ff]/16 bg-[#0b2537] px-3 py-2 text-xs text-[#cfe5f2] disabled:opacity-70"><FileText size={14} className="text-[#8ff5d3]" /> {selectorLabel} {!conversationId && <ChevronDown size={13} />}</button>
                            {selectorOpen && <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-[#b7e6ff]/18 bg-[#0b2537] p-2 shadow-2xl shadow-black/30">
                                <button onClick={() => { setScope("all"); setSelectedIds([]); setSelectorOpen(false) }} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-[#eaf7ff] hover:bg-[#b7e6ff]/8"><span>All documents</span>{scope === "all" && <Check size={15} className="text-[#8ff5d3]" />}</button>
                                <div className="my-2 border-t border-[#b7e6ff]/10" />
                                <div className="max-h-56 overflow-y-auto">{readyDocuments.map((document) => <button key={document._id} onClick={() => toggleDocument(document._id)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[#b7e6ff]/8"><span className="min-w-0 truncate text-sm text-[#d9effb]">{document.title}</span><span className={`grid h-5 w-5 place-items-center rounded border ${selectedIds.includes(document._id) ? "border-[#8ff5d3] bg-[#8ff5d3] text-[#07201c]" : "border-[#7091a7]"}`}>{selectedIds.includes(document._id) && <Check size={12} />}</span></button>)}</div>
                            </div>}
                        </div>
                    </header>

                    <div ref={messagesRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-7 sm:px-6">
                        <div className="mx-auto max-w-3xl">
                            {messages.length === 0 ? <div className="grid min-h-[48vh] place-items-center text-center"><div><h2 className="text-xl font-semibold text-[#effaff]">Ask a question</h2><p className="mt-2 text-sm text-[#9bb7c9]">{scope === "all" ? `Search across all ${readyDocuments.length} ready document${readyDocuments.length === 1 ? "" : "s"}.` : selectedIds.length ? `Search across ${selectedIds.length} selected document${selectedIds.length === 1 ? "" : "s"}.` : "Select documents, then ask about their contents."}</p>{readyDocuments.length === 0 && <Link href="/books/new" className="button-primary mt-5 inline-flex px-4 py-2.5 text-sm">Upload documents</Link>}</div></div> : (
                                <div className="space-y-7">{messages.map((message, index) => message.role === "user" ? <div key={`user-${index}`} className="ml-auto max-w-2xl rounded-2xl rounded-br-md bg-[#8ff5d3] px-4 py-3 text-sm leading-6 text-[#07201c]">{message.content}</div> : <article key={`assistant-${index}`} className="max-w-3xl"><div className="whitespace-pre-wrap text-sm leading-7 text-[#d9effb]">{message._id === "pending" ? <span className="inline-flex items-center gap-2 text-[#9bb7c9]"><LoaderCircle size={15} className="animate-spin text-[#8ff5d3]" /> {status || "Searching documents..."}</span> : message.content}</div>{message.citations?.length ? <div className="mt-3 flex flex-wrap gap-2">{message.citations.map((citation, citationIndex) => <button key={`${citation.document}-${citation.page}-${citationIndex}`} onClick={() => setActiveCitation(citation)} className="rounded-lg border border-[#b7e6ff]/16 bg-[#0b2537] px-2.5 py-1.5 text-xs text-[#a8c9d9] hover:border-[#8ff5d3]/45">{citation.document} · p. {citation.page}</button>)}</div> : null}</article>)}</div>
                            )}
                        </div>
                    </div>

                    <footer className="shrink-0 bg-[#071b2b]/80 px-4 py-4 backdrop-blur-xl sm:px-6">
                        <div className="mx-auto max-w-3xl">
                            {error && <div className="mb-3"><RecoveryPanel compact title="Request failed" message={error} onRetry={() => lastFailedQuestion ? void sendMessage(lastFailedQuestion) : setError("")} retryLabel={lastFailedQuestion ? "Retry" : "Dismiss"} /></div>}
                            {!conversationId && scope === "selected" && selectedDocuments.length > 0 && <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">{selectedDocuments.map((document) => <button key={document._id} onClick={() => toggleDocument(document._id)} className="rounded-full border border-[#b7e6ff]/16 px-2.5 py-1 text-[10px] text-[#b5d1df]">{document.title} <X className="ml-1 inline" size={10} /></button>)}</div>}
                            <div className="flex items-end gap-2 rounded-xl border border-[#b7e6ff]/18 bg-[#0b2537] p-2 focus-within:border-[#8ff5d3]">
                                <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage() } }} placeholder={scope === "selected" && !selectedIds.length && !conversationId ? "Select documents before asking a question" : "Ask a question"} disabled={sending || (scope === "selected" && !selectedIds.length && !conversationId)} rows={1} className="chat-composer-input max-h-32 min-h-9 flex-1 px-2 py-1.5 text-sm leading-6 text-[#eaf7ff] placeholder:text-[#7894a6] disabled:cursor-not-allowed" />
                                <button onClick={() => void sendMessage()} disabled={!canSend} aria-label="Send" className="grid h-9 w-9 place-items-center rounded-lg bg-[#8ff5d3] text-[#07201c] hover:bg-[#c0ffe9] disabled:cursor-not-allowed disabled:bg-[#234357] disabled:text-[#7292a5]">{sending ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowUp size={16} />}</button>
                            </div>
                        </div>
                    </footer>
                </section>
            </div>

            {activeCitation && <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" onClick={() => setActiveCitation(null)}><section className="w-full max-w-2xl rounded-xl border border-[#b7e6ff]/20 bg-[#0b2537] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><h2 className="text-sm font-semibold text-[#effaff]">{activeCitation.document}</h2><p className="mt-1 text-xs text-[#8faabd]">Page {activeCitation.page}</p></div><button onClick={() => setActiveCitation(null)} className="p-1 text-[#a8c0d2]"><X size={16} /></button></div><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[#d9effb]">{activeCitation.excerpt || "No excerpt is available for this citation."}</p></section></div>}
        </main>
    )
}
