"use client"

import { useEffect } from "react"

/**
 * Serwist/Workbox가 `/_next/static/*.js`를 잘못 캐시(HTML 오류 페이지 등)하면 청크 실행 시 SyntaxError·ChunkLoadError가 난다.
 * 캐시 이름은 `next-static-build-assets`뿐 아니라 `serwist-precache-v2-*`, `serwist-runtime-*` 등으로도 열리므로
 * 로그인 화면 진입 시 해당 Cache Storage를 비우고, 오래된 SW가 즉시 재오염하지 않도록 등록을 해제한다.
 * (로그인 후 `SwPreregister`가 다시 등록한다.)
 * `/pos/login`에는 넣지 않음 — SW·프리캐시를 지우면 오프라인에서 브라우저 기본 끊김 화면만 뜰 수 있음.
 */
function shouldClearBuildRelatedCache(name: string): boolean {
  const k = name.toLowerCase()
  return k.includes("next-static") || k.includes("serwist") || k.includes("workbox")
}

export function LoginNextCacheReset() {
  useEffect(() => {
    if (typeof window === "undefined" || !("caches" in window)) return
    void (async () => {
      try {
        const mod = await import("@/lib/firebase-client")
        await mod.unregisterServiceWorkers()
      } catch {
        /* ignore */
      }
      try {
        const keys = await caches.keys()
        await Promise.all(keys.filter(shouldClearBuildRelatedCache).map((key) => caches.delete(key)))
      } catch {
        /* ignore */
      }
    })()
  }, [])
  return null
}
