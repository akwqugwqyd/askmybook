import type { DocumentInterface } from "@langchain/core/documents"
import { OpenAIEmbeddings } from "@langchain/openai"
import { PineconeStore } from "@langchain/pinecone"
import Chunk from "@/database/models/chunk.model"
import dbConnect from "@/database/mongoose"
import { logger } from "@/lib/logger"
import { withPhoenixSpan } from "@/lib/phoenix-observability"
import pineconeClient from "@/lib/pinecone"

export type RetrievalChannel = "dense" | "lexical"

export interface HybridSearchCandidate {
    id: string
    content: string
    document: string
    documentId: string
    page: string
    chunkIndex: number
    relevance: number
    denseScore?: number
    lexicalScore?: number
    retrievalChannels: RetrievalChannel[]
}

export interface HybridSearchScope {
    userId: string
    documentIds: string[]
}

interface RankedCandidate extends Omit<HybridSearchCandidate, "relevance" | "retrievalChannels"> {
    score: number
}

const numberFromEnv = (name: string, fallback: number, minimum: number, maximum: number): number => {
    const parsed = Number(process.env[name])
    return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback
}

const DENSE_CANDIDATES = numberFromEnv("RAG_DENSE_CANDIDATES", 12, 1, 50)
const LEXICAL_CANDIDATES = numberFromEnv("RAG_LEXICAL_CANDIDATES", 12, 1, 50)
const FUSED_CANDIDATES = numberFromEnv("RAG_FUSED_CANDIDATES", 16, 1, 50)
const MIN_DENSE_SCORE = numberFromEnv("RAG_MIN_RELEVANCE_SCORE", 0.2, -1, 1)
const RRF_K = numberFromEnv("RAG_RRF_K", 60, 1, 500)
const DENSE_WEIGHT = numberFromEnv("RAG_DENSE_WEIGHT", 1, 0, 10)
const LEXICAL_WEIGHT = numberFromEnv("RAG_LEXICAL_WEIGHT", 1, 0, 10)

const metadataText = (metadata: Record<string, unknown>, keys: string[], fallback: string): string => {
    for (const key of keys) {
        const value = metadata[key]
        if (typeof value === "string" && value.trim()) return value.trim()
        if (typeof value === "number") return String(value)
    }
    return fallback
}

const metadataNumber = (metadata: Record<string, unknown>, key: string, fallback = 0): number => {
    const value = Number(metadata[key])
    return Number.isFinite(value) ? value : fallback
}

const denseSearch = async (
    query: string,
    scope: HybridSearchScope,
): Promise<RankedCandidate[]> => {
    const embeddings = new OpenAIEmbeddings({
        openAIApiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    })
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
        pineconeIndex: pineconeClient.index(process.env.PINECONE_INDEX!),
        namespace: scope.userId,
    })
    const filter = scope.documentIds.length === 1
        ? { documentId: { $eq: scope.documentIds[0] } }
        : { documentId: { $in: scope.documentIds } }
    const matches = await vectorStore.similaritySearchWithScore(query, DENSE_CANDIDATES, filter)

    return matches
        .filter(([, score]) => score >= MIN_DENSE_SCORE)
        .map(([rawDocument, score]) => {
            const doc = rawDocument as DocumentInterface<Record<string, unknown>>
            const documentId = metadataText(doc.metadata, ["documentId"], "")
            const chunkIndex = metadataNumber(doc.metadata, "chunkIndex")
            return {
                id: `${documentId}:${chunkIndex}`,
                content: doc.pageContent,
                document: metadataText(
                    doc.metadata,
                    ["documentName", "document", "title", "source", "fileName"],
                    "Current document",
                ),
                documentId,
                page: metadataText(doc.metadata, ["page", "pageNumber", "page_number"], "unknown"),
                chunkIndex,
                denseScore: score,
                score,
            }
        })
}

interface LexicalAggregateResult {
    vectorId: string
    content: string
    documentName: string
    documentId: string
    pageNumber?: number
    chunkIndex: number
    lexicalScore: number
}

const lexicalSearch = async (
    query: string,
    scope: HybridSearchScope,
): Promise<RankedCandidate[]> => {
    await dbConnect()
    await Chunk.init()
    const matches = await Chunk.aggregate<LexicalAggregateResult>([
        {
            $match: {
                userId: scope.userId,
                documentId: { $in: scope.documentIds },
                $text: { $search: query },
            },
        },
        { $set: { lexicalScore: { $meta: "textScore" } } },
        { $sort: { lexicalScore: -1 } },
        { $limit: LEXICAL_CANDIDATES },
        {
            $project: {
                _id: 0,
                vectorId: 1,
                content: 1,
                documentName: 1,
                documentId: 1,
                pageNumber: 1,
                chunkIndex: 1,
                lexicalScore: 1,
            },
        },
    ])

    return matches.map((chunk) => ({
        id: chunk.vectorId,
        content: chunk.content,
        document: chunk.documentName,
        documentId: chunk.documentId,
        page: chunk.pageNumber ? String(chunk.pageNumber) : "unknown",
        chunkIndex: chunk.chunkIndex,
        lexicalScore: chunk.lexicalScore,
        score: chunk.lexicalScore,
    }))
}

export const reciprocalRankFusion = (
    dense: RankedCandidate[],
    lexical: RankedCandidate[],
    limit = FUSED_CANDIDATES,
): HybridSearchCandidate[] => {
    const candidates = new Map<string, HybridSearchCandidate & { fusionScore: number }>()
    const maximumScore = (DENSE_WEIGHT + LEXICAL_WEIGHT) / (RRF_K + 1) || 1

    const addRanking = (
        ranking: RankedCandidate[],
        channel: RetrievalChannel,
        weight: number,
    ) => {
        ranking.forEach((candidate, index) => {
            const existing = candidates.get(candidate.id)
            const fusionScore = weight / (RRF_K + index + 1)
            const next = existing ?? {
                id: candidate.id,
                content: candidate.content,
                document: candidate.document,
                documentId: candidate.documentId,
                page: candidate.page,
                chunkIndex: candidate.chunkIndex,
                denseScore: candidate.denseScore,
                lexicalScore: candidate.lexicalScore,
                relevance: 0,
                retrievalChannels: [],
                fusionScore: 0,
            }
            next.fusionScore += fusionScore
            next.retrievalChannels = [...new Set([...next.retrievalChannels, channel])]
            if (candidate.denseScore !== undefined) next.denseScore = candidate.denseScore
            if (candidate.lexicalScore !== undefined) next.lexicalScore = candidate.lexicalScore
            candidates.set(candidate.id, next)
        })
    }

    addRanking(dense, "dense", DENSE_WEIGHT)
    addRanking(lexical, "lexical", LEXICAL_WEIGHT)

    return [...candidates.values()]
        .sort((first, second) => second.fusionScore - first.fusionScore)
        .slice(0, limit)
        .map(({ fusionScore, ...candidate }) => ({
            ...candidate,
            relevance: Math.min(1, fusionScore / maximumScore),
        }))
}

export const hybridSearch = async (
    query: string,
    scope: HybridSearchScope,
): Promise<HybridSearchCandidate[]> => withPhoenixSpan(
    "rag.hybrid_retrieval",
    "RETRIEVER",
    {
        "rag.query_length": query.length,
        "rag.document_count": scope.documentIds.length,
    },
    async () => {
        if (!query.trim() || scope.documentIds.length === 0) return []

        const [denseResult, lexicalResult] = await Promise.allSettled([
            denseSearch(query, scope),
            lexicalSearch(query, scope),
        ])
        const dense = denseResult.status === "fulfilled" ? denseResult.value : []
        const lexical = lexicalResult.status === "fulfilled" ? lexicalResult.value : []

        if (denseResult.status === "rejected") {
            logger.warn("[HYBRID_RETRIEVAL] Dense search failed; using lexical results.", denseResult.reason)
        }
        if (lexicalResult.status === "rejected") {
            logger.warn("[HYBRID_RETRIEVAL] Lexical search failed; using dense results.", lexicalResult.reason)
        }
        if (dense.length === 0 && lexical.length === 0) {
            if (denseResult.status === "rejected" && lexicalResult.status === "rejected") {
                throw new AggregateError(
                    [denseResult.reason, lexicalResult.reason],
                    "Both hybrid retrieval channels failed.",
                )
            }
            return []
        }

        const fused = reciprocalRankFusion(dense, lexical)
        logger.info("[HYBRID_RETRIEVAL] Search completed", {
            denseCandidates: dense.length,
            lexicalCandidates: lexical.length,
            fusedCandidates: fused.length,
            candidatesInBothChannels: fused.filter((candidate) => candidate.retrievalChannels.length === 2).length,
        })
        return fused
    },
)
