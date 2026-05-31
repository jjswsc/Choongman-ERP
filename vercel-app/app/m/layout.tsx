import type { Metadata, Viewport } from "next"
import { getServerAppBrandConfig } from "@/lib/app-brand-server"

function memberPwaAssets(brandKey: "choongman" | "omnifoodtech") {
  if (brandKey === "omnifoodtech") {
    return {
      manifest: "/manifest-member-omni.json",
      icon192: "/icon-member-omni-192.png",
      icon512: "/icon-member-omni-512.png",
      appleTitle: "Omni Member",
    }
  }
  return {
    manifest: "/manifest-member.json",
    icon192: "/icon-member-192.png",
    icon512: "/icon-member-512.png",
    appleTitle: "충만 멤버십",
  }
}

/** /m/* — 회원 라운지 전용 PWA(홈 화면 설치·시작 URL /m) */
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getServerAppBrandConfig()
  const pwa = memberPwaAssets(brand.key)
  return {
    title: `${brand.headerWordmark} Membership`,
    description: "สะสมแต้ม ใช้คูปอง และดูประวัติสมาชิก Choongman Chicken",
    manifest: pwa.manifest,
    icons: {
      icon: pwa.icon192,
      apple: pwa.icon512,
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
    <div className="min-h-[100dvh] bg-[#08080a] text-white antialiased">
      {children}
    </div>
  )
}
