'use client'

/**
 * 네트워크 상태 감지
 *
 * navigator.onLine 은 Windows·일부 Chromium·Electron 에서 실제와 무관하게 false 로 남는 경우가 있어,
 * 동일 출처 경량 프로브(/api/online-probe)와 최근 API 성공(reportNetworkSuccess)으로 보정한다.
 */

import { useEffect, useRef, useState } from 'react'

const HEALTH_WINDOW_MS = 30_000
/** 한 번의 실패만으로도 짧은 구간 내 캐시·하드 네비 우선 (라이파이·서버 무응답 대응) */
const DEGRADE_FAIL_THRESHOLD = 1

/** 프로브·성공한 fetch 이후 이 시간 안이면 navigator 가 false 여도 온라인으로 간주 */
const REACHABILITY_STALE_MS = 45_000
/** navigator.onLine=false(하이브리드 POS)여도 최근 API 성공이면 probe 생략 — 간격 90s */
const OFFLINE_PROBE_INTERVAL_MS = 90_000
const PROBE_TIMEOUT_MS = 3_000

export const REACHABILITY_EVENT = 'cm-reachability'

let consecutiveFailures = 0
let lastFailureAt = 0
let lastReachabilityOkAt = 0
let probeInFlight: Promise<boolean> | null = null

function isRecentFailureWindow(now: number): boolean {
  return lastFailureAt > 0 && now - lastFailureAt <= HEALTH_WINDOW_MS
}

function notifyReachability() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(REACHABILITY_EVENT))
  }
}

/** API 성공 시 — navigator 가 false 인 환경에서만 UI 동기화 (과도한 이벤트 방지) */
let lastFetchReachNotifyAt = 0
const FETCH_REACH_NOTIFY_MIN_MS = 1_500

function notifyReachabilityAfterFetchSuccess() {
  if (typeof navigator !== 'undefined' && navigator.onLine) return
  const now = Date.now()
  if (now - lastFetchReachNotifyAt < FETCH_REACH_NOTIFY_MIN_MS) return
  lastFetchReachNotifyAt = now
  notifyReachability()
}

/**
 * DB 없이 같은 앱에 요청이 도달하는지 확인. 여러 컴포넌트에서 동시 호출해도 한 번만 나간다.
 */
export function runReachabilityProbe(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (!probeInFlight) {
    probeInFlight = (async () => {
      try {
        const ac = new AbortController()
        const tid = window.setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS)
        const r = await fetch(`${window.location.origin}/api/online-probe`, {
          method: 'GET',
          cache: 'no-store',
          signal: ac.signal,
        })
        window.clearTimeout(tid)
        if (r.ok) {
          lastReachabilityOkAt = Date.now()
          notifyReachability()
          lastFetchReachNotifyAt = Date.now()
          return true
        }
      } catch {
        /* 서버·망 단절 */
      }
      return false
    })().finally(() => {
      probeInFlight = null
    })
  }
  return probeInFlight
}

/** 브라우저 기본 온라인 신호 + 동일 출처 도달 가능 시 보정 */
export function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  if (navigator.onLine) return true
  return Date.now() - lastReachabilityOkAt <= REACHABILITY_STALE_MS
}

/** API 실패 신호를 반영한 보조 헬스 상태 */
export function isNetworkDegraded(): boolean {
  const now = Date.now()
  if (!isRecentFailureWindow(now)) return false
  return consecutiveFailures >= DEGRADE_FAIL_THRESHOLD
}

/** 읽기 요청에서 캐시 우선 모드로 전환할지 판단 */
export function shouldPreferOfflineCache(): boolean {
  return !isBrowserOnline() || isNetworkDegraded()
}

/** 하위 호환: 기존 호출부는 그대로 사용 */
export function isOnline(): boolean {
  return isBrowserOnline()
}

/** 요청 성공 시 호출 (헬스 회복 + 실질 온라인 증명) */
export function reportNetworkSuccess() {
  consecutiveFailures = 0
  lastFailureAt = 0
  lastReachabilityOkAt = Date.now()
  notifyReachabilityAfterFetchSuccess()
}

/** 네트워크/타임아웃/5xx 등 실패 시 호출 */
export function reportNetworkFailure() {
  const now = Date.now()
  if (!isRecentFailureWindow(now)) {
    consecutiveFailures = 0
  }
  consecutiveFailures += 1
  lastFailureAt = now
}

export function getNetworkHealthSnapshot() {
  return {
    browserOnline: isBrowserOnline(),
    navigatorOnLine: typeof navigator !== 'undefined' ? navigator.onLine : null,
    degraded: isNetworkDegraded(),
    consecutiveFailures,
    lastFailureAt,
    lastReachabilityOkAt,
  }
}

export function useOnlineStatus(callback?: (online: boolean) => void): boolean {
  const cbRef = useRef(callback)
  cbRef.current = callback

  const [online, setOnline] = useState(() => isBrowserOnline())

  useEffect(() => {
    const push = (v: boolean) => {
      setOnline(v)
      cbRef.current?.(v)
    }
    const sync = () => push(isBrowserOnline())

    const probeIfStillOffline = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (isBrowserOnline()) return
      void runReachabilityProbe().then(sync)
    }

    const onOnline = () => push(true)
    const onOffline = () => {
      sync()
      probeIfStillOffline()
    }
    const onReachability = () => sync()
    const onFocus = () => probeIfStillOffline()
    const onVis = () => {
      if (document.visibilityState === 'visible') probeIfStillOffline()
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener(REACHABILITY_EVENT, onReachability)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)

    probeIfStillOffline()

    const interval = window.setInterval(probeIfStillOffline, OFFLINE_PROBE_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener(REACHABILITY_EVENT, onReachability)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
      window.clearInterval(interval)
    }
  }, [])

  return online
}
