"use client"

import { useEffect } from "react"
import RecoveryPanel from "@/components/RecoveryPanel"
import "./globals.css"

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        console.error("Global application error", error)
    }, [error])

    return (
        <html lang="en">
            <body className="app-frame grid min-h-screen place-items-center px-5 py-12">
                <RecoveryPanel
                    title="The application could not be loaded"
                    message="Your data has not been deleted. Reload the application or return to the knowledge base."
                    onRetry={reset}
                    backHref="/"
                    backLabel="Home"
                />
            </body>
        </html>
    )
}
