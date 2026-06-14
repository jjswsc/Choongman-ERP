"use client"

import dynamic from "next/dynamic"
import { useEffect, useLayoutEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useLang, normalizeAdminUiLang } from "@/lib/lang-context"
import {
  isManagerRole,
  isFranchiseeRole,
  canManagerAccessPath,
  canAccessAdmin,
  canPosStaffAccessPath,
  isPosOrderOnlyRole,
  isPosSettlementOnlyRole,
} from "@/lib/permissions"
import { resolveAdminPathSaasModule } from "@/lib/saas/erp-route-modules"
import { isSaasModuleEnabled, useSaasEnabledModules } from "@/lib/use-saas-enabled-modules"

const AdminShell = dynamic(
  () => import("@/components/erp/admin-shell").then((m) => m.AdminShell),
  {
    loading: () => <AdminLayoutLoading />,
  }
)

/** usePathname()이 첫 렌더에서 null이면 /admin/login인데도 로그인 분기로 못 들어가 스피너에 고정될 수 있음 */
function normalizePathname(p: string | null): string {
  if (p == null || p === "") return ""
  return p.endsWith("/") && p.length > 1 ? p.slice(0, -1) : p
}

/**
 * 로그인 직후 router.replace("/admin") 시 usePathname()과 window.location이 한 틱 어긋날 수 있음
 * (한쪽만 /admin/login으로 남는 경우). 한쪽이라도 로그인 URL이 아니면 사이드바 있는 관리자 셸을 쓴다.
 */
function isAdminLoginPath(pathname: string | null): boolean {
  const p = normalizePathname(pathname)
  if (typeof window === "undefined") {
    return p === "/admin/login"
  }
  const w = normalizePathname(window.location.pathname)
  const wLogin = w === "/admin/login"
  const pLogin = p === "/admin/login"
  const pUnknown = p === ""
  if (!wLogin) return false
  if (pLogin) return true
  if (pUnknown) return true
  return false
}

function AdminLayoutLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { auth, initialized, setAuth } = useAuth()
  const { lang, setLang } = useLang()
  const saasModules = useSaasEnabledModules()
  const isLoginPage = isAdminLoginPath(pathname)

  useEffect(() => {
    const p = normalizePathname(pathname)
    if (!p.startsWith("/admin")) return
    const n = normalizeAdminUiLang(lang)
    if (n !== lang) setLang(n)
  }, [pathname, lang, setLang])

  // 미로그인: 로그인 URL이 아니면 즉시 이동 (pathname null 대비로 window 경로도 함께 판별)
  useLayoutEffect(() => {
    if (typeof window === "undefined") return
    if (!initialized) return
    const onLogin = normalizePathname(window.location.pathname) === "/admin/login"
    if (onLogin) return
    if (!auth) {
      window.location.replace("/admin/login")
    }
  }, [initialized, auth])

  useEffect(() => {
    if (!initialized) return
    if (auth && !isLoginPage && !canAccessAdmin(auth.role || "")) {
      setAuth(null)
      window.location.replace("/admin/login?msg=no_admin")
      return
    }
    if (auth && !isLoginPage && (isManagerRole(auth.role || "") || isFranchiseeRole(auth.role || "")) && !canManagerAccessPath(pathname)) {
      router.replace("/admin")
    }
    if (auth && !isLoginPage && (isPosOrderOnlyRole(auth.role || "") || isPosSettlementOnlyRole(auth.role || ""))) {
      if (!canPosStaffAccessPath(pathname, auth.role || "")) {
        if (isPosOrderOnlyRole(auth.role || "")) {
          router.replace("/pos")
        } else {
          router.replace("/admin/pos-settlement")
        }
      } else if (pathname === "/admin" || pathname === "/admin/") {
        if (isPosOrderOnlyRole(auth.role || "")) {
          router.replace("/pos")
        } else {
          router.replace("/admin/pos-settlement")
        }
      }
    }
    if (auth && !isLoginPage && saasModules != null) {
      const mod = resolveAdminPathSaasModule(pathname)
      if (!isSaasModuleEnabled(saasModules, mod)) {
        router.replace("/admin?saas_module_locked=1")
      }
    }
  }, [auth, initialized, isLoginPage, pathname, router, setAuth, saasModules])

  // 로그인 페이지: 사이드바 없이 전체 화면
  if (isLoginPage) {
    return <>{children}</>
  }

  // 인증 대기
  if (!initialized || !auth) {
    return <AdminLayoutLoading />
  }

  return (
    <AdminShell>{children}</AdminShell>
  )
}
