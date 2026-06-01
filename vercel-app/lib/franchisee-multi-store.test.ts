import { describe, expect, it } from 'vitest'
import {
  canFranchiseeAggregateAllowedStores,
  isFranchiseeAggregateAllStoresView,
  pickFranchiseePosSalesStoreCodes,
  resolveFranchiseePosSalesFetchStoreCodes,
  FRANCHISEE_AGGREGATE_ALL_STORES_VALUE,
} from '@/lib/franchisee-multi-store'

describe('franchisee multi-store sales scope', () => {
  const auth = {
    role: 'franchisee',
    store: 'CM Rama9',
    allowedStores: ['CM Rama9', 'CM Ladprao'],
  }

  it('canFranchiseeAggregateAllowedStores requires 2+ stores', () => {
    expect(canFranchiseeAggregateAllowedStores('franchisee', ['CM A'])).toBe(false)
    expect(canFranchiseeAggregateAllowedStores('franchisee', ['CM A', 'CM B'])).toBe(true)
    expect(canFranchiseeAggregateAllowedStores('manager', ['CM A', 'CM B'])).toBe(false)
  })

  it('isFranchiseeAggregateAllStoresView', () => {
    expect(isFranchiseeAggregateAllStoresView('')).toBe(true)
    expect(isFranchiseeAggregateAllStoresView(FRANCHISEE_AGGREGATE_ALL_STORES_VALUE)).toBe(true)
    expect(isFranchiseeAggregateAllStoresView('CM Rama9')).toBe(false)
  })

  it('resolveFranchiseePosSalesFetchStoreCodes — All returns all allowed', () => {
    expect(resolveFranchiseePosSalesFetchStoreCodes(auth, 'All')).toEqual([
      'CM Rama9',
      'CM Ladprao',
    ])
  })

  it('resolveFranchiseePosSalesFetchStoreCodes — single store', () => {
    expect(resolveFranchiseePosSalesFetchStoreCodes(auth, 'CM Ladprao')).toEqual(['CM Ladprao'])
  })

  it('pickFranchiseePosSalesStoreCodes clamps unknown stores', () => {
    expect(pickFranchiseePosSalesStoreCodes(auth, ['CM Other'])).toEqual(['CM Rama9', 'CM Ladprao'])
    expect(pickFranchiseePosSalesStoreCodes(auth, ['CM Ladprao'])).toEqual(['CM Ladprao'])
  })
})
