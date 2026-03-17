"use client"
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { IBook } from '@/database/models/book.model'

interface Message {
    role: 'user' | 'assistant'
    content: string
}

const ChatPage = () => {
    const { id } = useParams()
    const [book, setBook] = useState<IBook | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [bookLoading, setBookLoading] = useState(true)
    const bottomRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const fetchBook = async () => {
            try {
                const res = await fetch(`/api/books/${id}`)
                const data = await res.json()
                if (data.success) {
                    setBook(data.book)
                    setMessages([{
                        role: 'assistant',
                        content: `I've read "${data.book.title}" by ${data.book.author}. Ask me anything about it!`
                    }])
                }
            } catch (error) {
                console.error(error)
            } finally {
                setBookLoading(false)
            }
        }
        fetchBook()
    }, [id])

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleSend = async () => {
        if (!input.trim() || loading) return
        const userMessage = input.trim()
        setInput('')
        setMessages(prev => [...prev, { role: 'user', content: userMessage }])
        setLoading(true)
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMessage, bookId: id }),
            })
            const data = await res.json()
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: data.success ? data.reply : 'Sorry, something went wrong.'
            }])
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong.' }])
        } finally {
            setLoading(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) handleSend()
    }

    if (bookLoading) return (
        <main className="min-h-screen bg-[#0D0C0A] flex items-center justify-center">
            <div className="w-7 h-7 border border-[#E8C97A] border-t-transparent rounded-full animate-spin" />
        </main>
    )

    return (
        <main className="h-screen bg-[#0D0C0A] flex flex-col">

            {/* Header */}
            <div className="w-full bg-[#0D0C0A] border-b border-[#2A2520] px-6 py-4
                flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <Link href={`/books/${id}`}
                        className="text-xs text-[#5A5048] hover:text-[#E8C97A] transition-colors">
                        ← Back
                    </Link>
                    <div>
                        <h1 className="text-sm font-medium text-[#D4C5A9]">{book?.title}</h1>
                        <p className="text-xs text-[#5A5048]">by {book?.author}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <span className="text-xs text-[#5A5048]">AI Ready</span>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-4
                max-w-3xl w-full mx-auto">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed
                            ${msg.role === 'user'
                                ? 'bg-[#E8C97A] text-[#0D0C0A] rounded-br-sm'
                                : 'bg-[#141210] border border-[#2A2520] text-[#D4C5A9] rounded-bl-sm'
                            }`}>
                            {msg.content}
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-[#141210] border border-[#2A2520] rounded-2xl rounded-bl-sm
                            px-4 py-3 flex gap-1 items-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#E8C97A] animate-bounce"
                                style={{ animationDelay: '0ms' }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-[#E8C97A] animate-bounce"
                                style={{ animationDelay: '150ms' }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-[#E8C97A] animate-bounce"
                                style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="w-full bg-[#0D0C0A] border-t border-[#2A2520] px-4 py-4 shrink-0">
                <div className="max-w-3xl mx-auto flex gap-3 items-center">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask anything about this book..."
                        disabled={loading}
                        className="flex-1 bg-[#141210] border border-[#2A2520] rounded-xl
                            px-4 py-3 text-sm text-[#D4C5A9] placeholder-[#3A3028]
                            focus:outline-none focus:border-[#E8C97A] transition-colors duration-200
                            disabled:opacity-50"
                    />
                    <button
                        onClick={handleSend}
                        disabled={loading || !input.trim()}
                        className="px-5 py-3 rounded-xl bg-[#E8C97A] text-sm font-medium
                            text-[#0D0C0A] hover:bg-[#D4B560] transition-colors duration-200
                            disabled:opacity-50">
                        Send
                    </button>
                </div>
            </div>
        </main>
    )
}

export default ChatPage

