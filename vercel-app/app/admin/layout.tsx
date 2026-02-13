"use client"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { useAuth } from "@/lib/auth-context"

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
  }, [auth, initialized, isLoginPage, router])

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
    <div className="min-h-screen bg-slate-50">
      <AdminSidebar />
      <main className="pl-64 min-h-screen">
        {children}
      </main>
    </div>
  )
}
