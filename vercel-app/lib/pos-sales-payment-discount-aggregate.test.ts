import { describe, expect, it } from 'vitest'
import { aggregatePosSalesPaymentDiscount } from '@/lib/pos-sales-payment-discount-aggregate'
import { aggregatePosSalesPromoBundleDiscount } from '@/lib/pos-sales-promo-discount-aggregate'
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

  it('classifies tier discount from tier_discount_amt', () => {
    const result = aggregatePosSalesPaymentDiscount({
      orderRows: [
        {
          total: 1000,
          discount_amt: 50,
          coupon_discount_amt: 0,
          tier_discount_amt: 50,
          member_tier_code: 'GOLD',
          discount_reason: '등급 할인 (GOLD 5.0%)',
        },
      ],
    })

    expect(result.byKind.find((k) => k.kind === 'tier')?.discountAmount).toBe(50)
    expect(result.byKind.find((k) => k.kind === 'manual')).toBeUndefined()
  })

  it('classifies tier discount from reason when tier_discount_amt is missing', () => {
    const result = aggregatePosSalesPaymentDiscount({
      orderRows: [
        {
          total: 1000,
          discount_amt: 50,
          coupon_discount_amt: 0,
          discount_reason: '등급 할인 (GOLD 5.0%)',
        },
      ],
    })

    expect(result.byKind.find((k) => k.kind === 'tier')?.discountAmount).toBe(50)
    expect(result.byKind.find((k) => k.kind === 'manual')).toBeUndefined()
  })

  it('classifies Grab API order as bundle platform, not payment discount', () => {
    const payment = aggregatePosSalesPaymentDiscount({
      orderRows: [
        {
          total: 106,
          order_type: 'delivery',
          delivery_app_code: 'grab',
          discount_amt: 23,
          discount_reason: 'Grab platform promo',
        },
      ],
    })
    expect(payment.byKind).toHaveLength(0)
    expect(payment.totals.discountAmount).toBe(0)

    const bundle = aggregatePosSalesPromoBundleDiscount({
      catalog: { menus: [], optionsByMenuId: {}, promoMetaById: new Map(), promoItemsByPromoId: new Map(), promoIdByMirrorMenuId: new Map() },
      orderRows: [
        {
          total: 106,
          order_type: 'delivery',
          delivery_app_code: 'grab',
          discount_amt: 23,
          discount_reason: 'Grab platform promo',
        },
      ],
    })
    expect(bundle.byKind.find((k) => k.kind === 'platform')?.bundleDiscount).toBe(23)
    expect(bundle.totals.bundleDiscount).toBe(23)
    expect(bundle.totals.paymentDiscount).toBe(0)
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
