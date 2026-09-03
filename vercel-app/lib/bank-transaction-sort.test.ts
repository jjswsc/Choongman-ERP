import { describe, expect, it } from 'vitest'
import { sortBankTransactionsByDate } from '@/lib/bank-transaction-sort'

describe('sortBankTransactionsByDate', () => {
  it('puts Aug 1–2 above Aug 31 even if later ids were inserted first', () => {
    const sorted = sortBankTransactionsByDate([
      { id: 10, transDate: '2026-08-31' },
      { id: 11, transDate: '2026-08-31' },
      { id: 20, transDate: '2026-08-01' },
      { id: 21, transDate: '2026-08-01' },
      { id: 30, transDate: '2026-08-02' },
    ])
    expect(sorted.map((r) => r.transDate)).toEqual([
      '2026-08-01',
      '2026-08-01',
      '2026-08-02',
      '2026-08-31',
      '2026-08-31',
    ])
    expect(sorted.map((r) => r.id)).toEqual([20, 21, 30, 10, 11])
  })

  it('keeps same-day rows by id', () => {
    const sorted = sortBankTransactionsByDate([
      { id: 5, transDate: '2026-08-02' },
      { id: 3, transDate: '2026-08-02' },
    ])
    expect(sorted.map((r) => r.id)).toEqual([3, 5])
  })
})
