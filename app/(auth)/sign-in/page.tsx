'use client'

import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="app-frame flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="eyebrow">AskMyBook</p>
          <h1 className="font-display mt-2 text-4xl tracking-[-0.04em] text-[#effaff]">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-[#9bb7c9]">
            Access your documents and chat history.
          </p>
        </div>
        
        <div className="flex justify-center">
          <SignIn
            appearance={{
              elements: {
                rootBox: 'w-full',
                card: 'border border-[#b7e6ff]/20 bg-[#0d293c] shadow-2xl shadow-black/25',
                headerTitle: 'text-[#effaff]',
                headerSubtitle: 'text-[#9bb7c9]',
                socialButtonsBlockButton: 'border border-[#b7e6ff]/18 bg-[#102e43] text-[#d9effb] hover:bg-[#173c54]',
                formButtonPrimary: 'bg-[#8ff5d3] text-[#07201c] hover:bg-[#c0ffe9]',
                formFieldInput: 'border-[#b7e6ff]/20 bg-[#081e2e] text-[#d9effb]',
                formFieldLabel: 'text-[#a9c4d5]',
                dividerLine: 'bg-[#b7e6ff]/16',
                dividerText: 'text-[#9bb7c9]',
                footerActionLink: 'text-[#8ff5d3] hover:text-[#c0ffe9]',
              },
              variables: {
                colorPrimary: '#8ff5d3',
                colorBackground: '#0d293c',
              },
            }}
            signUpUrl="/sign-up"
          />
        </div>
      </div>
    </div>
  )
}
