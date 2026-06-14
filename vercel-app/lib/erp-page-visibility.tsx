"use client"

import * as React from "react"

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
