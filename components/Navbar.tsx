"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { SignInButton, UserButton, useUser } from '@clerk/nextjs'

const navitems = [
    { label: 'Library', href: '/' },
    { label: 'Add New', href: '/books/new' },
]

const Navbar = () => {
    const pathName = usePathname()
    const { user, isLoaded } = useUser()

    return (
        <header className="w-full border-b border-[#2A2520] bg-[#0D0C0A]">
            <div className="wrapper navbar-height py-4 flex justify-between items-center px-6">
                <Link href="/" className="text-[#E8C97A] text-lg font-medium tracking-wide">
                     AskMyBook
                </Link>

                <nav className="flex gap-7 items-center">
                    {navitems.map(({ label, href }) => {
                        const isActive = pathName === href ||
                            (href !== '/' && pathName?.startsWith(href))

                        return (
                            <Link
                                href={href}
                                key={label}
                                className={cn(
                                    'text-sm transition-all duration-200',
                                    isActive
                                        ? 'text-[#E8C97A] border-b border-[#E8C97A] pb-0.5'
                                        : 'text-[#7A6E62] hover:text-[#D4C5A9]'
                                )}>
                                {label}
                            </Link>
                        )
                    })}

                    <div className="flex gap-4 items-center">
                        {isLoaded && !user && (
                            <SignInButton mode="modal">
                                <button className="px-4 py-2 rounded-lg bg-[#E8C97A] text-[#0D0C0A]
                                    text-sm font-medium hover:bg-[#D4B560] transition-colors duration-200">
                                    Sign In
                                </button>
                            </SignInButton>
                        )}
                        {isLoaded && user && (
                            <div className="flex items-center gap-3">
                                <UserButton />
                            </div>
                        )}
                    </div>
                </nav>
            </div>
        </header>
    )
}

export default Navbar

