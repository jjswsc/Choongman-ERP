import { addDayBangkok, diffDaysInclusiveBangkok } from '@/lib/attendance-utils'

/** 매출 RPC 한 번에 넘기는 영업일 수. 이보다 길면 statement timeout(57014)으로 빈 결과처럼 보인다. */
export const POS_SALES_ANALYTICS_RPC_CHUNK_DAYS = 31

/** 이보다 짧게 나눠도 시간 초과면 더 쪼개지 않고 오류를 올린다. */
export const POS_SALES_ANALYTICS_RPC_MIN_CHUNK_DAYS = 7

const SUM_KEYS = [
  'order_count',
  'subtotal',
  'vat',
  'discount',
  'service_amt',
  'total',
  'guest_sum',
  'dine_in_order_count',
  'dine_in_total',
  'dine_in_guest_sum',
  'menu_qty',
  'cash_sales',
  'credit_sales',
  'qr_sales',
  'other_sales',
  'delivery_app_sales',
  'crypto_sales',
] as const

export type PosSalesAnalyticsAggMergeRow = {
  bucket_key?: string | null
  bucket_key2?: string | null
  payment_key?: string | null
} & Partial<Record<(typeof SUM_KEYS)[number], number | string | null>>

function num(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** 포함 구간을 chunkDays일 단위로 나눈다. 구간은 겹치지 않고 빈 날도 없다. */
export function splitPosSalesAnalyticsYmdChunks(
  startStr: string,
  endStr: string,
  chunkDays = POS_SALES_ANALYTICS_RPC_CHUNK_DAYS
): { startStr: string; endStr: string }[] {
  const start = startStr.trim().slice(0, 10)
  const end = endStr.trim().slice(0, 10)
  const size = Math.max(1, Math.trunc(chunkDays))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return [{ startStr: start, endStr: end }]
  }
  const lo = start <= end ? start : end
  const hi = start <= end ? end : start
  if (diffDaysInclusiveBangkok(lo, hi) <= size) {
    return [{ startStr: lo, endStr: hi }]
  }
  const out: { startStr: string; endStr: string }[] = []
  let cursor = lo
  for (let guard = 0; guard < 400 && cursor <= hi; guard++) {
    const tentative = addDayBangkok(cursor, size - 1)
    const chunkEnd = tentative > hi ? hi : tentative
    out.push({ startStr: cursor, endStr: chunkEnd })
    if (chunkEnd >= hi) break
    cursor = addDayBangkok(chunkEnd, 1)
  }
  return out
}

/** 나눠 조회한 RPC 행을 버킷 키 기준으로 합친다. 주·시간대·요일 버킷도 같은 키면 더해진다. */
export function mergePosSalesAnalyticsAggRows<T extends PosSalesAnalyticsAggMergeRow>(rows: T[]): T[] {
  const map = new Map<string, T>()
  for (const row of rows) {
    const key = `${row.bucket_key ?? ''}\t${row.bucket_key2 ?? ''}\t${row.payment_key ?? ''}`
    const prev = map.get(key)
    if (!prev) {
      map.set(key, { ...row })
      continue
    }
    const target = prev as Record<string, unknown>
    for (const field of SUM_KEYS) {
      target[field] = num(prev[field]) + num(row[field])
    }
  }
  return [...map.values()]
}
