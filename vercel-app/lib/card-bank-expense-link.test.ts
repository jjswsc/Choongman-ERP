import { describe, expect, it } from 'vitest'
import { filterUnlinkedBankWithdrawalsForCardRows } from '@/lib/card-bank-expense-link'
import { isCardBillAllocationPlLine } from '@/lib/card-bill-allocation'
import { canLinkWithdrawForCardBill, canQueueWithdrawCategoryForCardBill } from '@/lib/card-bill-memo'
import { INTERNAL_BANK_SOURCE_MARKER } from '@/lib/bank-transaction-note-meta'

describe('canLinkWithdrawForCardBill', () => {
  it('allows expense even when the memo is not a card bill (CSV bulk as expense)', () => {
    expect(canLinkWithdrawForCardBill('expense', 'office rent')).toBe(true)
    expect(canLinkWithdrawForCardBill('expense', 'CREDIT CARD PAYMENT')).toBe(true)
    expect(canQueueWithdrawCategoryForCardBill('expense', 'office rent')).toBe(false)
  })

  it('still blocks purchase and tax', () => {
    expect(canLinkWithdrawForCardBill('purchase_payment', 'CREDIT CARD')).toBe(false)
    expect(canLinkWithdrawForCardBill('tax', 'CREDIT CARD')).toBe(false)
  })
})

describe('isCardBillAllocationPlLine', () => {
  it('counts child allocation lines only', () => {
    expect(isCardBillAllocationPlLine({ transType: 'expense', parentId: 9, isBillHeader: false })).toBe(true)
    expect(isCardBillAllocationPlLine({ transType: 'expense', parentId: null, isBillHeader: true })).toBe(false)
    expect(isCardBillAllocationPlLine({ transType: 'expense', parentId: null, isBillHeader: false })).toBe(false)
    expect(isCardBillAllocationPlLine({ transType: 'charge', parentId: 9, isBillHeader: false })).toBe(false)
  })
})

describe('filterUnlinkedBankWithdrawalsForCardRows', () => {
  const linkedIds = new Set<number>([99])

  it('lists expense withdrawals without a queue marker and filters by amount', () => {
    const list = filterUnlinkedBankWithdrawalsForCardRows(
      [
        { id: 1, trans_date: '2026-09-01', amount: 5000, memo: 'CSV bulk', category: 'expense' },
        { id: 2, trans_date: '2026-09-02', amount: 12000, memo: 'KBank Credit Card', category: 'expense' },
        { id: 3, trans_date: '2026-09-03', amount: 12000, memo: 'tax', category: 'tax' },
        { id: 99, trans_date: '2026-09-04', amount: 12000, memo: 'already linked', category: 'expense' },
      ],
      { linkedIds, amount: 12000 }
    )
    expect(list.map((r) => r.id)).toEqual([2])
    expect(list[0]?.likelyCardBill).toBe(true)
  })

  it('excludes internal expense-register bank rows', () => {
    const list = filterUnlinkedBankWithdrawalsForCardRows(
      [
        {
          id: 4,
          trans_date: '2026-09-01',
          amount: 100,
          memo: 'internal',
          note: INTERNAL_BANK_SOURCE_MARKER,
          category: 'expense',
        },
      ],
      { linkedIds }
    )
    expect(list).toEqual([])
  })
})
