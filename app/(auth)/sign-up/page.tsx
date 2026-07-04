'use client'

import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#0D0C0A] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-medium text-[#E8C97A] mb-2">
            Join AskMyBook
          </h1>
          <p className="text-sm text-[#7A6E62]">
            Create an account to build your private knowledge base
          </p>
        </div>
        
        <div className="flex justify-center">
          <SignUp
            appearance={{
              elements: {
                rootBox: 'w-full',
                card: 'bg-[#141210] border border-[#2A2520]',
                headerTitle: 'text-[#F0E6D0]',
                headerSubtitle: 'text-[#7A6E62]',
                socialButtonsBlockButton: 'bg-[#1F1C19] border border-[#2A2520] text-[#D4C5A9] hover:bg-[#2A2520]',
                formButtonPrimary: 'bg-[#E8C97A] text-[#0D0C0A] hover:bg-[#D4B560]',
                formFieldInput: 'bg-[#1F1C19] border-[#2A2520] text-[#D4C5A9]',
                formFieldLabel: 'text-[#7A6E62]',
                dividerLine: 'bg-[#2A2520]',
                dividerText: 'text-[#7A6E62]',
                footerActionLink: 'text-[#E8C97A] hover:text-[#D4B560]',
              },
              variables: {
                colorPrimary: '#E8C97A',
                colorBackground: '#0D0C0A',
              },
            }}
            signInUrl="/sign-in"
          />
        </div>
      </div>
    </div>
  )
}
