import { describe, expect, it } from 'vitest'
import { pickPayablePaymentKeeperId } from './receivable-payable'

describe('pickPayablePaymentKeeperId', () => {
  it('prefers expense_accrual linked row over legacy duplicate', () => {
    expect(
      pickPayablePaymentKeeperId([
        { id: 10, expense_accrual_id: null },
        { id: 12, expense_accrual_id: 99 },
        { id: 11, expense_accrual_id: null },
      ])
    ).toBe(12)
  })

  it('keeps newest id when no accrual link', () => {
    expect(
      pickPayablePaymentKeeperId([
        { id: 5, expense_accrual_id: null },
        { id: 8, expense_accrual_id: null },
      ])
    ).toBe(8)
  })

  it('returns null for empty input', () => {
    expect(pickPayablePaymentKeeperId([])).toBeNull()
  })

  it('prefers higher id among accrual-linked duplicates', () => {
    expect(
      pickPayablePaymentKeeperId([
        { id: 100, expense_accrual_id: 50 },
        { id: 101, expense_accrual_id: 50 },
      ])
    ).toBe(101)
  })
})
