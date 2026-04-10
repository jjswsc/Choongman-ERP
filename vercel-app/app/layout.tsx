import React from "react"
import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import { Geist_Mono, Orbitron } from "next/font/google"
import { AuthProvider } from "@/lib/auth-context"
import { LangProvider } from "@/lib/lang-context"
import { AppMessageProvider } from "@/components/app-message-provider"
import { ErrorBoundary } from "@/components/error-boundary"
import { SwPreregister } from "@/components/sw-preregister"
import { getAppBrandConfig } from "@/lib/app-brand"

import "./globals.css"

const pretendard = localFont({
  src: "../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
})
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})
const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  weight: ["400", "500", "600", "700"],
})

const brand = getAppBrandConfig()

export const metadata: Metadata = {
  title: brand.appName,
  description: `${brand.appName} 출고/운영 관리 시스템`,
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
      <body className={`${pretendard.variable} ${geistMono.variable} ${orbitron.variable} font-sans antialiased`}>
        <ErrorBoundary>
          <AuthProvider>
            <SwPreregister />
            <LangProvider>
              <AppMessageProvider>{children}</AppMessageProvider>
            </LangProvider>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
