import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import dbConnect from "@/database/mongoose"
import Book from "@/database/models/book.model"

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        await dbConnect()

        const book = await Book.findOne({ _id: id, userId })
        if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 })

        return NextResponse.json({ success: true, book }, { status: 200 })

    } catch (error) {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        await dbConnect()

        const book = await Book.findOneAndDelete({ _id: id, userId })
        if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 })

        return NextResponse.json({ success: true }, { status: 200 })

    } catch (error) {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}


