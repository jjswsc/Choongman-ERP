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

/**
 * 로그인 매장 셀렉트: 표시명이 같으면 store_code 쪽을 남긴다.
 * (SaaS에서 store_name·store_code가 둘 다 users 키로 들어가면 "1001"이 두 줄로 보임)
 */
export function preferLoginStoreKey(
  a: string,
  b: string,
  storeLabels: Record<string, string>
): string {
  const la = labelForStore(storeLabels, a) || a
  const lb = labelForStore(storeLabels, b) || b
  const aIsCode = a !== la
  const bIsCode = b !== lb
  if (aIsCode && !bIsCode) return a
  if (bIsCode && !aIsCode) return b
  if (a.includes('_') && !b.includes('_')) return a
  if (b.includes('_') && !a.includes('_')) return b
  return a.length >= b.length ? a : b
}

/** 동일 표시명 키를 하나로 합친다. users / storeLabels / storeCompanies 를 제자리 수정. */
export function dedupeLoginUsersByDisplayLabel(
  users: Record<string, string[]>,
  storeLabels: Record<string, string>,
  storeCompanies?: Record<string, string>
): void {
  const byLabel = new Map<string, string[]>()
  for (const key of Object.keys(users)) {
    const label = normStoreKey(labelForStore(storeLabels, key) || key)
    if (!label) continue
    const g = byLabel.get(label) || []
    g.push(key)
    byLabel.set(label, g)
  }
  for (const members of byLabel.values()) {
    if (members.length <= 1) continue
    let primary = members[0]!
    for (const m of members.slice(1)) {
      primary = preferLoginStoreKey(primary, m, storeLabels)
    }
    for (const m of members) {
      if (m === primary) continue
      users[primary] = [...new Set([...(users[primary] || []), ...(users[m] || [])])]
      if (storeCompanies && !storeCompanies[primary] && storeCompanies[m]) {
        storeCompanies[primary] = storeCompanies[m]!
      }
      delete users[m]
      delete storeLabels[m]
      if (storeCompanies) delete storeCompanies[m]
    }
  }
}

/** 드롭다운용: 같은 표시명은 한 키만 (value는 preferLoginStoreKey). */
export function dedupeLoginStoreKeysByLabel(
  storeKeys: string[],
  storeLabels: Record<string, string>
): string[] {
  const byLabel = new Map<string, string>()
  for (const key of storeKeys) {
    const label = normStoreKey(labelForStore(storeLabels, key) || key)
    if (!label) continue
    const prev = byLabel.get(label)
    byLabel.set(label, prev ? preferLoginStoreKey(prev, key, storeLabels) : key)
  }
  const keep = new Set(byLabel.values())
  return storeKeys.filter((k) => keep.has(k))
}
