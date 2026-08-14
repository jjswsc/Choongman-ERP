import { describe, expect, it } from 'vitest'
import {
  consolidatePosOrderLinesAfterMerge,
  posMergeLineIdentityKey,
  posMergeLineIsUnserved,
  computePosOrderMergeFinancials,
  computePosOrderDueTotalFromLines,
} from '@/lib/pos-dine-in-table-merge-rules'

describe('posMergeLineIsUnserved', () => {
  it('treats missing servedAt as unserved', () => {
    expect(posMergeLineIsUnserved({ name: 'A', price: 1, qty: 1 })).toBe(true)
  })
  it('treats empty string servedAt as unserved', () => {
    expect(posMergeLineIsUnserved({ name: 'A', price: 1, qty: 1, servedAt: '  ' })).toBe(true)
  })
  it('treats timestamp as served', () => {
    expect(posMergeLineIsUnserved({ name: 'A', price: 1, qty: 1, servedAt: '2025-01-01' })).toBe(false)
  })
})

describe('consolidatePosOrderLinesAfterMerge', () => {
  it('merges two unserved identical lines into one qty', () => {
    const out = consolidatePosOrderLinesAfterMerge([
      { id: 'a', name: 'Pad Thai', price: 100, qty: 1 },
      { id: 'b', name: 'Pad Thai', price: 100, qty: 2 },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('a')
    expect(out[0].qty).toBe(3)
  })

  it('does not merge when first line is served', () => {
    const out = consolidatePosOrderLinesAfterMerge([
      { id: 'a', name: 'Pad Thai', price: 100, qty: 1, servedAt: '2025-01-01T00:00:00Z' },
      { id: 'b', name: 'Pad Thai', price: 100, qty: 1 },
    ])
    expect(out).toHaveLength(2)
  })

  it('merges absorb-order line into earlier identical unserved line', () => {
    const out = consolidatePosOrderLinesAfterMerge([
      { id: 'k1', name: 'A', price: 10, qty: 1 },
      { id: 'm1', name: 'B', price: 20, qty: 1 },
      { id: 'm2', name: 'A', price: 10, qty: 1 },
    ])
    expect(out).toHaveLength(2)
    const aLine = out.find((x) => x.name === 'A')
    expect(aLine?.qty).toBe(2)
    expect(aLine?.id).toBe('k1')
  })

  it('different note stays separate', () => {
    const out = consolidatePosOrderLinesAfterMerge([
      { id: '1', name: 'A', price: 10, qty: 1, note: 'no onion' },
      { id: '2', name: 'A', price: 10, qty: 1, note: 'extra spicy' },
    ])
    expect(out).toHaveLength(2)
  })

  it('identity includes promoId', () => {
    const k1 = posMergeLineIdentityKey({ name: 'A', price: 10, qty: 1, promoId: 'p1' })
    const k2 = posMergeLineIdentityKey({ name: 'A', price: 10, qty: 1, promoId: 'p2' })
    expect(k1).not.toBe(k2)
  })
})

describe('computePosOrderMergeFinancials', () => {
  it('empty adjustments total equals item subtotal minus discount', () => {
    const r = computePosOrderMergeFinancials({
      mergedItems: [
        { name: 'A', price: 500, qty: 1 },
        { name: 'B', price: 618, qty: 1 },
      ],
      discountAmt: 0,
      couponDiscountAmt: 0,
      adjustments: { paymentTotalRoundingMode: 'none', vatRate: 0, serviceRate: 0 },
    })
    expect(r.subtotal).toBe(1118)
    expect(r.total).toBe(1118)
  })

  it('applies store service rate so checkout total is not lower than POS modal', () => {
    const items = [
      { name: 'A', price: 500, qty: 1 },
      { name: 'B', price: 618, qty: 1 },
    ]
    const withoutFee = computePosOrderMergeFinancials({
      mergedItems: items,
      discountAmt: 0,
      couponDiscountAmt: 0,
      adjustments: { paymentTotalRoundingMode: 'none', vatRate: 0, serviceRate: 0 },
    })
    const withService = computePosOrderMergeFinancials({
      mergedItems: items,
      discountAmt: 0,
      couponDiscountAmt: 0,
      adjustments: {
        paymentTotalRoundingMode: 'none',
        vatRate: 0,
        serviceRate: 10,
        serviceMode: 'separate',
      },
    })
    expect(withoutFee.total).toBe(1118)
    expect(withService.total).toBe(1229.8)
    expect(withService.serviceAmt).toBe(111.8)
  })

  it('rounds buffet 299×2 sequential VAT+service to 704 like POS pay modal', () => {
    const r = computePosOrderMergeFinancials({
      mergedItems: [{ name: 'Buffet 299', price: 299, qty: 2 }],
      discountAmt: 0,
      couponDiscountAmt: 0,
      adjustments: {
        vatRate: 7,
        vatMode: 'separate',
        serviceRate: 10,
        serviceMode: 'separate',
        feeStackMode: 'sequential',
        feeStackOrder: ['service', 'vat', 'other'],
        paymentTotalRoundingMode: 'round',
      },
    })
    expect(r.subtotal).toBe(598)
    expect(r.serviceAmt).toBe(59.8)
    expect(r.vat).toBe(46.05)
    expect(r.total).toBe(704)
  })
})

describe('computePosOrderDueTotalFromLines', () => {
  it('matches cart: discount + points come off subtotal before store fees', () => {
    const due = computePosOrderDueTotalFromLines({
      items: [{ name: 'A', price: 200, qty: 1 }],
      discountAmt: 20,
      pointUsed: 10,
      adjustments: { paymentTotalRoundingMode: 'none', vatRate: 0, serviceRate: 0 },
    })
    expect(due.total).toBe(170)
  })

  it('applies coupon when it is not already inside discountAmt', () => {
    const due = computePosOrderDueTotalFromLines({
      items: [{ name: 'A', price: 200, qty: 1 }],
      discountAmt: 0,
      couponDiscountAmt: 30,
      adjustments: { paymentTotalRoundingMode: 'none', vatRate: 0, serviceRate: 0 },
    })
    expect(due.total).toBe(170)
  })
})
