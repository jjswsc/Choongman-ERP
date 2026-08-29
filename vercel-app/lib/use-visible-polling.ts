'use client'

import * as React from 'react'

/**
 * 배경 탭 폴링 억제 — 숨긴 화면은 갱신해도 아무도 못 보는데
 * Vercel 호출·Fluid Active CPU는 그대로 나간다.
 * 숨김 동안 건너뛴 갱신은 다시 보일 때 1회로 갚는다.
 */
export type VisiblePollDelay = number | (() => number)

export function resolveVisiblePollDelayMs(delay: VisiblePollDelay): number {
  const ms = typeof delay === 'function' ? delay() : delay
  return Number.isFinite(ms) && ms > 0 ? ms : 0
}

export function isPollTargetVisible(
  state: DocumentVisibilityState | undefined = typeof document === 'undefined'
    ? undefined
    : document.visibilityState
): boolean {
  return state !== 'hidden'
}

export function useVisiblePolling(
  run: () => void | Promise<void>,
  delay: VisiblePollDelay,
  opts?: { enabled?: boolean }
): void {
  const enabled = opts?.enabled ?? true
  const runRef = React.useRef(run)
  runRef.current = run
  const delayRef = React.useRef(delay)
  delayRef.current = delay

  React.useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timerId = 0

    const schedule = () => {
      if (cancelled) return
      const delayMs = resolveVisiblePollDelayMs(delayRef.current)
      if (delayMs <= 0) return
      timerId = window.setTimeout(() => {
        void (async () => {
          if (!cancelled && isPollTargetVisible()) await runRef.current()
          schedule()
        })()
      }, delayMs)
    }

    const onVisibilityChange = () => {
      if (cancelled || !isPollTargetVisible()) return
      window.clearTimeout(timerId)
      void (async () => {
        await runRef.current()
        schedule()
      })()
    }

    schedule()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      window.clearTimeout(timerId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [enabled])
}
