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

  it('returns both merchant ids for partner store 1040', () => {
    expect(resolveGrabMenuNotificationMerchantIDs('1040')).toEqual(['GFSBPOS-811-087'])
  })

  it('expands GFSBPOS from linked portal id in map', () => {
    expect(resolveGrabMenuNotificationMerchantIDs('3-C6DWPB4VCKK1GT')).toEqual(['GFSBPOS-811-087'])
  })

  it('accepts GFSBPOS directly', () => {
    expect(resolveGrabMenuNotificationMerchantIDs('GFSBPOS-811-087')).toEqual(['GFSBPOS-811-087'])
  })
})
