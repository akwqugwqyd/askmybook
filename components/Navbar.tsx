"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { SignInButton, UserButton, useUser } from "@clerk/nextjs"
import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
    { label: "Knowledge base", href: "/dashboard" },
    { label: "Ask documents", href: "/chat" },
    { label: "Upload", href: "/books/new" },
]

const Navbar = () => {
    const pathName = usePathname()
    const { user, isLoaded } = useUser()

    return (
        <header className="sticky top-0 z-40 h-[var(--app-nav-height)] shrink-0 border-b border-[#b7e6ff]/12 bg-[#07131f]/82 backdrop-blur-xl">
            <div className="mx-auto flex h-full max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-6">
                <Link href="/" className="flex shrink-0 items-center gap-2 text-base font-bold tracking-tight text-[#effaff] sm:text-lg">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#8ff5d3] text-[#07201c]"><Sparkles size={14} /></span>
                    Ask<span className="text-[#8ff5d3]">MyBook</span>
                </Link>

                <nav className="flex min-w-0 items-center gap-2 sm:gap-5">
                    <div className="hidden items-center gap-1 rounded-full border border-[#b7e6ff]/15 bg-[#0c2132]/80 p-1 md:flex">
                        {navItems.map(({ label, href }) => {
                            const isActive = pathName === href || (href !== "/" && pathName?.startsWith(href))

                            return (
                                <Link
                                    href={href}
                                    key={label}
                                    className={cn(
                                        "rounded-full px-3 py-1.5 text-xs transition",
                                        isActive
                                            ? "bg-[#8ff5d3]/14 text-[#a7ffe1]"
                                            : "text-[#91afc1] hover:bg-[#b7e6ff]/10 hover:text-[#e4f7ff]",
                                    )}>
                                    {label}
                                </Link>
                            )
                        })}
                    </div>

                    {isLoaded && !user && (
                        <SignInButton mode="modal">
                            <button className="button-primary px-4 py-2 text-sm">
                                Sign in
                            </button>
                        </SignInButton>
                    )}
                    {isLoaded && user && <UserButton />}
                </nav>
            </div>
        </header>
    )
}

export default Navbar
