import { describe, expect, it } from 'vitest'
import {
  canSearchAllPettyCashStores,
  resolvePettyCashEffectiveStore,
  scopedPettyCashStoreOptions,
} from '@/lib/petty-cash-store-scope'

describe('canSearchAllPettyCashStores', () => {
  it('allows HQ roles and office-store staff', () => {
    expect(canSearchAllPettyCashStores('director', 'CM Office')).toBe(true)
    expect(canSearchAllPettyCashStores('accounting', 'CM Silom')).toBe(true)
    expect(canSearchAllPettyCashStores('supervisor', 'Office')).toBe(true)
    expect(canSearchAllPettyCashStores('supervisor', 'CM Rama9')).toBe(false)
    expect(canSearchAllPettyCashStores('manager', 'CM Silom')).toBe(false)
  })
})

describe('scopedPettyCashStoreOptions', () => {
  it('includes extra_stores for store-scoped users', () => {
    expect(
      scopedPettyCashStoreOptions(['CM Silom', 'CM Rama9', 'CM Ladprao'], 'CM Silom', ['CM Rama9'])
    ).toEqual(['CM Silom', 'CM Rama9'])
  })
})

describe('resolvePettyCashEffectiveStore', () => {
  it('lets office-store supervisor query any store', () => {
    const r = resolvePettyCashEffectiveStore({
      storeFilter: 'CM Silom',
      userStore: 'Office',
      userRole: 'supervisor',
      allowedStores: ['Office'],
    })
    expect(r.forbidden).toBe(false)
    expect(r.effectiveStore).toBe('CM Silom')
  })

  it('blocks store manager from another branch', () => {
    const r = resolvePettyCashEffectiveStore({
      storeFilter: 'CM Silom',
      userStore: 'CM Rama9',
      userRole: 'manager',
      allowedStores: ['CM Rama9'],
    })
    expect(r.forbidden).toBe(true)
  })
})
