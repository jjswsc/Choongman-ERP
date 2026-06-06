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
  it('filters inactive and non-public stores', () => {
    const stores = memberPortalStoresFromMasters([
      { store_code: 'CM Asoke', display_name: 'CM Asoke', is_active: true },
      { store_code: 'test', display_name: 'Test', is_active: true },
      { store_code: 'hq', display_name: 'HQ', is_active: true },
      { store_code: 'CM Rama', display_name: 'CM Rama', is_active: false },
    ])
    expect(stores.map((s) => s.storeCode)).toEqual(['CM Asoke'])
  })
})
