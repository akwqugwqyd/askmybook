import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import dbConnect from "@/database/mongoose"
import Book, { type IBook } from "@/database/models/book.model"
import { serializeDocumentSummary } from "@/lib/document-view"
import { createDocumentSchema } from "@/lib/validation"

const isOwnedCloudinaryUpload = (urlValue: string, publicId: string, userId: string): boolean => {
    try {
        const url = new URL(urlValue)
        return url.protocol === "https:"
            && url.hostname === "res.cloudinary.com"
            && publicId.startsWith(`ai-book/${userId}/`)
    } catch {
        return false
    }
}

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        await dbConnect()

        const parsed = createDocumentSchema.safeParse(await req.json())
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid document metadata." }, { status: 400 })
        }
        const { title, author, pdfUrl, documentName, fileSize, storagePublicId } = parsed.data
        if (!isOwnedCloudinaryUpload(pdfUrl, storagePublicId, userId)) {
            return NextResponse.json({ error: "The PDF upload reference is invalid." }, { status: 400 })
        }

        const book = await Book.create({
            title,
            author,
            pdfUrl,
            userId,
            documentName,
            fileSize,
            storagePublicId: storagePublicId || undefined,
            processingStatus: "queued",
        }) as IBook

        return NextResponse.json({ success: true, book }, { status: 201 })
    } catch (error) {
        console.error("Document creation error:", error)
        return NextResponse.json({
            error: "We could not create this document. Please check the upload and try again.",
        }, { status: 500 })
    }
}

export async function GET() {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        await dbConnect()

        const books = await Book.find({ userId }).sort({ createdAt: -1 }).lean()
        const compatibleBooks = books.map(serializeDocumentSummary)

        return NextResponse.json({ success: true, books: compatibleBooks }, { status: 200 })
    } catch {
        return NextResponse.json({
            error: "We could not load your documents right now. Please refresh and try again.",
        }, { status: 500 })
    }
}
