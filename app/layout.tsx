import type { Metadata } from "next"
import { ClerkProvider } from "@clerk/nextjs"
import "./globals.css"
import Navbar from "@/components/Navbar"

export const metadata: Metadata = {
  title: "AskMyBook — Grounded answers from your documents",
  description: "Build a private knowledge base and ask citation-backed questions across your PDFs.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider
      localization={{
        signIn: {
          start: {
            title: "Sign in to AskMyBook",
            titleCombined: "Sign in to AskMyBook",
            subtitle: "Continue to your private knowledge base",
            subtitleCombined: "Continue to your private knowledge base",
          },
        },
        signUp: {
          start: {
            title: "Create your AskMyBook account",
            titleCombined: "Create your AskMyBook account",
            subtitle: "Upload documents and ask grounded questions with citations",
            subtitleCombined: "Upload documents and ask grounded questions with citations",
          },
        },
      }}>
      <html lang="en">
        <body className="flex h-full flex-col antialiased">
          <Navbar />
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
