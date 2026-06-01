import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { parseGrabPortalMerchantMap, parseGrabStoreMap } from '@/lib/grab-store-map-env'
import { resolveGrabMenuNotificationMerchantIDs } from '@/lib/grab-resolve-menu-notification-merchants'

describe('parseGrabPortalMerchantMap', () => {
  it('parses one-line portal=partner format', () => {
    expect(parseGrabPortalMerchantMap('3-C6DWPB4VCKK1GT=1040')).toEqual({
      '3-C6DWPB4VCKK1GT': '1040',
    })
  })

  it('parses comma-separated pairs', () => {
    expect(parseGrabPortalMerchantMap('3-AAA=1040,3-BBB=1048')).toEqual({
      '3-AAA': '1040',
      '3-BBB': '1048',
    })
  })
})

describe('parseGrabStoreMap merge', () => {
  const prevMap = process.env.GRAB_STORE_MAP_JSON
  const prevPortal = process.env.GRAB_PORTAL_MERCHANT_MAP

  beforeEach(() => {
    process.env.GRAB_STORE_MAP_JSON = JSON.stringify({
      'GFSBPOS-811-087': '1040',
      '1040': 'CM True Digital',
    })
    process.env.GRAB_PORTAL_MERCHANT_MAP = '3-C6DWPB4VCKK1GT=1040'
  })

  afterEach(() => {
    if (prevMap === undefined) delete process.env.GRAB_STORE_MAP_JSON
    else process.env.GRAB_STORE_MAP_JSON = prevMap
    if (prevPortal === undefined) delete process.env.GRAB_PORTAL_MERCHANT_MAP
    else process.env.GRAB_PORTAL_MERCHANT_MAP = prevPortal
  })

  it('merges portal map into store map', () => {
    expect(parseGrabStoreMap()['3-C6DWPB4VCKK1GT']).toBe('1040')
  })

  it('resolves partner api id for partner 1040 (portal excluded from sync list)', () => {
    expect(resolveGrabMenuNotificationMerchantIDs('1040')).toEqual(['GFSBPOS-811-087'])
  })
})
