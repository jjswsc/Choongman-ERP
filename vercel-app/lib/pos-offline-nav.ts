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

export function prefersPosSessionHardNavigation(): boolean {
  return sessionPrefersHardNav()
}

function pathOnly(urlOrPath: string): string {
  const p = urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`
  return p.split('?')[0] || p
}

function normalizedPathWithSearch(urlOrPath: string): string {
  const p = urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`
  return p
}

/** `/pos/login` (끝 슬래시·쿼리 무시) */
export function isPosLoginPathname(pathname: string): boolean {
  const p = String(pathname || '')
    .split('?')[0]
    .replace(/\/+$/, '') || '/'
  return p === '/pos/login'
}

/**
 * 로그인 직후 soft `router.replace` 는 청크만 받아 흰 화면으로 남는 사례가 있어
 * `/pos/login` → POS/관리 화면은 항상 전체 로드한다.
 */
export function shouldHardNavigatePos(opts: {
  path: string
  currentPathname: string
  browserOnline: boolean
  sessionPreferHardNav: boolean
}): boolean {
  const p = opts.path.startsWith('/') ? opts.path : `/${opts.path}`
  if (!p.startsWith('/pos') && !p.startsWith('/admin')) return false
  if (isPosLoginPathname(opts.currentPathname)) return true
  return !opts.browserOnline || opts.sessionPreferHardNav
}

/**
 * 이미 /pos 셸이 로드된 뒤 하위 경로 이동 — SW가 /pos HTML만 내릴 때 location.assign 회귀 방지.
 * 로그인 화면에서는 soft 금지(위 shouldHardNavigatePos 와 맞춤).
 */
export function canSoftNavigateWithinPos(opts: {
  currentPathname: string
  currentFull: string
  targetPath: string
}): boolean {
  if (isPosLoginPathname(opts.currentPathname)) return false
  const currentPath = opts.currentPathname || ''
  const target = normalizedPathWithSearch(opts.targetPath)
  const targetPathOnly = pathOnly(target)
  if (!currentPath.startsWith('/pos') || !targetPathOnly.startsWith('/pos/')) return false
  return opts.currentFull !== target
}

/** @deprecated — 테스트·호출부 호환용 래퍼 */
function canUseSoftPosInAppNav(targetPath: string): boolean {
  if (typeof window === 'undefined') return false
  return canSoftNavigateWithinPos({
    currentPathname: window.location.pathname || '',
    currentFull: `${window.location.pathname || ''}${window.location.search || ''}`,
    targetPath,
  })
}

/**
 * 브라우저가 오프라인이거나, 로그인에서「오프라인 모드로 계속」을 택한 경우,
 * 또는 `/pos/login` 을 떠날 때 전체 로드로 우회한다.
 * (API 1회 실패만으로 isNetworkDegraded 되면 매 화면 전환마다 location.assign → 매우 느려지는 회귀 방지)
 */
function shouldUseHardNavigation(path: string): boolean {
  if (typeof window === 'undefined') return false
  return shouldHardNavigatePos({
    path,
    currentPathname: window.location.pathname || '',
    browserOnline: isBrowserOnline(),
    sessionPreferHardNav: sessionPrefersHardNav(),
  })
}

export function navigatePosOfflineAware(path: string, push: (p: string) => void): void {
  if (canUseSoftPosInAppNav(path)) {
    push(path)
    return
  }
  if (shouldUseHardNavigation(path)) {
    hardNavigatePos(path)
    return
  }
  push(path)
}

function hardNavigatePos(path: string): void {
  /** 로그인 → 홈은 history 에 로그인 폼을 남기지 않음 */
  if (isPosLoginPathname(typeof window !== 'undefined' ? window.location.pathname || '' : '')) {
    window.location.replace(path)
    return
  }
  window.location.assign(path)
}

export function replacePosOfflineAware(path: string, replace: (p: string) => void): void {
  if (canUseSoftPosInAppNav(path)) {
    replace(path)
    return
  }
  if (shouldUseHardNavigation(path)) {
    hardNavigatePos(path)
    return
  }
  replace(path)
}
