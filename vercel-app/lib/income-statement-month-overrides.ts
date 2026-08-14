import {
  readIncomeStatementBeginningInvOverride,
} from '@/lib/income-statement-beginning-inv-override'
import { readIncomeStatementSalesOverride } from '@/lib/income-statement-sales-override'

/** 월·매장 스코프 수동 매출·기초재고 (여러 달 비교 표에 적용) */
export type IncomeStatementMonthManualOverrides = {
  manualSales: number | null
  manualBeginningInventory: number | null
}

export function emptyIncomeStatementMonthOverrides(): IncomeStatementMonthManualOverrides {
  return { manualSales: null, manualBeginningInventory: null }
}

export function readLocalIncomeStatementMonthOverrides(
  yearMonth: string,
  storeFilter: string
): IncomeStatementMonthManualOverrides {
  const s = readIncomeStatementSalesOverride(yearMonth, storeFilter)
  const b = readIncomeStatementBeginningInvOverride(yearMonth, storeFilter)
  return {
    manualSales: s?.enabled ? s.amount : null,
    manualBeginningInventory: b?.enabled ? b.amount : null,
  }
}

export function monthOverridesFromSharedRow(
  row:
    | {
        sales_override_enabled?: boolean
        sales_override_amount?: number
        beginning_inv_override_enabled?: boolean
        beginning_inv_override_amount?: number
      }
    | null
    | undefined
): IncomeStatementMonthManualOverrides {
  if (!row) return emptyIncomeStatementMonthOverrides()
  const salesOn = Boolean(row.sales_override_enabled)
  const begOn = Boolean(row.beginning_inv_override_enabled)
  return {
    manualSales: salesOn ? Math.max(0, Number(row.sales_override_amount) || 0) : null,
    manualBeginningInventory: begOn
      ? Math.max(0, Number(row.beginning_inv_override_amount) || 0)
      : null,
  }
}
