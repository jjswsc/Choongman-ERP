'use client'

/**
 * 네트워크 상태 감지
 */

import { useEffect, useState } from 'react'

const HEALTH_WINDOW_MS = 30_000
const DEGRADE_FAIL_THRESHOLD = 2

let consecutiveFailures = 0
let lastFailureAt = 0

function isRecentFailureWindow(now: number): boolean {
  return lastFailureAt > 0 && now - lastFailureAt <= HEALTH_WINDOW_MS
}

/** 브라우저 기본 온라인 신호 (navigator.onLine) */
export function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
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

/** 요청 성공 시 호출 (헬스 회복) */
export function reportNetworkSuccess() {
  consecutiveFailures = 0
  lastFailureAt = 0
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
    degraded: isNetworkDegraded(),
    consecutiveFailures,
    lastFailureAt,
  }
}

export function useOnlineStatus(callback?: (online: boolean) => void): boolean {
  const [online, setOnline] = useState(() => isBrowserOnline())
  useEffect(() => {
    const onOnline = () => {
      setOnline(true)
      callback?.(true)
    }
    const onOffline = () => {
      setOnline(false)
      callback?.(false)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [callback])
  return online
}
