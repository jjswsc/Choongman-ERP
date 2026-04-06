/**
 * PostgREST filter: VAT/WHT ledger `store_name` (null/빈 값은 매장 미지정 행).
 * All / * / 빈 문자열 → 필터 없음(전체).
 */
export function appendStoreNameFilter(baseFilter: string, storeFilter?: string | null): string {
  const s = String(storeFilter ?? "").trim()
  if (!s || s === "All" || s === "*") return baseFilter
  const part = `store_name=eq.${encodeURIComponent(s)}`
  return baseFilter ? `${baseFilter}&${part}` : part
}

/** accounting_filing_workflow_status.store_scope — '*' = 전사(통합) */
export function workflowStoreScopeFromStoreTb(storeTb: string): string {
  const s = String(storeTb ?? "").trim()
  if (!s || s === "All") return "*"
  return s
}
