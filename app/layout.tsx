import type { Metadata } from "next";
import { Mona_Sans, IBM_Plex_Serif } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";

import "./globals.css";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";

const ibmPlexSerif = IBM_Plex_Serif({
  variable:"--font-ibm-plex-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: 'swap',
})

const monaSans = Mona_Sans({
  variable:"--font-mona-sans",
  subsets: ["latin"],
  display: 'swap',
})

export const metadata: Metadata = {
    title: " AskMyBook — Chat with your books",
    description: "Convert your books into interactive AI conversations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body
          className={`${ibmPlexSerif.variable} ${monaSans.variable} antialiased`}
        >
          <Navbar />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
   