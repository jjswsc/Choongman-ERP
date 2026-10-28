import { describe, expect, it } from 'vitest'
import {
  applyPartSoldOutToOptionFlags,
  optionStepSoldOutKey,
  optionStepValuesHitSoldOut,
  shouldApplyOptionStepSoldOutForChannel,
} from '@/lib/pos-option-step-store-sold-out'

describe('pos-option-step-store-sold-out', () => {
  it('builds stable keys', () => {
    expect(optionStepSoldOutKey('part', 'Wing')).toBe('part:Wing')
  })

  it('hits sold-out when part matches', () => {
    const keys = new Set(['part:Wing'])
    expect(optionStepValuesHitSoldOut({ part: 'Wing', size: 'M' }, keys)).toBe(true)
    expect(optionStepValuesHitSoldOut({ part: 'Boneless', size: 'M' }, keys)).toBe(false)
    expect(optionStepValuesHitSoldOut(null, keys)).toBe(false)
  })

  it('skips store scope on delivery channel', () => {
    expect(shouldApplyOptionStepSoldOutForChannel('delivery', 'store')).toBe(false)
    expect(shouldApplyOptionStepSoldOutForChannel('storefront', 'store')).toBe(true)
    expect(shouldApplyOptionStepSoldOutForChannel('delivery', 'all')).toBe(true)
  })

  it('clears storefront sell flags for sold-out part', () => {
    const keys = new Set(['part:Wing'])
    const out = applyPartSoldOutToOptionFlags(
      [
        {
          optionStepValues: { part: 'Wing', size: 'M' },
          sellHall: true,
          sellDelivery: true,
          sellPackaging: true,
          sellMember: true,
        },
        {
          optionStepValues: { part: 'Boneless', size: 'M' },
          sellHall: true,
          sellDelivery: true,
          sellPackaging: true,
          sellMember: true,
        },
      ],
      { storefrontKeys: keys }
    )
    expect(out[0]?.sellHall).toBe(false)
    expect(out[0]?.sellPackaging).toBe(false)
    expect(out[0]?.sellMember).toBe(false)
    expect(out[0]?.sellDelivery).toBe(true)
    expect(out[1]?.sellHall).toBe(true)
  })

  it('clears delivery flag when scope=all keys provided', () => {
    const storefront = new Set(['part:Wing'])
    const delivery = new Set(['part:Wing'])
    const out = applyPartSoldOutToOptionFlags(
      [
        {
          optionStepValues: { part: 'Wing', size: 'M' },
          sellHall: true,
          sellDelivery: true,
          sellPackaging: true,
          sellMember: true,
        },
      ],
      { storefrontKeys: storefront, deliveryKeys: delivery }
    )
    expect(out[0]?.sellHall).toBe(false)
    expect(out[0]?.sellDelivery).toBe(false)
  })
})
