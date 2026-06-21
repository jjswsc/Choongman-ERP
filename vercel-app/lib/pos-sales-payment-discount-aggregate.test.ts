import { describe, expect, it } from 'vitest'
import { aggregatePosSalesPaymentDiscount } from '@/lib/pos-sales-payment-discount-aggregate'
import { buildPosSalesCombinedDiscount } from '@/lib/pos-sales-combined-discount-aggregate'

describe('aggregatePosSalesPaymentDiscount', () => {
  it('splits manual discount and coupon', () => {
    const result = aggregatePosSalesPaymentDiscount({
      orderRows: [
        {
          total: 1000,
          discount_amt: 100,
          coupon_discount_amt: 0,
          discount_reason: 'VIP',
        },
        {
          total: 800,
          discount_amt: 50,
          coupon_discount_amt: 50,
          applied_coupons: [{ code: 'SAVE50', name: 'Save 50', discountAmt: 50 }],
        },
      ],
    })

    expect(result.totals.discountAmount).toBe(150)
    expect(result.totals.discountPctOfGross).toBeCloseTo(8.33, 1)
    expect(result.byKind.find((k) => k.kind === 'manual')?.discountAmount).toBe(100)
    expect(result.byKind.find((k) => k.kind === 'coupon')?.discountAmount).toBe(50)
  })

  it('classifies collab discount from reason text', () => {
    const result = aggregatePosSalesPaymentDiscount({
      orderRows: [
        {
          total: 500,
          discount_amt: 60,
          discount_reason: 'ส่วนลดความร่วมมือ: CM x Chang',
        },
      ],
    })

    expect(result.byKind).toHaveLength(1)
    expect(result.byKind[0]?.kind).toBe('collab')
    expect(result.byKind[0]?.discountAmount).toBe(60)
  })

  it('classifies Grab API order without reason as platform via delivery_app_code', () => {
    const result = aggregatePosSalesPaymentDiscount({
      orderRows: [
        {
          total: 106,
          order_type: 'delivery',
          delivery_app_code: 'grab',
          discount_amt: 23,
          discount_reason: '',
        },
      ],
    })

    expect(result.byKind).toHaveLength(1)
    expect(result.byKind[0]?.kind).toBe('platform')
    expect(result.byKind[0]?.discountAmount).toBe(23)
    expect(result.rows[0]?.label).toBe('Grab platform promo')
  })
})

describe('buildPosSalesCombinedDiscount', () => {
  it('merges bundle and payment layers', () => {
    const combined = buildPosSalesCombinedDiscount({
      periodGrossSales: 1000,
      periodOrderCount: 10,
      bundleDiscount: 100,
      paymentDiscount: 50,
      promoLineSaleAmount: 300,
      paymentOrderCountWithDiscount: 4,
      bundleByKind: [
        {
          kind: 'campaign',
          qty: 1,
          saleAmount: 300,
          regularAmount: 400,
          bundleDiscount: 100,
          discountPct: 25,
          saleSharePctOfGross: 30,
          bundleDiscountPctOfGross: 10,
          bundleDiscountSharePct: 100,
        },
      ],
      paymentByKind: [
        {
          kind: 'coupon',
          orderCount: 4,
          discountAmount: 50,
          discountPctOfGross: 5,
          discountSharePct: 100,
        },
      ],
    })

    expect(combined.totals.totalDiscount).toBe(150)
    expect(combined.totals.totalDiscountPctOfGross).toBe(15)
    expect(combined.byKind).toHaveLength(2)
  })
})
