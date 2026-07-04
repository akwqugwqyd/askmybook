import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import cloudinary from "@/lib/cloudinary"
import { logger } from "@/lib/logger"
import { uploadIntentSchema } from "@/lib/validation"

export const runtime = "nodejs"
export const maxDuration = 15

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const parsed = uploadIntentSchema.safeParse(await req.json())
        if (!parsed.success) {
            return NextResponse.json({
                error: parsed.error.issues[0]?.message || "Invalid PDF upload request.",
            }, { status: 400 })
        }

        const cloudName = process.env.CLOUDINARY_CLOUD_NAME
        const apiKey = process.env.CLOUDINARY_API_KEY
        const apiSecret = process.env.CLOUDINARY_API_SECRET
        if (!cloudName || !apiKey || !apiSecret) {
            throw new Error("Cloudinary is not configured.")
        }

        const timestamp = Math.floor(Date.now() / 1000)
        const folder = `ai-book/${userId}`
        const generatedId = `${randomUUID()}.pdf`
        const signedParameters = {
            allowed_formats: "pdf",
            folder,
            public_id: generatedId,
            timestamp,
            type: "authenticated",
        }
        const signature = cloudinary.utils.api_sign_request(signedParameters, apiSecret)

        return NextResponse.json({
            success: true,
            uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/raw/upload`,
            publicId: `${folder}/${generatedId}`,
            fields: {
                ...signedParameters,
                api_key: apiKey,
                signature,
            },
        })
    } catch (error) {
        logger.error("Cloudinary upload signature failed:", error)
        return NextResponse.json({
            error: "We could not authorize that upload. Please retry.",
        }, { status: 500 })
    }
}
