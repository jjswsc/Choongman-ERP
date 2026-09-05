import { afterEach, describe, expect, it } from 'vitest'
import {
  dedupeStoreCodesForPicker,
  enrichStoreListWithGrabMap,
  dedupeStoreListByCanonical,
} from '@/lib/erp-store-list-grab-enrich'
import { labelForStore } from '@/lib/store-list-keys'
import {
  aggregateTodaySalesByCanonical,
  computeRealtimeExpectedAddend,
  computeRealtimeTableTotal,
  mergeRealtimeStoreSalesRows,
  sumStoreTableOrders,
  sumStoreTableOrdersForExpectedAddend,
} from '@/lib/pos-realtime-store-rows'
import { flattenOpenTableTotalLookup } from '@/lib/pos-open-table-totals'
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

  it('dedupes numeric partner IDs when display_name is still 1040/1042 (no Grab env)', () => {
    delete process.env.GRAB_STORE_MAP_JSON
    delete process.env.GRAB_PORTAL_MERCHANT_MAP
    const masters = [
      { store_code: '1040', display_name: '1040', is_active: true, sort_order: 2 },
      { store_code: 'CM True Digital', display_name: 'CM True Digital', is_active: true, sort_order: 1 },
      { store_code: '1042', display_name: '1042', is_active: true, sort_order: 4 },
      { store_code: 'CM Silom', display_name: 'CM Silom', is_active: true, sort_order: 3 },
    ]
    expect(
      dedupeStoreCodesForPicker(
        ['1040', 'CM True Digital', '1042', 'CM Silom', 'CM Asoke'],
        masters
      )
    ).toEqual(['CM True Digital', 'CM Silom', 'CM Asoke'])
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

  it('does not double table totals for legacy duplicate store snapshots', () => {
    const order = { id: '99', total: 500, status: 'pending' as const, type: 'dine-in' as const, items: [], createdAt: new Date() }
    const stores: Store[] = [
      {
        id: 'CM True Digital',
        name: 'CM True Digital',
        tables: [{ id: 't1', name: '1', order, isOccupied: true }],
      },
      {
        id: '1040',
        name: '1040',
        tables: [{ id: 't1', name: '1', order, isOccupied: true }],
      },
    ]
    const rows = mergeRealtimeStoreSalesRows({
      operationalStores: stores,
      storeSalesMap: {},
      storeCodes: ['CM True Digital', '1040'],
      legacyToCanonical: { '1040': 'CM True Digital' },
      formatStoreLabel: (code) => code,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.tableTotal).toBe(500)
  })

  it('matches unpaid API totals when store codes differ by CM prefix', () => {
    const lookup = flattenOpenTableTotalLookup({ 'CM MBK': { tableTotal: 7600 } })
    const rows = mergeRealtimeStoreSalesRows({
      operationalStores: [],
      storeSalesMap: { MBK: { completedTotal: 100 } },
      storeCodes: ['MBK'],
      legacyToCanonical: {},
      formatStoreLabel: (code) => code,
      includeStoreIds: ['MBK'],
      tableTotalByStore: lookup,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.tableTotal).toBe(7600)
  })
})

describe('sumStoreTableOrders', () => {
  it('counts the same order id only once across tables', () => {
    const order = {
      id: '42',
      total: 800,
      status: 'pending' as const,
      type: 'dine-in' as const,
      items: [],
      createdAt: new Date(),
    }
    const store: Store = {
      id: 'CM A',
      name: 'CM A',
      tables: [
        { id: 'a', name: '1', order, isOccupied: true },
        { id: 'b', name: '1F-1', order, isOccupied: true },
      ],
    }
    expect(sumStoreTableOrders(store)).toBe(800)
  })

  it('includes ready (unpaid seat) but excludes paid/completed', () => {
    const base = { type: 'dine-in' as const, items: [], createdAt: new Date() }
    const store: Store = {
      id: 'CM A',
      name: 'CM A',
      tables: [
        { id: 'a', name: '1', order: { ...base, id: '1', total: 100, status: 'pending' }, isOccupied: true },
        { id: 'b', name: '2', order: { ...base, id: '2', total: 200, status: 'ready' }, isOccupied: true },
        { id: 'c', name: '3', order: { ...base, id: '3', total: 300, status: 'paid' }, isOccupied: true },
        { id: 'd', name: '4', order: { ...base, id: '4', total: 400, status: 'completed' }, isOccupied: true },
      ],
    }
    expect(sumStoreTableOrders(store)).toBe(300)
    expect(sumStoreTableOrdersForExpectedAddend(store)).toBe(100)
  })
})

describe('computeRealtimeTableTotal', () => {
  it('dedupes canonical store snapshots for all-store totals', () => {
    const order = { id: '7', total: 300, status: 'pending' as const, type: 'dine-in' as const, items: [], createdAt: new Date() }
    const stores: Store[] = [
      {
        id: '1040',
        name: '1040',
        tables: [{ id: 't1', name: '2', order, isOccupied: true }],
      },
      {
        id: 'CM True Digital',
        name: 'CM True Digital',
        tables: [{ id: 't1', name: '2', order, isOccupied: true }],
      },
    ]
    const total = computeRealtimeTableTotal({
      isAllStores: true,
      stores,
      storeCodes: ['CM True Digital', '1040'],
      legacyToCanonical: { '1040': 'CM True Digital' },
    })
    expect(total).toBe(300)
  })

  it('expected addend excludes ready already in confirmed sales', () => {
    const base = { type: 'dine-in' as const, items: [], createdAt: new Date() }
    const stores: Store[] = [
      {
        id: 'CM A',
        name: 'CM A',
        tables: [
          { id: 'a', name: '1', order: { ...base, id: '1', total: 100, status: 'pending' }, isOccupied: true },
          { id: 'b', name: '2', order: { ...base, id: '2', total: 200, status: 'ready' }, isOccupied: true },
        ],
      },
    ]
    expect(
      computeRealtimeTableTotal({
        isAllStores: true,
        stores,
        storeCodes: ['CM A'],
        legacyToCanonical: {},
      })
    ).toBe(300)
    expect(
      computeRealtimeExpectedAddend({
        isAllStores: true,
        stores,
        storeCodes: ['CM A'],
        legacyToCanonical: {},
      })
    ).toBe(100)
  })
})
