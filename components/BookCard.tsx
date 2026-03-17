"use client"
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { IBook } from '@/database/models/book.model'

interface BookCardProps {
    book: IBook
    onDelete: (id: string) => void
}

const BookCard = ({ book, onDelete }: BookCardProps) => {
    const [deleting, setDeleting] = useState(false)

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this book?')) return
        setDeleting(true)
        try {
            const res = await fetch(`/api/books/${book._id.toString()}`, { method: 'DELETE' })
            const data = await res.json()
            if (data.success) onDelete(book._id.toString())
        } catch (error) {
            console.error(error)
        } finally {
            setDeleting(false)
        }
    }

    return (
        <div className="bg-[#141210] border border-[#2A2520] rounded-xl overflow-hidden
            hover:border-[#3A3028] transition-all duration-200 flex flex-col group">

            {/* Cover */}
            <div className="w-full h-44 bg-[#1A1814] relative">
                {book.coverImage ? (
                    <Image
                        src={book.coverImage}
                        alt={book.title}
                        fill
                        className="object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"
                            viewBox="0 0 24 24" fill="none" stroke="#3A3028"
                            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                        </svg>
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="p-3 flex flex-col gap-1 flex-1">
                <h3 className="text-xs font-medium text-[#D4C5A9] leading-tight line-clamp-2">
                    {book.title}
                </h3>
                <p className="text-xs text-[#5A5048]">{book.author}</p>
                <p className="text-xs text-[#3A3028] mt-auto pt-2">
                    {new Date(book.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric', month: 'short', day: 'numeric'
                    })}
                </p>
            </div>

            {/* Actions */}
            <div className="px-3 pb-3 flex gap-2">
                <Link
                    href={`/books/${book._id.toString()}`}
                    className="flex-1 py-2 rounded-lg bg-[#E8C97A] text-xs font-medium
                        text-[#0D0C0A] hover:bg-[#D4B560] transition-colors duration-200
                        text-center">
                    Open
                </Link>
                <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-3 py-2 rounded-lg border border-[#3A2828] text-[#7A4040]
                        hover:bg-[#2A1818] transition-colors duration-200 text-xs
                        disabled:opacity-50">
                    {deleting ? '...' : '✕'}
                </button>
            </div>
        </div>
    )
}

export default BookCard



