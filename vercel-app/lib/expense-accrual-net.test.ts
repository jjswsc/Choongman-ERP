import { describe, expect, it } from 'vitest'
import {
  expenseAccrualNetPayable,
  expenseWhtAmountFromRate,
  expenseWhtBaseExVat,
} from '@/lib/expense-accrual-net'

describe('expenseWhtAmountFromRate', () => {
  it('computes WHT on amount ex-VAT', () => {
    expect(expenseWhtBaseExVat(10000, 700)).toBe(9300)
    expect(expenseWhtAmountFromRate(10000, 700, 3)).toBe(279)
    expect(expenseAccrualNetPayable(10000, 279)).toBe(9721)
  })

  it('returns 0 when rate is 0', () => {
    expect(expenseWhtAmountFromRate(10000, 700, 0)).toBe(0)
  })
})
