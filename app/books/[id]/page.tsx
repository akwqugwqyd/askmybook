"use client"
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { IBook } from '@/database/models/book.model'

const BookPage = () => {
    const { id } = useParams()
    const router = useRouter()
    const [book, setBook] = useState<IBook | null>(null)
    const [loading, setLoading] = useState(true)
    const [deleting, setDeleting] = useState(false)

    useEffect(() => {
        const fetchBook = async () => {
            try {
                const res = await fetch(`/api/books/${id}`)
                const data = await res.json()
                if (data.success) setBook(data.book)
            } catch (error) {
                console.error(error)
            } finally {
                setLoading(false)
            }
        }
        fetchBook()
    }, [id])

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this book?')) return
        setDeleting(true)
        try {
            const res = await fetch(`/api/books/${id}`, { method: 'DELETE' })
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
                <p className="text-xs text-[#5A5048]">Loading book...</p>
            </div>
        </main>
    )

    if (!book) return (
        <main className="min-h-screen bg-[#0D0C0A] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
                <p className="text-sm text-[#D4C5A9]">Book not found</p>
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

                            <div className="flex gap-3 mt-auto pt-4">
                                <Link
                                    href={`/books/${id}/chat`}
                                    className="flex-1 py-3 rounded-xl bg-[#E8C97A] text-sm font-medium
                                        text-[#0D0C0A] hover:bg-[#D4B560] transition-colors duration-200
                                        text-center">
                                    Start AI Chat
                                </Link>
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

