import React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, Geist_Mono, Noto_Sans_KR } from "next/font/google"
import { AuthProvider } from "@/lib/auth-context"
import { LangProvider } from "@/lib/lang-context"
import { ErrorBoundary } from "@/components/error-boundary"

import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})
const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  variable: "--font-noto-sans-kr",
})

export const metadata: Metadata = {
  title: "CHOONGMAN ERP MANAGER",
  description: "CHOONGMAN ERP 출고 관리 시스템",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-512.png",
  },
}

export const viewport: Viewport = {
  themeColor: "#1a2332",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <body className={`${inter.variable} ${geistMono.variable} ${notoSansKr.variable} font-sans antialiased`}>
        <ErrorBoundary>
          <AuthProvider>
            <LangProvider>{children}</LangProvider>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
