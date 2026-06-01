"use client"

import * as React from "react"
import { useAppBrandConfig } from "@/components/app-brand-provider"
import { getMemberPwaAssets, isErpManifestHref } from "@/lib/member-portal-pwa"

function upsertLink(rel: string, href: string, extra?: Record<string, string>) {
  const selector =
    rel === "manifest"
      ? 'link[rel="manifest"]'
      : `link[rel="${rel}"][data-member-pwa="1"]`
  let link = document.head.querySelector<HTMLLinkElement>(selector)
  if (!link) {
    link = document.createElement("link")
    link.rel = rel
    if (rel !== "manifest") link.dataset.memberPwa = "1"
    document.head.appendChild(link)
  }
  link.href = href
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      link.setAttribute(key, value)
    }
  }
}

/**
 * /m/* — 루트 ERP manifest·SW·apple-touch-icon이 회원 PWA 설치에 끼어들지 않도록 정리.
 * (동일 도메인에 CM ERP 홈 화면 바로가기가 있으면 "이미 설치됨" + ERP 아이콘으로 보일 수 있음)
 */
export function MemberPortalPwaHead() {
  const brand = useAppBrandConfig()
  const pwa = React.useMemo(() => getMemberPwaAssets(brand.key), [brand.key])

  React.useEffect(() => {
    if (typeof document === "undefined") return

    document.querySelectorAll<HTMLLinkElement>('link[rel="manifest"]').forEach((link) => {
      const href = link.getAttribute("href") || ""
      if (isErpManifestHref(href)) link.remove()
    })

    upsertLink("manifest", pwa.manifest)
    upsertLink("apple-touch-icon", pwa.icon512, { sizes: "512x512" })
    upsertLink("icon", pwa.icon192, { sizes: "192x192", type: "image/png" })

    if (typeof navigator !== "undefined" && navigator.serviceWorker?.getRegistrations) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) {
          void reg.unregister()
        }
      })
    }
  }, [pwa.icon192, pwa.icon512, pwa.manifest])

  return null
}
