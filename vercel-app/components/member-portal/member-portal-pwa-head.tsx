"use client"

import * as React from "react"
import { useAppBrandConfig } from "@/components/app-brand-provider"
import { getMemberPwaAssets, isErpManifestHref } from "@/lib/member-portal-pwa"
import {
  MEMBER_PORTAL_SHELL_RELOAD_KEY,
  shouldReloadMemberPortalAfterSwUnregister,
  shouldReloadMemberPortalForNewBuild,
} from "@/lib/member-portal-shell-refresh"
import { currentDocumentNextBuildStamp } from "@/lib/web-build-stamp"

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

function alreadyReloadedThisSession(): boolean {
  try {
    return sessionStorage.getItem(MEMBER_PORTAL_SHELL_RELOAD_KEY) === "1"
  } catch {
    return false
  }
}

function markReloadedThisSession(): void {
  try {
    sessionStorage.setItem(MEMBER_PORTAL_SHELL_RELOAD_KEY, "1")
  } catch {
    /* ignore */
  }
}

/**
 * /m/* — 루트 ERP manifest·SW·apple-touch-icon이 회원 PWA 설치에 끼어들지 않도록 정리.
 * (동일 도메인에 CM ERP 홈 화면 바로가기가 있으면 "이미 설치됨" + ERP 아이콘으로 보일 수 있음)
 * SW가 /m HTML을 프리캐시하면 배포 후에도 옛 홈이 남으므로, 제어 중이던 SW는 해제 후 한 번 새로고침한다.
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

    let cancelled = false
    void (async () => {
      const hadController = Boolean(navigator.serviceWorker?.controller)
      if (navigator.serviceWorker?.getRegistrations) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(regs.map((reg) => reg.unregister()))
        } catch {
          /* ignore */
        }
      }
      if (cancelled) return

      const reloaded = alreadyReloadedThisSession()
      if (
        shouldReloadMemberPortalAfterSwUnregister({
          hadController,
          alreadyReloaded: reloaded,
        })
      ) {
        markReloadedThisSession()
        window.location.reload()
        return
      }

      if (process.env.NODE_ENV !== "production" || reloaded) return
      const currentStamp = currentDocumentNextBuildStamp(document)
      if (!currentStamp) return
      try {
        const res = await fetch(`/m?_cmBuild=${Date.now()}`, {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "text/html" },
        })
        const html = res.ok ? await res.text() : ""
        if (cancelled || !html) return
        if (
          shouldReloadMemberPortalForNewBuild({
            currentStamp,
            networkHtml: html,
            alreadyReloaded: false,
          })
        ) {
          markReloadedThisSession()
          window.location.reload()
        }
      } catch {
        /* ignore */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pwa.icon192, pwa.icon512, pwa.manifest])

  return null
}
