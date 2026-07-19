"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { SignInButton, UserButton, useUser } from "@clerk/nextjs"
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
        <header className="sticky top-0 z-40 w-full border-b border-[#2a2520] bg-[#0d0c0a]/95 backdrop-blur">
            <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
                <Link href="/" className="shrink-0 text-base font-semibold tracking-wide text-[#e8c97a] sm:text-lg">
                    AskMyBook
                </Link>

                <nav className="flex min-w-0 items-center gap-2 sm:gap-5">
                    <div className="hidden items-center gap-1 rounded-full border border-[#29241e] bg-[#12100e] p-1 md:flex">
                        {navItems.map(({ label, href }) => {
                            const isActive = pathName === href || (href !== "/" && pathName?.startsWith(href))

                            return (
                                <Link
                                    href={href}
                                    key={label}
                                    className={cn(
                                        "rounded-full px-3 py-1.5 text-xs transition",
                                        isActive
                                            ? "bg-[#2a2113] text-[#e8c97a]"
                                            : "text-[#8b8176] hover:bg-[#1b1814] hover:text-[#d4c5a9]",
                                    )}>
                                    {label}
                                </Link>
                            )
                        })}
                    </div>

                    {isLoaded && !user && (
                        <SignInButton mode="modal">
                            <button className="rounded-xl bg-[#e8c97a] px-4 py-2 text-sm font-semibold text-[#0d0c0a] transition hover:bg-[#d4b560]">
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
