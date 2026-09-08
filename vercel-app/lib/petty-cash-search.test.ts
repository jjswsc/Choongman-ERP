import { describe, expect, it } from 'vitest'
import { latestPettyCashBalanceAfter } from '@/lib/petty-cash-search'
import type { PettyCashItem } from '@/lib/api-client'

function row(partial: Partial<PettyCashItem> & { id: number; trans_date: string; balance_after: number }): PettyCashItem {
  return {
    store: 'CM Silom',
    trans_type: 'expense',
    amount: 0,
    memo: '',
    user_name: '',
    ...partial,
  }
}

describe('latestPettyCashBalanceAfter', () => {
  it('returns null when there are no rows', () => {
    expect(latestPettyCashBalanceAfter([])).toBeNull()
  })

  it('picks the newest date then highest id', () => {
    const rows = [
      row({ id: 2, trans_date: '2026-09-01', balance_after: 8000 }),
      row({ id: 9, trans_date: '2026-09-08', balance_after: 9000 }),
      row({ id: 10, trans_date: '2026-09-08', balance_after: 8000 }),
      row({ id: 3, trans_date: '2026-09-07', balance_after: 9000 }),
    ]
    expect(latestPettyCashBalanceAfter(rows)).toBe(8000)
  })
})
