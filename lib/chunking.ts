import { Document } from "@langchain/core/documents"
import { getEncoding } from "js-tiktoken"

interface PageInput {
    pageNumber: number
    text: string
}

interface ChunkContext {
    userId: string
    documentId: string
    documentName: string
    title: string
    author: string
    fileSize: number
    embeddingModel: string
    embeddingVersion: number
}

const headingPattern = /^(?:\d+(?:\.\d+)*[\s.)-]+.{2,100}|[A-Z][A-Z0-9 &'’():/-]{3,100})$/

const splitSections = (text: string): Array<{ heading?: string; content: string }> => {
    const lines = text.split(/\r?\n/)
    const sections: Array<{ heading?: string; content: string }> = []
    let heading: string | undefined
    let body: string[] = []

    const flush = () => {
        const content = body.join("\n").trim()
        if (content) sections.push({ heading, content })
        body = []
    }

    for (const line of lines) {
        const clean = line.trim()
        if (clean.length <= 120 && headingPattern.test(clean)) {
            flush()
            heading = clean
        } else {
            body.push(line)
        }
    }
    flush()
    return sections.length > 0 ? sections : [{ content: text }]
}

const tokenizer = getEncoding("cl100k_base")

const splitByTokens = (text: string, chunkSize: number, overlap: number): string[] => {
    const tokens = tokenizer.encode(text)
    if (tokens.length <= chunkSize) return [text]

    const chunks: string[] = []
    const step = Math.max(1, chunkSize - overlap)
    for (let start = 0; start < tokens.length; start += step) {
        const slice = tokens.slice(start, start + chunkSize)
        chunks.push(tokenizer.decode(slice))
        if (start + chunkSize >= tokens.length) break
    }
    return chunks
}

export const createDocumentChunks = async (
    pages: PageInput[],
    context: ChunkContext,
): Promise<Document[]> => {
    const chunkSize = Number(process.env.RAG_CHUNK_TOKENS || 500)
    const overlap = Number(process.env.RAG_CHUNK_OVERLAP_TOKENS || 75)
    const chunks = pages.flatMap((page) =>
        splitSections(page.text).flatMap((section) => {
            const content = section.heading
                ? `${section.heading}\n${section.content}`
                : section.content
            return splitByTokens(content, chunkSize, overlap).map((pageContent) => ({
                pageContent,
                pageNumber: page.pageNumber,
                sectionTitle: section.heading || "",
            }))
        }),
    )

    return chunks.map((chunk, chunkIndex) => new Document({
        pageContent: chunk.pageContent.trim(),
        metadata: {
            ...context,
            source: context.documentName,
            pageNumber: chunk.pageNumber,
            page: chunk.pageNumber,
            sectionTitle: chunk.sectionTitle,
            chunkIndex,
            tokenCount: tokenizer.encode(chunk.pageContent).length,
        },
    })).filter((chunk) => chunk.pageContent.length > 0)
}
