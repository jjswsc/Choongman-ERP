/**
 * 매출 API 공통: URL stores / 단일 pos 파싱, Supabase(PostgREST) store_code 필터 조각 생성.
 * - 0개: 필터 없음
 * - 1개: ilike (기존 동작 유지, 부분 일치)
 * - 2개 이상: in.(...) 정확 일치
 */
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

/**
 * 기존 filter 문자열(created_at=...) 뒤에 붙일 store 조건.
 * PostgREST: store_code=in.(a,b,c)
 */
export function appendStoreCodeFilter(baseFilter: string, stores: string[]): string {
  if (stores.length === 0) return baseFilter
  if (stores.length === 1) {
    return `${baseFilter}&store_code=ilike.${encodeURIComponent(stores[0])}`
  }
  const inner = stores.map((s) => String(s).trim()).filter(Boolean)
  const inClause = `in.(${inner.join(',')})`
  return `${baseFilter}&store_code=${encodeURIComponent(inClause)}`
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
