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

  it('matches HQ vendor-code filter via sales_outlet aliases', () => {
    const vendorMaps = buildReceivableVendorMapsFromRows([
      { code: '1042', name: 'Silom Co', sales_outlet: 'CM Silom', gps_name: '' },
    ])
    const filtered = filterReceivableRows(rows, {
      storeFilter: '1042',
      vendorMaps,
      attributionMaps: emptyAttribution,
      filterByVendorLink: true,
    })
    expect(filtered.map((r) => r.store_name)).toEqual(['CM Silom'])
  })

  it('matches store-name filter when the sales vendor is missing', () => {
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
    expect(ekkamai.map((r) => r.store_name)).toEqual(['CM Ekkamai'])
    expect(union.map((r) => r.store_name)).toEqual(['CM Union Mall'])
  })
})
