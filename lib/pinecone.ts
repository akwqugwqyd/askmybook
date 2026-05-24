import { Pinecone } from "@pinecone-database/pinecone"

if (!process.env.PINECONE_API_KEY) {
    console.error("❌ PINECONE_API_KEY not found in environment variables")
} else {
    console.log("✅ PINECONE_API_KEY found")
}

if (!process.env.PINECONE_INDEX) {
    console.error("❌ PINECONE_INDEX not found in environment variables")
} else {
    console.log(`✅ PINECONE_INDEX: ${process.env.PINECONE_INDEX}`)
}

if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.error("❌ CLOUDINARY_CLOUD_NAME not found")
} else {
    console.log("✅ CLOUDINARY_CLOUD_NAME found")
}

console.log("🔧 Initializing Pinecone client...")

const pineconeClient = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
})

console.log("✅ Pinecone client initialized successfully")

export default pineconeClient

