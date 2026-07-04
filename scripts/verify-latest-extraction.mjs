import { v2 as cloudinary } from "cloudinary"
import mongoose from "mongoose"
import { PDFParse } from "pdf-parse"

const main = async () => {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required")

    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    })

    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 })
    const document = await mongoose.connection.db
        .collection("books")
        .findOne(
            { processingStatus: "failed" },
            {
                sort: { createdAt: -1 },
                projection: { pdfUrl: 1, storagePublicId: 1, documentName: 1 },
            },
        )
    if (!document) throw new Error("No failed document is available to test")

    const downloadUrl = document.storagePublicId
        ? cloudinary.url(document.storagePublicId, {
            resource_type: "raw",
            type: "authenticated",
            sign_url: true,
            expires_at: Math.floor(Date.now() / 1000) + 300,
        })
        : document.pdfUrl

    const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`Stored PDF download failed with status ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new Error("Stored object is not a PDF")
    }

    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    try {
        const result = await parser.getText()
        const nonEmptyPages = result.pages.filter((page) => page.text.trim().length > 0)
        console.log({
            download: "ok",
            bytes: buffer.length,
            pages: result.total,
            nonEmptyPages: nonEmptyPages.length,
            extractedCharacters: nonEmptyPages.reduce((sum, page) => sum + page.text.trim().length, 0),
            classification: nonEmptyPages.length > 0 ? "text-pdf" : "image-only-or-empty",
        })

        if (nonEmptyPages.length === 0 && process.argv.includes("--ocr")) {
            const { extractScannedPdfWithOcr } = await import("../lib/pdf-ocr.ts")
            const pages = await extractScannedPdfWithOcr(
                buffer,
                document.documentName || "document.pdf",
                result.total,
            )
            console.log({
                ocr: "ok",
                pages: pages.length,
                extractedCharacters: pages.reduce((sum, page) => sum + page.text.length, 0),
            })
        }
    } finally {
        await parser.destroy()
        await mongoose.disconnect()
    }
}

main().catch(async (error) => {
    console.error(error instanceof Error ? error.message : "Extraction verification failed")
    await mongoose.disconnect().catch(() => undefined)
    process.exitCode = 1
})
