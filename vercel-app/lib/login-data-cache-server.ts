import 'server-only'

/** getLoginData 서버 캐시 — 스코프별(충만 global / Omni tenant) */

type LoginDataCachePayload = Record<string, unknown>

const cacheUntilByScope = new Map<string, number>()
const payloadByScope = new Map<string, LoginDataCachePayload>()

export function loginDataCacheScopeKey(scope: string): string {
  const s = String(scope || '').trim().toLowerCase() || 'legacy-global'
  return s
}

export function isLoginDataCacheValid(scope = 'legacy-global', now = Date.now()): boolean {
  const until = cacheUntilByScope.get(loginDataCacheScopeKey(scope)) ?? 0
  return until > now
}

export function getLoginDataCachedPayload<T extends LoginDataCachePayload>(
  scope = 'legacy-global'
): T | null {
  const key = loginDataCacheScopeKey(scope)
  if (!isLoginDataCacheValid(key)) return null
  return (payloadByScope.get(key) as T | undefined) ?? null
}

/** TTL 만료 후에도 실패 폴백용으로 마지막 payload 반환 */
export function getLoginDataStalePayload<T extends LoginDataCachePayload>(
  scope = 'legacy-global'
): T | null {
  const key = loginDataCacheScopeKey(scope)
  return (payloadByScope.get(key) as T | undefined) ?? null
}

export function markLoginDataCacheValid(
  ttlMs: number,
  scope = 'legacy-global',
  payload?: LoginDataCachePayload,
  now = Date.now()
): void {
  const key = loginDataCacheScopeKey(scope)
  cacheUntilByScope.set(key, now + ttlMs)
  if (payload) payloadByScope.set(key, payload)
}

export function invalidateLoginDataCache(): void {
  cacheUntilByScope.clear()
  payloadByScope.clear()
}
