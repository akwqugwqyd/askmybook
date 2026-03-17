import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import dbConnect from "@/database/mongoose"
import Book from "@/database/models/book.model"
import { processAndEmbedPDF } from "@/lib/langchain"

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        await dbConnect()

        const { title, author, coverImage, pdfUrl } = await req.json()

        if (!title || !author || !pdfUrl) {
            return NextResponse.json(
                { error: "Title, author and PDF are required" },
                { status: 400 }
            )
        }

        // Save book to MongoDB
            const book = await Book.create({
                title,
                author,
                coverImage: coverImage || null,
                pdfUrl,
                userId,
            })
            try {
                await processAndEmbedPDF(pdfUrl, book._id.toString())
            } catch (err) {
            }

            return NextResponse.json({ success: true, book }, { status: 201 })

    } catch (error) {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        await dbConnect()

        const books = await Book.find({ userId }).sort({ createdAt: -1 })

        return NextResponse.json({ success: true, books }, { status: 200 })

    } catch (error) {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}



