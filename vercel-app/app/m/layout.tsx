import type { Metadata, Viewport } from "next"
import { getServerAppBrandConfig } from "@/lib/app-brand-server"

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getServerAppBrandConfig()
  return {
    title: `${brand.headerWordmark} Membership`,
    description: "สะสมแต้ม ใช้คูปอง และดูประวัติสมาชิก Choongman Chicken",
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
