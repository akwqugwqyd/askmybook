"use client"

import { useEffect, useState } from "react"
import { Activity, Database, DollarSign, Gauge, MessageSquare, ShieldCheck } from "lucide-react"

interface Metrics {
    documents: Record<string, number>
    chunks: number
    conversations: number
    messages: number
    last24Hours: {
        requests: number
        errors: number
        inputTokens: number
        outputTokens: number
        cost: number
        averageRelevance: number
        faithfulness: number
        averageDurationMs: number
        errorRate: number
        cacheHitRate: number
    }
}

export default function AdminPage() {
    const [metrics, setMetrics] = useState<Metrics | null>(null)
    const [error, setError] = useState("")

    useEffect(() => {
        fetch("/api/admin/metrics", { cache: "no-store" })
            .then(async (response) => {
                const data = await response.json()
                if (!response.ok) throw new Error(data.error || "Metrics could not be loaded.")
                setMetrics(data)
            })
            .catch((reason) => setError(reason instanceof Error ? reason.message : "Metrics could not be loaded."))
    }, [])

    if (error) return <main className="grid min-h-[70vh] place-items-center text-sm text-[#d58c84]">{error}</main>
    if (!metrics) return <main className="grid min-h-[70vh] place-items-center text-sm text-[#8f8579]">Loading metrics…</main>

    const cards = [
        ["AI requests · 24h", metrics.last24Hours.requests, Activity],
        ["Indexed chunks", metrics.chunks, Database],
        ["Messages", metrics.messages, MessageSquare],
        ["Cache hit rate", `${(metrics.last24Hours.cacheHitRate * 100).toFixed(1)}%`, Gauge],
        ["Faithfulness", `${(metrics.last24Hours.faithfulness * 100).toFixed(1)}%`, ShieldCheck],
        ["Estimated cost · 24h", `$${metrics.last24Hours.cost.toFixed(4)}`, DollarSign],
    ] as const

    return (
        <main className="min-h-screen bg-[#0d0c0a] px-6 py-10">
            <div className="mx-auto max-w-6xl">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#806f53]">Operations</p>
                <h1 className="mt-2 text-3xl text-[#f0e6d0]">Intelligence metrics</h1>
                <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {cards.map(([label, value, Icon]) => (
                        <div key={label} className="rounded-2xl border border-[#2c2721] bg-[#141210] p-5">
                            <Icon size={17} className="text-[#e8c97a]" />
                            <p className="mt-5 text-xs text-[#756a60]">{label}</p>
                            <p className="mt-2 text-2xl text-[#eee2cd]">{value}</p>
                        </div>
                    ))}
                </div>
                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-[#2c2721] bg-[#141210] p-5">
                        <h2 className="text-sm text-[#ddd1bf]">Document pipeline</h2>
                        <pre className="mt-4 text-xs leading-6 text-[#968b7d]">{JSON.stringify(metrics.documents, null, 2)}</pre>
                    </div>
                    <div className="rounded-2xl border border-[#2c2721] bg-[#141210] p-5 text-sm text-[#968b7d]">
                        <h2 className="text-sm text-[#ddd1bf]">Quality · last 24 hours</h2>
                        <p className="mt-4">Average relevance: {(metrics.last24Hours.averageRelevance * 100).toFixed(1)}%</p>
                        <p className="mt-2">Error rate: {(metrics.last24Hours.errorRate * 100).toFixed(1)}%</p>
                        <p className="mt-2">Average latency: {Math.round(metrics.last24Hours.averageDurationMs)}ms</p>
                        <p className="mt-2">Tracked tokens: {(metrics.last24Hours.inputTokens + metrics.last24Hours.outputTokens).toLocaleString()}</p>
                    </div>
                </div>
            </div>
        </main>
    )
}
