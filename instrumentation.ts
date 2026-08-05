export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return
    if (!process.env.PHOENIX_COLLECTOR_ENDPOINT?.trim()) return

    const { registerNodeObservability } = await import("./instrumentation.node")
    registerNodeObservability()
}
