import { describe, expect, it } from 'vitest'
import {
  GRAB_PORTAL_MERCHANT_ENTRIES,
  buildGrabPortalMerchantMapDefaults,
  formatGrabPortalMerchantMapEnvValue,
} from '@/lib/grab-portal-merchant-map-defaults'
import { parseGrabPortalMerchantMap } from '@/lib/grab-store-map-env'
import { resolveGrabMenuNotificationMerchantIDs } from '@/lib/grab-resolve-menu-notification-merchants'

describe('grab-portal-merchant-map-defaults', () => {
  it('includes 11 prod portal stores', () => {
    expect(GRAB_PORTAL_MERCHANT_ENTRIES).toHaveLength(11)
    expect(buildGrabPortalMerchantMapDefaults()['3-C72GUGC1VGJDSE']).toBe('1046')
    expect(buildGrabPortalMerchantMapDefaults()['3-C63UHBKTG64CLJ']).toBe('1045')
    expect(buildGrabPortalMerchantMapDefaults()['3-C6DAVNDVSE61VT']).toBe('1048')
  })

  it('resolves all partner IDs to portal merchant IDs without env', () => {
    const prev = process.env.GRAB_PORTAL_MERCHANT_MAP
    const prevStore = process.env.GRAB_STORE_MAP_JSON
    delete process.env.GRAB_PORTAL_MERCHANT_MAP
    delete process.env.GRAB_STORE_MAP_JSON
    try {
      for (const row of GRAB_PORTAL_MERCHANT_ENTRIES) {
        expect(resolveGrabMenuNotificationMerchantIDs(row.partnerMerchantId)).toEqual([
          row.grabMerchantId,
        ])
      }
    } finally {
      if (prev === undefined) delete process.env.GRAB_PORTAL_MERCHANT_MAP
      else process.env.GRAB_PORTAL_MERCHANT_MAP = prev
      if (prevStore === undefined) delete process.env.GRAB_STORE_MAP_JSON
      else process.env.GRAB_STORE_MAP_JSON = prevStore
    }
  })

  it('env overrides defaults for the same portal key', () => {
    const prev = process.env.GRAB_PORTAL_MERCHANT_MAP
    process.env.GRAB_PORTAL_MERCHANT_MAP = '3-C6DWPB4VCKK1GT=9999'
    try {
      expect(parseGrabPortalMerchantMap()['3-C6DWPB4VCKK1GT']).toBe('9999')
      expect(parseGrabPortalMerchantMap()['3-C4NKAA4FCNCUGA']).toBe('1042')
    } finally {
      if (prev === undefined) delete process.env.GRAB_PORTAL_MERCHANT_MAP
      else process.env.GRAB_PORTAL_MERCHANT_MAP = prev
    }
  })

  it('formats comma-separated env line', () => {
    expect(formatGrabPortalMerchantMapEnvValue()).toContain('3-C6DWPB4VCKK1GT=1040')
    expect(formatGrabPortalMerchantMapEnvValue()).toContain('3-C7KJGBUEJND1VX=1050')
  })
})
