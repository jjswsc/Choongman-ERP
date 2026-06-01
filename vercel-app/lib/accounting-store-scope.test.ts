import { describe, expect, it } from 'vitest'
import { resolveAccountingStoreFilterFromAuth } from '@/lib/accounting-store-scope'
import { normalizeIncomeScope } from '@/lib/accounting-reports'

const officeAuth = {
  userRole: 'admin',
  userStore: '본사',
  allowedStores: [] as string[],
}

const franchiseAuth = {
  userRole: 'franchisee',
  userStore: 'CM Rama9',
  allowedStores: ['CM Rama9', 'CM Ladprao'],
}

describe('resolveAccountingStoreFilterFromAuth', () => {
  it('keeps 본사 for HQ income statement (does not rewrite to All)', () => {
    expect(resolveAccountingStoreFilterFromAuth('본사', officeAuth)).toBe('본사')
    expect(resolveAccountingStoreFilterFromAuth('Office', officeAuth)).toBe('Office')
  })

  it('still allows explicit All for network rollup', () => {
    expect(resolveAccountingStoreFilterFromAuth('All', officeAuth)).toBe('All')
  })

  it('franchisee multi-store: All stays All (allowed stores rollup)', () => {
    expect(resolveAccountingStoreFilterFromAuth('All', franchiseAuth)).toBe('All')
    expect(resolveAccountingStoreFilterFromAuth('', franchiseAuth)).toBe('All')
  })

  it('franchisee multi-store: single allowed store', () => {
    expect(resolveAccountingStoreFilterFromAuth('CM Ladprao', franchiseAuth)).toBe('CM Ladprao')
  })
})

describe('normalizeIncomeScope', () => {
  it('sets isHQ when storeFilter is 본사', () => {
    const scope = normalizeIncomeScope({
      yearMonth: '2026-05',
      storeFilter: '본사',
      userRole: officeAuth.userRole,
      userStore: officeAuth.userStore,
      allowedStores: officeAuth.allowedStores,
    })
    expect(scope.storeFilter).toBe('본사')
    expect(scope.isHQ).toBe(true)
  })
})
