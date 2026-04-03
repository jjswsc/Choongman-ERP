'use client'

import { shouldPreferOfflineCache } from '@/lib/offline/network'

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
 * 오프라인·네트워크 열악 시 Next.js App Router 클라이언트 전환(RSC fetch)이 막혀 버튼이 먹통처럼 보이므로
 * 전체 로드(window.location)로 우회한다. /admin 은 POS에서 관리 화면으로 들어갈 때 동일 이슈가 있어 포함한다.
 */
function shouldUseHardNavigation(path: string): boolean {
  if (typeof window === 'undefined') return false
  const p = path.startsWith('/') ? path : `/${path}`
  if (!p.startsWith('/pos') && !p.startsWith('/admin')) return false
  return shouldPreferOfflineCache() || sessionPrefersHardNav()
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
