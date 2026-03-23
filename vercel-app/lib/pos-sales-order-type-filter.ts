/** pos_orders.order_type — 매출 집계 API 공통 필터 */

export const POS_ORDER_TYPE_DB_VALUES = ['dine_in', 'takeout', 'delivery'] as const
export type PosOrderTypeValue = (typeof POS_ORDER_TYPE_DB_VALUES)[number]

const ALLOWED = new Set<string>(POS_ORDER_TYPE_DB_VALUES)

/**
 * 쿼리 `orderTypes=dine_in,takeout` 파싱.
 * 없거나 비어 있으면 필터 없음(전체).
 */
export function parseOrderTypesParam(raw: string | null | undefined): PosOrderTypeValue[] | null {
  if (raw == null || !String(raw).trim()) return null
  const out: PosOrderTypeValue[] = []
  for (const p of String(raw).split(',')) {
    const s = p.trim()
    if (ALLOWED.has(s)) out.push(s as PosOrderTypeValue)
  }
  return out.length > 0 ? out : null
}

export function rowMatchesOrderFilter(
  orderType: string | undefined,
  allowed: PosOrderTypeValue[] | null
): boolean {
  if (allowed == null) return true
  const t = String(orderType ?? '').trim()
  return (allowed as readonly string[]).includes(t)
}

/** URL·state용: 빈 문자열 = 필터 없음(전체) */
export function normalizeOrderTypesQueryString(raw: string | null | undefined): string {
  const p = parseOrderTypesParam(raw)
  if (!p?.length) return ''
  return [...p].sort().join(',')
}
