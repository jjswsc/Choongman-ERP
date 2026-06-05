import { afterEach, describe, expect, it } from 'vitest'
import { enrichStoreListWithGrabMap, dedupeStoreListByCanonical } from '@/lib/erp-store-list-grab-enrich'
import { labelForStore } from '@/lib/store-list-keys'
import {
  aggregateTodaySalesByCanonical,
  mergeRealtimeStoreSalesRows,
} from '@/lib/pos-realtime-store-rows'
import type { Store } from '@/lib/pos-types'

describe('enrichStoreListWithGrabMap', () => {
  const prev = process.env.GRAB_STORE_MAP_JSON

  afterEach(() => {
    if (prev === undefined) delete process.env.GRAB_STORE_MAP_JSON
    else process.env.GRAB_STORE_MAP_JSON = prev
  })

  it('maps partner id to ERP store_code labels', () => {
    process.env.GRAB_STORE_MAP_JSON = JSON.stringify({
      '1042': 'CM Silom',
      '1040': 'CM True Digital',
    })
    const out = enrichStoreListWithGrabMap({
      stores: ['CM True Digital', '1040', '1042'],
      users: {},
      staffByStore: {},
      storeLabels: {
        'CM True Digital': 'CM True Digital',
        '1040': '1040',
        '1042': '1042',
      },
      legacyToCanonical: {},
      usedMaster: true,
    })
    expect(out.stores).toEqual(['CM True Digital', '1042'])
    expect(out.legacyToCanonical['1040']).toBe('CM True Digital')
    expect(out.legacyToCanonical['cm silom']).toBe('1042')
    expect(out.storeLabels['1040']).toBe('CM True Digital')
    expect(out.storeLabels['1042']).toBe('CM Silom')
  })

  it('dedupes ERP name and Grab partner id for the same branch', () => {
    const out = dedupeStoreListByCanonical({
      stores: ['CM True Digital', '1040', '1042'],
      users: { '1040': ['Alice'], 'CM True Digital': ['Bob'] },
      staffByStore: {},
      storeLabels: {
        'CM True Digital': 'CM True Digital',
        '1040': 'CM True Digital',
        '1042': 'CM Silom',
      },
      legacyToCanonical: { '1040': 'CM True Digital' },
      usedMaster: true,
    })
    expect(out.stores).toEqual(['CM True Digital', '1042'])
    expect(out.users['CM True Digital']).toEqual(['Bob', 'Alice'])
    expect(out.legacyToCanonical['1040']).toBe('CM True Digital')
  })
})

describe('aggregateTodaySalesByCanonical', () => {
  it('dedupes legacy and canonical store codes in header totals', () => {
    const total = aggregateTodaySalesByCanonical({
      entries: [
        ['CM True Digital', { completedCount: 10, completedTotal: 1000, completedCash: 400, pendingCount: 1 }],
        ['1040', { completedCount: 5, completedTotal: 33, completedCash: 10, pendingCount: 2 }],
        ['1042', { completedCount: 8, completedTotal: 766, completedCash: 200, pendingCount: 0 }],
      ],
      storeCodes: ['CM True Digital', '1040', '1042'],
      legacyToCanonical: { '1040': 'CM True Digital' },
    })
    expect(total.completedCount).toBe(23)
    expect(total.completedTotal).toBe(1799)
    expect(total.completedCash).toBe(610)
    expect(total.pendingCount).toBe(3)
  })
})

describe('mergeRealtimeStoreSalesRows', () => {
  it('merges duplicate store keys and sums sales', () => {
    const stores: Store[] = [
      { id: 'CM True Digital', name: 'CM True Digital', tables: [] },
      { id: '1040', name: '1040', tables: [] },
      { id: '1042', name: '1042', tables: [] },
    ]
    const rows = mergeRealtimeStoreSalesRows({
      operationalStores: stores,
      storeSalesMap: {
        'CM True Digital': { completedTotal: 1033 },
        '1040': { completedTotal: 0 },
        '1042': { completedTotal: 766 },
      },
      storeCodes: ['CM True Digital', '1040', '1042'],
      legacyToCanonical: {
        '1040': 'CM True Digital',
        '1042': 'CM Silom',
      },
      formatStoreLabel: (code) =>
        labelForStore(
          {
            'CM True Digital': 'CM True Digital',
            '1042': 'CM Silom',
          },
          code
        ),
    })
    expect(rows).toHaveLength(2)
    const trueDigital = rows.find((r) => r.storeId === 'CM True Digital')
    const silom = rows.find((r) => r.storeId === '1042')
    expect(trueDigital?.paid).toBe(1033)
    expect(trueDigital?.storeDisplayName).toBe('CM True Digital')
    expect(silom?.paid).toBe(766)
    expect(silom?.storeDisplayName).toBe('CM Silom')
  })
})
