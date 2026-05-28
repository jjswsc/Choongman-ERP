import { describe, expect, it } from 'vitest'
import {
  GRAB_DELIVERY_ON_APP_PRICING_KEYS,
  buildGrabDeliveryAdvancedPricing,
} from '@/lib/grab-menu-advanced-pricing'

describe('buildGrabDeliveryAdvancedPricing', () => {
  it('sets delivery grab-app keys in minor units', () => {
    const ap = buildGrabDeliveryAdvancedPricing(11100)
    for (const key of GRAB_DELIVERY_ON_APP_PRICING_KEYS) {
      expect(ap[key]).toBe(11100)
    }
  })

  it('never returns zero', () => {
    expect(buildGrabDeliveryAdvancedPricing(0).Delivery_OnDemand_GrabApp).toBe(1)
  })
})
