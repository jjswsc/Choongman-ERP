import { describe, expect, it } from 'vitest'
import { isMemberPortalPublicStore, memberPortalStoresFromMasters } from './member-portal-stores'

describe('isMemberPortalPublicStore', () => {
  it('excludes test and hq store codes', () => {
    expect(isMemberPortalPublicStore({ storeCode: 'test', displayName: 'Test Store' })).toBe(false)
    expect(isMemberPortalPublicStore({ storeCode: 'hq', displayName: 'HQ' })).toBe(false)
    expect(isMemberPortalPublicStore({ storeCode: 'CM Office', displayName: 'CM Office' })).toBe(false)
  })

  it('includes normal franchise stores', () => {
    expect(isMemberPortalPublicStore({ storeCode: 'CM Asoke', displayName: 'CM Asoke' })).toBe(true)
  })
})

describe('memberPortalStoresFromMasters', () => {
  const prevGrabMap = process.env.GRAB_STORE_MAP_JSON

  afterEach(() => {
    if (prevGrabMap === undefined) delete process.env.GRAB_STORE_MAP_JSON
    else process.env.GRAB_STORE_MAP_JSON = prevGrabMap
  })

  it('filters inactive and non-public stores', () => {
    const stores = memberPortalStoresFromMasters([
      { store_code: 'CM Asoke', display_name: 'CM Asoke', is_active: true },
      { store_code: 'test', display_name: 'Test', is_active: true },
      { store_code: 'hq', display_name: 'HQ', is_active: true },
      { store_code: 'CM Rama', display_name: 'CM Rama', is_active: false },
    ])
    expect(stores.map((s) => s.storeCode)).toEqual(['CM Asoke'])
  })

  it('dedupes Grab partner IDs when ERP store_code also exists', () => {
    process.env.GRAB_STORE_MAP_JSON = JSON.stringify({
      '1040': 'CM True Digital',
      '1042': 'CM Silom',
    })
    const stores = memberPortalStoresFromMasters([
      { store_code: '1040', display_name: 'CM True Digital', is_active: true, sort_order: 2 },
      { store_code: 'CM True Digital', display_name: 'CM True Digital', is_active: true, sort_order: 1 },
      { store_code: '1042', display_name: 'CM Silom', is_active: true, sort_order: 4 },
      { store_code: 'CM Silom', display_name: 'CM Silom', is_active: true, sort_order: 3 },
      { store_code: 'CM Asoke', display_name: 'CM Asoke', is_active: true, sort_order: 5 },
    ])
    expect(stores.map((s) => s.storeCode)).toEqual(['CM True Digital', 'CM Silom', 'CM Asoke'])
  })
})
