/**
 * 재무제표 기간 비교(월별·연도별)용 집계.
 */

import type { BalanceSheetData, IncomeStatementData } from '@/lib/api-client'

export const FINANCIAL_COMPARE_MAX_MONTHS = 48

export type IncomeCompareYearAgg = {
  year: string
  sales: number
  purchases: number
  expenses: number
  grossProfit: number
  netProfit: number
  cogs: number
}

/** 월별 손익 행의 매출원가(시스템 값; 수동 오버라이드 없음) */
export function incomeStatementCogs(data: IncomeStatementData): number {
  if (data.cogs != null && Number.isFinite(Number(data.cogs))) return Number(data.cogs) || 0
  return (
    (Number(data.beginningInventory) || 0) +
    (Number(data.purchases) || 0) -
    (Number(data.endingInventory) || 0)
  )
}

export function aggregateIncomeStatementByYear(
  rows: { ym: string; data: IncomeStatementData }[]
): IncomeCompareYearAgg[] {
  const map = new Map<
    string,
    { sales: number; purchases: number; expenses: number; grossProfit: number; netProfit: number; cogs: number }
  >()
  for (const { ym, data } of rows) {
    if (data.error) continue
    const y = ym.slice(0, 4)
    const cur = map.get(y) ?? { sales: 0, purchases: 0, expenses: 0, grossProfit: 0, netProfit: 0, cogs: 0 }
    cur.sales += Number(data.sales) || 0
    cur.purchases += Number(data.purchases) || 0
    cur.expenses += Number(data.expenses) || 0
    cur.grossProfit += Number(data.grossProfit) || 0
    cur.netProfit += Number(data.netProfit) || 0
    cur.cogs += incomeStatementCogs(data)
    map.set(y, cur)
  }
  return [...map.keys()]
    .sort()
    .map((year) => ({ year, ...map.get(year)! }))
}

export type BalanceYearSnap = { year: string; ym: string; data: BalanceSheetData }

/** 범위 내 각 연도마다 가장 늦은 월의 재무상태표 스냅샷 */
export function pickBalanceSheetLastMonthPerYear(
  rows: { ym: string; data: BalanceSheetData }[]
): BalanceYearSnap[] {
  const best = new Map<string, { ym: string; data: BalanceSheetData }>()
  for (const { ym, data } of rows) {
    const year = ym.slice(0, 4)
    const prev = best.get(year)
    if (!prev || ym > prev.ym) best.set(year, { ym, data })
  }
  return [...best.keys()].sort().map((year) => {
    const x = best.get(year)!
    return { year, ym: x.ym, data: x.data }
  })
}
