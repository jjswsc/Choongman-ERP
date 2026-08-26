import { describe, expect, it } from 'vitest'
import {
  BANK_DEPOSIT_LOAN_BORROW_CATEGORY,
  bankDepositLoanCategorySelectValue,
  isLoanBorrowDepositCategory,
} from './bank-loan-categories'

describe('bankDepositLoanCategorySelectValue', () => {
  it('collapses legacy loan onto a single loan_borrow dropdown value', () => {
    expect(bankDepositLoanCategorySelectValue('loan')).toBe(BANK_DEPOSIT_LOAN_BORROW_CATEGORY)
    expect(bankDepositLoanCategorySelectValue('loan_borrow')).toBe(BANK_DEPOSIT_LOAN_BORROW_CATEGORY)
    expect(bankDepositLoanCategorySelectValue('LOAN')).toBe(BANK_DEPOSIT_LOAN_BORROW_CATEGORY)
    expect(isLoanBorrowDepositCategory('loan')).toBe(true)
  })

  it('leaves other deposit categories unchanged', () => {
    expect(bankDepositLoanCategorySelectValue('receivable_receive')).toBe('receivable_receive')
    expect(bankDepositLoanCategorySelectValue('')).toBe('')
  })
})
