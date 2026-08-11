import { describe, expect, it } from 'vitest'
import {
  isOrphanPaidExpenseAccrualStatus,
  isRealBankOrPettySettlement,
  isSettledExpensePayment,
  settledPaidAbsFromPayableRows,
  storesMatchForExpenseBankLink,
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

  it('excludes expense_internal bank settlements from linkable remaining', () => {
    const notes = new Map<number, string>([
      [9, 'expense_accrual_id:1;withdrawal_category:expense;source:expense_internal'],
      [10, 'normal csv import'],
    ])
    expect(
      settledPaidAbsFromPayableRows(
        [
          { amount: -643, bank_transaction_id: 9 },
          { amount: -100, bank_transaction_id: 10 },
        ],
        { bankNoteById: notes, excludeInternalBank: true }
      )
    ).toBe(100)
    expect(isRealBankOrPettySettlement({ amount: -643, bank_transaction_id: 9 }, notes)).toBe(false)
    expect(isRealBankOrPettySettlement({ amount: -100, bank_transaction_id: 10 }, notes)).toBe(true)
  })

  it('matches office-family stores for bank link', () => {
    const grade = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
    const isOffice = (s: string) => /office|hq|본사/i.test(s)
    expect(storesMatchForExpenseBankLink('CM Office', 'Head Office (HQ)', grade, isOffice)).toBe(true)
    expect(storesMatchForExpenseBankLink('CM Silom', 'CM Office', grade, isOffice)).toBe(false)
  })

  it('detects orphan paid status', () => {
    expect(isOrphanPaidExpenseAccrualStatus('paid', false)).toBe(true)
    expect(isOrphanPaidExpenseAccrualStatus('done', false)).toBe(true)
    expect(isOrphanPaidExpenseAccrualStatus('paid', true)).toBe(false)
    expect(isOrphanPaidExpenseAccrualStatus('approved', false)).toBe(false)
  })
})
