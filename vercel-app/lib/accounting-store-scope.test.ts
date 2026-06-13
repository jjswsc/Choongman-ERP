import { describe, expect, it } from 'vitest'
import {
  parseCommaSeparatedStoreFilter,
  resolveAccountingRollupStores,
  resolveAccountingStoreFilterFromAuth,
  resolvePosStoreCodesForAccountingScope,
} from '@/lib/accounting-store-scope'
import { normalizeIncomeScope } from '@/lib/accounting-reports'
import {
  decodeFinancialStatementStoreFilter,
  encodeFinancialStatementStoreFilter,
} from '@/lib/financial-statement-store-options'

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

  it('franchisee multi-store: comma-separated subset', () => {
    expect(resolveAccountingStoreFilterFromAuth('CM Rama9,CM Ladprao', franchiseAuth)).toBe(
      'CM Rama9,CM Ladprao'
    )
  })

  it('franchisee multi-store: rejects store outside allowed', () => {
    expect(() => resolveAccountingStoreFilterFromAuth('CM Other,CM Rama9', franchiseAuth)).toThrow()
  })
})

describe('parseCommaSeparatedStoreFilter', () => {
  it('parses and dedupes store codes', () => {
    expect(parseCommaSeparatedStoreFilter('A,B,A')).toEqual(['A', 'B'])
    expect(parseCommaSeparatedStoreFilter('All')).toBeNull()
    expect(parseCommaSeparatedStoreFilter('Single')).toBeNull()
  })
})

describe('resolveAccountingRollupStores', () => {
  it('prefers explicit multi selection over franchise All rollup', () => {
    expect(
      resolveAccountingRollupStores({
        storeFilter: 'A,B',
        selectedStoresOnly: ['A', 'B'],
        allowedStoresOnly: ['A', 'B', 'C'],
      })
    ).toEqual(['A', 'B'])
  })
})

describe('financial statement store encode/decode', () => {
  const codes = ['A', 'B', 'C']

  it('round-trips multi selection', () => {
    const encoded = encodeFinancialStatementStoreFilter({
      franchiseStoreCodes: codes,
      selectedFranchiseStores: ['A', 'C'],
      officeSelected: false,
      allFranchiseSelected: false,
    })
    expect(encoded).toBe('A,C')
    expect(decodeFinancialStatementStoreFilter(encoded, codes)).toEqual({
      selectedFranchiseStores: ['A', 'C'],
      officeSelected: false,
    })
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

  it('sets selectedStoresOnly for comma-separated franchise stores', () => {
    const scope = normalizeIncomeScope({
      yearMonth: '2026-05',
      storeFilter: 'CM Rama9,CM Ladprao',
      userRole: franchiseAuth.userRole,
      userStore: franchiseAuth.userStore,
      allowedStores: franchiseAuth.allowedStores,
    })
    expect(scope.selectedStoresOnly).toEqual(['CM Rama9', 'CM Ladprao'])
    expect(scope.allowedStoresOnly).toBeUndefined()
    expect(resolvePosStoreCodesForAccountingScope(scope)).toEqual(['CM Rama9', 'CM Ladprao'])
  })
})
