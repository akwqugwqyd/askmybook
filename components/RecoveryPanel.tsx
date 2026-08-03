"use client"

import Link from "next/link"
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react"

interface RecoveryPanelProps {
    title?: string
    message: string
    onRetry?: () => void
    retryLabel?: string
    backHref?: string
    backLabel?: string
    compact?: boolean
}

export default function RecoveryPanel({
    title = "Something went wrong",
    message,
    onRetry,
    retryLabel = "Try again",
    backHref,
    backLabel = "Go back",
    compact = false,
}: RecoveryPanelProps) {
    return (
        <section className={`recovery-panel ${compact ? "p-4" : "max-w-md p-6 sm:p-7"}`} role="alert">
            <span className="recovery-icon"><AlertTriangle size={compact ? 17 : 21} /></span>
            <div className={compact ? "mt-3" : "mt-4"}>
                <h2 className={compact ? "text-sm font-semibold text-[#eff8ff]" : "text-lg font-semibold text-[#eff8ff]"}>{title}</h2>
                <p className="mt-1.5 text-sm leading-6 text-[#9fb5c9]">{message}</p>
            </div>
            {(onRetry || backHref) && (
                <div className="mt-5 flex flex-wrap gap-2.5">
                    {onRetry && (
                        <button onClick={onRetry} className="button-primary inline-flex items-center gap-2 px-3.5 py-2 text-xs">
                            <RefreshCw size={14} /> {retryLabel}
                        </button>
                    )}
                    {backHref && (
                        <Link href={backHref} className="button-secondary inline-flex items-center gap-2 px-3.5 py-2 text-xs">
                            <ArrowLeft size={14} /> {backLabel}
                        </Link>
                    )}
                </div>
            )}
        </section>
    )
}
