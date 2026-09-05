import { shouldExcludeAdvanceFromLiveFloor } from '@/lib/pos-deposit-domain'
import { isDineInOrderForTableDisplay, normalizePosOrderTypeKey } from '@/lib/pos-sales-order-type-filter'
import { matchRequestedStoreCodeForTodaySales } from '@/lib/pos-today-sales-aggregate'
import { canonicalSalesStoreRowKey, storeCodeSearchVariants } from '@/lib/pos-sales-store-filter'
import {
  countsTowardExpectedSalesAddend,
  countsTowardUnpaidTableTotal,
} from '@/lib/pos-realtime-store-rows'

/** 미결제 좌석 조회에 쓰는 상태 — 주문 전량 스캔 없이 이 목록만 가져온다 */
export const POS_OPEN_TABLE_STATUSES = ['pending', 'cooking', 'ready', 'preparing', 'served'] as const

export const POS_OPEN_TABLE_ROW_SELECT =
  'created_at,store_code,status,total,order_type,table_name'

export type PosOpenTableTotals = {
  tableTotal: number
  expectedAddend: number
}

export type PosOpenTableOrderRow = {
  store_code?: string | null
  status?: string | null
  total?: number | string | null
  order_type?: string | null
  table_name?: string | null
  is_advance?: boolean | null
  scheduled_at?: string | null
  advance_checked_in_at?: string | null
}

export function emptyPosOpenTableTotals(): PosOpenTableTotals {
  return { tableTotal: 0, expectedAddend: 0 }
}

export function rowCountsTowardOpenTable(row: PosOpenTableOrderRow): boolean {
  if (shouldExcludeAdvanceFromLiveFloor(row)) return false
  const orderType = normalizePosOrderTypeKey(row.order_type)
  if (orderType === 'delivery' || orderType === 'takeout') return false
  if (orderType && orderType !== 'dine_in') return false
  if (!isDineInOrderForTableDisplay(row.order_type) && orderType !== '') return false
  if (!String(row.table_name ?? '').trim()) return false
  return countsTowardUnpaidTableTotal({
    status: row.status ?? undefined,
    total: Number(row.total) || 0,
  })
}

export function aggregateOpenTableTotalsFromRows(
  rows: PosOpenTableOrderRow[],
  storeCodes: string[] = []
): { total: PosOpenTableTotals; byStore: Record<string, PosOpenTableTotals> } {
  const requested = storeCodes.map((c) => String(c || '').trim()).filter(Boolean)
  const byStore: Record<string, PosOpenTableTotals> = {}
  for (const code of requested) byStore[code] = emptyPosOpenTableTotals()
  const total = emptyPosOpenTableTotals()

  for (const row of rows) {
    if (!rowCountsTowardOpenTable(row)) continue
    const amt = Number(row.total) || 0
    if (!Number.isFinite(amt) || amt === 0) continue
    const key =
      requested.length > 0
        ? matchRequestedStoreCodeForTodaySales(row.store_code, requested)
        : canonicalSalesStoreRowKey(String(row.store_code ?? '').trim() || '(미지정)')
    if (!key) continue
    if (!byStore[key]) byStore[key] = emptyPosOpenTableTotals()
    byStore[key].tableTotal += amt
    total.tableTotal += amt
    if (countsTowardExpectedSalesAddend({ status: row.status ?? undefined })) {
      byStore[key].expectedAddend += amt
      total.expectedAddend += amt
    }
  }
  return { total, byStore }
}

/** 차트 매장명(CM 접두·별칭)과 맞추기 위해 키를 펼친 미결제 합계 */
export function flattenOpenTableTotalLookup(
  byStore: Record<string, { tableTotal?: number }> | undefined
): Record<string, number> {
  const out: Record<string, number> = {}
  if (!byStore) return out
  for (const [code, row] of Object.entries(byStore)) {
    const amt = Number(row?.tableTotal ?? 0) || 0
    for (const key of storeCodeSearchVariants(code)) {
      const k = String(key || '').trim()
      if (!k) continue
      out[k] = Math.max(out[k] ?? 0, amt)
    }
  }
  return out
}
