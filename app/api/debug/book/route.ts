import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import dbConnect from "@/database/mongoose"
import Book from "@/database/models/book.model"

export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const bookId = req.nextUrl.searchParams.get("bookId")
        if (!bookId) return NextResponse.json({ error: "bookId required" }, { status: 400 })

        await dbConnect()

        const book = await Book.findById(bookId)
        if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 })

        console.log(`[DEBUG] Book found: ${book.title}`)
        console.log(`[DEBUG] PDF URL: ${book.pdfUrl}`)
        console.log(`[DEBUG] URL length: ${book.pdfUrl.length}`)
        console.log(`[DEBUG] URL includes 'cloudinary': ${book.pdfUrl.includes("cloudinary")}`)
        console.log(`[DEBUG] URL includes 'secure_url': ${book.pdfUrl.includes("secure_url")}`)

        // Try to fetch the URL to test if it's accessible
        console.log(`[DEBUG] Attempting to fetch URL...`)
        try {
            const response = await fetch(book.pdfUrl, { method: "HEAD" })
            console.log(`[DEBUG] HEAD request status: ${response.status} ${response.statusText}`)
        } catch (fetchError) {
            console.error(`[DEBUG] HEAD request failed:`, fetchError)
        }

        return NextResponse.json({
            success: true,
            book: {
                id: book._id,
                title: book.title,
                author: book.author,
                pdfUrl: book.pdfUrl,
                urlLength: book.pdfUrl.length,
                urlValid: book.pdfUrl.includes("cloudinary") && book.pdfUrl.startsWith("https"),
            }
        })

    } catch (error) {
        console.error("[DEBUG] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
