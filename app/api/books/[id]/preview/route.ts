import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import mongoose from "mongoose"
import Book from "@/database/models/book.model"
import dbConnect from "@/database/mongoose"
import { signedDocumentUrl } from "@/lib/cloudinary-storage"

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id } = await params
    if (!mongoose.isValidObjectId(id)) {
        return NextResponse.json({ error: "Invalid document identifier" }, { status: 400 })
    }
    await dbConnect()
    const document = await Book.findOne({ _id: id, userId }).select("pdfUrl storagePublicId").lean()
    if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 })

    const target = signedDocumentUrl(document.pdfUrl, document.storagePublicId)
    const url = new URL(target)
    if (
        url.protocol !== "https:"
        || !["res.cloudinary.com", "api.cloudinary.com"].includes(url.hostname)
    ) {
        return NextResponse.json({ error: "Invalid document storage location" }, { status: 500 })
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok || !response.body) {
        return NextResponse.json({ error: "Document preview is unavailable" }, { status: 502 })
    }
    return new Response(response.body, {
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": "inline",
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
        },
    })
}
