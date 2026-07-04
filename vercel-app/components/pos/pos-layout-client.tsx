"use client"

import { useEffect, useState } from "react"
import { navigatePosOfflineAware, replacePosOfflineAware } from "@/lib/pos-offline-nav"
import { useRouter, usePathname } from "next/navigation"
import { ArrowLeft, ChevronDown, ChevronUp, Home } from "lucide-react"
import { isCmPosHybridShell } from "@/lib/cm-pos-shell"
import { PosHybridPrintDiagnosticsButton } from "@/components/pos/pos-hybrid-print-diagnostics"
import { useAuth } from "@/lib/auth-context"
import { canAccessPosOrder, isPosSettlementOnlyRole } from "@/lib/permissions"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { PosBusinessDayHydrate } from "@/components/pos/pos-business-day-hydrate"
import { PosMainDeviceSyncHost } from "@/components/pos/pos-main-device-sync-host"
import { PosDrawerPinProvider } from "@/components/pos/pos-drawer-pin-provider"
import { PosStoreProvider } from "@/lib/pos-store-provider"
// appAlert는 모달 Dialog → inert 잠금 유발하므로 POS 레이아웃에서 사용 금지
// import { appAlert } from "@/lib/app-message"
import { resolveAdminPathSaasModule } from "@/lib/saas/erp-route-modules"
import { isSaasModuleEnabled, useSaasEnabledModules } from "@/lib/use-saas-enabled-modules"
import { inspectPosHybridPrintHealth } from "@/lib/pos-hybrid-print-health"
import { sendPosHealthAlert } from "@/lib/pos-health-alert-client"

const POS_TOPBAR_HIDDEN_KEY = "cm-pos-topbar-hidden"
const POS_PRINT_STARTUP_ALERT_KEY = "cm-pos-print-startup-health-alert-v1"

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
    return (
      <div className="flex min-w-0 max-w-[min(100%,520px)] shrink-0 items-center justify-end gap-1">
        <PosHybridPrintDiagnosticsButton />
      </div>
    )
  }
  return (
    <div className="flex min-w-0 max-w-[min(100%,520px)] shrink-0 items-center justify-end gap-1">
      <PosHybridPrintDiagnosticsButton />
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
  const isCustomerDisplayPage = pathname === "/pos/customer-display"
  const [shellUpdateAvailable, setShellUpdateAvailable] = useState(false)
  const [shellExitFullscreenAvailable, setShellExitFullscreenAvailable] = useState(false)
  const [shellMinimizeAvailable, setShellMinimizeAvailable] = useState(false)
  const [shellQuitAvailable, setShellQuitAvailable] = useState(false)
  const [topBarHidden, setTopBarHidden] = useState(false)
  const [topBarHydrated, setTopBarHydrated] = useState(false)
  const [isTouchViewport, setIsTouchViewport] = useState(false)
  const saasModules = useSaasEnabledModules()

  useEffect(() => {
    setShellUpdateAvailable(typeof window.cmPosShell?.checkForUpdates === "function")
    setShellExitFullscreenAvailable(
      typeof window.cmPosShell?.exitKioskOrFullscreen === "function"
    )
    setShellMinimizeAvailable(typeof window.cmPosShell?.minimizeWindow === "function")
    setShellQuitAvailable(typeof window.cmPosShell?.quitApp === "function")
  }, [])

  useEffect(() => {
    if (!isCmPosHybridShell()) return
    if (typeof window === "undefined") return
    /** 고객용 모니터(/pos/customer-display)에는 캐셔용 프린터 점검 알림을 띄우지 않음 */
    if (pathname === "/pos/customer-display") return
    const shell = window.cmPosShell
    if (typeof shell?.listPrinters !== "function" || typeof shell?.getPrintConfig !== "function") return

    try {
      if (sessionStorage.getItem(POS_PRINT_STARTUP_ALERT_KEY) === "1") return
    } catch {
      // ignore
    }

    let cancelled = false
    ;(async () => {
      try {
        const [printers, config] = await Promise.all([shell.listPrinters!(), shell.getPrintConfig!()])
        if (cancelled) return
        const summary = inspectPosHybridPrintHealth({
          printers: Array.isArray(printers) ? printers : [],
          config: config && typeof config === "object" ? config : null,
        })
        const hasIssue =
          summary.mismatchFields.length > 0 || summary.usesOnlyWindowsDefault || !summary.hasExplicitPrintDevices
        if (!hasIssue) return

        // 모달 Dialog(appAlert)가 inert를 걸어 전체 POS를 잠그므로 console.warn만 사용
        console.warn(
          "[cm-pos] printer health:",
          summary.mismatchFields.length > 0
            ? `mismatch: ${summary.mismatchFields.join(", ")}`
            : !summary.hasExplicitPrintDevices
              ? "no explicit print devices"
              : "uses only Windows default"
        )
        void sendPosHealthAlert({
          eventType: "hybrid_print_mapping_mismatch",
          payload: {
            pathname: window.location.pathname,
            mismatchFields: summary.mismatchFields,
            usesOnlyWindowsDefault: summary.usesOnlyWindowsDefault,
            hasExplicitPrintDevices: summary.hasExplicitPrintDevices,
            defaultPrinterLabel: summary.defaultPrinterLabel,
            printerCount: Array.isArray(printers) ? printers.length : 0,
          },
        })
        try {
          sessionStorage.setItem(POS_PRINT_STARTUP_ALERT_KEY, "1")
        } catch {
          // ignore
        }
      } catch {
        // ignore: startup check must not block POS
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pathname, t])

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const coarseQuery = window.matchMedia("(pointer: coarse)")
    const narrowQuery = window.matchMedia("(max-width: 1200px)")
    const apply = () => {
      setIsTouchViewport(coarseQuery.matches || narrowQuery.matches)
    }
    apply()
    const add = (mq: MediaQueryList, handler: () => void) => {
      if (typeof mq.addEventListener === "function") {
        mq.addEventListener("change", handler)
        return () => mq.removeEventListener("change", handler)
      }
      mq.addListener(handler)
      return () => mq.removeListener(handler)
    }
    const offCoarse = add(coarseQuery, apply)
    const offNarrow = add(narrowQuery, apply)
    return () => {
      offCoarse()
      offNarrow()
    }
  }, [])

  /**
   * 하이브리드 cold start 오프라인: Serwist SW·프리캐시가 있어야 로그인 셸이 뜬다.
   * (예전에는 SW 제거 정책이었으나 오프라인 부팅을 위해 등록으로 전환)
   */
  useEffect(() => {
    if (!isCmPosHybridShell()) return
    if (process.env.NODE_ENV !== "production") return
    const t = window.setTimeout(() => {
      import("@/lib/firebase-client")
        .then((m) => {
          m.preRegisterServiceWorker()
        })
        .catch(() => {})
    }, 0)
    return () => window.clearTimeout(t)
  }, [])

  /**
   * 방어적 input 포커스 보장:
   * Radix Dialog inert 잔존, 캡처 단계 이벤트 간섭 등 어떤 원인이든
   * 터치/클릭한 input에 확실히 포커스를 잡아 준다.
   */
  useEffect(() => {
    console.log("[cm-pos] layout build: 2026-07-04T18:20+07")
    const peStyle = document.createElement("style")
    peStyle.textContent = [
      "body { pointer-events: auto !important; }",
      '[role="dialog"] { pointer-events: auto !important; }',
    ].join("\n")
    document.head.appendChild(peStyle)
    const logDomState = () => {
      const dialogs = document.querySelectorAll("[role=dialog]").length
      const inertEls = document.querySelectorAll("[inert]")
      const bodyPE = document.body.style.pointerEvents
      const inertInfo = Array.from(inertEls).map((el) => describeEl(el))
      if (bodyPE || dialogs > 0 || inertEls.length > 0) {
        console.warn("[cm-pos-diag] DOM:", { bodyPointerEvents: bodyPE || "(empty)", dialogs, inert: inertEls.length, inertElements: inertInfo })
      }
      if (bodyPE === "none" && dialogs === 0) {
        console.warn("[cm-pos-diag] *** body.pointerEvents stuck at 'none' with no dialog! Restoring ***")
        document.body.style.pointerEvents = ""
      }
    }
    window.setTimeout(logDomState, 2000)
    const domTid = window.setInterval(logDomState, 5000)
    const describeEl = (el: Element | null): string => {
      if (!el) return "(null)"
      const tag = el.tagName.toLowerCase()
      const id = el.id ? `#${el.id}` : ""
      const cls = String((el as HTMLElement).className ?? "").slice(0, 40)
      const type = (el as HTMLInputElement).type ? `[${(el as HTMLInputElement).type}]` : ""
      const ds = (el as HTMLElement).dataset
      const dsKeys = ds ? Object.keys(ds).filter(k => k.startsWith("pos") || k.startsWith("radix") || k === "tour").join(",") : ""
      return `${tag}${type}${id}${cls ? `.${cls}` : ""}${dsKeys ? ` data:{${dsKeys}}` : ""}`
    }
    const findInertAncestors = (el: Element): string[] => {
      const result: string[] = []
      let node: Element | null = el.parentElement
      while (node) {
        if (node.hasAttribute("inert")) result.push(describeEl(node))
        node = node.parentElement
      }
      return result
    }
    const stripInertFromAncestors = (el: Element) => {
      let node: Element | null = el
      while (node) {
        if (node.hasAttribute("inert")) {
          console.warn("[cm-pos-diag] stripping inert from:", describeEl(node))
          node.removeAttribute("inert")
        }
        node = node.parentElement
      }
    }
    const stripAllStaleInert = () => {
      if (typeof document === "undefined") return
      const openDialog = document.querySelector(
        "[data-radix-portal] [role=dialog]"
      )
      const inertEls = document.querySelectorAll("[inert]")
      if (openDialog && inertEls.length > 0) {
        console.warn("[cm-pos-diag] dialog open → NOT stripping", inertEls.length, "inert. dialog:", describeEl(openDialog))
        return
      }
      if (inertEls.length > 0) {
        console.warn("[cm-pos-diag] no dialog open → stripping", inertEls.length, "inert elements")
      }
      inertEls.forEach((el) => {
        el.removeAttribute("inert")
      })
    }
    const isInteractive = (el: HTMLElement): boolean =>
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLButtonElement ||
      el.isContentEditable ||
      el.getAttribute("role") === "combobox" ||
      el.getAttribute("role") === "option" ||
      el.getAttribute("role") === "listbox"
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target
      if (!(t instanceof HTMLElement)) return
      const bodyPE = document.body.style.pointerEvents
      const computedPE = window.getComputedStyle(t).pointerEvents
      if (isInteractive(t) || computedPE === "none" || bodyPE === "none") {
        console.warn("[cm-pos-diag] tap:", describeEl(t),
          "| body.pointerEvents:", bodyPE || "(empty)",
          "| el.computedPE:", computedPE,
          "| interactive:", isInteractive(t))
      }
      const inertAnc = findInertAncestors(t)
      if (inertAnc.length > 0) {
        console.warn("[cm-pos-diag] INERT ancestors:", inertAnc)
      }
      stripInertFromAncestors(t)
      if (bodyPE === "none") {
        console.warn("[cm-pos-diag] *** body.pointerEvents is NONE! Force-restoring ***")
        document.body.style.pointerEvents = ""
      }
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        t.isContentEditable
      ) {
        requestAnimationFrame(() => {
          if (document.activeElement !== t) {
            console.warn("[cm-pos-diag] force-focusing:", describeEl(t), "activeElement was:", describeEl(document.activeElement))
            t.focus({ preventScroll: true })
          }
        })
      }
    }
    const inertObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.attributeName === "inert") {
          const el = m.target as HTMLElement
          console.warn("[cm-pos-diag] inert attr changed:", describeEl(el), "inert=", el.hasAttribute("inert"))
        }
      }
    })
    let lastPointerDownTarget: EventTarget | null = null
    let lastPointerDownAt = 0
    let prevFocusedEl: HTMLElement | null = null
    let restoringFocus = false
    const origOnPointerDown = onPointerDown
    const wrappedOnPointerDown = (e: PointerEvent) => {
      lastPointerDownTarget = e.target
      lastPointerDownAt = Date.now()
      origOnPointerDown(e)
    }
    const radixOverlaySelector =
      '[data-radix-popper-content-wrapper], [role="listbox"][data-state="open"], [data-radix-select-viewport], [role="menu"][data-state="open"]'
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target
      if (!(t instanceof HTMLElement)) return
      if (restoringFocus) {
        restoringFocus = false
        prevFocusedEl = t
        return
      }
      const ds = t.dataset || {}
      const isScanInput = ds.posMemberScan === "1" || ds.posCouponScan === "1"
      if (isScanInput) {
        const isUserClick = lastPointerDownTarget === t && (Date.now() - lastPointerDownAt < 300)
        const overlayOpen = Boolean(document.querySelector(radixOverlaySelector))
        if (!isUserClick && overlayOpen && prevFocusedEl && prevFocusedEl !== t) {
          console.warn("[cm-pos-diag] scan autofocus blocked — overlay open, restoring:", describeEl(prevFocusedEl))
          restoringFocus = true
          prevFocusedEl.focus()
          return
        }
        console.warn("[cm-pos-diag] scan input FOCUSED:", describeEl(t),
          isUserClick ? "(user click)" : "(programmatic)")
      }
      prevFocusedEl = t
    }
    document.addEventListener("focusin", onFocusIn, true)
    inertObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["inert"], subtree: true })
    document.addEventListener("pointerdown", wrappedOnPointerDown, true)
    const tid = window.setInterval(stripAllStaleInert, 3000)
    return () => {
      document.head.removeChild(peStyle)
      document.removeEventListener("focusin", onFocusIn, true)
      inertObserver.disconnect()
      document.removeEventListener("pointerdown", wrappedOnPointerDown, true)
      window.clearInterval(tid)
      window.clearInterval(domTid)
    }
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
      replacePosOfflineAware("/pos/login", (p) => router.replace(p))
      return
    }
    if (!canAccessPosOrder(auth.role || "")) {
      if (isPosSettlementOnlyRole(auth.role || "")) {
        if (pathname !== "/pos/settlement") {
          replacePosOfflineAware("/pos/settlement", (p) => router.replace(p))
          return
        }
      } else {
        replacePosOfflineAware("/pos/login", (p) => router.replace(p))
        return
      }
    }
    if (saasModules != null) {
      const mod = resolveAdminPathSaasModule(pathname)
      if (!isSaasModuleEnabled(saasModules, mod)) {
        replacePosOfflineAware("/admin?saas_module_locked=1", (p) => router.replace(p))
        return
      }
    }
  }, [auth, initialized, isPosLoginPage, pathname, router, saasModules])

  const showTopChrome = (bar: boolean) => shellChrome && bar && !topBarHidden
  const touchMainButtonClass = isTouchViewport ? "min-h-10 px-3" : "px-2 py-1.5"
  const touchThinButtonClass = isTouchViewport ? "min-h-9 px-3" : "px-2 py-1"

  const topBarToggleButton = (variant: "header" | "thin") => (
    <button
      type="button"
      title={t("posTopBarHide")}
      className={
        variant === "header"
          ? `flex shrink-0 items-center gap-1 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 ${touchMainButtonClass}`
          : `mr-auto flex shrink-0 items-center gap-0.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 ${touchThinButtonClass}`
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
          <div
            className={`flex shrink-0 items-center justify-end border-b border-slate-200 bg-white px-2 shadow-sm sm:px-3 ${isTouchViewport ? "h-10" : "h-9"}`}
          >
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
  const useViewport = isFirstScreen || isTerminalPage || isCustomerDisplayPage
  const showPosHeader = !isFirstScreen && !isLocalPage
  const hideChromeForCustomerDisplay = isCustomerDisplayPage
  const effectiveShowPosHeader = showPosHeader && !hideChromeForCustomerDisplay
  const showThinMain = !showPosHeader && showShellThinBar

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-50">
      <PosStoreProvider>
      <PosMainDeviceSyncHost />
      <PosDrawerPinProvider>
      <PosBusinessDayHydrate />
      {topBarRevealStrip}
      {showTopChrome(effectiveShowPosHeader) ? (
        <header
          className={`flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-2 shadow-sm sm:px-4 ${isTouchViewport ? "h-11" : "h-12"}`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {topBarToggleButton("header")}
            <button
              type="button"
              onClick={() => router.back()}
              className={`flex shrink-0 items-center gap-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${touchMainButtonClass}`}
            >
              <ArrowLeft className="h-4 w-4" />
              {t("posBack")}
            </button>
            <button
              type="button"
              className={`flex shrink-0 items-center gap-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${touchMainButtonClass}`}
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
      {showTopChrome(showThinMain && !hideChromeForCustomerDisplay) ? (
        <div
          className={`flex shrink-0 items-center justify-end border-b border-slate-200 bg-white px-2 shadow-sm sm:px-3 ${isTouchViewport ? "h-10" : "h-9"}`}
        >
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
        className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${isTouchViewport ? "p-0" : "p-2 md:p-4"} ${padForRevealStrip ? "pt-12" : ""}`}
      >
        {useViewport ? (
          <div
            className={
              isTouchViewport
                ? "mx-auto flex h-full min-h-0 w-full flex-col overflow-hidden bg-background"
                : "mx-auto flex h-full min-h-0 w-full max-w-[1024px] max-h-[768px] min-[1024px]:min-h-[600px] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl"
            }
          >
            {children}
          </div>
        ) : (
          <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
            {children}
          </div>
        )}
      </main>
      </PosDrawerPinProvider>
      </PosStoreProvider>
    </div>
  )
}
