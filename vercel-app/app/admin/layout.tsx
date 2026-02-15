"use client"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { ErpSidebar } from "@/components/erp/erp-sidebar"
import { ErpHeader } from "@/components/erp/erp-header"
import { useAuth } from "@/lib/auth-context"
import { isManagerRole, canManagerAccessPath } from "@/lib/permissions"

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
    if (auth && !isLoginPage && isManagerRole(auth.role || "") && !canManagerAccessPath(pathname)) {
      router.replace("/admin")
    }
  }, [auth, initialized, isLoginPage, pathname, router])

  // 로그인 페이지: 사이드바 없이 전체 화면
  if (isLoginPage) {
    return <>{children}</>
  }

  // 인증 대기
  if (!initialized || !auth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <SidebarProvider>
      <ErpSidebar />
      <SidebarInset>
        <ErpHeader />
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
