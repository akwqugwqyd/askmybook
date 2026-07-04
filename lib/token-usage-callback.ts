import { BaseCallbackHandler } from "@langchain/core/callbacks/base"
import type { LLMResult } from "@langchain/core/outputs"

export interface TokenUsage {
    inputTokens: number
    outputTokens: number
}

export class TokenUsageCallback extends BaseCallbackHandler {
    name = "token_usage_callback"
    usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }

    handleLLMEnd(output: LLMResult): void {
        const providerUsage = output.llmOutput?.tokenUsage as Record<string, unknown> | undefined
        const promptTokens = Number(providerUsage?.promptTokens ?? providerUsage?.prompt_tokens)
        const completionTokens = Number(providerUsage?.completionTokens ?? providerUsage?.completion_tokens)
        if (Number.isFinite(promptTokens) || Number.isFinite(completionTokens)) {
            this.usage.inputTokens += Number.isFinite(promptTokens) ? promptTokens : 0
            this.usage.outputTokens += Number.isFinite(completionTokens) ? completionTokens : 0
            return
        }

        const generation = output.generations[0]?.[0] as {
            message?: { usage_metadata?: { input_tokens?: number; output_tokens?: number } }
        } | undefined
        this.usage.inputTokens += generation?.message?.usage_metadata?.input_tokens || 0
        this.usage.outputTokens += generation?.message?.usage_metadata?.output_tokens || 0
    }
}
