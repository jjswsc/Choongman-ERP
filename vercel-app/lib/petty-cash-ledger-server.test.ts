import { describe, expect, it } from 'vitest'
import {
  buildPettyCashLedgerWithBalances,
  buildPettyCashStoreFilter,
  toPettyCashDateStr,
} from '@/lib/petty-cash-ledger-server'

describe('toPettyCashDateStr', () => {
  it('slices YYYY-MM-DD strings', () => {
    expect(toPettyCashDateStr('2026-10-15T00:00:00')).toBe('2026-10-15')
  })
})

describe('buildPettyCashStoreFilter', () => {
  it('returns id=gt.0 for all stores', () => {
    expect(buildPettyCashStoreFilter('')).toBe('id=gt.0')
  })

  it('uses Office OR pattern when no department', () => {
    expect(buildPettyCashStoreFilter('Office')).toContain('store.eq.Office')
  })

  it('equals store when a specific store is set', () => {
    expect(buildPettyCashStoreFilter('CM Silom')).toBe('store=eq.CM%20Silom')
  })
})

describe('buildPettyCashLedgerWithBalances', () => {
  it('applies opening balance then period amounts', () => {
    const list = buildPettyCashLedgerWithBalances(
      [
        {
          id: 1,
          store: 'CM Silom',
          trans_date: '2026-10-02',
          trans_type: 'expense',
          amount: -100,
        },
        {
          id: 2,
          store: 'CM Silom',
          trans_date: '2026-10-01',
          trans_type: 'receive',
          amount: 500,
        },
      ],
      { 'CM Silom': 1000 }
    )
    expect(list).toHaveLength(2)
    expect(list[0].trans_date).toBe('2026-10-01')
    expect(list[0].balance_after).toBe(1500)
    expect(list[1].balance_after).toBe(1400)
  })

  it('skips empty store rows', () => {
    const list = buildPettyCashLedgerWithBalances(
      [{ id: 1, store: '  ', trans_date: '2026-10-01', amount: -50, trans_type: 'expense' }],
      {}
    )
    expect(list).toHaveLength(0)
  })
})
