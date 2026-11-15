import { NextRequest } from 'next/server'
import { calcSalesBonusPreviewForStores } from '@/lib/sales-bonus/calc-store-month-server'
import { listYearMonthsInclusive } from '@/lib/sales-bonus/period'
import type { SaasTenantScope } from '@/lib/saas-tenant-scope'

export type SalesBonusStatsMonthSlice = {
  month: string
  salesTotal: number
  bonusTotal: number
  penaltyTotal: number
  paidPeople: number
  empCount: number
}

export type SalesBonusStatsStoreRow = {
  storeCode: string
  enabled: boolean
  salesTotal: number
  bonusTotal: number
  penaltyTotal: number
  paidPeopleSum: number
  empCountMax: number
  months: SalesBonusStatsMonthSlice[]
}

export type SalesBonusStatsResult = {
  fromMonth: string
  toMonth: string
  months: string[]
  stores: SalesBonusStatsStoreRow[]
  totals: {
    salesTotal: number
    bonusTotal: number
    penaltyTotal: number
    storeCount: number
    monthCount: number
  }
}

/**
 * 여러 달력월 보너스·매출을 월별로 계산한 뒤 합산(통계).
 * 구간 보너스는 월 단위이므로 월별 계산 후 합산한다.
 */
export async function calcSalesBonusStatsForStores(params: {
  fromMonth: string
  toMonth: string
  storeCodes: string[]
  request?: NextRequest
  tenantScope?: SaasTenantScope | null
  maxMonths?: number
}): Promise<SalesBonusStatsResult> {
  const months = listYearMonthsInclusive(params.fromMonth, params.toMonth, params.maxMonths ?? 24)
  if (months.length === 0) {
    throw new Error('통계 기간이 올바르지 않습니다. (시작≤종료, 최대 24개월)')
  }
  const storeCodes = Array.from(
    new Set(params.storeCodes.map((s) => String(s || '').trim()).filter(Boolean))
  )
  if (storeCodes.length === 0) {
    return {
      fromMonth: months[0],
      toMonth: months[months.length - 1],
      months,
      stores: [],
      totals: { salesTotal: 0, bonusTotal: 0, penaltyTotal: 0, storeCount: 0, monthCount: months.length },
    }
  }

  const byStore = new Map<string, SalesBonusStatsStoreRow>()

  for (const month of months) {
    const previews = await calcSalesBonusPreviewForStores({
      month,
      storeCodes,
      request: params.request,
      tenantScope: params.tenantScope,
    })
    for (const st of previews) {
      let row = byStore.get(st.storeCode)
      if (!row) {
        row = {
          storeCode: st.storeCode,
          enabled: st.settings.enabled,
          salesTotal: 0,
          bonusTotal: 0,
          penaltyTotal: 0,
          paidPeopleSum: 0,
          empCountMax: 0,
          months: [],
        }
        byStore.set(st.storeCode, row)
      }
      row.enabled = st.settings.enabled
      const bonusTotal = st.employees.reduce((s, e) => s + (e.result.finalAmount || 0), 0)
      const penaltyTotal = st.employees.reduce((s, e) => s + (e.result.penaltyAmount || 0), 0)
      const paidPeople = st.employees.filter((e) => (e.result.finalAmount || 0) > 0).length
      const empCount = st.employees.length
      row.salesTotal += st.salesTotal || 0
      row.bonusTotal += bonusTotal
      row.penaltyTotal += penaltyTotal
      row.paidPeopleSum += paidPeople
      row.empCountMax = Math.max(row.empCountMax, empCount)
      row.months.push({
        month,
        salesTotal: st.salesTotal || 0,
        bonusTotal,
        penaltyTotal,
        paidPeople,
        empCount,
      })
    }
  }

  const stores = Array.from(byStore.values()).sort((a, b) =>
    a.storeCode.localeCompare(b.storeCode)
  )
  const totals = {
    salesTotal: stores.reduce((s, x) => s + x.salesTotal, 0),
    bonusTotal: stores.reduce((s, x) => s + x.bonusTotal, 0),
    penaltyTotal: stores.reduce((s, x) => s + x.penaltyTotal, 0),
    storeCount: stores.length,
    monthCount: months.length,
  }

  return {
    fromMonth: months[0],
    toMonth: months[months.length - 1],
    months,
    stores,
    totals,
  }
}
