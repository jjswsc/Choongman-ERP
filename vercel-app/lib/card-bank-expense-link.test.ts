import { describe, expect, it } from 'vitest'
import { filterUnlinkedBankWithdrawalsForCardRows } from '@/lib/card-bank-expense-link'
import { pickBankAccountSubjectIdForCardBill } from '@/lib/card-bill-allocation'
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

describe('pickBankAccountSubjectIdForCardBill', () => {
  it('returns the single subject when all lines share one account', () => {
    expect(
      pickBankAccountSubjectIdForCardBill([
        { accountSubjectId: 10, amount: 100 },
        { accountSubjectId: 10, amount: 50 },
      ])
    ).toBe(10)
  })

  it('picks the largest-amount subject when several accounts are used', () => {
    expect(
      pickBankAccountSubjectIdForCardBill([
        { accountSubjectId: 10, amount: 100 },
        { accountSubjectId: 20, amount: 250 },
        { accountSubjectId: 30, amount: 40 },
      ])
    ).toBe(20)
  })

  it('returns null when there are no valid lines', () => {
    expect(pickBankAccountSubjectIdForCardBill([])).toBeNull()
    expect(pickBankAccountSubjectIdForCardBill([{ accountSubjectId: 0, amount: 10 }])).toBeNull()
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
