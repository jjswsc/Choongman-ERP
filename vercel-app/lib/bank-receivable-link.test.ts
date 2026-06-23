import { describe, expect, it } from 'vitest'
import {
  bankDepositNeedsReceivableOrderLink,
  bankDepositReceivableLinkPending,
  computeReceivableOpenAmount,
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
})
