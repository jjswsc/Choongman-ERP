import type { Metadata, Viewport } from "next"
import { PosLayoutClient } from "@/components/pos/pos-layout-client"
import { getServerAppBrandConfig } from "@/lib/app-brand-server"

/** /pos/* 에서는 PWA 설치·시작 URL이 ERP 전체가 아닌 POS로 잡히도록 전용 manifest 연결 */
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getServerAppBrandConfig()
  const title = brand.posWindowTitle
  return {
    title,
    description: `${title} — point of sale`,
    manifest: "/manifest-pos.json",
    icons: {
      icon: "/icon-pos-192.png",
      apple: "/icon-pos-512.png",
    },
    appleWebApp: {
      capable: true,
      title: title,
      statusBarStyle: "default",
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

export default function PosLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <PosLayoutClient>{children}</PosLayoutClient>
}
