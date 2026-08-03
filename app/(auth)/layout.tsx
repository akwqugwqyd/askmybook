'use client'

import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && user) {
      router.replace('/dashboard')
    }
  }, [isLoaded, user, router])

  // Show loading state while checking auth
  if (!isLoaded) {
    return (
      <div className="app-frame flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-[#8ff5d3] border-t-transparent"></div>
          <p className="text-[#9bb7c9]">Opening your workspace...</p>
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
