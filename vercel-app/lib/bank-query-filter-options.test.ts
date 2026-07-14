import { describe, expect, it } from 'vitest'
import {
  bankRowMatchesAmountFilter,
  bankRowMatchesKeywordFilter,
  resolveBankQueryFilterAccountSubjects,
  resolveBankQueryFilterCategories,
} from '@/lib/bank-query-filter-options'

describe('bank-query-filter-options', () => {
  it('lists withdraw categories when trans type is withdraw', () => {
    expect(resolveBankQueryFilterCategories('withdraw')).toContain('expense')
    expect(resolveBankQueryFilterCategories('withdraw')).not.toContain('receivable_receive')
  })

  it('lists deposit categories when trans type is deposit', () => {
    expect(resolveBankQueryFilterCategories('deposit')).toContain('receivable_receive')
    expect(resolveBankQueryFilterCategories('deposit')).not.toContain('purchase_payment')
  })

  it('returns expense subjects for expense category filter', () => {
    const rows = resolveBankQueryFilterAccountSubjects({
      filterTransType: 'withdraw',
      filterCategory: 'expense',
      accountSubjectOptions: [
        { id: 1, code: '1110', name: '이체', type: 'transfer', sortOrder: 1 },
        { id: 2, code: '5520', name: '기타경비', type: 'expense', sortOrder: 2 },
      ],
      revenueAccountOptions: [],
    })
    expect(rows.map((r) => r.code)).toEqual(['5520'])
  })

  it('matches amount filter by absolute value', () => {
    expect(bankRowMatchesAmountFilter(1500.5, '')).toBe(true)
    expect(bankRowMatchesAmountFilter(1500.5, '1500.50')).toBe(true)
    expect(bankRowMatchesAmountFilter(-1500.5, '1,500.5')).toBe(true)
    expect(bankRowMatchesAmountFilter(1500.5, '1501')).toBe(false)
  })

  it('matches keyword filter case-insensitively across haystacks', () => {
    expect(bankRowMatchesKeywordFilter(['Grab Food', 'note'], '')).toBe(true)
    expect(bankRowMatchesKeywordFilter(['Grab Food', 'note'], 'grab')).toBe(true)
    expect(bankRowMatchesKeywordFilter(['Grab Food', 'note'], 'memo')).toBe(false)
  })
})
