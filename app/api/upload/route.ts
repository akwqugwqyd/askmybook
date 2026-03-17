import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import cloudinary from "@/lib/cloudinary"

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const formData = await req.formData()
        const file = formData.get("file") as File

        if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        const result = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream(
                {
                    resource_type: "auto",
                    folder: `ai-book/${userId}`,
                },
                (error, result) => {
                    if (error) reject(error)
                    else resolve(result)
                }
            ).end(buffer)
        })

        return NextResponse.json({ success: true, url: (result as any).secure_url }, { status: 200 })

    } catch (error) {
        return NextResponse.json({ error: "Upload failed" }, { status: 500 })
    }
}

