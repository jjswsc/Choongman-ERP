import { describe, expect, it } from 'vitest'
import {
  alignPaymentToRecomputedDue,
  coercePosPricingAdjustmentsFromBody,
  resolveAlignedDueTotal,
  shouldRealignSettleFastDue,
} from '@/lib/pos-order-payment-due-align'
import type { PosPricingAdjustments } from '@/lib/pos-pricing'

const omniSeparateFees: PosPricingAdjustments = {
  vatRate: 7,
  vatMode: 'separate',
  serviceRate: 10,
  serviceMode: 'separate',
  feeStackMode: 'sequential',
  feeStackOrder: ['service', 'vat', 'other'],
  paymentTotalRoundingMode: 'round',
}

describe('resolveAlignedDueTotal', () => {
  it('accepts exact match', () => {
    expect(resolveAlignedDueTotal(704, 704)).toBe(704)
  })

  it('accepts 703.85 due vs POS rounded 704 payment', () => {
    expect(resolveAlignedDueTotal(704, 703.85)).toBe(704)
  })

  it('accepts 117.7 due vs POS rounded 118 payment', () => {
    expect(resolveAlignedDueTotal(118, 117.7)).toBe(118)
  })

  it('rejects missing VAT/service (598 vs 704)', () => {
    expect(resolveAlignedDueTotal(704, 598)).toBeNull()
  })

  it('rejects underpay vs recomputed due', () => {
    expect(resolveAlignedDueTotal(598, 704)).toBeNull()
  })
})

describe('alignPaymentToRecomputedDue', () => {
  it('matches buffet 299×2 with sequential VAT+service rounded to 704', () => {
    const aligned = alignPaymentToRecomputedDue({
      items: [{ name: 'Buffet 299', price: 299, qty: 2 }],
      paymentSum: 704,
      adjustments: omniSeparateFees,
    })
    expect(aligned?.total).toBe(704)
    expect(aligned?.serviceAmt).toBe(59.8)
    expect(aligned?.vat).toBe(46.05)
  })

  it('matches bibimbap 100 → 118', () => {
    const aligned = alignPaymentToRecomputedDue({
      items: [{ name: 'Bibimbap C', price: 100, qty: 1 }],
      paymentSum: 118,
      adjustments: omniSeparateFees,
    })
    expect(aligned?.total).toBe(118)
  })

  it('10% off 70 with VAT separate rounds 67.41 down to the paid 67', () => {
    const aligned = alignPaymentToRecomputedDue({
      items: [
        { name: 'Coke Zero', price: 40, qty: 1 },
        { name: 'coke', price: 30, qty: 1 },
      ],
      paymentSum: 67,
      discountAmt: 7,
      adjustments: {
        vatRate: 7,
        vatMode: 'separate',
        serviceRate: 0,
        paymentTotalRoundingMode: 'round',
      },
    })
    expect(aligned?.total).toBe(67)
    expect(aligned?.vat).toBe(4.41)
  })

  it('returns null when adjustments omit store fees', () => {
    const aligned = alignPaymentToRecomputedDue({
      items: [{ name: 'Buffet 299', price: 299, qty: 2 }],
      paymentSum: 704,
      adjustments: { paymentTotalRoundingMode: 'round', vatRate: 0, serviceRate: 0 },
    })
    expect(aligned).toBeNull()
  })
})

describe('shouldRealignSettleFastDue', () => {
  it('realigns when a payment discount drops the due below the stored total', () => {
    expect(
      shouldRealignSettleFastDue({
        collectableDue: 75,
        nextPaymentSum: 67,
        incomingDiscountAmt: 7,
      })
    ).toBe('discount')
  })

  it('does not lower the stored total on a short payment without a discount', () => {
    expect(
      shouldRealignSettleFastDue({
        collectableDue: 75,
        nextPaymentSum: 67,
        incomingDiscountAmt: 0,
      })
    ).toBeNull()
  })

  it('still realigns when payment exceeds the stored due', () => {
    expect(
      shouldRealignSettleFastDue({
        collectableDue: 598,
        nextPaymentSum: 704,
      })
    ).toBe('exceeds')
  })
})

describe('coercePosPricingAdjustmentsFromBody', () => {
  it('reads POS printer adjustments including rounding', () => {
    const adj = coercePosPricingAdjustmentsFromBody({
      vatRate: 7,
      vatMode: 'separate',
      serviceRate: 10,
      serviceMode: 'separate',
      feeStackMode: 'sequential',
      feeStackOrder: ['service', 'vat', 'other'],
      paymentTotalRoundingMode: 'round',
    })
    expect(adj?.vatMode).toBe('separate')
    expect(adj?.serviceRate).toBe(10)
    expect(adj?.paymentTotalRoundingMode).toBe('round')
  })

  it('returns null for empty object', () => {
    expect(coercePosPricingAdjustmentsFromBody({})).toBeNull()
  })
})
