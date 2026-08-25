import { describe, expect, it } from 'vitest'
import {
  concatExpenseWhtIncomeTypes,
  expenseWhtItemsFromTotals,
  normalizeExpenseWhtItems,
  primaryExpenseWhtRate,
  sumExpenseWhtTax,
  taxAmountFromWhtBase,
} from '@/lib/expense-wht-items'

describe('normalizeExpenseWhtItems', () => {
  it('parses rent + service like a 50 ทวิ with two lines', () => {
    const items = normalizeExpenseWhtItems([
      { incomeType: 'ค่าเช่า', rate: 5, baseAmount: 56000, taxAmount: 2800 },
      { incomeType: 'ค่าบริการ', rate: 3, baseAmount: 24000, taxAmount: 720 },
    ])
    expect(items).toHaveLength(2)
    expect(sumExpenseWhtTax(items)).toBe(3520)
    expect(concatExpenseWhtIncomeTypes(items)).toBe('ค่าเช่า, ค่าบริการ')
    expect(primaryExpenseWhtRate(items)).toBeNull()
  })

  it('fills tax from base × rate when tax omitted', () => {
    const items = normalizeExpenseWhtItems([{ incomeType: 'ค่าบริการ', rate: 3, baseAmount: 24000 }])
    expect(items[0]?.taxAmount).toBe(720)
  })
})

describe('expenseWhtItemsFromTotals', () => {
  it('falls back to a single service line', () => {
    const items = expenseWhtItemsFromTotals({
      taxAmount: 279,
      baseAmount: 9300,
      rate: 3,
    })
    expect(items).toHaveLength(1)
    expect(items[0]?.incomeType).toBe('ค่าบริการ')
    expect(items[0]?.taxAmount).toBe(279)
  })
})

describe('taxAmountFromWhtBase', () => {
  it('rounds to 2 decimals', () => {
    expect(taxAmountFromWhtBase(56000, 5)).toBe(2800)
    expect(taxAmountFromWhtBase(24000, 3)).toBe(720)
  })
})
