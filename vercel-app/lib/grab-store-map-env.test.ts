import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  listGrabPartnerStoreCodeRepairs,
  parseGrabPortalMerchantMap,
  parseGrabStoreMap,
  resolveErpStoreCodeFromGrabMap,
} from '@/lib/grab-store-map-env'
import {
  listAllGrabPortalMerchantIdsFromEnv,
  resolveGrabMenuNotificationMerchantIDs,
} from '@/lib/grab-resolve-menu-notification-merchants'

describe('parseGrabPortalMerchantMap', () => {
  it('parses one-line portal=partner format', () => {
    const map = parseGrabPortalMerchantMap('3-C6DWPB4VCKK1GT=1040')
    expect(map['3-C6DWPB4VCKK1GT']).toBe('1040')
    expect(map['3-C4NKAA4FCNCUGA']).toBe('1042')
  })

  it('parses comma-separated pairs and merges code defaults', () => {
    const map = parseGrabPortalMerchantMap('3-AAA=1040,3-BBB=1048')
    expect(map['3-AAA']).toBe('1040')
    expect(map['3-BBB']).toBe('1048')
    expect(map['3-C4NKAA4FCNCUGA']).toBe('1042')
  })

  it('parses True Digital + Silom + Ekkamai portal map', () => {
    const map = parseGrabPortalMerchantMap(
      '3-C6DWPB4VCKK1GT=1040,3-C4NKAA4FCNCUGA=1042,3-C7JGN2B2DFJ1AE=1043'
    )
    expect(map['3-C6DWPB4VCKK1GT']).toBe('1040')
    expect(map['3-C4NKAA4FCNCUGA']).toBe('1042')
    expect(map['3-C7JGN2B2DFJ1AE']).toBe('1043')
    expect(map['3-C63UHBKTG64CLJ']).toBe('1045')
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

  it('resolves prod portal merchant for partner 1040 when portal map is set', () => {
    expect(resolveGrabMenuNotificationMerchantIDs('1040')).toEqual(['3-C6DWPB4VCKK1GT'])
  })

  it('resolves Silom and Ekkamai partner IDs when portal map includes them', () => {
    process.env.GRAB_PORTAL_MERCHANT_MAP =
      '3-C6DWPB4VCKK1GT=1040,3-C4NKAA4FCNCUGA=1042,3-C7JGN2B2DFJ1AE=1043'
    process.env.GRAB_STORE_MAP_JSON = JSON.stringify({
      '1040': 'CM True Digital',
      '1042': 'CM Silom',
      '1043': 'CM Ekkamai',
    })
    expect(resolveGrabMenuNotificationMerchantIDs('1042')).toEqual(['3-C4NKAA4FCNCUGA'])
    expect(resolveGrabMenuNotificationMerchantIDs('1043')).toEqual(['3-C7JGN2B2DFJ1AE'])
    expect(resolveGrabMenuNotificationMerchantIDs('CM Silom')).toEqual(['3-C4NKAA4FCNCUGA'])
    expect(resolveGrabMenuNotificationMerchantIDs('CM Ekkamai')).toEqual(['3-C7JGN2B2DFJ1AE'])
  })

  it('lists all portal merchant IDs for multi-store promo sync', () => {
    process.env.GRAB_PORTAL_MERCHANT_MAP =
      '3-C6DWPB4VCKK1GT=1040,3-C4NKAA4FCNCUGA=1042,3-C7JGN2B2DFJ1AE=1043'
    expect(listAllGrabPortalMerchantIdsFromEnv()).toEqual(
      expect.arrayContaining([
        '3-C4NKAA4FCNCUGA',
        '3-C6DWPB4VCKK1GT',
        '3-C7JGN2B2DFJ1AE',
        '3-C63UHBKTG64CLJ',
      ])
    )
    expect(listAllGrabPortalMerchantIdsFromEnv()).toHaveLength(10)
  })

  it('walks map chain to ERP store_code', () => {
    process.env.GRAB_STORE_MAP_JSON = JSON.stringify({
      'GFSBPOS-811-087': '1042',
      '1042': 'CM Silom',
    })
    expect(resolveErpStoreCodeFromGrabMap('GFSBPOS-811-087')).toBe('CM Silom')
    expect(resolveErpStoreCodeFromGrabMap('1042')).toBe('CM Silom')
  })

  it('lists partner numeric store codes that need ERP repair', () => {
    process.env.GRAB_STORE_MAP_JSON = JSON.stringify({
      '1040': 'CM True Digital',
      '1042': 'CM Silom',
    })
    expect(listGrabPartnerStoreCodeRepairs()).toEqual(
      expect.arrayContaining([
        { from: '1040', to: 'CM True Digital' },
        { from: '1042', to: 'CM Silom' },
        { from: '1045', to: 'CM Seacon Srinakarin' },
      ])
    )
  })
})
