import { describe, expect, it } from 'vitest'
import { monthOverridesFromSharedRow } from '@/lib/income-statement-month-overrides'
import { buildIncomeStatementViewNumbers } from '@/lib/income-statement-display'
import type { IncomeStatementData } from '@/lib/api-client'

function stubData(overrides: Partial<IncomeStatementData> = {}): IncomeStatementData {
  return {
    yearMonth: '2026-03',
    startStr: '2026-03-01',
    endStr: '2026-03-31',
    storeFilter: 'CM MBK',
    sales: 0,
    purchases: 100,
    beginningInventory: 50,
    endingInventory: 40,
    expenses: 10,
    grossProfit: -110,
    netProfit: -120,
    displayAmounts: {
      salesGross: 0,
      salesNet: 0,
      purchasesGross: 107,
      purchasesNet: 100,
      beginningInventoryGross: 53.5,
      beginningInventoryNet: 50,
      endingInventoryGross: 42.8,
      endingInventoryNet: 40,
    },
    ...overrides,
  }
}

describe('income-statement-month-overrides', () => {
  it('reads enabled shared sales and beginning inventory', () => {
    expect(
      monthOverridesFromSharedRow({
        sales_override_enabled: true,
        sales_override_amount: 900000,
        beginning_inv_override_enabled: true,
        beginning_inv_override_amount: 12000,
      })
    ).toEqual({
      manualSales: 900000,
      manualBeginningInventory: 12000,
    })
  })

  it('ignores amounts when flags are off', () => {
    expect(
      monthOverridesFromSharedRow({
        sales_override_enabled: false,
        sales_override_amount: 900000,
        beginning_inv_override_enabled: false,
        beginning_inv_override_amount: 12000,
      })
    ).toEqual({
      manualSales: null,
      manualBeginningInventory: null,
    })
  })
})

describe('multi-month compare applies manual sales', () => {
  it('replaces system sales of 0 with manual override', () => {
    const data = stubData()
    const v = buildIncomeStatementViewNumbers({
      data,
      vatMode: 'included',
      manualSales: 850000,
      manualBeginningInventory: null,
    })
    expect(v.sales).toBe(850000)
    expect(v.grossProfit).toBe(850000 - v.cogs)
  })
})
