"use client"

import { useEffect, useState } from "react"
import { Activity, Database, DollarSign, Gauge, LoaderCircle, MessageSquare, ShieldCheck } from "lucide-react"
import RecoveryPanel from "@/components/RecoveryPanel"

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
    const [loading, setLoading] = useState(true)

    const requestMetrics = async () => {
        try {
            const response = await fetch("/api/admin/metrics", { cache: "no-store" })
            const data = await response.json().catch(() => ({})) as Metrics & { error?: string }
            if (!response.ok) throw new Error(data.error || "Metrics could not be loaded.")
            setMetrics(data)
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Metrics could not be loaded.")
        } finally {
            setLoading(false)
        }
    }

    const loadMetrics = () => {
        setError("")
        setLoading(true)
        void requestMetrics()
    }

    useEffect(() => {
        void requestMetrics()
    }, [])

    if (loading) return <main className="app-frame grid min-h-[70vh] place-items-center"><div className="flex items-center gap-3 text-sm text-[#9bb7c9]"><LoaderCircle size={17} className="animate-spin text-[#8ff5d3]" /> Loading metrics</div></main>
    if (error && !metrics) return <main className="app-frame grid min-h-[70vh] place-items-center px-5"><RecoveryPanel title="Metrics could not be loaded" message={error} onRetry={loadMetrics} /></main>
    if (!metrics) return null

    const cards = [
        ["AI requests · 24h", metrics.last24Hours.requests, Activity],
        ["Indexed chunks", metrics.chunks, Database],
        ["Messages", metrics.messages, MessageSquare],
        ["Cache hit rate", `${(metrics.last24Hours.cacheHitRate * 100).toFixed(1)}%`, Gauge],
        ["Faithfulness", `${(metrics.last24Hours.faithfulness * 100).toFixed(1)}%`, ShieldCheck],
        ["Estimated cost · 24h", `$${metrics.last24Hours.cost.toFixed(4)}`, DollarSign],
    ] as const

    return (
        <main className="app-frame min-h-screen px-6 py-10">
            <div className="mx-auto max-w-6xl">
                <p className="eyebrow">Operations</p>
                <h1 className="font-display mt-2 text-4xl tracking-[-0.04em] text-[#effaff]">Intelligence metrics</h1>
                <p className="mt-2 text-sm text-[#9bb7c9]">A live pulse check on quality, cost, and the document pipeline.</p>
                {error && <div className="mt-6 max-w-xl"><RecoveryPanel compact message={error} onRetry={loadMetrics} /></div>}

                <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {cards.map(([label, value, Icon]) => (
                        <div key={label} className="shell-card rounded-2xl p-5">
                            <Icon size={17} className="text-[#8ff5d3]" />
                            <p className="mt-5 text-xs text-[#91adbf]">{label}</p>
                            <p className="mt-2 text-2xl font-semibold text-[#effaff]">{value}</p>
                        </div>
                    ))}
                </div>
                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    <div className="shell-card rounded-2xl p-5">
                        <h2 className="text-sm font-semibold text-[#e4f5ff]">Document pipeline</h2>
                        <pre className="mt-4 text-xs leading-6 text-[#9db8c9]">{JSON.stringify(metrics.documents, null, 2)}</pre>
                    </div>
                    <div className="shell-card rounded-2xl p-5 text-sm text-[#9db8c9]">
                        <h2 className="text-sm font-semibold text-[#e4f5ff]">Quality · last 24 hours</h2>
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
