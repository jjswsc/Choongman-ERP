import { describe, expect, it } from 'vitest'
import {
  buildIncomeStatementViewNumbers,
  convertLineAmount,
  convertExpenseSubjectAmount,
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

  it('convertLineAmount subtracts cash vat only when excluded', () => {
    expect(convertLineAmount(107, 'cash_gross', 'included', null, 7)).toBe(107)
    expect(convertLineAmount(107, 'cash_gross', 'excluded', null, 7)).toBe(100)
    expect(convertLineAmount(107, 'cash_gross', 'excluded', null, 0)).toBe(107)
  })

  it('convertExpenseSubjectAmount subtracts explicit vat', () => {
    expect(convertExpenseSubjectAmount(107, 7, 'included')).toBe(107)
    expect(convertExpenseSubjectAmount(107, 7, 'excluded')).toBe(100)
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

  it('switches franchise billing expense by vat mode only', () => {
    const data = stubData({
      expenses: 307,
      displayAmounts: {
        salesGross: 1070,
        salesNet: 1000,
        purchasesGross: 535,
        purchasesNet: 500,
        beginningInventoryGross: 107,
        beginningInventoryNet: 100,
        endingInventoryGross: 214,
        endingInventoryNet: 200,
        franchiseBillingGross: 107,
        franchiseBillingNet: 100,
      },
    })
    const incl = buildIncomeStatementViewNumbers({ data, vatMode: 'included' })
    const excl = buildIncomeStatementViewNumbers({ data, vatMode: 'excluded' })
    expect(incl.expenses).toBe(307)
    expect(excl.expenses).toBe(300)
    expect(incl.netProfit).toBe(incl.grossProfit - 307)
    expect(excl.netProfit).toBe(excl.grossProfit - 300)
  })

  it('subtracts expensesCashVat with franchise in excluded mode', () => {
    const data = stubData({
      expenses: 327,
      displayAmounts: {
        salesGross: 1070,
        salesNet: 1000,
        purchasesGross: 535,
        purchasesNet: 500,
        beginningInventoryGross: 107,
        beginningInventoryNet: 100,
        endingInventoryGross: 214,
        endingInventoryNet: 200,
        franchiseBillingGross: 107,
        franchiseBillingNet: 100,
        expensesCashVat: 20,
      },
    })
    const incl = buildIncomeStatementViewNumbers({ data, vatMode: 'included' })
    const excl = buildIncomeStatementViewNumbers({ data, vatMode: 'excluded' })
    expect(incl.expenses).toBe(327)
    // (327 - 107 - 20) + 100 = 300
    expect(excl.expenses).toBe(300)
  })

  it('uses purchasesNet that already excludes bank vat', () => {
    const data = stubData({
      displayAmounts: {
        salesGross: 1070,
        salesNet: 1000,
        purchasesGross: 642,
        purchasesNet: 600,
        beginningInventoryGross: 107,
        beginningInventoryNet: 100,
        endingInventoryGross: 214,
        endingInventoryNet: 200,
        purchasesBankVat: 7,
      },
    })
    const excl = buildIncomeStatementViewNumbers({ data, vatMode: 'excluded' })
    expect(excl.purchases).toBe(600)
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
