import { describe, expect, it } from 'vitest'
import {
  filterExpenseWithdrawAccountSubjects,
  filterFixedAssetAccountSubjects,
  filterTransferWithdrawAccountSubjects,
} from '@/lib/account-subject-withdraw-options'

describe('account-subject-withdraw-options', () => {
  const rows = [
    { id: 1, code: '1110', name: '이체', type: 'transfer', sortOrder: 1 },
    { id: 2, code: '5111', name: '식품원재료', type: 'expense', pAndLSection: 'cost', sortOrder: 2 },
    { id: 3, code: '5520', name: '기타경비', type: 'expense', pAndLSection: 'expense', sortOrder: 3 },
    { id: 4, code: '5410', name: '임차료', type: 'expense', pAndLSection: 'fixed', sortOrder: 4 },
    { id: 5, code: '1490', name: '기타유형자산', type: 'asset', sortOrder: 5 },
    { id: 6, code: '1460', name: '재고자산', type: 'asset', sortOrder: 6 },
  ]

  it('excludes cost expense accounts for withdraw expense picker', () => {
    expect(filterExpenseWithdrawAccountSubjects(rows).map((r) => r.code)).toEqual(['5520', '5410'])
  })

  it('keeps transfer accounts only for transfer picker', () => {
    expect(filterTransferWithdrawAccountSubjects(rows).map((r) => r.code)).toEqual(['1110'])
  })

  it('keeps asset accounts only for fixed-asset picker', () => {
    expect(filterFixedAssetAccountSubjects(rows).map((r) => r.code)).toEqual(['1490', '1460'])
  })
})
