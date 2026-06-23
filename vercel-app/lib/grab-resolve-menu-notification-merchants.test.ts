import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  collectGrabMapLookupSeedsForStore,
  collectGrabMenuSyncMerchantIDsForStoreLookup,
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

  it('uses GRAB_PARTNER_API_MENU_MERCHANT_MAP override for partner 1040', () => {
    const prevApi = process.env.GRAB_PARTNER_API_MENU_MERCHANT_MAP
    process.env.GRAB_PARTNER_API_MENU_MERCHANT_MAP = '1040=GFSBPOS-PROD-999'
    expect(resolveGrabMenuNotificationMerchantIDs('1040')).toEqual(['GFSBPOS-PROD-999'])
    if (prevApi === undefined) delete process.env.GRAB_PARTNER_API_MENU_MERCHANT_MAP
    else process.env.GRAB_PARTNER_API_MENU_MERCHANT_MAP = prevApi
  })

  it('resolves CM The street via map alias to portal merchant 1050', () => {
    const prevPortal = process.env.GRAB_PORTAL_MERCHANT_MAP
    const prevMap = process.env.GRAB_STORE_MAP_JSON
    delete process.env.GRAB_PORTAL_MERCHANT_MAP
    process.env.GRAB_STORE_MAP_JSON = JSON.stringify({
      '3-C7KJGBUEJND1VX': '1050',
      '1050': 'CM The Street Ratchada',
      'CM The street': '1050',
    })
    const seeds = collectGrabMapLookupSeedsForStore('CM The street', [
      {
        store_code: 'CM The street',
        display_name: 'CM The street',
        aliases: ['CM The Street Ratchada', '1050'],
      },
    ])
    expect(seeds).toContain('CM The Street Ratchada')
    const ids = new Set<string>()
    for (const seed of seeds) {
      for (const id of collectGrabMenuSyncMerchantIDsForStoreLookup(seed)) ids.add(id)
    }
    expect(Array.from(ids)).toEqual(['3-C7KJGBUEJND1VX'])
    if (prevPortal === undefined) delete process.env.GRAB_PORTAL_MERCHANT_MAP
    else process.env.GRAB_PORTAL_MERCHANT_MAP = prevPortal
    if (prevMap === undefined) delete process.env.GRAB_STORE_MAP_JSON
    else process.env.GRAB_STORE_MAP_JSON = prevMap
  })

  it('resolves GFSBPOS via partner store to portal merchant when defaults link 1040', () => {
    const prevPortal = process.env.GRAB_PORTAL_MERCHANT_MAP
    const prevMap = process.env.GRAB_STORE_MAP_JSON
    delete process.env.GRAB_PORTAL_MERCHANT_MAP
    process.env.GRAB_STORE_MAP_JSON = JSON.stringify({
      'GFSBPOS-811-087': '1040',
      '1040': 'CM True Digital',
    })
    expect(resolveGrabMenuNotificationMerchantIDs('GFSBPOS-811-087')).toEqual(['3-C6DWPB4VCKK1GT'])
    if (prevPortal === undefined) delete process.env.GRAB_PORTAL_MERCHANT_MAP
    else process.env.GRAB_PORTAL_MERCHANT_MAP = prevPortal
    if (prevMap === undefined) delete process.env.GRAB_STORE_MAP_JSON
    else process.env.GRAB_STORE_MAP_JSON = prevMap
  })
})
