import type { Metadata, Viewport } from "next"
import { MemberPortalPwaHead } from "@/components/member-portal/member-portal-pwa-head"
import { getServerAppBrandConfig } from "@/lib/app-brand-server"
import { getMemberPwaAssets } from "@/lib/member-portal-pwa"
import { memberPortalShellBootstrapInlineScript } from "@/lib/member-portal-shell-refresh"

export const dynamic = "force-dynamic"

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
  themeColor: "#faf7f2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function MemberPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#faf7f2] text-stone-900 antialiased">
      {/* React 청크가 깨져도 SW 오염을 한 번 걷어 낸다 */}
      <script dangerouslySetInnerHTML={{ __html: memberPortalShellBootstrapInlineScript() }} />
      <MemberPortalPwaHead />
      {children}
    </div>
  )
}
