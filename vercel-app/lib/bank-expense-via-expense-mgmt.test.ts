import { describe, expect, it } from 'vitest'
import {
  isBankExpenseRelatedWithdrawCategory,
  shouldSkipBankAutoJournal,
} from '@/lib/bank-expense-via-expense-mgmt'

describe('bank-expense-via-expense-mgmt', () => {
  it('detects expense-related withdraw categories', () => {
    expect(isBankExpenseRelatedWithdrawCategory('expense')).toBe(true)
    expect(isBankExpenseRelatedWithdrawCategory('fixed')).toBe(true)
    expect(isBankExpenseRelatedWithdrawCategory('purchase_payment')).toBe(true)
    expect(isBankExpenseRelatedWithdrawCategory('transfer')).toBe(false)
  })

  it('skips auto journal for expense-related withdraw only', () => {
    expect(shouldSkipBankAutoJournal('expense', 'withdraw')).toBe(true)
    expect(shouldSkipBankAutoJournal('purchase_payment', 'withdraw')).toBe(true)
    expect(shouldSkipBankAutoJournal('transfer', 'withdraw')).toBe(false)
    expect(shouldSkipBankAutoJournal('expense', 'deposit')).toBe(false)
  })
})
