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
    expect(resolveGrabMenuNotificationMerchantIDs('1040')).toEqual([
      '3-C6DWPB4VCKK1GT',
      'GFSBPOS-811-087',
    ])
  })

  it('expands GFSBPOS to linked portal id', () => {
    const ids = resolveGrabMenuNotificationMerchantIDs('GFSBPOS-811-087')
    expect(ids).toContain('GFSBPOS-811-087')
    expect(ids).toContain('3-C6DWPB4VCKK1GT')
  })

  it('accepts portal id directly', () => {
    expect(resolveGrabMenuNotificationMerchantIDs('3-C6DWPB4VCKK1GT')).toEqual([
      '3-C6DWPB4VCKK1GT',
      'GFSBPOS-811-087',
    ])
  })
})
