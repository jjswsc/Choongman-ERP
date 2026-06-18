import 'server-only'

/** getLoginData 서버 캐시 — SaaS 매장 생성·비활성화 직후 로그인 목록 즉시 반영 */
let loginDataCacheUntil = 0

export function isLoginDataCacheValid(now = Date.now()): boolean {
  return loginDataCacheUntil > now
}

export function markLoginDataCacheValid(ttlMs: number, now = Date.now()): void {
  loginDataCacheUntil = now + ttlMs
}

export function invalidateLoginDataCache(): void {
  loginDataCacheUntil = 0
}
