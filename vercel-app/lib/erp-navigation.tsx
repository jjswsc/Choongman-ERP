"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ERP_HELP_PARAM } from "@/components/erp/admin-help-mode-toggle"
import {
  clearErpWorkspaceTabs,
  closeOtherErpWorkspaceTabs,
  ensureErpWorkspaceTab,
  findNeighborWorkspaceTabHref,
  getErpWorkspaceTabFullHref,
  getErpWorkspaceTabs,
  removeErpWorkspaceTab,
  reorderErpWorkspaceTabs,
  resolveErpWorkspaceTabHref,
  subscribeErpWorkspaceTabs,
  type ErpWorkspaceTab,
} from "@/lib/erp-workspace-tabs"
import {
  bumpErpKeepAliveRemount,
  clearErpKeepAliveRemountStamps,
} from "@/lib/erp-keep-alive-remount"
import { isErpKeepAliveExcluded } from "@/lib/erp-keep-alive-config"
import {
  clearErpKeepAliveCacheRegistry,
  hasErpKeepAliveCache,
} from "@/lib/erp-keep-alive-registry"

const STACK_KEY = "erp_nav_stack_v1"
const BACK_FLAG_KEY = "erp_nav_back_pending"
const BACK_EVICT_KEY = "erp_nav_back_evict_v1"
const MAX_STACK = 80

export type ErpBackHandler = () => boolean

function normalizePath(path: string): string {
  if (!path) return path
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1)
  return path
}

/** pathname + search를 ERP 뒤로가기 스택용 href로 정규화 */
export function normalizeErpHref(pathname: string, search?: string): string {
  const path = normalizePath(pathname)
  const raw = (search || "").trim()
  if (!raw) return path
  const q = raw.startsWith("?") ? raw : `?${raw}`
  return `${path}${q}`
}

function readStack(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = sessionStorage.getItem(STACK_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s): s is string => typeof s === "string" && s.startsWith("/admin"))
  } catch {
    return []
  }
}

function writeStack(stack: string[]) {
  if (typeof window === "undefined") return
  sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-MAX_STACK)))
}

/** keep-alive 캐시와 스택 동기화용 (레거시·디버그) */
export function getErpNavigationStack(): string[] {
  return readStack()
}

function removeHrefFromStack(href: string) {
  const stack = readStack()
  const target = resolveErpWorkspaceTabHref(href)
  writeStack(stack.filter((s) => resolveErpWorkspaceTabHref(s) !== target))
}

export function markErpBackNavigation(opts?: { evictHref?: string }) {
  if (typeof window === "undefined") return
  sessionStorage.setItem(BACK_FLAG_KEY, "1")
  if (opts?.evictHref) sessionStorage.setItem(BACK_EVICT_KEY, opts.evictHref)
}

export function consumeErpBackEvictHref(): string | null {
  if (typeof window === "undefined") return null
  const v = sessionStorage.getItem(BACK_EVICT_KEY)
  sessionStorage.removeItem(BACK_EVICT_KEY)
  return v || null
}

export function consumeErpBackNavigation(): boolean {
  if (typeof window === "undefined") return false
  if (sessionStorage.getItem(BACK_FLAG_KEY) === "1") {
    sessionStorage.removeItem(BACK_FLAG_KEY)
    return true
  }
  return false
}

function pushToStack(href: string) {
  if (!href.startsWith("/admin") || href.startsWith("/admin/login")) return
  const stack = readStack()
  const last = stack[stack.length - 1]
  if (last === href) return
  stack.push(href)
  writeStack(stack)
}

function trimStackToHref(href: string) {
  const stack = readStack()
  const idx = stack.lastIndexOf(href)
  if (idx >= 0) {
    writeStack(stack.slice(0, idx + 1))
    return
  }
  pushToStack(href)
}

function popStackAndGetPrev(current: string): string | null {
  const stack = readStack()
  if (stack.length === 0) return null

  const idx = stack.lastIndexOf(current)
  if (idx >= 0) {
    writeStack(stack.slice(0, idx))
  } else if (stack[stack.length - 1] === current) {
    stack.pop()
    writeStack(stack)
  }

  const trimmed = readStack()
  const prev = trimmed[trimmed.length - 1]
  return prev && prev !== current ? prev : null
}

type ErpNavigationContextValue = {
  registerBackHandler: (handler: ErpBackHandler) => () => void
  goBack: () => void
  closeCurrentPage: () => void
  closeWorkspaceTab: (href: string) => void
  closeOtherWorkspaceTabs: (keepHref?: string) => void
  activateWorkspaceTab: (href: string) => void
  refreshWorkspaceTab: (href: string) => void
  reorderWorkspaceTabs: (fromHref: string, toHref: string) => void
  /** keep-alive soft 전환 중 URL(라우터보다 우선). null이면 Next pathname */
  softDisplayHref: string | null
  clearSoftDisplayHref: () => void
  workspaceTabs: ErpWorkspaceTab[]
  registerPageClearListener: (listener: () => void) => () => void
  clearPageCache: () => void
  /** 매장·언어 등 컨텍스트 변경 — 탭 목록은 유지하고 keep-alive 트리만 비움 */
  invalidateKeepAliveCaches: () => void
  registerKeepAliveCountListener: (listener: (count: number) => void) => () => void
  notifyKeepAliveCount: (count: number) => void
}

const ErpNavigationContext = React.createContext<ErpNavigationContextValue | null>(null)

function ErpNavigationTracker({
  onRouterHref,
}: {
  onRouterHref: (href: string) => void
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const href = React.useMemo(() => {
    const p = pathname || ""
    const qs = searchParams.toString()
    return normalizeErpHref(p, qs ? `?${qs}` : "")
  }, [pathname, searchParams])

  React.useEffect(() => {
    onRouterHref(href)
  }, [href, onRouterHref])

  React.useEffect(() => {
    if (!href.startsWith("/admin") || href.startsWith("/admin/login")) return
    ensureErpWorkspaceTab(href)
    if (consumeErpBackNavigation()) return
    pushToStack(href)
  }, [href])

  React.useEffect(() => {
    const onPopState = () => {
      const p = normalizePath(window.location.pathname)
      const qs = window.location.search
      const next = normalizeErpHref(p, qs)
      ensureErpWorkspaceTab(next)
      trimStackToHref(next)
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  return null
}

export function ErpNavigationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const handlersRef = React.useRef<ErpBackHandler[]>([])
  const pageClearListenersRef = React.useRef<(() => void)[]>([])
  const keepAliveCountListenersRef = React.useRef<((count: number) => void)[]>([])
  const [workspaceTabs, setWorkspaceTabs] = React.useState<ErpWorkspaceTab[]>([
    { href: "/admin", titleKey: "adminDashboard", lastSeen: 0 },
  ])
  const [softDisplayHref, setSoftDisplayHref] = React.useState<string | null>(null)

  React.useEffect(() => {
    setWorkspaceTabs(getErpWorkspaceTabs())
    return subscribeErpWorkspaceTabs(() => setWorkspaceTabs(getErpWorkspaceTabs()))
  }, [])

  const onRouterHref = React.useCallback((href: string) => {
    const resolved = resolveErpWorkspaceTabHref(href)
    // Soft pushState가 Next pathname과 동기화되면 soft 대상과 같아짐 → 유지.
    // 사이드바 Link 등 hard nav로 다른 경로가 오면 soft 해제.
    setSoftDisplayHref((prev) => {
      if (!prev) return null
      if (resolveErpWorkspaceTabHref(prev) === resolved) return prev
      return null
    })
  }, [])

  const clearSoftDisplayHref = React.useCallback(() => {
    setSoftDisplayHref(null)
  }, [])

  React.useEffect(() => {
    const onPopState = () => {
      const p = normalizePath(window.location.pathname)
      const qs = window.location.search
      const next = resolveErpWorkspaceTabHref(normalizeErpHref(p, qs))
      if (hasErpKeepAliveCache(next) && !isErpKeepAliveExcluded(next)) {
        setSoftDisplayHref(next)
        ensureErpWorkspaceTab(next)
        return
      }
      setSoftDisplayHref(null)
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  const registerBackHandler = React.useCallback((handler: ErpBackHandler) => {
    handlersRef.current.push(handler)
    return () => {
      handlersRef.current = handlersRef.current.filter((h) => h !== handler)
    }
  }, [])

  const registerPageClearListener = React.useCallback((listener: () => void) => {
    pageClearListenersRef.current.push(listener)
    return () => {
      pageClearListenersRef.current = pageClearListenersRef.current.filter((l) => l !== listener)
    }
  }, [])

  const registerKeepAliveCountListener = React.useCallback((listener: (count: number) => void) => {
    keepAliveCountListenersRef.current.push(listener)
    return () => {
      keepAliveCountListenersRef.current = keepAliveCountListenersRef.current.filter((l) => l !== listener)
    }
  }, [])

  const notifyKeepAliveCount = React.useCallback((count: number) => {
    for (const listener of keepAliveCountListenersRef.current) listener(count)
  }, [])

  const clearPageCache = React.useCallback(() => {
    setSoftDisplayHref(null)
    clearErpWorkspaceTabs()
    clearErpKeepAliveRemountStamps()
    clearErpKeepAliveCacheRegistry()
    for (const listener of pageClearListenersRef.current) listener()
  }, [])

  /** 탭은 유지한 채 숨김 keep-alive만 비우고 현재 화면 RSC 갱신 */
  const invalidateKeepAliveCaches = React.useCallback(() => {
    setSoftDisplayHref(null)
    clearErpKeepAliveCacheRegistry()
    for (const listener of pageClearListenersRef.current) listener()
    markErpBackNavigation()
    router.refresh()
  }, [router])

  const activateWorkspaceTab = React.useCallback(
    (href: string) => {
      const target = resolveErpWorkspaceTabHref(href)
      const p = typeof window !== "undefined" ? normalizePath(window.location.pathname) : ""
      const qs = typeof window !== "undefined" ? window.location.search : ""
      const routerCurrent = resolveErpWorkspaceTabHref(normalizeErpHref(p, qs))
      const current = softDisplayHref || routerCurrent
      if (current === target) return

      // 캐시 hit: history만 바꾸고 keep-alive 표시 전환 (RSC push 생략)
      if (
        typeof window !== "undefined" &&
        hasErpKeepAliveCache(target) &&
        !isErpKeepAliveExcluded(target)
      ) {
        setSoftDisplayHref(target)
        ensureErpWorkspaceTab(target)
        window.history.pushState({ erpSoftTab: 1 }, "", getErpWorkspaceTabFullHref(target))
        return
      }

      setSoftDisplayHref(null)
      markErpBackNavigation()
      router.push(target, { scroll: false })
    },
    [router, softDisplayHref]
  )

  const refreshWorkspaceTab = React.useCallback(
    (href: string) => {
      if (typeof window === "undefined") return
      const tabHref = resolveErpWorkspaceTabHref(href)
      const p = normalizePath(window.location.pathname)
      const qs = window.location.search
      const routerCurrent = resolveErpWorkspaceTabHref(normalizeErpHref(p, qs))
      const current = softDisplayHref || routerCurrent
      bumpErpKeepAliveRemount(tabHref)
      setSoftDisplayHref(null)
      if (current === tabHref || routerCurrent === tabHref) {
        markErpBackNavigation()
        if (routerCurrent !== tabHref) router.push(tabHref, { scroll: false })
        else router.refresh()
      }
    },
    [router, softDisplayHref]
  )

  const closeWorkspaceTab = React.useCallback(
    (href: string) => {
      if (typeof window === "undefined") return
      const tabHref = resolveErpWorkspaceTabHref(href)
      if (tabHref === "/admin") return

      const before = getErpWorkspaceTabs()
      const neighbor = findNeighborWorkspaceTabHref(tabHref, before)
      const p = normalizePath(window.location.pathname)
      const qs = window.location.search
      const routerCurrent = resolveErpWorkspaceTabHref(normalizeErpHref(p, qs))
      const current = softDisplayHref || routerCurrent

      removeHrefFromStack(tabHref)
      removeErpWorkspaceTab(tabHref)

      if (current === tabHref) {
        setSoftDisplayHref(null)
        markErpBackNavigation({ evictHref: tabHref })
        router.push(neighbor)
      }
    },
    [router, softDisplayHref]
  )

  const closeOtherWorkspaceTabs = React.useCallback(
    (keepHref?: string) => {
      if (typeof window === "undefined") return
      const p = normalizePath(window.location.pathname)
      const qs = window.location.search
      const routerCurrent = resolveErpWorkspaceTabHref(normalizeErpHref(p, qs))
      const current = softDisplayHref || routerCurrent
      const keep = resolveErpWorkspaceTabHref(keepHref || current)
      const removed = closeOtherErpWorkspaceTabs(keep)
      for (const h of removed) removeHrefFromStack(h)
      if (current !== keep && keep !== "/admin") {
        setSoftDisplayHref(null)
        markErpBackNavigation()
        router.push(keep, { scroll: false })
      } else if (softDisplayHref && softDisplayHref !== keep) {
        setSoftDisplayHref(keep === routerCurrent ? null : keep)
      }
    },
    [router, softDisplayHref]
  )

  const reorderWorkspaceTabs = React.useCallback((fromHref: string, toHref: string) => {
    reorderErpWorkspaceTabs(fromHref, toHref)
  }, [])

  const closeCurrentPage = React.useCallback(() => {
    if (typeof window === "undefined") return
    const p = normalizePath(window.location.pathname)
    const qs = window.location.search
    const routerCurrent = resolveErpWorkspaceTabHref(normalizeErpHref(p, qs))
    const current = softDisplayHref || routerCurrent
    if (current === "/admin") return
    closeWorkspaceTab(current)
  }, [closeWorkspaceTab, softDisplayHref])

  const goBack = React.useCallback(() => {
    if (typeof window === "undefined") return

    const p = normalizePath(window.location.pathname)
    const qs = window.location.search
    const current = normalizeErpHref(p, qs)
    const params = new URLSearchParams(qs)

    if (params.get(ERP_HELP_PARAM) === "1") {
      params.delete(ERP_HELP_PARAM)
      const nextQs = params.toString()
      router.replace(nextQs ? `${p}?${nextQs}` : p, { scroll: false })
      return
    }

    for (let i = handlersRef.current.length - 1; i >= 0; i--) {
      if (handlersRef.current[i]()) return
    }

    const prev = popStackAndGetPrev(current)
    if (prev) {
      setSoftDisplayHref(null)
      markErpBackNavigation()
      router.push(prev)
      return
    }

    if (window.history.length > 1) {
      setSoftDisplayHref(null)
      markErpBackNavigation()
      router.back()
      return
    }
    setSoftDisplayHref(null)
    router.push("/admin")
  }, [router])

  const value = React.useMemo(
    () => ({
      registerBackHandler,
      goBack,
      closeCurrentPage,
      closeWorkspaceTab,
      closeOtherWorkspaceTabs,
      activateWorkspaceTab,
      refreshWorkspaceTab,
      reorderWorkspaceTabs,
      softDisplayHref,
      clearSoftDisplayHref,
      workspaceTabs,
      registerPageClearListener,
      clearPageCache,
      invalidateKeepAliveCaches,
      registerKeepAliveCountListener,
      notifyKeepAliveCount,
    }),
    [
      registerBackHandler,
      goBack,
      closeCurrentPage,
      closeWorkspaceTab,
      closeOtherWorkspaceTabs,
      activateWorkspaceTab,
      refreshWorkspaceTab,
      reorderWorkspaceTabs,
      softDisplayHref,
      clearSoftDisplayHref,
      workspaceTabs,
      registerPageClearListener,
      clearPageCache,
      invalidateKeepAliveCaches,
      registerKeepAliveCountListener,
      notifyKeepAliveCount,
    ]
  )

  return (
    <ErpNavigationContext.Provider value={value}>
      <React.Suspense fallback={null}>
        <ErpNavigationTracker onRouterHref={onRouterHref} />
      </React.Suspense>
      {children}
    </ErpNavigationContext.Provider>
  )
}

export function useErpNavigation(): ErpNavigationContextValue {
  const ctx = React.useContext(ErpNavigationContext)
  if (!ctx) {
    throw new Error("useErpNavigation must be used within ErpNavigationProvider")
  }
  return ctx
}

export function useErpNavigationOptional(): ErpNavigationContextValue | null {
  return React.useContext(ErpNavigationContext)
}

/**
 * 팝업·탭 등 화면 내 작업 상태를 먼저 되돌릴 때 등록.
 * handler가 true를 반환하면 ERP 뒤로가기가 해당 단계에서 멈춘다.
 */
export function useErpBackHandler(active: boolean, handler: ErpBackHandler) {
  const ctx = useErpNavigationOptional()
  const handlerRef = React.useRef(handler)
  handlerRef.current = handler

  React.useEffect(() => {
    if (!ctx || !active) return
    return ctx.registerBackHandler(() => handlerRef.current())
  }, [ctx, active])
}

/** Dialog·Sheet 등 오버레이 — open일 때 onOpenChange(false)로 닫기 */
export function useErpOverlayBack(
  open: boolean | undefined,
  onOpenChange: ((open: boolean) => void) | undefined
) {
  useErpBackHandler(open === true && !!onOpenChange, () => {
    onOpenChange?.(false)
    return true
  })
}
