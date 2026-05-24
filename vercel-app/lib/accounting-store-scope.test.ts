import { describe, expect, it } from 'vitest'
import { resolveAccountingStoreFilterFromAuth } from '@/lib/accounting-store-scope'
import { normalizeIncomeScope } from '@/lib/accounting-reports'

const officeAuth = {
  userRole: 'admin',
  userStore: '본사',
  allowedStores: [] as string[],
}

describe('resolveAccountingStoreFilterFromAuth', () => {
  it('keeps 본사 for HQ income statement (does not rewrite to All)', () => {
    expect(resolveAccountingStoreFilterFromAuth('본사', officeAuth)).toBe('본사')
    expect(resolveAccountingStoreFilterFromAuth('Office', officeAuth)).toBe('Office')
  })

  it('still allows explicit All for network rollup', () => {
    expect(resolveAccountingStoreFilterFromAuth('All', officeAuth)).toBe('All')
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
