import { describe, expect, it } from 'vitest'
import {
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
})
