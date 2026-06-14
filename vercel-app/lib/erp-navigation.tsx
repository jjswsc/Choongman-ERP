"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ERP_HELP_PARAM } from "@/components/erp/admin-help-mode-toggle"

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

/** keep-alive 캐시와 스택 동기화용 */
export function getErpNavigationStack(): string[] {
  return readStack()
}

function removeHrefFromStack(href: string) {
  const stack = readStack()
  const idx = stack.lastIndexOf(href)
  if (idx < 0) return
  writeStack(stack.slice(0, idx))
}

export function markErpBackNavigation(fromHref?: string) {
  if (typeof window === "undefined") return
  sessionStorage.setItem(BACK_FLAG_KEY, "1")
  if (fromHref) sessionStorage.setItem(BACK_EVICT_KEY, fromHref)
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
  registerPageClearListener: (listener: () => void) => () => void
  clearPageCache: () => void
  registerKeepAliveCountListener: (listener: (count: number) => void) => () => void
  notifyKeepAliveCount: (count: number) => void
}

const ErpNavigationContext = React.createContext<ErpNavigationContextValue | null>(null)

function ErpNavigationTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const href = React.useMemo(() => {
    const p = pathname || ""
    const qs = searchParams.toString()
    return normalizeErpHref(p, qs ? `?${qs}` : "")
  }, [pathname, searchParams])

  React.useEffect(() => {
    if (!href.startsWith("/admin") || href.startsWith("/admin/login")) return
    if (consumeErpBackNavigation()) return
    pushToStack(href)
  }, [href])

  React.useEffect(() => {
    const onPopState = () => {
      const p = normalizePath(window.location.pathname)
      const qs = window.location.search
      trimStackToHref(normalizeErpHref(p, qs))
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
    for (const listener of pageClearListenersRef.current) listener()
  }, [])

  const closeCurrentPage = React.useCallback(() => {
    if (typeof window === "undefined") return
    const p = normalizePath(window.location.pathname)
    const qs = window.location.search
    const current = normalizeErpHref(p, qs)
    if (current === "/admin") return
    markErpBackNavigation(current)
    removeHrefFromStack(current)
    router.push("/admin")
  }, [router])

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
      markErpBackNavigation(current)
      router.push(prev)
      return
    }

    if (window.history.length > 1) {
      markErpBackNavigation(current)
      router.back()
      return
    }
    router.push("/admin")
  }, [router])

  const value = React.useMemo(
    () => ({
      registerBackHandler,
      goBack,
      closeCurrentPage,
      registerPageClearListener,
      clearPageCache,
      registerKeepAliveCountListener,
      notifyKeepAliveCount,
    }),
    [
      registerBackHandler,
      goBack,
      closeCurrentPage,
      registerPageClearListener,
      clearPageCache,
      registerKeepAliveCountListener,
      notifyKeepAliveCount,
    ]
  )

  return (
    <ErpNavigationContext.Provider value={value}>
      <React.Suspense fallback={null}>
        <ErpNavigationTracker />
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
