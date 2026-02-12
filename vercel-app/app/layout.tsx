import React from "react"
import type { Metadata, Viewport } from "next"
import { Noto_Sans_KR } from "next/font/google"
import { AuthProvider } from "@/lib/auth-context"
import { LangProvider } from "@/lib/lang-context"

import "./globals.css"

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export const metadata: Metadata = {
  title: "충만치킨 - Integrated ERP",
  description: "충만치킨 Integrated ERP System",
}

export const viewport: Viewport = {
  themeColor: "#f9f6f2",
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
      <body className={`${notoSansKR.className} antialiased`}>
        <AuthProvider>
        <LangProvider>{children}</LangProvider>
      </AuthProvider>
      </body>
    </html>
  )
}
