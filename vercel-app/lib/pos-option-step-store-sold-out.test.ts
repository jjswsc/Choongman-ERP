import { describe, expect, it } from 'vitest'
import {
  applyStorefrontPartSoldOutToOptionFlags,
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
    const out = applyStorefrontPartSoldOutToOptionFlags(
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
      keys
    )
    expect(out[0]?.sellHall).toBe(false)
    expect(out[0]?.sellPackaging).toBe(false)
    expect(out[0]?.sellMember).toBe(false)
    expect(out[0]?.sellDelivery).toBe(true)
    expect(out[1]?.sellHall).toBe(true)
  })
})
