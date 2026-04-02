"use client"

import { useEffect } from "react"
import { navigatePosOfflineAware } from "@/lib/pos-offline-nav"
import { useRouter, usePathname } from "next/navigation"
import { ArrowLeft, Home } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { canAccessPosOrder, isPosSettlementOnlyRole } from "@/lib/permissions"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

/** POS 전용 레이아웃 - 풀스크린, 태블릿 터치 UI (로그인 필수) */
export function PosLayoutClient({
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
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              onClick={() => navigatePosOfflineAware('/pos', (p) => router.push(p))}
            >
              <Home className="h-4 w-4" />
              {t('posHome')}
            </button>
          </div>
          <span className="text-sm font-bold text-slate-800">POS</span>
          <div className="w-16" />
        </header>
      )}
      {/*
        items-stretch: 자식이 main 높이까지 채워져야 overflow-y-auto가 동작함.
        items-start였을 때 높이=콘텐츠만큼만 잡혀 스크롤이 생기지 않고 overflow-hidden에 잘림.
      */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-2 md:p-4">
        {useViewport ? (
          <div className="mx-auto flex h-full min-h-0 w-full max-w-[1024px] max-h-[768px] min-[1024px]:min-h-[600px] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl">
            {children}
          </div>
        ) : (
          <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
            {children}
          </div>
        )}
      </main>
    </div>
  )
}
