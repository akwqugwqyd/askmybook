import { v2 as cloudinary } from "cloudinary"
import mongoose from "mongoose"
import OpenAI from "openai"
import { PDFParse } from "pdf-parse"
import { Pinecone } from "@pinecone-database/pinecone"

const createPdf = (text) => {
    const escaped = text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")
    const stream = `BT /F1 18 Tf 72 720 Td (${escaped}) Tj ET`
    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    ]

    let pdf = "%PDF-1.4\n"
    const offsets = [0]
    objects.forEach((object, index) => {
        offsets.push(Buffer.byteLength(pdf))
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
    })
    const xrefOffset = Buffer.byteLength(pdf)
    pdf += `xref\n0 ${objects.length + 1}\n`
    pdf += "0000000000 65535 f \n"
    offsets.slice(1).forEach((offset) => {
        pdf += `${String(offset).padStart(10, "0")} 00000 n \n`
    })
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
    return Buffer.from(pdf)
}

const uploadRaw = async (buffer, publicId) => {
    const [folder, generatedId] = [
        publicId.slice(0, publicId.lastIndexOf("/")),
        publicId.slice(publicId.lastIndexOf("/") + 1),
    ]
    const timestamp = Math.floor(Date.now() / 1000)
    const signedParameters = {
        allowed_formats: "pdf",
        folder,
        public_id: generatedId,
        timestamp,
        type: "authenticated",
    }
    const signature = cloudinary.utils.api_sign_request(
        signedParameters,
        process.env.CLOUDINARY_API_SECRET,
    )
    const formData = new FormData()
    Object.entries({
        ...signedParameters,
        api_key: process.env.CLOUDINARY_API_KEY,
        signature,
    }).forEach(([key, value]) => formData.append(key, String(value)))
    formData.append("file", new Blob([buffer], { type: "application/pdf" }), "smoke.pdf")

    const response = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(process.env.CLOUDINARY_CLOUD_NAME)}/raw/upload`,
        { method: "POST", body: formData, signal: AbortSignal.timeout(30_000) },
    )
    const result = await response.json()
    if (!response.ok) throw new Error(result.error?.message || "Signed Cloudinary upload failed")
    if (
        result.public_id !== publicId
        || result.resource_type !== "raw"
        || result.type !== "authenticated"
    ) {
        throw new Error(`Signed Cloudinary upload returned unexpected metadata: ${JSON.stringify({
            publicId: result.public_id,
            resourceType: result.resource_type,
            type: result.type,
        })}`)
    }
    return result
}

const main = async () => {
    const required = [
        "MONGODB_URI",
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET",
        "OPENAI_API_KEY",
        "PINECONE_API_KEY",
        "PINECONE_INDEX",
    ]
    const missing = required.filter((name) => !process.env[name])
    if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(", ")}`)

    const runId = `smoke-${Date.now()}`
    const publicId = `ai-book-smoke/${runId}.pdf`
    const namespace = `smoke-${runId}`
    const documentId = `document-${runId}`
    const text = "AskMyBook provider smoke test. The verification token is amber-lantern."
    const pdf = createPdf(text)

    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    })
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000 })
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY })
    const index = pinecone.index(process.env.PINECONE_INDEX).namespace(namespace)

    const checks = {}
    try {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 })
        await mongoose.connection.db.command({ ping: 1 })
        checks.mongodb = "ok"

        const uploaded = await uploadRaw(pdf, publicId)
        const signedUrl = cloudinary.utils.private_download_url(
            uploaded.public_id,
            uploaded.format || "",
            {
            resource_type: "raw",
            type: "authenticated",
            expires_at: Math.floor(Date.now() / 1000) + 300,
            },
        )
        const download = await fetch(signedUrl, { signal: AbortSignal.timeout(30_000) })
        const downloadedPdf = Buffer.from(await download.arrayBuffer())
        if (!download.ok || downloadedPdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
            throw new Error(`Cloudinary signed download verification failed: ${JSON.stringify({
                status: download.status,
                contentType: download.headers.get("content-type"),
                signature: downloadedPdf.subarray(0, 5).toString("ascii"),
                uploadedFormat: uploaded.format || null,
            })}`)
        }
        checks.cloudinary = "ok"

        const parser = new PDFParse({ data: new Uint8Array(downloadedPdf) })
        const parsed = await parser.getText()
        await parser.destroy()
        if (parsed.pages.length !== 1 || parsed.text.trim().length < 20) {
            throw new Error(`Local PDF extraction verification failed (${parsed.total} pages, ${parsed.text.length} characters)`)
        }
        checks.pdfExtraction = "ok"

        const vision = await openai.responses.create({
            model: process.env.OPENAI_OCR_MODEL || "gpt-4o-mini",
            store: false,
            max_output_tokens: 100,
            input: [{
                role: "user",
                content: [
                    {
                        type: "input_file",
                        filename: "smoke.pdf",
                        file_data: `data:application/pdf;base64,${downloadedPdf.toString("base64")}`,
                    },
                    { type: "input_text", text: "Return only the verification token visible in this PDF." },
                ],
            }],
        })
        if (!vision.output_text.toLowerCase().includes("amber-lantern")) {
            throw new Error("OpenAI PDF vision verification failed")
        }
        checks.openaiPdfVision = "ok"

        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
            temperature: 0,
            messages: [
                { role: "system", content: "Answer using only the supplied evidence." },
                { role: "user", content: `Evidence: ${text}\nQuestion: What is the verification token?` },
            ],
        })
        if (!completion.choices[0]?.message.content?.toLowerCase().includes("amber-lantern")) {
            throw new Error("OpenAI grounded chat verification failed")
        }
        checks.openaiChat = "ok"

        const embedding = await openai.embeddings.create({
            model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
            input: text,
        })
        const values = embedding.data[0]?.embedding
        if (!values?.length) throw new Error("OpenAI embedding verification failed")
        checks.openaiEmbeddings = "ok"

        await index.upsert([{
            id: `${documentId}:0`,
            values,
            metadata: {
                userId: namespace,
                documentId,
                documentName: "smoke.pdf",
                chunkIndex: 0,
                pageNumber: 1,
                text,
            },
        }])
        const query = await index.query({
            vector: values,
            topK: 1,
            includeMetadata: true,
            filter: { documentId: { $eq: documentId } },
        })
        if (query.matches?.[0]?.id !== `${documentId}:0`) {
            throw new Error("Pinecone filtered retrieval verification failed")
        }
        checks.pinecone = "ok"

        console.table(checks)
    } finally {
        await Promise.allSettled([
            index.deleteAll(),
            cloudinary.uploader.destroy(publicId, { resource_type: "raw", type: "authenticated" }),
            mongoose.disconnect(),
        ])
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Provider smoke test failed")
    process.exitCode = 1
})
