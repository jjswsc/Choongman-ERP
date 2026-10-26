/**
 * POS 결산·일마감 주문 집계 창.
 * 현금·매출 일치는 오픈(판매) 영업일(created_at) — 회계 세금계산서일·현장(Fang) 요청.
 * paid_at 은 영수증·입금 확인용 표시에만 쓴다.
 */

export function buildPosSettlementOrdersDateFilters(
  startISO: string,
  endISOExclusive: string,
  storeCode: string
): { paidAtFilter: string; nullPaidCreatedFallbackFilter: string } {
  const store = `store_code=ilike.${encodeURIComponent(storeCode)}`
  /** 프로퍼티명 paidAtFilter 는 호출부 호환 — 실제 필터는 created_at */
  const createdAtFilter =
    `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}&${store}`
  /** 두 번째 조회는 비움(동일 창 중복 방지). id=eq.-1 은 매칭 없음 */
  const emptySecondary = `id=eq.-1&${store}`
  return { paidAtFilter: createdAtFilter, nullPaidCreatedFallbackFilter: emptySecondary }
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
