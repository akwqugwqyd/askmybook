import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import {
    ArrowRight,
    CheckCircle2,
    FileSearch,
    Files,
    LockKeyhole,
    ScanText,
    Sparkles,
} from "lucide-react"

const sourceCards = [
    { icon: Files, label: "Supported files", detail: "PDF, DOCX, CSV, JSON, HTML, text, and images" },
    { icon: ScanText, label: "Text extraction", detail: "Scanned pages can be processed with OCR" },
    { icon: LockKeyhole, label: "Private workspace", detail: "Documents are isolated to your account" },
]

export default async function HomePage() {
    const { userId } = await auth()
    const primaryHref = userId ? "/dashboard" : "/sign-in"

    return (
        <main className="app-frame min-h-[calc(100dvh-var(--app-nav-height))] overflow-x-hidden px-5 pb-16 pt-10 text-[#edf7ff] sm:px-8 sm:pt-16">
            <section className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(430px,0.9fr)] lg:gap-10">
                <div className="rise-in">
                    <p className="inline-flex items-center gap-2 rounded-full border border-[#6ed8c0]/30 bg-[#8ff5d3]/10 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.15em] text-[#9df8db]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#8ff5d3] shadow-[0_0_14px_#8ff5d3]" />
                        Document search with citations
                    </p>
                    <h1 className="font-display mt-6 max-w-3xl text-5xl leading-[0.94] tracking-[-0.055em] text-[#f2fbff] sm:text-6xl lg:text-7xl">
                        Search your documents.
                        <span className="block text-[#8ff5d3]">Review the evidence.</span>
                    </h1>
                    <p className="mt-6 max-w-xl text-base leading-7 text-[#a8c0d2] sm:text-lg">
                        Upload files, ask questions across selected documents, and review the supporting pages for every answer.
                    </p>

                    <div className="mt-8 flex flex-wrap gap-3">
                        <Link href={primaryHref} className="button-primary inline-flex items-center gap-2 px-5 py-3 text-sm">
                            {userId ? "Open my workspace" : "Try your sources"} <ArrowRight size={16} />
                        </Link>
                        <Link href={userId ? "/books/new" : "/sign-in"} className="button-secondary inline-flex items-center gap-2 px-5 py-3 text-sm">
                            <Files size={16} /> Upload a source
                        </Link>
                    </div>

                    <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
                        {sourceCards.map(({ icon: Icon, label, detail }, index) => (
                            <article key={label} className={`shell-card rounded-2xl p-4 ${index === 1 ? "sm:translate-y-4" : ""}`}>
                                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#8ff5d3]/12 text-[#8ff5d3]"><Icon size={17} /></span>
                                <h2 className="mt-4 text-sm font-bold text-[#e7f6ff]">{label}</h2>
                                <p className="mt-1.5 text-xs leading-5 text-[#92adc0]">{detail}</p>
                            </article>
                        ))}
                    </div>
                </div>

                <div className="rise-in-delay relative mx-auto w-full max-w-xl">
                    <div className="absolute -left-10 top-10 h-40 w-40 rounded-full bg-[#8ff5d3]/20 blur-3xl" />
                    <div className="absolute -bottom-8 -right-8 h-44 w-44 rounded-full bg-[#ff927a]/18 blur-3xl" />
                    <section className="shell-card relative overflow-hidden rounded-[2rem] p-3 sm:p-5">
                        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#8ff5d3]/8 to-transparent" />
                        <div className="relative rounded-[1.45rem] border border-[#b7e6ff]/15 bg-[#071a2a]/82 p-4 sm:p-5">
                            <div className="flex items-center justify-between border-b border-[#b7e6ff]/12 pb-4">
                                <div className="flex items-center gap-3">
                                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#8ff5d3] text-[#08221e]"><Sparkles size={17} /></span>
                                    <div>
                                        <p className="text-sm font-bold text-[#eaf8ff]">Document search</p>
                                        <p className="mt-0.5 text-[11px] text-[#86a6bc]">4 documents indexed</p>
                                    </div>
                                </div>
                                <span className="rounded-full border border-[#8ff5d3]/25 bg-[#8ff5d3]/10 px-2.5 py-1 text-[10px] font-bold text-[#9df8db]">READY</span>
                            </div>

                            <div className="mt-5 rounded-2xl border border-[#b7e6ff]/12 bg-[#102c42]/70 p-4">
                                <p className="eyebrow">Question</p>
                                <p className="mt-2 text-sm leading-6 text-[#e7f5ff]">What risks did the team identify before launch?</p>
                            </div>

                            <div className="relative my-3 h-9">
                                <div className="absolute left-7 top-0 h-full border-l border-dashed border-[#8ff5d3]/45" />
                                <span className="absolute left-[19px] top-3 h-3 w-3 rounded-full border-2 border-[#8ff5d3] bg-[#0a2031]" />
                            </div>

                            <div className="rounded-2xl border border-[#8ff5d3]/20 bg-[#0d3141]/74 p-4">
                                <div className="flex items-center justify-between gap-3">
                                <p className="eyebrow">Answer with citations</p>
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#8ff5d3]"><CheckCircle2 size={12} /> 3 sources</span>
                                </div>
                                <p className="mt-2 text-sm leading-6 text-[#d9effb]">The key risk was launch readiness: delayed approvals, incomplete onboarding, and unclear escalation ownership.</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {["Launch plan p. 8", "Risk register p. 3", "Notes p. 12"].map((source) => (
                                        <span key={source} className="rounded-lg border border-[#b7e6ff]/15 bg-[#071d2c] px-2 py-1 text-[10px] text-[#9ec6d9]">{source}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>
                    <div className="absolute -left-3 bottom-8 hidden rounded-2xl border border-[#ffb3a1]/30 bg-[#173247]/95 p-3 shadow-xl shadow-black/20 sm:block">
                        <div className="flex items-center gap-2.5">
                            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#ff927a]/15 text-[#ffab97]"><FileSearch size={15} /></span>
                            <div><p className="text-xs font-bold text-[#eaf7ff]">Citations</p><p className="text-[10px] text-[#99b5c6]">Open the supporting text.</p></div>
                        </div>
                    </div>
                    <div className="absolute -right-4 top-20 hidden rounded-xl border border-[#8ff5d3]/25 bg-[#0c2637]/95 px-3 py-2 shadow-xl shadow-black/20 lg:block">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#9df8db]"><CheckCircle2 size={13} /> Sources ready</span>
                    </div>
                </div>
            </section>

            <section className="mx-auto mt-20 max-w-7xl border-t border-[#b7e6ff]/12 pt-7 sm:mt-28">
                <p className="text-center text-sm text-[#87a6ba]">Built for the documents people actually work with, not just pristine PDFs.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-x-8 gap-y-3 text-xs font-bold uppercase tracking-[0.16em] text-[#79b3ca]">
                    <span>PDF + OCR</span><span>DOCX</span><span>CSV</span><span>JSON</span><span>HTML</span><span>Images</span>
                </div>
            </section>
        </main>
    )
}
