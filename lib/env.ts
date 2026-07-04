const requiredEnvVars = [
  'MONGODB_URI',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'OPENAI_API_KEY',
  'PINECONE_API_KEY',
  'PINECONE_INDEX',
]

export function validateEnv() {
  const missing = requiredEnvVars.filter((env) => !process.env[env])
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }

  const dailyLimit = Number(process.env.AI_DAILY_REQUEST_LIMIT || 10)
  const relevance = Number(process.env.RAG_MIN_RELEVANCE_SCORE || 0.25)
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1) {
    throw new Error("AI_DAILY_REQUEST_LIMIT must be a positive integer")
  }
  if (!Number.isFinite(relevance) || relevance < 0 || relevance > 1) {
    throw new Error("RAG_MIN_RELEVANCE_SCORE must be between 0 and 1")
  }
}
