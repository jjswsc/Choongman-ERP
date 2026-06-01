"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/auth-context"

/** 로그인·POS 로그인 등 공개 경로: 한 번이라도 온라인으로 열면 SW·프리캐시가 깔려야 오프라인에서 로그인 화면이 뜸 */
function shouldRegisterSwForPath(pathname: string | null): boolean {
  if (!pathname) return false
  if (pathname === "/m" || pathname.startsWith("/m/")) return false
  if (pathname === "/login" || pathname === "/admin/login" || pathname === "/pos/login") return true
  return false
}

/**
 * 로그인 전(일반 페이지)에 SW가 너무 이르게 뜨면 `/_next/static` 청크 캐시 오염 이슈가 있어,
 * 기본은 **세션 있을 때만** 등록.
 * 다만 `/pos/login` 등 공개 로그인 URL은 오프라인 대비를 위해 **비로그인이어도** 등록한다.
 */
export function SwPreregister() {
  const { auth, initialized } = useAuth()
  const pathname = usePathname()
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!initialized) return
    if (!auth && !shouldRegisterSwForPath(pathname)) return
    const t = window.setTimeout(() => {
      import("@/lib/firebase-client")
        .then((m) => {
          m.preRegisterServiceWorker()
          m.setupForegroundHandler()
        })
        .catch(() => {})
    }, 0)
    return () => window.clearTimeout(t)
  }, [initialized, auth, pathname])
  return null
}
