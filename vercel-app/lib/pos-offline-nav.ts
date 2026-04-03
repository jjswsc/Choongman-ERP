'use client'

import { isBrowserOnline } from '@/lib/offline/network'

const POS_HARD_NAV_SESSION_KEY = 'cm_pos_prefer_hard_nav'

/** POS 로그인에서「오프라인 모드로 계속」진입 시 세션 동안 하드 네비 우선 (onLine 거짓 true 대비) */
export function setPosSessionPreferHardNavigation(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(POS_HARD_NAV_SESSION_KEY, '1')
  } catch {
    /* private mode 등 */
  }
}

function sessionPrefersHardNav(): boolean {
  if (typeof sessionStorage === 'undefined') return false
  try {
    return sessionStorage.getItem(POS_HARD_NAV_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * 브라우저가 오프라인이거나, 로그인에서「오프라인 모드로 계속」을 택한 경우에만 전체 로드로 우회한다.
 * (API 1회 실패만으로 isNetworkDegraded 되면 매 화면 전환마다 location.assign → 매우 느려지는 회귀 방지)
 */
function shouldUseHardNavigation(path: string): boolean {
  if (typeof window === 'undefined') return false
  const p = path.startsWith('/') ? path : `/${path}`
  if (!p.startsWith('/pos') && !p.startsWith('/admin')) return false
  return !isBrowserOnline() || sessionPrefersHardNav()
}

export function navigatePosOfflineAware(path: string, push: (p: string) => void): void {
  if (shouldUseHardNavigation(path)) {
    window.location.assign(path)
    return
  }
  push(path)
}

export function replacePosOfflineAware(path: string, replace: (p: string) => void): void {
  if (shouldUseHardNavigation(path)) {
    window.location.assign(path)
    return
  }
  replace(path)
}
