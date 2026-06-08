import { describe, expect, it } from 'vitest'
import {
  collectPosSalesPaymentTenderGaps,
  posSalesPeriodPaymentTenderGap,
  posSalesPeriodPaymentTenderSum,
} from '@/lib/pos-sales-payment-tender-gap'

describe('pos-sales-payment-tender-gap', () => {
  it('sums payment columns', () => {
    expect(
      posSalesPeriodPaymentTenderSum({
        cashSales: 100,
        creditSales: 50,
        qrSales: 10,
        otherSales: 5,
        deliveryAppSales: 200,
      })
    ).toBe(365)
  })

  it('detects positive gap when total exceeds tender', () => {
    expect(
      posSalesPeriodPaymentTenderGap({
        total: 1046,
        cashSales: 0,
        creditSales: 0,
        qrSales: 0,
        otherSales: 0,
        deliveryAppSales: 0,
      })
    ).toBe(1046)
  })

  it('returns 0 within epsilon', () => {
    expect(
      posSalesPeriodPaymentTenderGap({
        total: 100,
        cashSales: 50,
        creditSales: 50,
      })
    ).toBe(0)
  })

  it('collects only rows with material gap', () => {
    const gaps = collectPosSalesPaymentTenderGaps([
      { label: '2026-05-12', key: '2026-05-12', total: 27275, cashSales: 26229, creditSales: 0 },
      { label: '2026-05-13', key: '2026-05-13', total: 1000, cashSales: 1000 },
    ])
    expect(gaps).toHaveLength(1)
    expect(gaps[0]?.key).toBe('2026-05-12')
    expect(gaps[0]?.gap).toBe(1046)
  })
})
