"use client"

import { useEffect } from "react"
import RecoveryPanel from "@/components/RecoveryPanel"

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        console.error("Application route error", error)
    }, [error])

    return (
        <main className="app-frame grid min-h-[calc(100vh-65px)] place-items-center px-5 py-12">
            <RecoveryPanel
                title="This view could not be opened"
                message="Your data is safe. Check your connection and try loading this view again."
                onRetry={reset}
                backHref="/dashboard"
                backLabel="Knowledge base"
            />
        </main>
    )
}
