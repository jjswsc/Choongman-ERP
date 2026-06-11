import { describe, expect, it } from 'vitest'
import {
  buildIncomeStatementViewNumbers,
  convertLineAmount,
  grossFromNetSubtotal,
} from '@/lib/income-statement-display'
import type { IncomeStatementData } from '@/lib/api-client'

function stubData(overrides: Partial<IncomeStatementData> = {}): IncomeStatementData {
  return {
    yearMonth: '2025-01',
    startStr: '2025-01-01',
    endStr: '2025-01-31',
    storeFilter: 'ST01',
    sales: 1070,
    purchases: 500,
    expenses: 200,
    grossProfit: 570,
    netProfit: 370,
    displayAmounts: {
      salesGross: 1070,
      salesNet: 1000,
      purchasesGross: 535,
      purchasesNet: 500,
      beginningInventoryGross: 107,
      beginningInventoryNet: 100,
      endingInventoryGross: 214,
      endingInventoryNet: 200,
    },
    ...overrides,
  }
}

describe('income-statement-display', () => {
  it('grossFromNetSubtotal uses Thai 7% rounding', () => {
    expect(grossFromNetSubtotal(100)).toBe(107)
  })

  it('convertLineAmount upgrades stock_net in included mode', () => {
    expect(convertLineAmount(100, 'stock_net', 'included')).toBe(107)
    expect(convertLineAmount(100, 'stock_net', 'excluded')).toBe(100)
  })

  it('buildIncomeStatementViewNumbers switches sales by vat mode', () => {
    const data = stubData()
    const incl = buildIncomeStatementViewNumbers({ data, vatMode: 'included' })
    const excl = buildIncomeStatementViewNumbers({ data, vatMode: 'excluded' })
    expect(incl.sales).toBe(1070)
    expect(excl.sales).toBe(1000)
    expect(incl.purchases).toBe(535)
    expect(excl.purchases).toBe(500)
  })

  it('computes ebitda from bridge', () => {
    const data = stubData({
      ebitdaBridge: { depreciation: 50, interest: 10, incomeTax: 20 },
    })
    const v = buildIncomeStatementViewNumbers({ data, vatMode: 'included' })
    expect(v.netProfit).toBe(v.grossProfit - 200)
    expect(v.ebitda).toBe(v.netProfit + 50 + 10 + 20)
  })
})
