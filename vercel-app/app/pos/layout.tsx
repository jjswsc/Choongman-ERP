"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { ArrowLeft, Home } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { canAccessPosOrder, isPosSettlementOnlyRole } from "@/lib/permissions"

/** POS 전용 레이아웃 - 풀스크린, 태블릿 터치 UI (로그인 필수) */
export default function PosLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { auth, initialized } = useAuth()

  useEffect(() => {
    if (!initialized) return
    if (!auth) {
      router.replace("/admin/login?redirect=/pos")
      return
    }
    if (!canAccessPosOrder(auth.role || "")) {
      if (isPosSettlementOnlyRole(auth.role || "")) {
        router.replace("/admin/pos-settlement")
      } else {
        router.replace("/admin/login?redirect=/pos")
      }
      return
    }
  }, [auth, initialized, router])

  if (!initialized || !auth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    )
  }

  const pathname = usePathname()
  const isMain = pathname === "/pos" || pathname === "/pos/"

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-50">
      {!isMain && (
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
          <div className="flex items-center gap-1">
            <Link
              href="/pos"
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <Home className="h-4 w-4" />
              홈
            </Link>
            <Link
              href="/admin"
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Admin
            </Link>
          </div>
          <span className="text-sm font-bold text-slate-800">POS</span>
          <div className="w-16" />
        </header>
      )}
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
