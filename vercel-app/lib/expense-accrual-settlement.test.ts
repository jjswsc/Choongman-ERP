import { describe, expect, it } from 'vitest'
import {
  isOrphanPaidExpenseAccrualStatus,
  isSettledExpensePayment,
  settledPaidAbsFromPayableRows,
} from './expense-accrual-settlement'

describe('expense-accrual-settlement', () => {
  it('treats negative payable with bank id as settled', () => {
    expect(
      isSettledExpensePayment({ amount: -100, bank_transaction_id: 12, petty_cash_transaction_id: null })
    ).toBe(true)
  })

  it('ignores phantom payment without bank/petty', () => {
    expect(
      isSettledExpensePayment({ amount: -100, bank_transaction_id: null, petty_cash_transaction_id: null })
    ).toBe(false)
  })

  it('sums only settled payments', () => {
    expect(
      settledPaidAbsFromPayableRows([
        { amount: 100, bank_transaction_id: null },
        { amount: -40, bank_transaction_id: null },
        { amount: -60, bank_transaction_id: 9 },
      ])
    ).toBe(60)
  })

  it('detects orphan paid status', () => {
    expect(isOrphanPaidExpenseAccrualStatus('paid', false)).toBe(true)
    expect(isOrphanPaidExpenseAccrualStatus('done', false)).toBe(true)
    expect(isOrphanPaidExpenseAccrualStatus('paid', true)).toBe(false)
    expect(isOrphanPaidExpenseAccrualStatus('approved', false)).toBe(false)
  })
})
