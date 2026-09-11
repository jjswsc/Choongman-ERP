import { describe, expect, it } from 'vitest'
import {
  CHUNGMAN_FALLBACK_PURCHASE_LOCATIONS,
  withPurchaseLocationFallback,
} from '@/lib/warehouse-purchase-locations'

describe('withPurchaseLocationFallback', () => {
  const hq: { name: string; address: string; location_code: string } = {
    name: 'HQ',
    address: '',
    location_code: 'HQ',
  }

  it('keeps registered locations', () => {
    expect(withPurchaseLocationFallback([hq], true)).toEqual([hq])
    expect(withPurchaseLocationFallback([hq], false)).toEqual([hq])
  })

  it('does not seed Chungman warehouses for Omni', () => {
    expect(withPurchaseLocationFallback([], true)).toEqual([])
  })

  it('keeps Chungman legacy fallback when empty', () => {
    expect(withPurchaseLocationFallback([], false)).toEqual(CHUNGMAN_FALLBACK_PURCHASE_LOCATIONS)
  })
})
