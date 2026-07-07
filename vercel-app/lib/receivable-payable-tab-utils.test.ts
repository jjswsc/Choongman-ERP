import { describe, expect, it } from 'vitest'
import {
  mergeReceivablePayableCumulativeByKey,
  resolveEffectivePayableStoreFilter,
} from '@/components/tabs/receivable-payable-tab-utils'

describe('mergeReceivablePayableCumulativeByKey', () => {
  it('prefers payable list cumulativeByVendor over summary rows', () => {
    const byKey = mergeReceivablePayableCumulativeByKey({
      tab: 'payable',
      summaryRows: [{ vendorCode: '1014', balance: 100000 }],
      listItems: [{ vendorCode: '1014', cumulativeBalance: 120000, balance: 30000 }],
      payableCumulativeByVendor: { '1014': 246216.84 },
    })
    expect(byKey['1014']).toBe(246216.84)
  })

  it('prefers receivable list cumulativeByStoreGroup over summary rows', () => {
    const byKey = mergeReceivablePayableCumulativeByKey({
      tab: 'receivable',
      summaryRows: [{ storeName: 'CM Bangna', balance: 50000 }],
      listItems: [{ storeName: 'CM Bangna', cumulativeBalance: 60000, balance: 10000 }],
      receivableCumulativeByStoreGroup: { bangna: 90000 },
    })
    expect(byKey.bangna).toBe(90000)
  })

  it('uses receivable list item cumulative when cumulativeByStoreGroup is missing', () => {
    const byKey = mergeReceivablePayableCumulativeByKey({
      tab: 'receivable',
      summaryRows: [],
      listItems: [{ storeName: 'CM Bangna', cumulativeBalance: 50000, balance: 10000 }],
    })
    expect(byKey.bangna).toBe(50000)
  })
})

describe('resolveEffectivePayableStoreFilter', () => {
  it('defaults office users to CM Office before explicit All selection', () => {
    expect(
      resolveEffectivePayableStoreFilter({
        payableStoreFilter: 'All',
        canSelectStores: true,
        storeList: ['CM Bangna', 'CM Office'],
        officeDefaultApplied: false,
      })
    ).toBe('CM Office')
  })

  it('respects explicit All after office default was applied', () => {
    expect(
      resolveEffectivePayableStoreFilter({
        payableStoreFilter: 'All',
        canSelectStores: true,
        storeList: ['CM Bangna', 'CM Office'],
        officeDefaultApplied: true,
      })
    ).toBe('All')
  })

  it('keeps explicit store selection', () => {
    expect(
      resolveEffectivePayableStoreFilter({
        payableStoreFilter: 'CM Bangna',
        canSelectStores: true,
        storeList: ['CM Bangna', 'CM Office'],
      })
    ).toBe('CM Bangna')
  })
})
