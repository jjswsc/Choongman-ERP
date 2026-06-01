import type { AppBrandKey } from "@/lib/app-brand"

export type MemberPwaAssets = {
  manifest: string
  icon192: string
  icon512: string
  appleTitle: string
}

/** /m/* 회원 라운지 PWA — ERP·POS manifest와 분리된 아이콘·manifest 경로 */
export function getMemberPwaAssets(brandKey: AppBrandKey): MemberPwaAssets {
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

const ERP_MANIFEST_HINTS = ["/manifest.json", "/manifest-omnifoodtech.json"] as const

export function isErpManifestHref(href: string): boolean {
  const v = href.trim()
  return ERP_MANIFEST_HINTS.some((hint) => v === hint || v.endsWith(hint))
}
