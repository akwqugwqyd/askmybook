"use client"
import Link from 'next/link'
import Image from 'next/image'

const steps = [
    { num: 1, title: 'Upload PDF', desc: 'Add your book file' },
    { num: 2, title: 'Start Chatting', desc: 'Ask anything about it' },
]

const HeroSection = () => {
    return (
        <section className="w-full bg-[#0D0C0A] border-b border-[#2A2520] px-10 py-10">
            <div className="w-full max-w-5xl mx-auto grid grid-cols-3 items-center"
                style={{ gap: '1.5rem 4rem' }}>

                {/* LEFT */}
                <div className="flex flex-col gap-4">
                    <h1 className="text-4xl font-medium text-[#F0E6D0] leading-tight">
                        Your Library
                    </h1>
                    <p className="text-sm text-[#6B5F52] leading-relaxed">
                        Convert your books into interactive AI conversations.
                        Listen, learn, and discuss your favorite reads.
                    </p>
                    <Link
                        href="/books/new"
                        className="inline-flex items-center gap-2 w-fit px-5 py-2.5 rounded-lg
                            border border-[#E8C97A] text-sm text-[#E8C97A]
                            hover:bg-[#E8C97A] hover:text-[#0D0C0A] transition-all duration-200">
                        + Add new book
                    </Link>
                </div>

                {/* CENTER */}
                <div className="flex items-center justify-center h-48">
                    <Image
                        src="/assests/hero-illustration.svg"
                        alt="Books illustration"
                        width={280}
                        height={192}
                        className="object-contain w-full h-full"
                    />
                </div>

                {/* RIGHT */}
                <div className="bg-[#141210] border border-[#2A2520] rounded-xl p-6
                    flex flex-col gap-6 ml-12">
                    {steps.map(({ num, title, desc }) => (
                        <div key={num} className="flex items-start gap-4">
                            <div className="w-7 h-7 rounded-full bg-[#1E1A14] border border-[#E8C97A]
                                flex items-center justify-center text-xs text-[#E8C97A] shrink-0">
                                {num}
                            </div>
                            <div>
                                <p className="text-sm font-medium text-[#D4C5A9]">{title}</p>
                                <p className="text-xs text-[#5A5048] mt-0.5">{desc}</p>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </section>
    )
}

export default HeroSection

