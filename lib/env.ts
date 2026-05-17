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
}
