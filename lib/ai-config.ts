export const CURRENT_INDEXING_VERSION = 3
export const CURRENT_EMBEDDING_VERSION = Number(process.env.EMBEDDING_VERSION || 1)
export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small"
