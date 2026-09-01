import { describe, expect, it } from 'vitest'
import { linesForBankDeposit } from './chart-of-accounts-mapping'
import { isLoanBorrowDepositCategory } from './bank-loan-categories'

describe('loan borrow deposit posting', () => {
  it('posts cash / borrowings 2150 not revenue 4110', () => {
    for (const cat of ['loan', 'loan_borrow'] as const) {
      expect(isLoanBorrowDepositCategory(cat)).toBe(true)
      const lines = linesForBankDeposit(cat, 1000)
      expect(lines.map((l) => l.accountCode).sort()).toEqual(['1010', '2150'])
      const credit = lines.find((l) => l.side === 'credit')
      expect(credit?.accountCode).toBe('2150')
    }
  })

  it('posts other income to 4191 and skips journal for cash-to-bank', () => {
    const oil = linesForBankDeposit('other_income', 800)
    expect(oil.find((l) => l.side === 'credit')?.accountCode).toBe('4191')
    expect(linesForBankDeposit('cash_to_bank', 500)).toEqual([])
  })

  it('keeps sales collection on 1130', () => {
    const lines = linesForBankDeposit('receivable_receive', 500)
    expect(lines.find((l) => l.side === 'credit')?.accountCode).toBe('1130')
  })
})
