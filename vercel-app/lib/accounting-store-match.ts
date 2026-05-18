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
