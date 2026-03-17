import { Pinecone } from "@pinecone-database/pinecone"

const pineconeClient = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
})

export default pineconeClient

