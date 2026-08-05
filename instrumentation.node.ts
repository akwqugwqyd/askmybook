import * as CallbackManagerModule from "@langchain/core/callbacks/manager"
import { LangChainInstrumentation } from "@arizeai/openinference-instrumentation-langchain"
import { register, trace } from "@arizeai/phoenix-otel"
import { logger } from "@/lib/logger"

declare global {
    var askMyBookPhoenixInitialized: boolean | undefined
    var askMyBookPhoenixTracer: ReturnType<typeof trace.getTracer> | undefined
}

export const registerNodeObservability = (): void => {
    if (globalThis.askMyBookPhoenixInitialized) return

    const collectorEndpoint = process.env.PHOENIX_COLLECTOR_ENDPOINT?.trim()
    if (!collectorEndpoint) return

    const captureContent = process.env.PHOENIX_CAPTURE_CONTENT === "true"
    const provider = register({
        url: collectorEndpoint,
        apiKey: process.env.PHOENIX_API_KEY?.trim() || undefined,
        projectName: process.env.PHOENIX_PROJECT_NAME?.trim() || "ai-book-saas",
        batch: process.env.NODE_ENV === "production",
        global: true,
    })
    globalThis.askMyBookPhoenixTracer = provider.getTracer("ai-book-saas", "1.0.0")

    const langChainInstrumentation = new LangChainInstrumentation({
        tracerProvider: provider,
        traceConfig: {
            hideInputs: !captureContent,
            hideOutputs: !captureContent,
            hideInputMessages: !captureContent,
            hideOutputMessages: !captureContent,
            hideInputImages: true,
            hideEmbeddingVectors: true,
            hidePrompts: !captureContent,
        },
    })
    langChainInstrumentation.manuallyInstrument(CallbackManagerModule)

    globalThis.askMyBookPhoenixInitialized = true
    logger.info("Phoenix observability initialized", {
        projectName: process.env.PHOENIX_PROJECT_NAME?.trim() || "ai-book-saas",
        captureContent,
    })
}
