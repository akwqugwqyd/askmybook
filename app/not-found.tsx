import Link from "next/link"
import { Compass } from "lucide-react"

export default function NotFound() {
    return (
        <main className="app-frame grid min-h-[calc(100vh-65px)] place-items-center px-5 py-12">
            <section className="recovery-panel max-w-md p-6 sm:p-7">
                <span className="recovery-icon"><Compass size={21} /></span>
                <h1 className="mt-4 text-lg font-semibold text-[#eff8ff]">This page is not here</h1>
                <p className="mt-1.5 text-sm leading-6 text-[#9fb5c9]">The link may be old, or the page may have moved.</p>
                <Link href="/dashboard" className="button-primary mt-5 inline-flex px-3.5 py-2 text-xs">Open knowledge base</Link>
            </section>
        </main>
    )
}
