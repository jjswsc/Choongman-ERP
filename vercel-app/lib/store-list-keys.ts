/** 매장 목록 키(코드)·표시명 — 클라이언트/서버 공통, DB 의존 없음 */

export function normStoreKey(s: string): string {
  return String(s || '').trim().toLowerCase()
}

/**
 * DB의 레거시 매장 문자열·이미 코드인 값을 드롭다운 value(store_code)로 맞춤.
 */
export function resolveStoreListKey(
  raw: string,
  storeCodes: string[],
  legacyToCanonical: Record<string, string>
): string {
  const t = String(raw || '').trim()
  if (!t) return t
  const nk = normStoreKey(t)
  const c = legacyToCanonical[nk]
  if (c && storeCodes.includes(c)) return c
  if (storeCodes.includes(t)) return t
  return t
}

export function labelForStore(storeLabels: Record<string, string>, code: string): string {
  const c = String(code || '').trim()
  if (!c) return ''
  return storeLabels[c] || c
}
