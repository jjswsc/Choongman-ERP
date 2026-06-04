import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  isGrabFoodMerchantMapKey,
  resolveGrabMenuNotificationMerchantIDs,
} from '@/lib/grab-resolve-menu-notification-merchants'

describe('isGrabFoodMerchantMapKey', () => {
  it('accepts GFSBPOS partner ids', () => {
    expect(isGrabFoodMerchantMapKey('GFSBPOS-204-253')).toBe(true)
  })

  it('accepts Grab portal merchant ids from orders', () => {
    expect(isGrabFoodMerchantMapKey('3-C6DWPB4VCKK1GT')).toBe(true)
  })

  it('rejects partner store numeric ids', () => {
    expect(isGrabFoodMerchantMapKey('1040')).toBe(false)
  })
})

describe('resolveGrabMenuNotificationMerchantIDs', () => {
  const prev = process.env.GRAB_STORE_MAP_JSON

  beforeEach(() => {
    process.env.GRAB_STORE_MAP_JSON = JSON.stringify({
      'GFSBPOS-811-087': '1040',
      '3-C6DWPB4VCKK1GT': '1040',
      '1040': 'CM True Digital',
    })
  })

  afterEach(() => {
    if (prev === undefined) delete process.env.GRAB_STORE_MAP_JSON
    else process.env.GRAB_STORE_MAP_JSON = prev
  })

  it('prefers prod portal merchant for partner store 1040 when portal is in map', () => {
    expect(resolveGrabMenuNotificationMerchantIDs('1040')).toEqual(['3-C6DWPB4VCKK1GT'])
  })

  it('returns portal id when input is portal merchant', () => {
    expect(resolveGrabMenuNotificationMerchantIDs('3-C6DWPB4VCKK1GT')).toEqual(['3-C6DWPB4VCKK1GT'])
  })

  it('linked portal wins over GFSBPOS when both map to same partner store', () => {
    expect(resolveGrabMenuNotificationMerchantIDs('GFSBPOS-811-087')).toEqual(['3-C6DWPB4VCKK1GT'])
  })

  it('uses GFSBPOS when portal map is absent (sandbox-only)', () => {
    const prevPortal = process.env.GRAB_PORTAL_MERCHANT_MAP
    const prevMap = process.env.GRAB_STORE_MAP_JSON
    delete process.env.GRAB_PORTAL_MERCHANT_MAP
    process.env.GRAB_STORE_MAP_JSON = JSON.stringify({
      'GFSBPOS-811-087': '1040',
      '1040': 'CM True Digital',
    })
    expect(resolveGrabMenuNotificationMerchantIDs('GFSBPOS-811-087')).toEqual(['GFSBPOS-811-087'])
    if (prevPortal === undefined) delete process.env.GRAB_PORTAL_MERCHANT_MAP
    else process.env.GRAB_PORTAL_MERCHANT_MAP = prevPortal
    if (prevMap === undefined) delete process.env.GRAB_STORE_MAP_JSON
    else process.env.GRAB_STORE_MAP_JSON = prevMap
  })
})
