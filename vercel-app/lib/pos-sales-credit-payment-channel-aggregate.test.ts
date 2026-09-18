import { describe, expect, it } from 'vitest'
import { sumCreditPaymentChannelSales } from '@/lib/pos-sales-credit-payment-channel-aggregate'

describe('sumCreditPaymentChannelSales', () => {
  it('sums independently rounded lines so the table total ties out', () => {
    expect(sumCreditPaymentChannelSales([{ sales: 10.6 }, { sales: 10.6 }, { sales: 10.6 }])).toBe(33)
  })

  it('Silom credit table: 463,712 not round-of-sum 463,711', () => {
    const rows = [
      { sales: 162_922.6 },
      { sales: 126_083.6 },
      { sales: 113_371.6 },
      { sales: 37_294 },
      { sales: 14_513 },
      { sales: 5_792 },
      { sales: 2_246 },
      { sales: 990 },
      { sales: 498 },
    ]
    expect(sumCreditPaymentChannelSales(rows)).toBe(463_712)
  })
})
