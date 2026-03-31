"use client"

import { useEffect, useLayoutEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { ErpSidebar } from "@/components/erp/erp-sidebar"
import { ErpHeader } from "@/components/erp/erp-header"
import { OfflineBanner } from "@/components/offline-banner"
import { StoreViewProvider } from "@/lib/store-view-context"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  isManagerRole,
  isFranchiseeRole,
  canManagerAccessPath,
  canAccessAdmin,
  canPosStaffAccessPath,
  isPosOrderOnlyRole,
  isPosSettlementOnlyRole,
} from "@/lib/permissions"

/** usePathname()이 첫 렌더에서 null이면 /admin/login인데도 로그인 분기로 못 들어가 스피너에 고정될 수 있음 */
function normalizePathname(p: string | null): string {
  if (p == null || p === "") return ""
  return p.endsWith("/") && p.length > 1 ? p.slice(0, -1) : p
}

function isAdminLoginPath(pathname: string | null): boolean {
  const p = normalizePathname(pathname)
  if (p === "/admin/login") return true
  if (typeof window !== "undefined") {
    const w = normalizePathname(window.location.pathname)
    if (w === "/admin/login") return true
  }
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
  const { lang } = useLang()
  const t = useT(lang)
  const isLoginPage = isAdminLoginPath(pathname)

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
  }, [auth, initialized, isLoginPage, pathname, router, setAuth])

  // 로그인 페이지: 사이드바 없이 전체 화면
  if (isLoginPage) {
    return <>{children}</>
  }

  // 인증 대기
  if (!initialized || !auth) {
    return <AdminLayoutLoading />
  }

  return (
    <StoreViewProvider>
      <SidebarProvider>
        <ErpSidebar />
        <SidebarInset>
          <ErpHeader />
          <OfflineBanner pendingLabel={t("offlineBannerPendingData")} />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </StoreViewProvider>
  )
}
