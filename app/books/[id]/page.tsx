"use client"
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { IBook } from '@/database/models/book.model'
import { CURRENT_EMBEDDING_VERSION, CURRENT_INDEXING_VERSION } from '@/lib/ai-config'

const BookPage = () => {
    const { id } = useParams()
    const router = useRouter()
    const [book, setBook] = useState<IBook | null>(null)
    const [loading, setLoading] = useState(true)
    const [deleting, setDeleting] = useState(false)
    const [processing, setProcessing] = useState(false)
    const [processMessage, setProcessMessage] = useState('')
    const isReady = (book?.processingStatus === 'ready' || !book?.processingStatus)
        && (book?.indexingVersion || 1) >= CURRENT_INDEXING_VERSION
        && (book?.embeddingVersion || 1) === CURRENT_EMBEDDING_VERSION
    const documentId = Array.isArray(id) ? id[0] : id

    const fetchBook = useCallback(async () => {
        if (!documentId) return
        try {
            const res = await fetch(`/api/books/${documentId}`)
            const data = await res.json()
            if (data.success) setBook(data.book)
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }, [documentId])

    const startProcessing = useCallback(async () => {
        if (!documentId || processing) return
        setProcessing(true)
        setProcessMessage('Processing this PDF now. Larger documents can take a little while.')

        try {
            const res = await fetch(`/api/books/${documentId}/process`, { method: 'POST' })
            const data = await res.json()
            if (data.success && data.book) {
                setBook(data.book)
                setProcessMessage(data.book.processingStatus === 'ready'
                    ? 'Processing complete. Chat is ready.'
                    : data.message || 'Processing is underway.')
            } else {
                setProcessMessage(data.error || 'Processing could not be started.')
                await fetchBook()
            }
        } catch {
            setProcessMessage('Processing could not be started. Please try again.')
            await fetchBook()
        } finally {
            setProcessing(false)
        }
    }, [documentId, fetchBook, processing])

    useEffect(() => {
        fetchBook()
    }, [fetchBook])

    useEffect(() => {
        if (book?.processingStatus === 'queued') {
            startProcessing()
        }
    }, [book?.processingStatus, startProcessing])

    useEffect(() => {
        if (book?.processingStatus !== 'processing' || processing) return

        const interval = window.setInterval(() => {
            fetchBook()
        }, 3000)

        return () => window.clearInterval(interval)
    }, [book?.processingStatus, processing, fetchBook])

    const handleDelete = async () => {
        if (!confirm('Delete this document, its vectors, and related conversations?')) return
        setDeleting(true)
        try {
            const res = await fetch(`/api/books/${documentId}`, { method: 'DELETE' })
            const data = await res.json()
            if (data.success) router.push('/')
        } catch (error) {
            console.error(error)
        } finally {
            setDeleting(false)
        }
    }

    if (loading) return (
        <main className="min-h-screen bg-[#0D0C0A] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
                <div className="w-7 h-7 border border-[#E8C97A] border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-[#5A5048]">Loading document...</p>
            </div>
        </main>
    )

    if (!book) return (
        <main className="min-h-screen bg-[#0D0C0A] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
                <p className="text-sm text-[#D4C5A9]">Document not found</p>
                <Link href="/" className="text-xs text-[#E8C97A] hover:opacity-70">← Back to Library</Link>
            </div>
        </main>
    )

    return (
        <main className="min-h-screen bg-[#0D0C0A] px-6 py-10">
            <div className="max-w-3xl mx-auto">

                <Link href="/"
                    className="inline-flex items-center gap-2 text-xs text-[#5A5048]
                        hover:text-[#E8C97A] transition-colors duration-200 mb-8">
                    ← Back to Library
                </Link>

                <div className="bg-[#141210] border border-[#2A2520] rounded-2xl overflow-hidden">
                    <div className="flex flex-col md:flex-row">

                        {/* Cover */}
                        <div className="w-full md:w-56 h-64 bg-[#1A1814] relative shrink-0">
                            {book.coverImage ? (
                                <Image src={book.coverImage} alt={book.title} fill className="object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"
                                        viewBox="0 0 24 24" fill="none" stroke="#3A3028"
                                        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                                    </svg>
                                </div>
                            )}
                        </div>

                        {/* Details */}
                        <div className="flex flex-col gap-4 p-8 flex-1">
                            <div>
                                <h1 className="text-2xl font-medium text-[#F0E6D0] leading-tight mb-1">
                                    {book.title}
                                </h1>
                                <p className="text-sm text-[#E8C97A]">by {book.author}</p>
                            </div>

                            <p className="text-xs text-[#3A3028]">
                                Added {new Date(book.createdAt).toLocaleDateString('en-US', {
                                    year: 'numeric', month: 'long', day: 'numeric'
                                })}
                            </p>
                            <div className="rounded-lg border border-[#2A2520] px-4 py-3">
                                <p className="text-xs text-[#7A6E62] uppercase tracking-wider mb-1">
                                    Processing Status
                                </p>
                                <p className={`text-sm ${
                                    isReady ? 'text-[#7A8F5A]' : book.processingStatus === 'failed' ? 'text-[#B96A6A]' : 'text-[#B9A06A]'
                                }`}>
                                    {isReady ? 'Ready to chat' : book.processingStatus}
                                </p>
                                {book.processingError?.message && (
                                    <p className="text-xs text-[#B96A6A] mt-2">{book.processingError.message}</p>
                                )}
                                {book.pageCount > 0 && (
                                    <p className="text-xs text-[#5A5048] mt-2">
                                        {book.pageCount} pages | {book.chunkCount} chunks indexed
                                    </p>
                                )}
                                {processMessage && (
                                    <p className="text-xs text-[#7A6E62] mt-2">{processMessage}</p>
                                )}
                                {(book.processingStatus === 'queued' || book.processingStatus === 'failed' || !isReady) && (
                                    <button
                                        onClick={startProcessing}
                                        disabled={processing}
                                        className="mt-3 px-3 py-2 rounded-lg bg-[#E8C97A] text-xs font-medium
                                            text-[#0D0C0A] hover:bg-[#D4B560] transition-colors disabled:opacity-50">
                                        {processing
                                            ? 'Processing...'
                                            : book.processingStatus === 'failed'
                                                ? 'Retry Processing'
                                                : 'Process Now'}
                                    </button>
                                )}
                            </div>

                            <div className="flex gap-3 mt-auto pt-4">
                                <Link
                                    href={`/books/${documentId}/preview`}
                                    className="px-4 py-3 rounded-xl border border-[#3A3028] text-sm
                                        text-[#D4C5A9] hover:bg-[#201C17] transition-colors text-center">
                                    Preview PDF
                                </Link>
                                {isReady ? (
                                    <Link
                                        href={`/chat?documents=${documentId}`}
                                        className="flex-1 py-3 rounded-xl bg-[#E8C97A] text-sm font-medium
                                            text-[#0D0C0A] hover:bg-[#D4B560] transition-colors duration-200
                                            text-center">
                                        Start AI Chat
                                    </Link>
                                ) : (
                                    <button
                                        disabled
                                        className="flex-1 py-3 rounded-xl bg-[#3A3028] text-sm font-medium
                                            text-[#7A6E62] cursor-not-allowed">
                                        Chat unavailable
                                    </button>
                                )}
                                <button
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="px-5 py-3 rounded-xl border border-[#3A2828]
                                        text-[#7A4040] hover:bg-[#2A1818] transition-colors duration-200
                                        text-sm disabled:opacity-50">
                                    {deleting ? '...' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    )
}

export default BookPage

