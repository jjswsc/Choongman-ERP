/**
 * Omni POS 매장 코드 가드
 * - erp_stores.store_code 가 비면 과거 코드가 tenant:name (malatang01:1001) 을 만들어
 *   메뉴 스코프(1001)와 불일치 → POS 메뉴 0건이 됨
 */

/** malatang01:1001 → 1001 (tenant 접두 합성키 완화) */
export function stripTenantPrefixedStoreCode(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const colon = s.indexOf(':')
  if (colon <= 0 || colon >= s.length - 1) return s
  const left = s.slice(0, colon).trim()
  const right = s.slice(colon + 1).trim()
  if (!right || right.includes(':')) return s
  // tenant slug 형태(공백 없음) + 오른쪽이 운영 매장코드일 때만 분리
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(left)) return s
  return right
}

/** 합성키 여부 (저장 금지·경고용) */
export function isTenantPrefixedSyntheticStoreCode(raw: unknown): boolean {
  const s = String(raw ?? '').trim()
  if (!s || !s.includes(':')) return false
  return stripTenantPrefixedStoreCode(s) !== s
}

/** 스코프/요청 매장 코드 비교용 후보 (원본 + tenant 접두 제거) */
export function storeCodeIdentityForms(raw: unknown): string[] {
  const base = String(raw ?? '').trim()
  if (!base) return []
  const stripped = stripTenantPrefixedStoreCode(base)
  if (stripped && stripped.toLowerCase() !== base.toLowerCase()) {
    return [base, stripped]
  }
  return [base]
}

/** 메뉴 스코프 저장 전 정규화 — 합성키를 운영 코드로 축소·중복 제거 */
export function sanitizeMenuScopeStoreCodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const v of raw) {
    const code = stripTenantPrefixedStoreCode(v)
    if (!code) continue
    if (out.some((x) => x.toLowerCase() === code.toLowerCase())) continue
    out.push(code)
  }
  return out
}

/**
 * SaaS 매장 코드 확정.
 * 입력이 없으면 store_name 을 코드로 쓰고, tenant_name 합성은 쓰지 않는다.
 */
export function resolveErpStoreCodeForWrite(params: {
  storeCode?: string | null
  storeName?: string | null
  tenantId?: string | null
}): { ok: true; storeCode: string } | { ok: false; message: string } {
  const fromInput = stripTenantPrefixedStoreCode(params.storeCode)
  if (fromInput) {
    if (isTenantPrefixedSyntheticStoreCode(params.storeCode)) {
      return {
        ok: true,
        storeCode: fromInput,
      }
    }
    return { ok: true, storeCode: fromInput.slice(0, 64) }
  }
  const fromName = String(params.storeName ?? '').trim()
  if (fromName) {
    return { ok: true, storeCode: fromName.slice(0, 64) }
  }
  return {
    ok: false,
    message: '매장 코드(store_code)가 필요합니다. 예: 1001. tenant:매장명 형식은 사용할 수 없습니다.',
  }
}
