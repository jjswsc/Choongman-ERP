/**
 * POS·ERP 로그인 「서버에 연결 중」함정 방지.
 *
 * 매장 홀 태블릿은 거의 전부 Android PWA(홈 화면) + 저장된 세션이다.
 * 스피너가 로그인 폼을 통째로 가리면, 세션 복구용 client router 가 멈추는 순간
 * 전 매장이 같은 화면에서 조작 불능이 된다. 폼은 절대 가리지 않는다.
 */

export const LOGIN_CONNECTING_REPLACES_FORM = false
export const LOGIN_CONNECTING_WATCHDOG_MS = 8_000
export const LOGIN_SESSION_REDIRECT_HARD_NAV_MS = 2_000
export const LOGIN_SESSION_REDIRECT_BOUNCE_KEY = 'cm_login_session_redirect_at'
export const LOGIN_SESSION_REDIRECT_BOUNCE_MS = 8_000
export const LOGIN_LIST_FETCH_TIMEOUT_DESKTOP_MS = 60_000
export const LOGIN_LIST_FETCH_TIMEOUT_KIOSK_MS = 12_000
export const LOGIN_LIST_FETCH_TIMEOUT_HYBRID_OFFLINE_MS = 3_000

export type LoginBootPhase = 'wait_auth' | 'redirect_session' | 'load_list'

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

export function shouldHardNavigateLoginSessionRedirect(opts: {
  isHybridShell: boolean
  isStandaloneDisplay: boolean
  userAgent: string
}): boolean {
  if (opts.isHybridShell) return true
  if (opts.isStandaloneDisplay) return true
  if (/Android/i.test(opts.userAgent || '')) return true
  return false
}

export function loginListFetchTimeoutMs(opts: {
  hybridOfflineFastPath: boolean
  kioskClient: boolean
}): number {
  if (opts.hybridOfflineFastPath) return LOGIN_LIST_FETCH_TIMEOUT_HYBRID_OFFLINE_MS
  if (opts.kioskClient) return LOGIN_LIST_FETCH_TIMEOUT_KIOSK_MS
  return LOGIN_LIST_FETCH_TIMEOUT_DESKTOP_MS
}
