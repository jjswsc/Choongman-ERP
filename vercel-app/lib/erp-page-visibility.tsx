"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

const ErpPageVisibilityContext = React.createContext(true)
const ErpTabActiveContext = React.createContext(true)

export function ErpPageVisibilityProvider({
  active,
  children,
}: {
  active: boolean
  children: React.ReactNode
}) {
  return (
    <ErpPageVisibilityContext.Provider value={active}>{children}</ErpPageVisibilityContext.Provider>
  )
}

export function ErpTabActiveProvider({
  active,
  children,
}: {
  active: boolean
  children: React.ReactNode
}) {
  return <ErpTabActiveContext.Provider value={active}>{children}</ErpTabActiveContext.Provider>
}

/** keep-alive로 숨겨진 화면이면 false. Provider 밖(사이드바 등)은 true. */
export function useErpPageActive(): boolean {
  return React.useContext(ErpPageVisibilityContext)
}

/** Radix Tabs 비활성 탭(forceMount)이면 false */
export function useErpTabActive(): boolean {
  return React.useContext(ErpTabActiveContext)
}

function useDocumentVisible(): boolean {
  const [visible, setVisible] = React.useState(() =>
    typeof document !== "undefined" ? document.visibilityState === "visible" : true
  )

  React.useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible")
    document.addEventListener("visibilitychange", onChange)
    return () => document.removeEventListener("visibilitychange", onChange)
  }, [])

  return visible
}

/** 페이지·탭이 보이고 브라우저 탭도 활성일 때만 true */
export function useErpPageFullyActive(): boolean {
  const pageActive = useErpPageActive()
  const tabActive = useErpTabActive()
  const docVisible = useDocumentVisible()
  return pageActive && tabActive && docVisible
}

/**
 * 최신 `useErpPageActive()` 값을 ref로 읽는다.
 * keep-alive로 숨겨진 탭의 effect에서 `usePathname`/`useSearchParams`를 다룰 때 사용한다.
 *
 * 숨김 중에도 훅은 **현재 활성 탭 URL**을 반환한다. 그 변화를 그대로 동기화·초기화하면
 * (1) 조회 결과가 지워지거나 (2) 다른 탭 URL을 router.replace로 덮어쓴다.
 * `pageActive`를 effect deps에 넣으면 탭 복귀 시 effect가 다시 돌며 결과를 지울 수 있으므로,
 * URL/필터 초기화 effect는 deps에 넣지 말고 `if (!activeRef.current) return`으로 가드한다.
 */
export function useErpPageActiveRef(): React.MutableRefObject<boolean> {
  const active = useErpPageActive()
  const ref = React.useRef(active)
  ref.current = active
  return ref
}

/**
 * keep-alive 숨김 중 URL→state 동기화 허용 여부.
 * 페이지가 활성(보이는 슬롯)이고 pathname이 인자 경로 중 하나일 때만 true.
 */
export function useErpAllowUrlSync(...pathPrefixes: string[]): boolean {
  const pageActive = useErpPageActive()
  const pathname = usePathname()
  const path = (pathname || "").split("?")[0] || ""
  const normalized = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path
  if (!pageActive || pathPrefixes.length === 0) return false
  return pathPrefixes.some((pathPrefix) => {
    const prefix =
      pathPrefix.length > 1 && pathPrefix.endsWith("/") ? pathPrefix.slice(0, -1) : pathPrefix
    return normalized === prefix || normalized.startsWith(`${prefix}/`)
  })
}

/**
 * keep-alive 캐시에서 다시 보일 때(다른 메뉴 갔다 복귀) callback 1회 실행.
 */
export function useErpRefetchOnActivate(callback: () => void, enabled = true) {
  const active = useErpPageActive()
  const callbackRef = React.useRef(callback)
  callbackRef.current = callback
  const wasActiveRef = React.useRef(active)

  React.useEffect(() => {
    if (!enabled) {
      wasActiveRef.current = active
      return
    }
    if (active && !wasActiveRef.current) {
      callbackRef.current()
    }
    wasActiveRef.current = active
  }, [active, enabled])
}

type ErpPollingOptions = {
  enabled?: boolean
  /** 복귀 시 즉시 1회 실행 */
  refetchOnActivate?: boolean
}

/**
 * 페이지·탭이 활성일 때만 interval 폴링. 숨김 keep-alive·비활성 탭·백그라운드에서는 중지.
 */
export function useErpPolling(
  callback: () => void,
  intervalMs: number,
  options?: ErpPollingOptions
) {
  const enabled = options?.enabled ?? true
  const fullyActive = useErpPageFullyActive()
  const callbackRef = React.useRef(callback)
  callbackRef.current = callback

  useErpRefetchOnActivate(() => {
    callbackRef.current()
  }, enabled && (options?.refetchOnActivate ?? false))

  React.useEffect(() => {
    if (!enabled || !fullyActive || intervalMs <= 0) return
    const tick = () => {
      if (document.visibilityState !== "visible") return
      callbackRef.current()
    }
    const id = window.setInterval(tick, intervalMs)
    return () => window.clearInterval(id)
  }, [enabled, fullyActive, intervalMs])
}

/**
 * window/document 이벤트 구독 — 페이지가 활성일 때만 등록.
 */
export function useErpActiveSubscription(
  subscribe: (listener: () => void) => () => void,
  listener: () => void,
  enabled = true
) {
  const active = useErpPageActive()
  const listenerRef = React.useRef(listener)
  listenerRef.current = listener

  React.useEffect(() => {
    if (!enabled || !active) return
    return subscribe(() => listenerRef.current())
  }, [active, enabled, subscribe])
}
