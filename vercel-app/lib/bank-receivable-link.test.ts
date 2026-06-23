import { describe, expect, it } from 'vitest'
import {
  bankDepositNeedsReceivableOrderLink,
  bankDepositReceivableLinkPending,
  computeReceivableOpenAmount,
  receivablePickTotalMatchesBank,
  sumOpenReceivablePickAmount,
} from '@/lib/bank-receivable-link'

describe('bank-receivable-link', () => {
  it('flags receivable_receive deposit with store as link candidate', () => {
    expect(
      bankDepositNeedsReceivableOrderLink({
        transType: 'deposit',
        category: 'receivable_receive',
        storeName: 'CM Bangna',
        isChannelSettled: false,
      })
    ).toBe(true)
    expect(
      bankDepositReceivableLinkPending({
        transType: 'deposit',
        category: 'receivable_receive',
        storeName: 'CM Bangna',
        isReceivableLinked: false,
        isChannelSettled: false,
      })
    ).toBe(true)
  })

  it('skips channel-settled POS deposits', () => {
    expect(
      bankDepositNeedsReceivableOrderLink({
        transType: 'deposit',
        category: 'receivable_receive',
        storeName: 'CM Bangna',
        isChannelSettled: true,
      })
    ).toBe(false)
  })

  it('computes open amount from receive offsets', () => {
    expect(computeReceivableOpenAmount(1000, [{ amount: -400 }])).toBe(600)
    expect(computeReceivableOpenAmount(1000, [{ amount: -1000 }])).toBe(0)
  })

  it('sums selected receivable pick amounts and matches bank total', () => {
    const list = [
      { id: 1, remainingAmount: 50007.6 },
      { id: 2, remainingAmount: 58405.95 },
      { id: 3, remainingAmount: 64430.05 },
    ]
    expect(sumOpenReceivablePickAmount(list, [1, 2])).toBe(108413.55)
    expect(receivablePickTotalMatchesBank(303112, 108413.55)).toBe(false)
    expect(
      receivablePickTotalMatchesBank(
        108413.55,
        sumOpenReceivablePickAmount(list, [1, 2])
      )
    ).toBe(true)
    expect(
      receivablePickTotalMatchesBank(
        172843.6,
        sumOpenReceivablePickAmount(list, [1, 2, 3])
      )
    ).toBe(true)
  })
})
