import React from "react"
import type { Metadata, Viewport } from "next"
import { AuthProvider } from "@/lib/auth-context"
import { LangProvider } from "@/lib/lang-context"
import { AppMessageProvider } from "@/components/app-message-provider"
import { ErrorBoundary } from "@/components/error-boundary"
import { StaleBundleAutoRecover } from "@/components/stale-bundle-auto-recover"
import { SwPreregister } from "@/components/sw-preregister"
import { SwAutoUpdate } from "@/components/sw-auto-update"
import { AppBrandProvider } from "@/components/app-brand-provider"
import { getServerAppBrandConfig } from "@/lib/app-brand-server"
import {
  geistMono,
  ibmPlexSansThai,
  inter,
  notoSansThai,
  orbitron,
  pretendard,
} from "@/lib/app-root-fonts"

import "./globals.css"

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
  /** 폴드·노치 기기 safe-area (PC는 0). AdminShell 등이 env(safe-area-inset-*) 사용 */
  viewportFit: "cover",
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
        className={`${inter.variable} ${pretendard.variable} ${ibmPlexSansThai.variable} ${notoSansThai.variable} ${geistMono.variable} ${orbitron.variable} font-sans antialiased notranslate`}
      >
        <AppBrandProvider value={brand}>
          <StaleBundleAutoRecover />
          <ErrorBoundary>
            <AuthProvider>
              <SwPreregister />
              <LangProvider>
                <SwAutoUpdate />
                <AppMessageProvider>{children}</AppMessageProvider>
              </LangProvider>
            </AuthProvider>
          </ErrorBoundary>
        </AppBrandProvider>
      </body>
    </html>
  )
}
