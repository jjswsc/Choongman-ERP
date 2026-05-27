/**
 * 손익 매장 매출 — 매출 관리 `posSalesByStore` 와 동일 집계(영업일·total·완료 건).
 */
import { fetchPosSalesOrdersForBusinessRange } from '@/lib/pos-sales-fetch-rows'
import {
  aggregatePosSalesByPeriod,
  filterCompletedPosSalesRows,
} from '@/lib/pos-sales-period-aggregate'
import { isPosSalesBusinessYmdInInclusiveRange } from '@/lib/pos-sales-business-day-range'
import { resolvePosBusinessHoursFromContext } from '@/lib/pos-business-day-server'

export type PosSalesDayLine = { key: string; amount: number; label?: string }

export type PosSalesSumResult = {
  total: number
  completedCount: number
  truncated: boolean
  source: 'posSalesByStore'
  salesByDay: PosSalesDayLine[]
}

/**
 * 손익 매장 매출 — POS 완료 건 `total` 합계 + 영업일별 내역.
 * `posSalesByStore` API 와 동일한 fetch·필터·합산.
 */
export async function sumCompletedPosSalesTotal(params: {
  startStr: string
  endStr: string
  storeFilter: string
}): Promise<PosSalesSumResult> {
  const { rows, truncated, bizCtx } = await fetchPosSalesOrdersForBusinessRange({
    startStr: params.startStr,
    endStr: params.endStr,
    storeCodes:
      params.storeFilter && params.storeFilter !== 'All' ? [params.storeFilter] : undefined,
    queryLabel: 'incomeStatementPosSales',
  })

  const resolveHours = (storeCode: string) =>
    resolvePosBusinessHoursFromContext(bizCtx, storeCode)
  const completed = filterCompletedPosSalesRows(rows, null)
  const byDay = aggregatePosSalesByPeriod(completed, 'day', null, undefined, resolveHours)

  const salesByDay: PosSalesDayLine[] = []
  let total = 0
  let completedCount = 0
  for (const d of byDay) {
    if (!isPosSalesBusinessYmdInInclusiveRange(d.key, params.startStr, params.endStr)) continue
    total += d.total
    completedCount += d.count
    salesByDay.push({ key: d.key, amount: d.total, label: d.key })
  }

  return {
    total,
    completedCount,
    truncated,
    source: 'posSalesByStore',
    salesByDay,
  }
}
