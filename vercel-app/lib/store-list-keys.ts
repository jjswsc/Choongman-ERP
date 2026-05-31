/** 매장 목록 키(코드)·표시명 — 클라이언트/서버 공통, DB 의존 없음 */

export function normStoreKey(s: string): string {
  return String(s || '').trim().toLowerCase()
}

/** SaaS `tenant / store` 등 슬래시 구분 표시명의 매장 구간(또는 원문) */
export function extractStoreDisplayTail(name: string): string {
  const t = String(name || '').trim()
  if (!t) return ''
  const idx = t.lastIndexOf(' / ')
  if (idx >= 0) return t.slice(idx + 3).trim()
  return t
}

export function addStoreNameAliasVariants(keys: Set<string>, value: string): void {
  const v = String(value || '').trim()
  if (!v) return
  keys.add(v)
  const tail = extractStoreDisplayTail(v)
  if (tail && tail !== v) keys.add(tail)
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
