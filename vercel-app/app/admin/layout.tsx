"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { ErpSidebar } from "@/components/erp/erp-sidebar"
import { ErpHeader } from "@/components/erp/erp-header"
import { StoreViewProvider } from "@/lib/store-view-context"
import { useAuth } from "@/lib/auth-context"
import {
  isManagerRole,
  isFranchiseeRole,
  canManagerAccessPath,
  canAccessAdmin,
  canPosStaffAccessPath,
  isPosOrderOnlyRole,
  isPosSettlementOnlyRole,
} from "@/lib/permissions"

function AdminLayoutLoading() {
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setStuck(true), 6000)
    return () => clearTimeout(t)
  }, [])
  if (stuck) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-4">
        <p className="text-center text-sm text-slate-300">로딩이 오래 걸립니다. 새로고침해 보세요.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          새로고침
        </button>
      </div>
    )
  }
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
  const { auth, initialized } = useAuth()
  const isLoginPage = pathname === "/admin/login"

  useEffect(() => {
    if (!initialized) return
    if (!auth && !isLoginPage) {
      router.replace("/admin/login")
      return
    }
    if (auth && !isLoginPage && !canAccessAdmin(auth.role || "")) {
      router.replace("/?msg=no_admin")
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
  }, [auth, initialized, isLoginPage, pathname, router])

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
          {children}
        </SidebarInset>
      </SidebarProvider>
    </StoreViewProvider>
  )
}
