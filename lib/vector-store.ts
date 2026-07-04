import { Errors as PineconeErrors } from "@pinecone-database/pinecone"
import { logger } from "@/lib/logger"
import pineconeClient from "@/lib/pinecone"

const isPineconeNotFoundError = (error: unknown): boolean =>
    error instanceof PineconeErrors.PineconeNotFoundError
    || (error instanceof Error && error.name === "PineconeNotFoundError")

const deleteIfPresent = async (
    operation: () => Promise<unknown>,
    documentId: string,
    layout: "user" | "legacy",
): Promise<void> => {
    try {
        await operation()
    } catch (error) {
        // Pinecone returns 404 when a namespace has never contained vectors.
        // For cleanup and first-time indexing, that is the desired end state.
        if (isPineconeNotFoundError(error)) {
            logger.info("No Pinecone vectors remained for document", {
                documentId,
                layout,
            })
            return
        }

        throw error
    }
}

export const deleteDocumentVectors = async (
    userId: string,
    documentId: string,
    options: { includeLegacyNamespace?: boolean } = {},
): Promise<void> => {
    const index = pineconeClient.index(process.env.PINECONE_INDEX!)
    const operations = [
        deleteIfPresent(
            () => index
                .namespace(userId)
                .deleteMany({ documentId: { $eq: documentId } }),
            documentId,
            "user",
        ),
    ]

    if (options.includeLegacyNamespace) {
        operations.push(deleteIfPresent(
            () => index.namespace(documentId).deleteAll(),
            documentId,
            "legacy",
        ))
    }

    await Promise.all(operations)
}
