import { loadErpStoreMatchIndex, type ErpStoreMatchIndex } from '@/lib/erp-store-identity'
import { matchesAccountingStoreScopeRow } from '@/lib/accounting-store-row-match'
import { storeCodeSearchVariants } from '@/lib/pos-sales-store-filter'

const MATCH_INDEX_TTL_MS = 5 * 60 * 1000
let matchIndexCache: ErpStoreMatchIndex | null = null
let matchIndexCacheAt = 0

/** erp_stores 로드 후 재무·원장 매칭에 공통 사용 */
export async function ensureErpStoreMatchIndex(): Promise<ErpStoreMatchIndex> {
  if (matchIndexCache && Date.now() - matchIndexCacheAt < MATCH_INDEX_TTL_MS) {
    return matchIndexCache
  }
  matchIndexCache = await loadErpStoreMatchIndex()
  matchIndexCacheAt = Date.now()
  return matchIndexCache
}

function storeMatchesIncomeFilterLegacy(storeValue: string, filter: string): boolean {
  const a = String(storeValue || '').trim().toLowerCase()
  if (!filter || filter.trim().toLowerCase() === 'all') return true
  if (!a) return false
  const terms = storeFilterSearchTerms(filter)
  const searchTerms = terms.length > 0 ? terms : [filter]
  for (const term of searchTerms) {
    for (const v of storeCodeSearchVariants(term)) {
      const b = String(v || '').trim().toLowerCase()
      if (!b) continue
      if (a === b || a.includes(b) || b.includes(a)) return true
    }
  }
  return false
}

/** 손익·통장·시산 — erp_stores 단일 store_code 기준(마스터 없으면 CM 접두 폴백) */
export function storeMatchesIncomeFilterWithIndex(
  storeValue: string,
  filter: string,
  index: ErpStoreMatchIndex
): boolean {
  if (!filter || filter.trim().toLowerCase() === 'all') return true
  const v = String(storeValue || '').trim()
  if (!v) return false
  const terms = storeFilterSearchTerms(filter)
  if (terms.length > 1) {
    return terms.some((f) => matchesAccountingStoreScopeRow(v, f, index.masters, index.legacyToCanonical))
  }
  return matchesAccountingStoreScopeRow(v, filter, index.masters, index.legacyToCanonical)
}

/** @deprecated 가능하면 ensureErpStoreMatchIndex + storeMatchesIncomeFilterWithIndex 사용 */
export function storeMatchesIncomeFilter(storeValue: string, filter: string): boolean {
  if (matchIndexCache && Date.now() - matchIndexCacheAt < MATCH_INDEX_TTL_MS) {
    return storeMatchesIncomeFilterWithIndex(storeValue, filter, matchIndexCache)
  }
  return storeMatchesIncomeFilterLegacy(storeValue, filter)
}

export function sqlIlikeContains(term: string): string {
  const t = String(term || '').trim()
  if (!t) return '%'
  return `%${t.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
}

/**
 * 손익·원장 storeFilter 검색어.
 * 가맹 「복수 매장」은 `A,B,C` 형태 — 통째로 ilike 하면 PostgREST or=() 콤마와 충돌(PGRST100).
 */
export function storeFilterSearchTerms(storeFilter: string): string[] {
  const s = String(storeFilter || '').trim()
  if (!s || s === 'All' || s === '전체' || s === '*') return []
  if (!s.includes(',')) return [s]
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of s.split(',')) {
    const v = String(part || '').trim()
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out.length > 0 ? out : [s]
}

function incomeStoreSearchVariants(term: string): string[] {
  const raw = String(term || '').trim()
  if (!raw) return []
  return [...new Set([raw, ...storeCodeSearchVariants(raw)])].filter(Boolean)
}

/** PostgREST: 매장명·코드 변형 중 하나라도 ilike 일치 (복수 매장은 OR) */
export function buildStoreFieldOrIlikeFragment(field: string, storeFilter: string): string {
  if (!storeFilter || storeFilter === 'All') return ''
  if (storeFilter === '입고등록') {
    return `${field}=ilike.${encodeURIComponent(sqlIlikeContains(storeFilter))}`
  }
  const terms = storeFilterSearchTerms(storeFilter)
  if (terms.length === 0) return ''
  const variants = [...new Set(terms.flatMap((t) => incomeStoreSearchVariants(t)))].filter(Boolean)
  if (variants.length === 0) return ''
  if (variants.length === 1) {
    return `${field}=ilike.${encodeURIComponent(sqlIlikeContains(variants[0]!))}`
  }
  const inner = variants.map((v) => `${field}.ilike.${encodeURIComponent(sqlIlikeContains(v))}`).join(',')
  return `or=(${inner})`
}
