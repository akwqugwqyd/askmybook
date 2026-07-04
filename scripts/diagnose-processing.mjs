import mongoose from "mongoose"

const main = async () => {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required")

    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 })
    const documents = await mongoose.connection.db
        .collection("books")
        .find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .project({
            processingStatus: 1,
            processingError: 1,
            processingAttempts: 1,
            indexingVersion: 1,
            pdfUrl: 1,
            storagePublicId: 1,
            createdAt: 1,
        })
        .toArray()

    const safeResults = documents.map((document) => {
        let storage = null
        try {
            const url = new URL(document.pdfUrl)
            const parts = url.pathname.split("/").filter(Boolean)
            storage = {
                host: url.hostname,
                resourceType: parts[1] || null,
                deliveryType: parts[2] || null,
            }
        } catch {
            storage = { invalidUrl: true }
        }

        return {
            status: document.processingStatus,
            error: document.processingError?.message || null,
            code: document.processingError?.code || null,
            attempts: document.processingAttempts || 0,
            indexingVersion: document.indexingVersion || null,
            hasPublicId: Boolean(document.storagePublicId),
            storage,
            createdAt: document.createdAt,
        }
    })

    console.table(safeResults)
    await mongoose.disconnect()
}

main().catch(async (error) => {
    console.error(error instanceof Error ? error.message : "Diagnostics failed")
    await mongoose.disconnect().catch(() => undefined)
    process.exitCode = 1
})
