/**
 * POS·ERP 로그인 「서버에 연결 중」함정 방지.
 *
 * 매장 홀 태블릿은 거의 전부 Android PWA(홈 화면) + 저장된 세션이다.
 * 스피너가 로그인 폼을 통째로 가리면, 세션 복구용 client router 가 멈추는 순간
 * 전 매장이 같은 화면에서 조작 불능이 된다. 폼은 절대 가리지 않는다.
 */

export const LOGIN_CONNECTING_REPLACES_FORM = false
export const LOGIN_CONNECTING_WATCHDOG_MS = 8_000
/** 세션 스토리지 읽기가 멈추면 목록 로드로 넘어간다 */
export const LOGIN_AUTH_INIT_WATCHDOG_MS = 2_500
export const LOGIN_SESSION_REDIRECT_HARD_NAV_MS = 2_000
/** Android·화웨이에서 location.replace('/pos') 가 네트워크 대기만 하는 경우 폼을 되돌림 */
export const LOGIN_SESSION_REDIRECT_HANG_MS = 4_000
export const LOGIN_SESSION_REDIRECT_BOUNCE_KEY = 'cm_login_session_redirect_at'
export const LOGIN_SESSION_REDIRECT_BOUNCE_MS = 8_000
export const LOGIN_LIST_FETCH_TIMEOUT_DESKTOP_MS = 60_000
export const LOGIN_LIST_FETCH_TIMEOUT_KIOSK_MS = 12_000
export const LOGIN_LIST_FETCH_TIMEOUT_HYBRID_OFFLINE_MS = 3_000

export type LoginBootPhase = 'wait_auth' | 'redirect_session' | 'load_list'

export type KioskClientSignals = {
  isHybridShell: boolean
  isStandaloneDisplay: boolean
  userAgent: string
  maxTouchPoints?: number
  pointerCoarse?: boolean
}

export function resolveLoginBootPhase(opts: {
  authInitialized: boolean
  hasSession: boolean
  stayOnLoginForm: boolean
}): LoginBootPhase {
  if (!opts.authInitialized) return 'wait_auth'
  if (opts.hasSession && !opts.stayOnLoginForm) return 'redirect_session'
  return 'load_list'
}

/** 세션 복구 직후 /pos 로 보냈다가 로그인으로 되돌아온 경우 — 재리다이렉트 루프 차단 */
export function isLoginSessionRedirectBounce(storedAt: string | null, now = Date.now()): boolean {
  const t = Number(storedAt || '')
  return Number.isFinite(t) && t > 0 && now - t < LOGIN_SESSION_REDIRECT_BOUNCE_MS
}

export function isStillOnLoginPath(pathname: string): boolean {
  const path = (pathname || '').replace(/\/+$/, '') || '/'
  return (
    path === '/login' ||
    path === '/admin/login' ||
    path === '/pos/login' ||
    path === '/saas-admin/login'
  )
}

export function readKioskClientSignals(): Omit<KioskClientSignals, 'isHybridShell'> {
  if (typeof window === 'undefined') {
    return { isStandaloneDisplay: false, userAgent: '', maxTouchPoints: 0, pointerCoarse: false }
  }
  return {
    isStandaloneDisplay:
      typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    maxTouchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0,
    pointerCoarse:
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
  }
}

/**
 * 홀 태블릿·PWA·하이브리드. 화웨이는 「데스크톱 사이트」UA(Windows)로 위장하는 경우가 많아
 * 터치 신호도 같이 본다.
 */
export function isKioskLikeClient(opts: KioskClientSignals): boolean {
  if (opts.isHybridShell) return true
  if (opts.isStandaloneDisplay) return true
  if (/Android/i.test(opts.userAgent || '')) return true
  if ((opts.maxTouchPoints ?? 0) > 1) return true
  if (opts.pointerCoarse) return true
  return false
}

export function shouldHardNavigateLoginSessionRedirect(opts: KioskClientSignals): boolean {
  return isKioskLikeClient(opts)
}

export function detectKioskLikeClient(isHybridShell = false): boolean {
  return isKioskLikeClient({
    isHybridShell,
    ...readKioskClientSignals(),
  })
}

export function loginListFetchTimeoutMs(opts: {
  hybridOfflineFastPath: boolean
  kioskClient: boolean
}): number {
  if (opts.hybridOfflineFastPath) return LOGIN_LIST_FETCH_TIMEOUT_HYBRID_OFFLINE_MS
  if (opts.kioskClient) return LOGIN_LIST_FETCH_TIMEOUT_KIOSK_MS
  return LOGIN_LIST_FETCH_TIMEOUT_DESKTOP_MS
}

/** 키오스크는 느린 재시도로 스피너를 24초까지 끌지 않는다 */
export function loginListFetchMaxAttempts(opts: { kioskClient: boolean; hybridOfflineFastPath: boolean }): number {
  if (opts.hybridOfflineFastPath || opts.kioskClient) return 1
  return 2
}
