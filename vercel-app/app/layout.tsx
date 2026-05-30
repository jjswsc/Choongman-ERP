import React from "react"
import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import { Geist_Mono, Inter, Noto_Sans_Thai, Orbitron } from "next/font/google"
import { AuthProvider } from "@/lib/auth-context"
import { LangProvider } from "@/lib/lang-context"
import { AppMessageProvider } from "@/components/app-message-provider"
import { ErrorBoundary } from "@/components/error-boundary"
import { SwPreregister } from "@/components/sw-preregister"
import { AppBrandProvider } from "@/components/app-brand-provider"
import { getServerAppBrandConfig } from "@/lib/app-brand-server"

import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})
const pretendard = localFont({
  src: "../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  preload: false,
})
const notoSansThai = Noto_Sans_Thai({
  subsets: ["latin", "thai"],
  variable: "--font-noto-sans-thai",
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: false,
})
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  preload: false,
})
const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  weight: ["400", "500", "600", "700"],
  preload: false,
})

function appMetadataBase(): URL | undefined {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (raw) {
    try {
      return new URL(raw)
    } catch {
      /* ignore */
    }
  }
  const v = process.env.VERCEL_URL?.trim()
  if (v) {
    try {
      return new URL(`https://${v}`)
    } catch {
      /* ignore */
    }
  }
  return undefined
}

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getServerAppBrandConfig()
  const base = appMetadataBase()
  return {
    metadataBase: base,
    title: brand.appName,
    description: brand.metadataDescription,
    manifest: brand.manifestPath,
    icons: {
      icon: brand.iconPath,
      apple: brand.iconPath,
    },
    other: {
      google: "notranslate",
    },
  }
}

export const viewport: Viewport = {
  themeColor: "#1a2332",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const brand = await getServerAppBrandConfig()
  return (
    <html lang="ko" translate="no" className="notranslate">
      <body
        className={`${inter.variable} ${pretendard.variable} ${notoSansThai.variable} ${geistMono.variable} ${orbitron.variable} font-sans antialiased notranslate`}
      >
        <AppBrandProvider value={brand}>
          <ErrorBoundary>
            <AuthProvider>
              <SwPreregister />
              <LangProvider>
                <AppMessageProvider>{children}</AppMessageProvider>
              </LangProvider>
            </AuthProvider>
          </ErrorBoundary>
        </AppBrandProvider>
      </body>
    </html>
  )
}
