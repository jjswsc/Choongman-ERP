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

export type PosSalesDayLine = {
  key: string
  /** POS 결제 total (VAT 포함·별도 반영된 고객 매출액) */
  amount: number
  /** total − vat 근사 (공급가 환산) */
  amountNet: number
  label?: string
}

export type PosSalesSumResult = {
  total: number
  totalNet: number
  totalVat: number
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
  /** Omni JWT tenantId — 없으면 storeFilter 로 추론 */
  tenantId?: string
}): Promise<PosSalesSumResult> {
  const { resolveSaasTenantScope } = await import('@/lib/saas-tenant-scope')
  const tenantScope = await resolveSaasTenantScope({
    auth: params.tenantId ? { tenantId: params.tenantId } : null,
    storeCode:
      params.storeFilter && params.storeFilter !== 'All' ? params.storeFilter : null,
  })
  const { rows, truncated, bizCtx } = await fetchPosSalesOrdersForBusinessRange({
    startStr: params.startStr,
    endStr: params.endStr,
    storeCodes:
      params.storeFilter && params.storeFilter !== 'All' ? [params.storeFilter] : undefined,
    queryLabel: 'incomeStatementPosSales',
    tenantScope,
  })

  const resolveHours = (storeCode: string) =>
    resolvePosBusinessHoursFromContext(bizCtx, storeCode)
  const completed = filterCompletedPosSalesRows(rows, null)
  const byDay = aggregatePosSalesByPeriod(completed, 'day', null, undefined, resolveHours)

  const salesByDay: PosSalesDayLine[] = []
  let total = 0
  let totalNet = 0
  let totalVat = 0
  let completedCount = 0
  for (const d of byDay) {
    if (!isPosSalesBusinessYmdInInclusiveRange(d.key, params.startStr, params.endStr)) continue
    const dayVat = Math.max(0, Number(d.vat) || 0)
    const dayGross = Math.max(0, Number(d.total) || 0)
    const dayNet = Math.max(0, dayGross - dayVat)
    total += dayGross
    totalNet += dayNet
    totalVat += dayVat
    completedCount += d.count
    salesByDay.push({ key: d.key, amount: dayGross, amountNet: dayNet, label: d.key })
  }

  return {
    total,
    totalNet,
    totalVat,
    completedCount,
    truncated,
    source: 'posSalesByStore',
    salesByDay,
  }
}
