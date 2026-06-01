import { describe, expect, it } from 'vitest'
import { mergeIncomeStatementReports } from '@/lib/accounting-income-statement-merge'
import type { IncomeStatementReport } from '@/lib/accounting-reports'

function stubReport(storeFilter: string, sales: number): IncomeStatementReport {
  return {
    yearMonth: '2026-05',
    startStr: '2026-05-01',
    endStr: '2026-05-31',
    storeFilter,
    timezone: 'Asia/Bangkok',
    sales,
    purchases: 10,
    beginningInventory: 1,
    endingInventory: 2,
    cogs: 3,
    expenses: 4,
    grossProfit: sales - 3,
    netProfit: sales - 7,
    expenseBreakdown: {
      pettyCash: 1,
      bankWithdraw: 1,
      deliveryAppFees: 0,
      cardFees: 0,
      fixedExpenses: 2,
      total: 4,
    },
  }
}

describe('mergeIncomeStatementReports', () => {
  it('sums sales across stores', () => {
    const merged = mergeIncomeStatementReports(
      [stubReport('A', 100), stubReport('B', 200)],
      { yearMonth: '2026-05', startStr: '2026-05-01', endStr: '2026-05-31' }
    )
    expect(merged.storeFilter).toBe('All')
    expect(merged.sales).toBe(300)
    expect(merged.netProfit).toBe(286)
  })
})
