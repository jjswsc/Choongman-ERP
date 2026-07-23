import { describe, expect, it } from 'vitest'
import {
  isTenantPrefixedSyntheticStoreCode,
  resolveErpStoreCodeForWrite,
  sanitizeMenuScopeStoreCodes,
  storeCodeIdentityForms,
  stripTenantPrefixedStoreCode,
} from '@/lib/pos-operating-store-code'
import { menuScopeIncludesStore, normalizeMenuScopeStoreCodes } from '@/lib/pos-menu-store-scope'

describe('pos-operating-store-code', () => {
  it('strips tenant:store synthetic codes', () => {
    expect(stripTenantPrefixedStoreCode('malatang01:1001')).toBe('1001')
    expect(stripTenantPrefixedStoreCode('1001')).toBe('1001')
    expect(stripTenantPrefixedStoreCode('CM Rama9')).toBe('CM Rama9')
    expect(isTenantPrefixedSyntheticStoreCode('malatang01:1001')).toBe(true)
    expect(isTenantPrefixedSyntheticStoreCode('1001')).toBe(false)
  })

  it('sanitizes scope arrays', () => {
    expect(sanitizeMenuScopeStoreCodes(['malatang01:1001', '1001', ' 1040 ', ''])).toEqual([
      '1001',
      '1040',
    ])
  })

  it('resolves write codes without inventing tenant:name', () => {
    expect(resolveErpStoreCodeForWrite({ storeCode: '1001', storeName: 'HQ' })).toEqual({
      ok: true,
      storeCode: '1001',
    })
    expect(resolveErpStoreCodeForWrite({ storeCode: 'malatang01:1001', storeName: 'HQ' })).toEqual({
      ok: true,
      storeCode: '1001',
    })
    expect(resolveErpStoreCodeForWrite({ storeCode: '', storeName: '1001' })).toEqual({
      ok: true,
      storeCode: '1001',
    })
    expect(resolveErpStoreCodeForWrite({ storeCode: '', storeName: '' }).ok).toBe(false)
  })

  it('matches scoped 1001 against synthetic request malatang01:1001', () => {
    expect(storeCodeIdentityForms('malatang01:1001')).toEqual(['malatang01:1001', '1001'])
    expect(menuScopeIncludesStore(['1001'], 'malatang01:1001')).toBe(true)
    expect(menuScopeIncludesStore(['malatang01:1001'], '1001')).toBe(true)
    expect(normalizeMenuScopeStoreCodes(['malatang01:1001', '1001'])).toEqual(['1001'])
  })
})
