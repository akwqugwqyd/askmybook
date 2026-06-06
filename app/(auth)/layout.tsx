'use client'

import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && user) {
      router.replace('/')
    }
  }, [isLoaded, user, router])

  // Show loading state while checking auth
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-[#0D0C0A] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#E8C97A]"></div>
          <p className="text-[#7A6E62]">Loading...</p>
        </div>
      </div>
    )
  }

  // If user is logged in, don't show the page (redirect will happen)
  if (user) {
    return null
  }

  // Show auth page only if not logged in
  return <>{children}</>
}
