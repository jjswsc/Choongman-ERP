/**
 * 재무제표 조회 스냅샷 — 워크스페이스 탭 전환·keep-alive remount 시 복구.
 * (fiber state가 비어도 검색 조건·결과가 유지되도록)
 *
 * 주의: remount 직후 queryToken=0 초기 렌더에서 clear하지 말 것.
 */

import { createErpQueryViewCache } from "@/lib/erp-query-view-cache"
import type { BalanceSheetData } from "@/lib/api-client/balance-sheet"
import type { IncomeStatementData } from "@/lib/api-client/income-statement"
import type { IncomeStatementMonthManualOverrides } from "@/lib/income-statement-month-overrides"

export type FinancialStatementsTabId = "income" | "balance" | "reconcile" | "margin"

export type FinancialStatementsPageViewCache = {
  /** 필터 바 초안(검색 버튼 전에도 바뀔 수 있음) */
  yearMonthStart: string
  yearMonthEnd: string
  storeFilter: string
  /** 마지막 검색으로 확정된 조건 — 탭 조회는 이 값만 사용 */
  appliedYearMonthStart?: string
  appliedYearMonthEnd?: string
  appliedStoreFilter?: string
  queryToken: number
  tab: FinancialStatementsTabId
}

export type IncomeStatementCompareCacheRow = {
  ym: string
  data: IncomeStatementData
} & IncomeStatementMonthManualOverrides

export type IncomeStatementViewCache = {
  /** `${start}|${end}|${store}|exp:${0|1}` */
  cacheKey: string
  data: IncomeStatementData | null
  compareIncomeRows: IncomeStatementCompareCacheRow[]
  compareFetchError: string | null
  showExpenseDetails?: boolean
}

export type BalanceSheetViewCache = {
  cacheKey: string
  data: BalanceSheetData | null
  compareBalanceRows: { ym: string; data: BalanceSheetData }[]
  fetchError: string | null
}

export const financialStatementsPageViewCache =
  createErpQueryViewCache<FinancialStatementsPageViewCache>()

export const incomeStatementViewCache = createErpQueryViewCache<IncomeStatementViewCache>()

export const balanceSheetViewCache = createErpQueryViewCache<BalanceSheetViewCache>()

export function buildIncomeStatementCacheKey(
  yearMonthStart: string,
  yearMonthEnd: string,
  storeFilter: string,
  showExpenseDetails: boolean
): string {
  return `${yearMonthStart}|${yearMonthEnd}|${storeFilter}|exp:${showExpenseDetails ? 1 : 0}`
}

export function buildBalanceSheetCacheKey(
  yearMonthStart: string,
  yearMonthEnd: string,
  storeFilter: string
): string {
  return `${yearMonthStart}|${yearMonthEnd}|${storeFilter}`
}
