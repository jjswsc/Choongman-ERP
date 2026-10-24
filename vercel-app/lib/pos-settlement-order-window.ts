/**
 * POS 결산·일마감 주문 집계 창.
 * EDC·돈통 대사와 맞추기 위해 결제 시각(paid_at) 우선, paid_at 없으면 created_at 폴백.
 */

export function buildPosSettlementOrdersDateFilters(
  startISO: string,
  endISOExclusive: string,
  storeCode: string
): { paidAtFilter: string; nullPaidCreatedFallbackFilter: string } {
  const store = `store_code=ilike.${encodeURIComponent(storeCode)}`
  const paidAtFilter =
    `paid_at=gte.${encodeURIComponent(startISO)}&paid_at=lt.${encodeURIComponent(endISOExclusive)}&${store}`
  const nullPaidCreatedFallbackFilter =
    `paid_at=is.null&created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}&${store}`
  return { paidAtFilter, nullPaidCreatedFallbackFilter }
}

/** id 기준 병합. select에 id가 없으면 단순 연결(중복 가능). */
export function mergeSettlementOrderRowsById<T extends { id?: number | string | null }>(
  primary: T[] | null | undefined,
  fallback: T[] | null | undefined
): T[] {
  const primaryRows = primary || []
  const fallbackRows = fallback || []
  const out = new Map<string, T>()
  let anyId = false
  for (const row of primaryRows) {
    const id = row.id
    if (id == null || id === '') continue
    anyId = true
    out.set(String(id), row)
  }
  for (const row of fallbackRows) {
    const id = row.id
    if (id == null || id === '') continue
    anyId = true
    if (!out.has(String(id))) out.set(String(id), row)
  }
  if (!anyId) return [...primaryRows, ...fallbackRows]
  return [...out.values()]
}
