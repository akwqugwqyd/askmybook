"use client"
import { useState, useEffect } from 'react'
import BookCard from './BookCard'
import { IBook } from '@/database/models/book.model'

const BookGrid = () => {
    const [books, setBooks] = useState<IBook[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchBooks = async () => {
            try {
                const res = await fetch('/api/books')
                const data = await res.json()
                if (data.success) setBooks(data.books)
            } catch (error) {
                console.error(error)
            } finally {
                setLoading(false)
            }
        }
        fetchBooks()
    }, [])

    const handleDelete = (id: string) => {
        setBooks(prev => prev.filter(book => book._id.toString() !== id))
    }

    if (loading) return (
        <div className="w-full flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
                <div className="w-7 h-7 border border-[#E8C97A] border-t-transparent
                    rounded-full animate-spin" />
                <p className="text-xs text-[#5A5048]">Loading your library...</p>
            </div>
        </div>
    )

    if (books.length === 0) return (
        <div className="w-full flex flex-col items-center justify-center py-20 gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"
                viewBox="0 0 24 24" fill="none" stroke="#3A3028"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <p className="text-sm text-[#D4C5A9]">No books yet</p>
            <p className="text-xs text-[#5A5048]">Click "Add New" to upload your first book</p>
        </div>
    )

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {books.map(book => (
                <BookCard
                    key={book._id.toString()}
                    book={book}
                    onDelete={handleDelete}
                />
            ))}
        </div>
    )
}

export default BookGrid



