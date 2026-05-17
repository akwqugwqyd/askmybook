"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const BookNewPage = () => {
    const router = useRouter()
    const [pdfFile, setPdfFile] = useState<File | null>(null)
    const [coverImage, setCoverImage] = useState<File | null>(null)
    const [title, setTitle] = useState('')
    const [author, setAuthor] = useState('')
    const [loading, setLoading] = useState(false)

    const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) setPdfFile(e.target.files[0])
    }

    const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) setCoverImage(e.target.files[0])
    }

    const uploadFile = async (file: File): Promise<string> => {
        const formData = new FormData()
        formData.append("file", file)
        const res = await fetch("/api/upload", { method: "POST", body: formData })
        const data = await res.json()
        if (!data.success) throw new Error(data.error)
        return data.url
    }

    const handleSubmit = async () => {
        if (!title || !author) return alert("Title and author are required")
        if (!pdfFile) return alert("Please upload a PDF file")
        setLoading(true)
        try {
            const pdfUrl = await uploadFile(pdfFile)
            let coverImageUrl = null
            if (coverImage) coverImageUrl = await uploadFile(coverImage)
            const res = await fetch("/api/books", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, author, pdfUrl, coverImage: coverImageUrl }),
            })
            const data = await res.json()
            if (data.success) router.push("/")
            else alert(data.error)
        } catch (error) {
            alert("Something went wrong")
        } finally {
            setLoading(false)
        }
    }

    return (
        <main className="min-h-screen bg-[#0D0C0A] px-6 py-14 flex flex-col items-center">
            <div className="w-full max-w-xl">

                <div className="text-center mb-10">
                    <h1 className="text-3xl font-medium text-[#F0E6D0] mb-2">
                        Add a New Book
                    </h1>
                    <p className="text-sm text-[#5A5048]">
                        Upload a PDF to generate your interactive interview
                    </p>
                </div>

                <div className="flex flex-col gap-6">

                    {/* PDF Upload */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs text-[#7A6E62] uppercase tracking-wider">
                            Book PDF File
                        </label>
                        <label className="w-full bg-[#141210] border border-dashed border-[#2A2520]
                            rounded-xl flex flex-col items-center justify-center py-10 gap-3
                            cursor-pointer hover:border-[#E8C97A] transition-colors duration-200">
                            <input type="file" accept=".pdf" className="hidden" onChange={handlePdfChange} />
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"
                                viewBox="0 0 24 24" fill="none" stroke="#E8C97A"
                                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                            <div className="text-center">
                                <p className="text-sm text-[#D4C5A9]">
                                    {pdfFile ? pdfFile.name : 'Click to upload PDF'}
                                </p>
                                <p className="text-xs text-[#5A5048] mt-1">PDF file (max 50MB)</p>
                            </div>
                        </label>
                    </div>

                    {/* Cover Image */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs text-[#7A6E62] uppercase tracking-wider">
                            Cover Image <span className="normal-case text-[#3A3028]">(Optional)</span>
                        </label>
                        <label className="w-full bg-[#141210] border border-dashed border-[#2A2520]
                            rounded-xl flex flex-col items-center justify-center py-10 gap-3
                            cursor-pointer hover:border-[#E8C97A] transition-colors duration-200">
                            <input type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"
                                viewBox="0 0 24 24" fill="none" stroke="#E8C97A"
                                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                            </svg>
                            <div className="text-center">
                                <p className="text-sm text-[#D4C5A9]">
                                    {coverImage ? coverImage.name : 'Click to upload cover image'}
                                </p>
                                <p className="text-xs text-[#5A5048] mt-1">Leave empty to use default</p>
                            </div>
                        </label>
                    </div>

                    {/* Title */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs text-[#7A6E62] uppercase tracking-wider">Title</label>
                        <input
                            type="text"
                            placeholder="ex: Rich Dad Poor Dad"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-[#141210] border border-[#2A2520] rounded-lg
                                px-4 py-3 text-sm text-[#D4C5A9] placeholder-[#3A3028]
                                focus:outline-none focus:border-[#E8C97A] transition-colors duration-200"
                        />
                    </div>

                    {/* Author */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs text-[#7A6E62] uppercase tracking-wider">Author Name</label>
                        <input
                            type="text"
                            placeholder="ex: Robert Kiyosaki"
                            value={author}
                            onChange={(e) => setAuthor(e.target.value)}
                            className="w-full bg-[#141210] border border-[#2A2520] rounded-lg
                                px-4 py-3 text-sm text-[#D4C5A9] placeholder-[#3A3028]
                                focus:outline-none focus:border-[#E8C97A] transition-colors duration-200"
                        />
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={() => router.back()}
                            disabled={loading}
                            className="flex-1 py-3 rounded-lg border border-[#2A2520] text-sm
                                text-[#7A6E62] hover:border-[#3A3028] hover:text-[#D4C5A9]
                                transition-colors duration-200 disabled:opacity-50">
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="flex-1 py-3 rounded-lg bg-[#E8C97A] text-sm font-medium
                                text-[#0D0C0A] hover:bg-[#D4B560] transition-colors duration-200
                                disabled:opacity-50">
                            {loading ? 'Uploading...' : 'Add Book'}
                        </button>
                    </div>
                </div>
            </div>
        </main>
    )
}

export default BookNewPage

