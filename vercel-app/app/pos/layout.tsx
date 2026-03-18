"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { ArrowLeft, Home } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { canAccessPosOrder, isPosSettlementOnlyRole } from "@/lib/permissions"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

/** POS 전용 레이아웃 - 풀스크린, 태블릿 터치 UI (로그인 필수) */
export default function PosLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { auth, initialized } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const isPosLoginPage = pathname === "/pos/login"

  useEffect(() => {
    if (!initialized) return
    if (isPosLoginPage) return
    if (!auth) {
      router.replace("/pos/login")
      return
    }
    if (!canAccessPosOrder(auth.role || "")) {
      if (isPosSettlementOnlyRole(auth.role || "")) {
        if (pathname !== "/pos/settlement") {
          router.replace("/pos/settlement")
          return
        }
        // /pos/settlement: 허용, 아래 렌더 진행
      } else {
        router.replace("/pos/login")
        return
      }
    }
  }, [auth, initialized, isPosLoginPage, pathname, router])

  if (isPosLoginPage) {
    return <>{children}</>
  }

  if (!initialized || !auth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    )
  }

  const isFirstScreen = pathname === "/pos" || pathname === "/pos/"
  const isLocalPage = pathname?.startsWith?.('/pos/local')
  const useViewport = isFirstScreen || pathname === "/pos/terminal"
  const showPosHeader = !isFirstScreen && !isLocalPage

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-50">
      {showPosHeader && (
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('posBack')}
            </button>
            <Link
              href="/pos"
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <Home className="h-4 w-4" />
              {t('posHome')}
            </Link>
          </div>
          <span className="text-sm font-bold text-slate-800">POS</span>
          <div className="w-16" />
        </header>
      )}
      <main className="flex-1 min-h-0 overflow-hidden flex items-start justify-center p-2 md:p-4">
        {useViewport ? (
          <div className="w-full max-w-[1024px] h-full max-h-[768px] min-h-[600px] bg-background rounded-lg shadow-xl overflow-hidden flex flex-col border border-border">
            {children}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 w-full max-w-7xl flex-col overflow-y-auto">
            {children}
          </div>
        )}
      </main>
    </div>
  )
}
