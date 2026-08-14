/**
 * 매출 API 공통: URL stores / 단일 pos 파싱, Supabase(PostgREST) store_code 필터 조각 생성.
 * - 0개: 필터 없음
 * - 1개 이상: erp_stores 별칭·Grab ID·CM 접두 등을 펼친 뒤 `in.(...)` 정확 일치(동일 주문 이중집계 없음)
 */
import { isOfficeStoreVariant } from '@/lib/office-store-canonical'

export function parseStoreList(raw: string | null): string[] {
  return String(raw ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

/** pos 단일 + stores 병합 (stores 우선) */
export function resolveStoresFromParams(pos: string | null | undefined, storesRaw: string | null): string[] {
  const fromStores = parseStoreList(storesRaw)
  if (fromStores.length > 0) return fromStores
  const p = String(pos ?? '').trim()
  if (p && p !== 'All') return [p]
  return []
}

/** 조회·RPC에 넘길 store_code 목록 (CM 접두 등 표기 차이 펼침, 대소문자 중복 제거) */
export function expandSalesStoreCodesForFilter(stores: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const s of stores) {
    for (const v of storeCodeSearchVariants(s)) {
      const t = String(v ?? '').trim()
      if (!t) continue
      const k = t.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push(t)
    }
  }
  return out
}

/** erp_stores 별칭·Grab ID 포함 — 매출 API 권장 */
export async function expandSalesStoreCodesForFilterAsync(stores: string[]): Promise<string[]> {
  if (!stores.length) return []
  return expandSalesStoreCodesForFilter(stores)
}

/**
 * 기존 filter 문자열(created_at=...) 뒤에 붙일 store 조건.
 * PostgREST: store_code=in.(a,b,c)
 */
export function appendStoreCodeFilterFromExpanded(baseFilter: string, expanded: string[]): string {
  if (expanded.length === 0) return baseFilter
  const inner = expanded.join(',')
  const inClause = `in.(${inner})`
  return `${baseFilter}&store_code=${encodeURIComponent(inClause)}`
}

export function appendStoreCodeFilter(baseFilter: string, stores: string[]): string {
  return appendStoreCodeFilterFromExpanded(baseFilter, expandSalesStoreCodesForFilter(stores))
}

export async function appendStoreCodeFilterAsync(baseFilter: string, stores: string[]): Promise<string> {
  const expanded = await expandSalesStoreCodesForFilterAsync(stores)
  return appendStoreCodeFilterFromExpanded(baseFilter, expanded)
}

/**
 * POS `store_code`와 ERP 매장 목록 문자열이 어긋날 때(getPosOrders와 동일).
 * 예: 목록은 "Asoke", DB는 "CM Asoke" 또는 반대.
 */
export function storeCodeSearchVariants(primary: string): string[] {
  const s = String(primary || "").trim()
  if (!s) return []
  const out: string[] = []
  const seen = new Set<string>()
  const add = (v: string) => {
    const x = v.trim()
    if (!x || seen.has(x.toLowerCase())) return
    seen.add(x.toLowerCase())
    out.push(x)
  }
  add(s)
  const withCm = s.toUpperCase().startsWith("CM ") ? s.slice(3).trim() : `CM ${s}`.trim()
  add(withCm)
  add(s.replace(/^CM\s+/i, "").trim())
  return out
}

function buildExpandedStoreMatchSet(expanded: string[]): Set<string> {
  const out = new Set<string>()
  for (const code of expanded) {
    for (const v of storeCodeSearchVariants(code)) {
      const t = String(v || '').trim().toLowerCase()
      if (t) out.add(t)
    }
  }
  return out
}

/** DB store_code가 펼친 후보 집합에 포함되면 true */
export function rowMatchesExpandedStoreFilter(dbStoreCode: unknown, expandedStoreCodes: string[]): boolean {
  const raw = String(dbStoreCode ?? '').trim()
  if (!raw || expandedStoreCodes.length === 0) return false
  const matchSet = buildExpandedStoreMatchSet(expandedStoreCodes)
  for (const v of storeCodeSearchVariants(raw)) {
    if (matchSet.has(String(v || '').trim().toLowerCase())) return true
  }
  return false
}

/** DB `store_code`가 매출 화면에서 선택한 코드와 동일 매장 계열이면 true (CM 접두·표기 차이) */
export function rowMatchesSalesStoreSelection(dbStoreCode: unknown, selectedCode: string): boolean {
  const a = String(dbStoreCode ?? '').trim()
  const b = String(selectedCode ?? '').trim()
  if (!a || !b) return false
  if (a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0) return true
  const setA = new Set(storeCodeSearchVariants(a).map((x) => x.toLowerCase()))
  const setB = new Set(storeCodeSearchVariants(b).map((x) => x.toLowerCase()))
  for (const x of setA) {
    if (setB.has(x)) return true
  }
  return false
}

export function rowMatchesAnySalesStoreSelection(
  dbStoreCode: unknown,
  selectedCodes: string[],
  expandedStoreCodes?: string[]
): boolean {
  if (expandedStoreCodes?.length) {
    return rowMatchesExpandedStoreFilter(dbStoreCode, expandedStoreCodes)
  }
  return selectedCodes.some((code) => rowMatchesSalesStoreSelection(dbStoreCode, code))
}

/**
 * 매장별 집계 행 키 통합: `Ekkamai` / `CM Ekkamai` 등을 한 줄로 합칠 때 사용.
 * CM 접두가 있으면 그 표기를 우선, 없으면 사전순 첫 변형.
 */
export function canonicalSalesStoreRowKey(storeCode: string): string {
  const raw = String(storeCode ?? '').trim()
  if (!raw || raw === '(미지정)') return raw || '(미지정)'
  const variants = storeCodeSearchVariants(raw)
  const withCm = variants.filter((v) => /^CM\s+/i.test(v))
  const pool = withCm.length > 0 ? withCm : variants
  return pool.slice().sort((a, b) => a.localeCompare(b))[0] ?? raw
}

const MIN_BANK_STORE_TOKEN_LEN = 3

function normalizeBankStoreHaystack(text: string): string {
  return ` ${String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0e00-\u0e7f가-힣]+/gi, ' ')
    .trim()} `
}

/** 적요에 매장명(CM 접두 제외, 3글자 이상)이 단어로 들어 있으면 true */
export function salesStoreMentionedInText(text: string, storeCode: string): boolean {
  const hay = normalizeBankStoreHaystack(text)
  if (hay === '  ') return false
  const seen = new Set<string>()
  for (const variant of storeCodeSearchVariants(storeCode)) {
    const token = String(variant || '')
      .replace(/^CM\s+/i, '')
      .trim()
      .toLowerCase()
    if (token.length < MIN_BANK_STORE_TOKEN_LEN || seen.has(token)) continue
    seen.add(token)
    if (hay.includes(` ${token} `)) return true
  }
  return false
}

/** 적요가 후보 매장 중 정확히 1곳만 가리키면 그 매장. 아니면 빈 문자열 */
export function inferSalesStoreFromBankText(text: string, storeCodes: string[]): string {
  const codes = [...new Set((storeCodes || []).map((s) => String(s || '').trim()).filter(Boolean))]
  if (codes.length === 0) return ''
  const hits = codes.filter((s) => salesStoreMentionedInText(text, s))
  return hits.length === 1 ? hits[0]! : ''
}

/** 통장 행 매장: store_name → store → (선택 매장 후보 중) 적요 유일 매칭. 추측 귀속 없음 */
export function resolveBankRowStoreName(params: {
  storeName?: string | null
  store?: string | null
  memo?: string | null
  note?: string | null
  storeCodes?: string[]
}): string {
  const named = String(params.storeName || '').trim() || String(params.store || '').trim()
  if (named && !isOfficeStoreVariant(named)) return named
  return inferSalesStoreFromBankText(
    `${params.memo || ''} ${params.note || ''}`,
    params.storeCodes || []
  )
}
