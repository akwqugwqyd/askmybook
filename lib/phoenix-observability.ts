import { createHash } from "node:crypto"
import {
    context,
    setMetadata,
    setSession,
    setUser,
    SpanStatusCode,
    trace,
} from "@arizeai/phoenix-otel"

type PhoenixAttribute = string | number | boolean

interface RagTraceContext {
    traceId: string
    userId: string
    conversationId?: string
    documentCount: number
    qualityMode: string
    operation?: string
}

const anonymousIdentifier = (value: string): string =>
    createHash("sha256").update(value).digest("hex").slice(0, 24)

const errorFromUnknown = (error: unknown): Error =>
    error instanceof Error ? error : new Error(String(error))

export const withPhoenixSpan = async <T>(
    name: string,
    kind: "CHAIN" | "RETRIEVER" | "RERANKER" | "LLM" | "TOOL",
    attributes: Record<string, PhoenixAttribute>,
    operation: () => Promise<T>,
): Promise<T> => (globalThis.askMyBookPhoenixTracer ?? trace.getTracer("ai-book-saas", "1.0.0"))
    .startActiveSpan(name, async (span) => {
    span.setAttribute("openinference.span.kind", kind)
    span.setAttributes(attributes)
    try {
        const result = await operation()
        span.setStatus({ code: SpanStatusCode.OK })
        return result
    } catch (error) {
        span.recordException(errorFromUnknown(error))
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorFromUnknown(error).message })
        throw error
    } finally {
        span.end()
    }
    })

export const withRagTrace = async <T>(
    traceContext: RagTraceContext,
    operation: () => Promise<T>,
): Promise<T> => {
    const userHash = anonymousIdentifier(traceContext.userId)
    const sessionId = traceContext.conversationId || traceContext.traceId
    const metadata = {
        applicationTraceId: traceContext.traceId,
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
        qualityMode: traceContext.qualityMode,
        documentCount: traceContext.documentCount,
        operation: traceContext.operation || "grounded_chat",
    }
    const activeContext = setMetadata(
        setUser(
            setSession(context.active(), { sessionId }),
            { userId: userHash },
        ),
        metadata,
    )

    return context.with(activeContext, () => withPhoenixSpan(
        "rag.chat",
        "CHAIN",
        {
            "app.trace_id": traceContext.traceId,
            "app.user_hash": userHash,
            "rag.document_count": traceContext.documentCount,
            "rag.quality_mode": traceContext.qualityMode,
            "rag.operation": traceContext.operation || "grounded_chat",
        },
        operation,
    ))
}

export const activePhoenixContext = (): { traceId?: string; spanId?: string } => {
    const spanContext = trace.getActiveSpan()?.spanContext()
    return spanContext
        ? { traceId: spanContext.traceId, spanId: spanContext.spanId }
        : {}
}
