import type { Metadata, Viewport } from "next"
import { Cormorant_Garamond } from "next/font/google"
import { MemberPortalPwaHead } from "@/components/member-portal/member-portal-pwa-head"
import { getServerAppBrandConfig } from "@/lib/app-brand-server"
import { getMemberPwaAssets } from "@/lib/member-portal-pwa"

const mpDisplay = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-mp-display",
  weight: ["500", "600", "700"],
  display: "swap",
  preload: false,
})

/** /m/* — 회원 라운지 전용 PWA(홈 화면 설치·시작 URL /m) */
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getServerAppBrandConfig()
  const pwa = getMemberPwaAssets(brand.key)
  return {
    title: `${brand.headerWordmark} Membership`,
    description: "สะสมแต้ม ใช้คูปอง และดูประวัติสมาชิก Choongman Chicken",
    manifest: pwa.manifest,
    applicationName: pwa.appleTitle,
    icons: {
      icon: [
        { url: pwa.icon192, sizes: "192x192", type: "image/png" },
        { url: pwa.icon512, sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: pwa.icon512, sizes: "512x512", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      title: pwa.appleTitle,
      statusBarStyle: "black-translucent",
    },
  }
}

export const viewport: Viewport = {
  themeColor: "#08080a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function MemberPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${mpDisplay.variable} min-h-[100dvh] bg-[#08080a] text-white antialiased`}>
      <MemberPortalPwaHead />
      {children}
    </div>
  )
}
