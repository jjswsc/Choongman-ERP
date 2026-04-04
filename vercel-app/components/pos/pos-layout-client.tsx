"use client"

import { useEffect, useState } from "react"
import { navigatePosOfflineAware } from "@/lib/pos-offline-nav"
import { useRouter, usePathname } from "next/navigation"
import { ArrowLeft, ChevronDown, ChevronUp, Home } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { canAccessPosOrder, isPosSettlementOnlyRole } from "@/lib/permissions"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

const POS_TOPBAR_HIDDEN_KEY = "cm-pos-topbar-hidden"

function PosShellUtilityButtons({
  shellUpdateAvailable,
  shellExitFullscreenAvailable,
  t,
}: {
  shellUpdateAvailable: boolean
  shellExitFullscreenAvailable: boolean
  t: (key: string) => string
}) {
  if (!shellUpdateAvailable && !shellExitFullscreenAvailable) return null
  return (
    <div className="flex max-w-[min(100%,240px)] shrink-0 items-center justify-end gap-1">
      {shellExitFullscreenAvailable ? (
        <button
          type="button"
          className="truncate rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          onClick={() => {
            void window.cmPosShell?.exitKioskOrFullscreen?.()
          }}
        >
          {t("posShellExitFullscreen")}
        </button>
      ) : null}
      {shellUpdateAvailable ? (
        <button
          type="button"
          className="truncate rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          onClick={() => {
            void window.cmPosShell?.checkForUpdates?.()
          }}
        >
          {t("posShellCheckUpdate")}
        </button>
      ) : null}
    </div>
  )
}

/** Windows 셸: 창 최소화·앱 종료 (헤더 오른쪽) */
function PosShellWindowControls({
  minimizeOk,
  quitOk,
  variant,
  t,
}: {
  minimizeOk: boolean
  quitOk: boolean
  variant: "header" | "thin"
  t: (key: string) => string
}) {
  if (!minimizeOk && !quitOk) return null
  const btn =
    variant === "header"
      ? "truncate rounded-lg px-2 py-1.5 text-xs font-medium"
      : "truncate rounded-lg px-2 py-1 text-xs font-medium"
  return (
    <div className="ml-1 flex shrink-0 items-center gap-1 border-l border-slate-200 pl-2">
      {minimizeOk ? (
        <button
          type="button"
          title={t("posShellMinimizeTitle")}
          className={`${btn} text-slate-600 hover:bg-slate-100 hover:text-slate-900`}
          onClick={() => {
            void window.cmPosShell?.minimizeWindow?.()
          }}
        >
          {t("posShellMinimize")}
        </button>
      ) : null}
      {quitOk ? (
        <button
          type="button"
          className={`${btn} text-red-700 hover:bg-red-50 hover:text-red-800`}
          onClick={() => {
            if (window.confirm(t("posShellQuitConfirm"))) {
              void window.cmPosShell?.quitApp?.()
            }
          }}
        >
          {t("posShellPowerOff")}
        </button>
      ) : null}
    </div>
  )
}

function PosShellHeaderRightCluster({
  shellUpdateAvailable,
  shellExitFullscreenAvailable,
  shellMinimizeAvailable,
  shellQuitAvailable,
  variant,
  t,
}: {
  shellUpdateAvailable: boolean
  shellExitFullscreenAvailable: boolean
  shellMinimizeAvailable: boolean
  shellQuitAvailable: boolean
  variant: "header" | "thin"
  t: (key: string) => string
}) {
  const hasUtils = shellUpdateAvailable || shellExitFullscreenAvailable
  const hasWin = shellMinimizeAvailable || shellQuitAvailable
  if (!hasUtils && !hasWin) {
    return <div className="w-16 shrink-0" aria-hidden />
  }
  return (
    <div className="flex min-w-0 max-w-[min(100%,520px)] shrink-0 items-center justify-end">
      {hasUtils ? (
        <PosShellUtilityButtons
          shellUpdateAvailable={shellUpdateAvailable}
          shellExitFullscreenAvailable={shellExitFullscreenAvailable}
          t={t}
        />
      ) : null}
      {hasWin ? (
        <PosShellWindowControls
          minimizeOk={shellMinimizeAvailable}
          quitOk={shellQuitAvailable}
          variant={variant}
          t={t}
        />
      ) : null}
    </div>
  )
}

/** POS 전용 레이아웃 - 풀스크린, 태블릿 터치 UI (로그인 필수) */
export function PosLayoutClient({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { auth, initialized } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const isPosLoginPage = pathname === "/pos/login"
  const isFirstScreen = pathname === "/pos" || pathname === "/pos/"
  const isTerminalPage = pathname === "/pos/terminal"
  const [shellUpdateAvailable, setShellUpdateAvailable] = useState(false)
  const [shellExitFullscreenAvailable, setShellExitFullscreenAvailable] = useState(false)
  const [shellMinimizeAvailable, setShellMinimizeAvailable] = useState(false)
  const [shellQuitAvailable, setShellQuitAvailable] = useState(false)
  const [topBarHidden, setTopBarHidden] = useState(false)
  const [topBarHydrated, setTopBarHydrated] = useState(false)

  useEffect(() => {
    setShellUpdateAvailable(typeof window.cmPosShell?.checkForUpdates === "function")
    setShellExitFullscreenAvailable(
      typeof window.cmPosShell?.exitKioskOrFullscreen === "function"
    )
    setShellMinimizeAvailable(typeof window.cmPosShell?.minimizeWindow === "function")
    setShellQuitAvailable(typeof window.cmPosShell?.quitApp === "function")
  }, [])

  useEffect(() => {
    try {
      setTopBarHidden(sessionStorage.getItem(POS_TOPBAR_HIDDEN_KEY) === "1")
    } catch {
      setTopBarHidden(false)
    }
    setTopBarHydrated(true)
  }, [])

  useEffect(() => {
    if (!topBarHydrated) return
    try {
      if (topBarHidden) sessionStorage.setItem(POS_TOPBAR_HIDDEN_KEY, "1")
      else sessionStorage.removeItem(POS_TOPBAR_HIDDEN_KEY)
    } catch {
      /* ignore */
    }
  }, [topBarHidden, topBarHydrated])

  const shellChrome =
    shellUpdateAvailable ||
    shellExitFullscreenAvailable ||
    shellMinimizeAvailable ||
    shellQuitAvailable

  const showShellThinBar =
    shellChrome && (isPosLoginPage || isFirstScreen || isTerminalPage)

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
      } else {
        router.replace("/pos/login")
        return
      }
    }
  }, [auth, initialized, isPosLoginPage, pathname, router])

  const showTopChrome = (bar: boolean) => shellChrome && bar && !topBarHidden

  const topBarToggleButton = (variant: "header" | "thin") => (
    <button
      type="button"
      title={t("posTopBarHide")}
      className={
        variant === "header"
          ? "flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          : "mr-auto flex shrink-0 items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      }
      onClick={() => setTopBarHidden(true)}
    >
      <ChevronUp className="h-4 w-4 shrink-0" aria-hidden />
      <span className="hidden sm:inline">{t("posTopBarHide")}</span>
    </button>
  )

  const topBarRevealStrip =
    shellChrome && topBarHidden && topBarHydrated ? (
      <button
        type="button"
        className="fixed left-0 right-0 top-0 z-[70] flex h-10 shrink-0 items-center justify-center gap-1 border-b border-slate-200 bg-white/95 text-xs font-medium text-slate-700 shadow-md backdrop-blur-sm"
        onClick={() => setTopBarHidden(false)}
      >
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
        {t("posTopBarShow")}
      </button>
    ) : null

  const padForRevealStrip = Boolean(shellChrome && topBarHidden && topBarHydrated)

  if (isPosLoginPage) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        {topBarRevealStrip}
        {showTopChrome(showShellThinBar) ? (
          <div className="flex h-9 shrink-0 items-center justify-end border-b border-slate-200 bg-white px-2 shadow-sm sm:px-3">
            {topBarToggleButton("thin")}
            <PosShellHeaderRightCluster
              shellUpdateAvailable={shellUpdateAvailable}
              shellExitFullscreenAvailable={shellExitFullscreenAvailable}
              shellMinimizeAvailable={shellMinimizeAvailable}
              shellQuitAvailable={shellQuitAvailable}
              variant="thin"
              t={t}
            />
          </div>
        ) : null}
        <div className={`min-h-0 flex-1 ${padForRevealStrip ? "pt-10" : ""}`}>{children}</div>
      </div>
    )
  }

  if (!initialized || !auth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    )
  }

  const isLocalPage = pathname?.startsWith?.("/pos/local")
  const useViewport = isFirstScreen || isTerminalPage
  const showPosHeader = !isFirstScreen && !isLocalPage
  const showThinMain = !showPosHeader && showShellThinBar

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-50">
      {topBarRevealStrip}
      {showTopChrome(showPosHeader) ? (
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-2 shadow-sm sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {topBarToggleButton("header")}
            <button
              type="button"
              onClick={() => router.back()}
              className="flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("posBack")}
            </button>
            <button
              type="button"
              className="flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              onClick={() => navigatePosOfflineAware("/pos", (p) => router.push(p))}
            >
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">{t("posHome")}</span>
            </button>
          </div>
          <span className="shrink-0 text-sm font-bold text-slate-800">POS</span>
          <PosShellHeaderRightCluster
            shellUpdateAvailable={shellUpdateAvailable}
            shellExitFullscreenAvailable={shellExitFullscreenAvailable}
            shellMinimizeAvailable={shellMinimizeAvailable}
            shellQuitAvailable={shellQuitAvailable}
            variant="header"
            t={t}
          />
        </header>
      ) : null}
      {showTopChrome(showThinMain) ? (
        <div className="flex h-9 shrink-0 items-center justify-end border-b border-slate-200 bg-white px-2 shadow-sm sm:px-3">
          {topBarToggleButton("thin")}
          <PosShellHeaderRightCluster
            shellUpdateAvailable={shellUpdateAvailable}
            shellExitFullscreenAvailable={shellExitFullscreenAvailable}
            shellMinimizeAvailable={shellMinimizeAvailable}
            shellQuitAvailable={shellQuitAvailable}
            variant="thin"
            t={t}
          />
        </div>
      ) : null}
      {/*
        items-stretch: 자식이 main 높이까지 채워져야 overflow-y-auto가 동작함.
        items-start였을 때 높이=콘텐츠만큼만 잡혀 스크롤이 생기지 않고 overflow-hidden에 잘림.
      */}
      <main
        className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-2 md:p-4 ${padForRevealStrip ? "pt-12" : ""}`}
      >
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
