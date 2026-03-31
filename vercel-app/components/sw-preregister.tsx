"use client"

import { useEffect } from "react"
import { useAuth } from "@/lib/auth-context"

/**
 * 로그인 전에 SW가 등록되면 `/_next/static` 청크가 CacheFirst로 오염된 캐시를 쓰는 경우가 있어,
 * **세션이 생긴 뒤에만** 등록한다(첫 로그인·로그아웃 후 재로그인 시 청크는 네트워크 우선).
 * 동적 import로 서버 번들에서 Firebase 초기화를 피한다.
 */
export function SwPreregister() {
  const { auth, initialized } = useAuth()
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!initialized || !auth) return
    const t = window.setTimeout(() => {
      import("@/lib/firebase-client")
        .then((m) => {
          m.preRegisterServiceWorker()
          m.setupForegroundHandler()
        })
        .catch(() => {})
    }, 0)
    return () => window.clearTimeout(t)
  }, [initialized, auth])
  return null
}
