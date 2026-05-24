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

        console.log(`📤 Uploading file: ${file.name} (${file.size} bytes)`)

        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        const result = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream(
                {
                    resource_type: "raw",
                    folder: `ai-book/${userId}`,
                    type: "authenticated",
                    delivery_type: "upload",
                },
                (error, result) => {
                    if (error) {
                        console.error(`❌ Cloudinary upload failed:`, error)
                        reject(error)
                    } else {
                        console.log(`✅ Cloudinary upload successful`)
                        console.log(`📁 Public ID: ${(result as any).public_id}`)
                        console.log(`🔗 Secure URL: ${(result as any).secure_url}`)
                        console.log(`📊 Resource Type: ${(result as any).resource_type}`)
                        console.log(`🔐 Upload Type: ${(result as any).type} (authenticated = private/secure)`)
                        resolve(result)
                    }
                }
            ).end(buffer)
        })

        const secureUrl = (result as any).secure_url
        console.log(`📥 Returning URL: ${secureUrl}`)
        
        return NextResponse.json({ success: true, url: secureUrl }, { status: 200 })

    } catch (error) {
        console.error("Upload Error:", error)
        const errorMessage = error instanceof Error ? error.message : "Upload failed"
        return NextResponse.json({ error: errorMessage }, { status: 500 })
    }
}

