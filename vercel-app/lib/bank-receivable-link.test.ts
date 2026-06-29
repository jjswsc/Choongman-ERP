import { describe, expect, it } from 'vitest'
import {
  bankDepositNeedsReceivableOrderLink,
  bankDepositReceivableLinkPending,
  buildReceivableLinkAllocations,
  computeReceivableOpenAmount,
  receivablePickTotalMatchesBank,
  sumOpenReceivablePickAmount,
  sumReceivableLinkAllocation,
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

  it('allocates bank and credit across multiple invoices', () => {
    const targets = [
      { accrualId: 1, remaining: 100000 },
      { accrualId: 2, remaining: 171025.94 },
    ]
    const parts = buildReceivableLinkAllocations({
      bankAmt: 270752.94,
      storeCreditApply: 273,
      targets,
      absorbShortfall: true,
    })
    const sum = sumReceivableLinkAllocation(parts)
    expect(sum.fromBank).toBe(270752.94)
    expect(sum.fromCredit).toBe(273)
    expect(sum.total).toBe(271025.94)
  })

  it('pays full invoice when bank deposit is slightly larger', () => {
    const parts = buildReceivableLinkAllocations({
      bankAmt: 5042,
      storeCreditApply: 0,
      targets: [{ accrualId: 1, remaining: 5041.38 }],
      absorbShortfall: true,
    })
    expect(parts[0]?.fromBank).toBe(5041.38)
    expect(parts[0]?.fromRounding).toBe(0)
  })

  it('absorbs small shortfall on last invoice', () => {
    const parts = buildReceivableLinkAllocations({
      bankAmt: 100,
      storeCreditApply: 0,
      targets: [{ accrualId: 1, remaining: 100.5 }],
      absorbShortfall: true,
    })
    expect(parts[0]?.fromBank).toBe(100)
    expect(parts[0]?.fromRounding).toBe(0.5)
  })
})
