import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { ArrowRight, FileText, Lock, MessageSquareText, Search, ShieldCheck, Sparkles } from "lucide-react"

export default async function HomePage() {
    const { userId } = await auth()

    return (
        <main className="min-h-screen bg-[#0d0c0a] px-5 py-16 text-[#f2e7d7] sm:px-8">
            <section className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1fr_430px]">
                <div>
                    <p className="inline-flex items-center gap-2 rounded-full border border-[#3a3329] bg-[#15120f] px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-[#d9bd72]">
                        <Sparkles size={13} /> Private document intelligence
                    </p>
                    <h1 className="mt-6 max-w-3xl font-[var(--font-ibm-plex-serif)] text-5xl leading-[1.02] tracking-tight sm:text-6xl">
                        Ask questions across your PDFs and get answers with sources.
                    </h1>
                    <p className="mt-5 max-w-2xl text-base leading-7 text-[#9c9184]">
                        AskMyBook turns uploaded PDFs into a private knowledge base. It retrieves the most relevant
                        passages from the documents you choose, then generates grounded answers with page-level citations.
                    </p>

                    <div className="mt-8 flex flex-wrap gap-3">
                        <Link
                            href={userId ? "/dashboard" : "/sign-in"}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#e8c97a] px-5 py-3 text-sm font-semibold text-[#17130e] transition hover:bg-[#d8b760]">
                            {userId ? "Open dashboard" : "Start demo"}
                            <ArrowRight size={16} />
                        </Link>
                        <Link
                            href={userId ? "/chat" : "/sign-in"}
                            className="inline-flex items-center gap-2 rounded-xl border border-[#393128] bg-[#15120f] px-5 py-3 text-sm font-semibold text-[#d8cbb9] transition hover:border-[#5e513d]">
                            Ask documents
                        </Link>
                    </div>

                    <div className="mt-10 grid gap-3 text-sm text-[#a89c8d] sm:grid-cols-3">
                        <div className="rounded-2xl border border-[#2d2822] bg-[#12100e] p-4">
                            <Lock size={17} className="mb-3 text-[#e8c97a]" />
                            User-isolated documents
                        </div>
                        <div className="rounded-2xl border border-[#2d2822] bg-[#12100e] p-4">
                            <Search size={17} className="mb-3 text-[#e8c97a]" />
                            Metadata-filtered retrieval
                        </div>
                        <div className="rounded-2xl border border-[#2d2822] bg-[#12100e] p-4">
                            <ShieldCheck size={17} className="mb-3 text-[#e8c97a]" />
                            Grounded answers only
                        </div>
                    </div>
                </div>

                <div className="rounded-[2rem] border border-[#342d25] bg-[#12100e] p-5 shadow-2xl shadow-black/40">
                    <div className="rounded-3xl border border-[#2c271f] bg-[#0c0b0a] p-4">
                        <div className="flex items-center justify-between border-b border-[#252019] pb-4">
                            <div>
                                <p className="text-xs uppercase tracking-[0.16em] text-[#7f725f]">RAG workflow</p>
                                <h2 className="mt-1 text-lg font-semibold text-[#f1e4d1]">End-to-end pipeline</h2>
                            </div>
                            <span className="rounded-full bg-[#2a2113] px-3 py-1 text-xs text-[#e8c97a]">Live app</span>
                        </div>
                        <div className="mt-5 space-y-3">
                            {[
                                [FileText, "Upload PDFs", "Files are stored in Cloudinary."],
                                [Search, "Index chunks", "Text is extracted, chunked, embedded, and stored in Pinecone."],
                                [MessageSquareText, "Ask questions", "Retrieval is filtered by user and selected documents."],
                                [ShieldCheck, "Verify sources", "Answers include citations at the end."],
                            ].map(([Icon, title, body]) => (
                                <div key={String(title)} className="flex gap-3 rounded-2xl border border-[#29241e] bg-[#15120f] p-4">
                                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#2a2113] text-[#e8c97a]">
                                        <Icon size={16} />
                                    </span>
                                    <div>
                                        <p className="text-sm font-semibold text-[#eadfce]">{String(title)}</p>
                                        <p className="mt-1 text-xs leading-5 text-[#82786d]">{String(body)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </main>
    )
}
