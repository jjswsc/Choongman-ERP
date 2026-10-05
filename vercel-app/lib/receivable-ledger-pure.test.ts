import { describe, expect, it } from 'vitest'
import {
  buildReceivableVendorMapsFromRows,
  filterReceivableRows,
  type ReceivableTransactionRow,
} from './receivable-ledger-pure'

const emptyAttribution = { accrualStoreByDateAmount: new Map<string, string>() }

describe('filterReceivableRows', () => {
  const rows: ReceivableTransactionRow[] = [
    { id: 1, store_name: 'CM Silom', amount: 100, ref_type: 'Order' },
    { id: 2, store_name: 'CM Ekkamai', amount: 200, ref_type: 'Order' },
    { id: 3, store_name: 'CM Union Mall', amount: 300, ref_type: 'Order' },
  ]

  it('keeps HQ books on all outlets and store books on the selected outlet', () => {
    const vendorMaps = buildReceivableVendorMapsFromRows([
      { code: '1042', name: 'Silom Co', sales_outlet: 'CM Silom', gps_name: '' },
      { code: '1043', name: 'CM Ekkamai', sales_outlet: 'CM Ekkamai', gps_name: '' },
    ])
    const books: ReceivableTransactionRow[] = [
      { id: 1, store_name: 'CM Silom', amount: 100, ref_type: 'Order' },
      { id: 2, store_name: 'CM The Street', creditor_store: 'CM Silom', amount: 40, ref_type: 'AccountingPO' },
      { id: 3, store_name: 'PEPSI', amount: -10, ref_type: 'Receive' },
    ]
    const hq = filterReceivableRows(books, {
      storeFilter: 'All',
      vendorMaps,
      attributionMaps: emptyAttribution,
      filterByVendorLink: true,
    })
    expect(hq.map((r) => r.id)).toEqual([1, 3])

    const silom = filterReceivableRows(books, {
      storeFilter: '1042',
      vendorMaps,
      attributionMaps: emptyAttribution,
      filterByVendorLink: true,
    })
    expect(silom.map((r) => r.id)).toEqual([2])
  })

  it('does not show HQ claims against a store as that store receivable', () => {
    const vendorMaps = buildReceivableVendorMapsFromRows([])
    const ekkamai = filterReceivableRows(rows, {
      storeFilter: 'CM Ekkamai',
      vendorMaps,
      attributionMaps: emptyAttribution,
      filterByVendorLink: true,
    })
    const union = filterReceivableRows(rows, {
      storeFilter: 'CM Union Mall',
      vendorMaps,
      attributionMaps: emptyAttribution,
      filterByVendorLink: true,
    })
    expect(ekkamai).toEqual([])
    expect(union).toEqual([])
  })

  it('uses the store as creditor when that store has issued its own receivables', () => {
    const vendorMaps = buildReceivableVendorMapsFromRows([
      { code: '1043', name: 'CM Ekkamai', sales_outlet: 'CM Ekkamai', gps_name: '' },
    ])
    const withIssued: ReceivableTransactionRow[] = [
      { id: 1, store_name: 'CM Ekkamai', amount: 26000, ref_type: 'Order' },
      { id: 2, store_name: 'CM The Street', creditor_store: 'CM Ekkamai', amount: 500, ref_type: 'AccountingPO' },
    ]
    const filtered = filterReceivableRows(withIssued, {
      storeFilter: '1043',
      vendorMaps,
      attributionMaps: emptyAttribution,
      filterByVendorLink: true,
    })
    expect(filtered.map((r) => r.id)).toEqual([2])
  })
})
