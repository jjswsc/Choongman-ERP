"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

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
  }, [auth, initialized, router])

  if (!initialized || !auth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-950">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-4">
        <Link
          href="/admin"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Admin
        </Link>
        <span className="text-sm font-bold text-white">POS</span>
        <div className="w-16" />
      </header>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
