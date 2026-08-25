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
      stockInboundExpense: 0,
      payrollExpense: 0,
      depreciationExpense: 0,
      franchiseRoyalty: 0,
      franchiseDeliveryGp: 0,
      franchiseGrabGp: 0,
      franchiseBillingCombined: 0,
      pp30VatRemittance: 0,
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

  it('keeps PO-ROY and PO-GGP separate when merging stores', () => {
    const a = stubReport('A', 100)
    const b = stubReport('B', 200)
    a.expenseByAccountSubject = [
      {
        accountSubjectId: null,
        code: 'PO-ROY',
        name: 'royalty',
        nameEn: null,
        nameTh: null,
        amount: 10,
      },
      {
        accountSubjectId: null,
        code: 'PO-GGP',
        name: 'grab',
        nameEn: null,
        nameTh: null,
        amount: 20,
      },
    ]
    b.expenseByAccountSubject = [
      {
        accountSubjectId: null,
        code: 'PO-ROY',
        name: 'royalty',
        nameEn: null,
        nameTh: null,
        amount: 5,
      },
    ]
    const merged = mergeIncomeStatementReports([a, b], {
      yearMonth: '2026-05',
      startStr: '2026-05-01',
      endStr: '2026-05-31',
    })
    const rows = merged.expenseByAccountSubject || []
    expect(rows.find((r) => r.code === 'PO-ROY')?.amount).toBe(15)
    expect(rows.find((r) => r.code === 'PO-GGP')?.amount).toBe(20)
  })
})
