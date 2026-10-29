import { describe, expect, it } from 'vitest'
import {
  computePosPricing,
  normalizePosServiceOrderType,
  resolveServiceRateForOrderType,
  type PosPricingAdjustments,
} from '@/lib/pos-pricing'

const base: PosPricingAdjustments = {
  vatRate: 7,
  vatMode: 'separate',
  serviceRate: 10,
  serviceRateTakeout: 0,
  serviceRateDelivery: 0,
  serviceMode: 'separate',
  feeStackMode: 'parallel',
  paymentTotalRoundingMode: 'none',
}

describe('normalizePosServiceOrderType', () => {
  it('maps common labels', () => {
    expect(normalizePosServiceOrderType('dine_in')).toBe('dine_in')
    expect(normalizePosServiceOrderType('dine-in')).toBe('dine_in')
    expect(normalizePosServiceOrderType('takeout')).toBe('takeout')
    expect(normalizePosServiceOrderType('delivery')).toBe('delivery')
    expect(normalizePosServiceOrderType('Grab')).toBe('delivery')
    expect(normalizePosServiceOrderType('LINE MAN')).toBe('delivery')
  })
})

describe('resolveServiceRateForOrderType', () => {
  it('uses channel rates when set (0 means off)', () => {
    expect(resolveServiceRateForOrderType(base, 'dine_in')).toBe(10)
    expect(resolveServiceRateForOrderType(base, 'dine-in')).toBe(10)
    expect(resolveServiceRateForOrderType(base, 'takeout')).toBe(0)
    expect(resolveServiceRateForOrderType(base, 'delivery')).toBe(0)
  })

  it('falls back to dine-in rate when channel is null', () => {
    const adj: PosPricingAdjustments = {
      serviceRate: 10,
      serviceRateTakeout: null,
      serviceRateDelivery: null,
    }
    expect(resolveServiceRateForOrderType(adj, 'takeout')).toBe(10)
    expect(resolveServiceRateForOrderType(adj, 'delivery')).toBe(10)
  })
})

describe('computePosPricing orderType service', () => {
  it('applies service only for dine-in when takeout/delivery are 0', () => {
    const dine = computePosPricing({
      subtotal: 100,
      orderType: 'dine_in',
      adjustments: base,
    })
    const takeout = computePosPricing({
      subtotal: 100,
      orderType: 'takeout',
      adjustments: base,
    })
    const delivery = computePosPricing({
      subtotal: 100,
      orderType: 'delivery',
      adjustments: base,
    })
    expect(dine.serviceFeeAmt).toBe(10)
    expect(takeout.serviceFeeAmt).toBe(0)
    expect(delivery.serviceFeeAmt).toBe(0)
  })
})
