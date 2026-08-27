import { describe, expect, it } from 'vitest'
import {
  canBundleExpenseWithdrawalCategories,
  defaultExpenseBankComboPeriod,
  expensePlanPickTotalMatchesBank,
  parseExpensePaymentAccrualIds,
  remainingFitsBankWithdrawal,
  sumExpensePlanPickAmount,
  accrualDateInComboPeriod,
  expenseAccrualMatchesComboSearch,
  expenseBankComboPeriodDayCount,
  isExpenseBankComboPeriodReady,
  isExpenseBankComboSearchReady,
  parseExpenseBankComboSearchQuery,
} from './expense-accrual-bank-multi-link'

describe('parseExpensePaymentAccrualIds', () => {
  it('prefers the ids array and de-duplicates', () => {
    expect(
      parseExpensePaymentAccrualIds({
        expenseAccrualId: 9,
        expenseAccrualIds: [1, 2, 2, '3'],
      })
    ).toEqual([1, 2, 3])
  })

  it('falls back to a single id', () => {
    expect(parseExpensePaymentAccrualIds({ expense_accrual_id: 44 })).toEqual([44])
    expect(parseExpensePaymentAccrualIds({})).toEqual([])
  })
})

describe('remainingFitsBankWithdrawal', () => {
  it('keeps exact 1:1 and smaller remainings for a combo', () => {
    expect(remainingFitsBankWithdrawal(10000, 10000)).toBe(true)
    expect(remainingFitsBankWithdrawal(6000, 10000)).toBe(true)
    expect(remainingFitsBankWithdrawal(4000, 10000)).toBe(true)
  })

  it('excludes remainings larger than the bank withdrawal', () => {
    expect(remainingFitsBankWithdrawal(12000, 10000)).toBe(false)
    expect(remainingFitsBankWithdrawal(0, 10000)).toBe(false)
  })
})

describe('sumExpensePlanPickAmount / expensePlanPickTotalMatchesBank', () => {
  const list = [
    { id: 1, remainingAmount: 6000 },
    { id: 2, remainingAmount: 4000 },
    { id: 3, remainingAmount: 500 },
  ]

  it('sums selected remainings and matches the bank total', () => {
    expect(sumExpensePlanPickAmount(list, [1, 2])).toBe(10000)
    expect(expensePlanPickTotalMatchesBank(10000, 10000)).toBe(true)
    expect(expensePlanPickTotalMatchesBank(10000, 6500)).toBe(false)
  })
})

describe('canBundleExpenseWithdrawalCategories', () => {
  it('allows several normal expenses or several tax remittances', () => {
    expect(canBundleExpenseWithdrawalCategories(['expense', 'purchase_payment']).ok).toBe(true)
    expect(canBundleExpenseWithdrawalCategories(['tax_vat', 'tax_vat']).ok).toBe(true)
  })

  it('rejects petty/card and tax mixed with expense', () => {
    expect(canBundleExpenseWithdrawalCategories(['expense', 'transfer_to_petty']).ok).toBe(false)
    expect(canBundleExpenseWithdrawalCategories(['expense', 'tax_vat']).ok).toBe(false)
    expect(canBundleExpenseWithdrawalCategories(['tax_vat', 'tax_withholding']).ok).toBe(false)
  })
})

describe('expenseAccrualMatchesComboSearch', () => {
  it('requires a ready query before matching text', () => {
    expect(isExpenseBankComboSearchReady('a')).toBe(false)
    expect(isExpenseBankComboSearchReady('MEA')).toBe(true)
    expect(isExpenseBankComboSearchReady('6,000')).toBe(true)
    expect(parseExpenseBankComboSearchQuery('6,000').amount).toBe(6000)
  })

  it('matches amount or payee text', () => {
    const row = {
      payeeName: 'Bangkok Man',
      payeeCode: '1008',
      memo: 'electric Jun',
      documentNo: 'EXP2026080001',
      remainingAmount: 6000,
      plannedAmount: 6000,
    }
    expect(expenseAccrualMatchesComboSearch(row, '6000')).toBe(true)
    expect(expenseAccrualMatchesComboSearch(row, '4000')).toBe(false)
    expect(expenseAccrualMatchesComboSearch(row, 'bangkok')).toBe(true)
    expect(expenseAccrualMatchesComboSearch(row, 'EXP202608')).toBe(true)
    expect(expenseAccrualMatchesComboSearch(row, 'zzz')).toBe(false)
    expect(expenseAccrualMatchesComboSearch(row, '')).toBe(true)
  })
})

describe('expense bank combo period', () => {
  it('defaults to the bank month through the withdrawal date', () => {
    expect(defaultExpenseBankComboPeriod('2026-08-27')).toEqual({
      from: '2026-08-01',
      to: '2026-08-27',
    })
  })

  it('treats a valid period as enough to search without vendor text', () => {
    expect(isExpenseBankComboSearchReady('', { from: '2026-08-01', to: '2026-08-27' })).toBe(true)
    expect(isExpenseBankComboPeriodReady('2026-08-01', '2026-08-27')).toBe(true)
    expect(expenseBankComboPeriodDayCount('2026-08-01', '2026-08-31')).toBe(31)
    expect(isExpenseBankComboPeriodReady('2026-01-01', '2026-08-27')).toBe(false)
  })

  it('matches expense or due date inside the chosen period', () => {
    expect(accrualDateInComboPeriod('2026-08-10', '', '2026-08-01', '2026-08-27')).toBe(true)
    expect(accrualDateInComboPeriod('2026-07-31', '2026-08-02', '2026-08-01', '2026-08-27')).toBe(true)
    expect(accrualDateInComboPeriod('2026-07-01', '2026-07-15', '2026-08-01', '2026-08-27')).toBe(false)
  })
})
