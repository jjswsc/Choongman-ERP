import { storeCodeSearchVariants } from '@/lib/pos-sales-store-filter'

/** 손익·통장·대차 등 JS 측 매장 매칭 (변형 허용) */
export function storeMatchesIncomeFilter(storeValue: string, filter: string): boolean {
  const a = String(storeValue || '').trim().toLowerCase()
  if (!filter || filter.trim().toLowerCase() === 'all') return true
  if (!a) return false
  for (const v of storeCodeSearchVariants(filter)) {
    const b = String(v || '').trim().toLowerCase()
    if (!b) continue
    if (a === b || a.includes(b) || b.includes(a)) return true
  }
  return false
}

export function sqlIlikeContains(term: string): string {
  const t = String(term || '').trim()
  if (!t) return '%'
  return `%${t.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
}

function incomeStoreSearchVariants(term: string): string[] {
  const raw = String(term || '').trim()
  if (!raw) return []
  return [...new Set([raw, ...storeCodeSearchVariants(raw)])].filter(Boolean)
}

/** PostgREST: 매장명·코드 변형 중 하나라도 ilike 일치 */
export function buildStoreFieldOrIlikeFragment(field: string, storeFilter: string): string {
  if (!storeFilter || storeFilter === 'All') return ''
  if (storeFilter === '입고등록') {
    return `${field}=ilike.${encodeURIComponent(sqlIlikeContains(storeFilter))}`
  }
  const variants = incomeStoreSearchVariants(storeFilter)
  if (variants.length === 1) {
    return `${field}=ilike.${encodeURIComponent(sqlIlikeContains(variants[0]))}`
  }
  const inner = variants.map((v) => `${field}.ilike.${encodeURIComponent(sqlIlikeContains(v))}`).join(',')
  return `or=(${inner})`
}
