import { describe, expect, it } from 'vitest'
import {
  buildReceivableVendorMapsFromRows,
  filterReceivableRows,
  groupReceivableRowsByStore,
  resolveReceivableStoreDisplayName,
  type ReceivableTransactionRow,
} from './receivable-ledger-pure'

const emptyAttribution = { accrualStoreByDateAmount: new Map<string, string>() }

describe('filterReceivableRows', () => {
  const rows: ReceivableTransactionRow[] = [
    { id: 1, store_name: 'CM Silom', amount: 100, ref_type: 'Order' },
    { id: 2, store_name: 'CM Ekkamai', amount: 200, ref_type: 'Order' },
    { id: 3, store_name: 'CM Union Mall', amount: 300, ref_type: 'Order' },
  ]

  it('keeps HQ books on all outlets and only the selected debtor when a customer is chosen', () => {
    const vendorMaps = buildReceivableVendorMapsFromRows([
      { code: '1042', name: 'Silom Co', sales_outlet: 'CM Silom', gps_name: '' },
      { code: '1043', name: 'CM Ekkamai', sales_outlet: 'CM Ekkamai', gps_name: '' },
      { code: '1041', name: 'MBK Co', sales_outlet: 'CM MBK', gps_name: '' },
      { code: '1045', name: 'Seacon Co', sales_outlet: 'CM Seacon Srinakarin', gps_name: '' },
    ])
    const books: ReceivableTransactionRow[] = [
      { id: 1, store_name: 'CM Silom', amount: 100, ref_type: 'Order' },
      { id: 2, store_name: 'CM The Street', creditor_store: 'CM Silom', amount: 40, ref_type: 'AccountingPO' },
      { id: 3, store_name: 'PEPSI', amount: -10, ref_type: 'Receive' },
      { id: 4, store_name: 'CM MBK', amount: 1000, ref_type: 'Order' },
      { id: 5, store_name: 'CM Seacon Srinakarin', creditor_store: 'CM MBK', amount: 2280, ref_type: 'AccountingPO' },
      { id: 6, store_name: 'CM Seacon Srinakarin', amount: 500, ref_type: 'Order' },
    ]
    const hq = filterReceivableRows(books, {
      storeFilter: 'All',
      vendorMaps,
      attributionMaps: emptyAttribution,
      filterByVendorLink: true,
    })
    expect(hq.map((r) => r.id)).toEqual([1, 3, 4, 6])

    const silom = filterReceivableRows(books, {
      storeFilter: '1042',
      vendorMaps,
      attributionMaps: emptyAttribution,
      filterByVendorLink: true,
    })
    expect(silom.map((r) => r.id)).toEqual([1])

    const mbk = filterReceivableRows(books, {
      storeFilter: '1041',
      vendorMaps,
      attributionMaps: emptyAttribution,
      filterByVendorLink: true,
    })
    expect(mbk.map((r) => r.id)).toEqual([4])
  })

  it('shows the HQ outstanding of the selected outlet', () => {
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
    expect(ekkamai.map((r) => r.id)).toEqual([2])
    expect(union.map((r) => r.id)).toEqual([3])
  })

  it('does not pull in other debtors when the selected store issued receivables to them', () => {
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
    expect(filtered.map((r) => r.id)).toEqual([1])
  })
})

describe('resolveReceivableStoreDisplayName', () => {
  it('maps bare vendor-code store_name to sales outlet / legal name', () => {
    const vendorMaps = buildReceivableVendorMapsFromRows([
      {
        code: '1070',
        name: 'Related Party Co., Ltd.',
        sales_outlet: 'CM Related',
        gps_name: '',
      },
    ])
    expect(resolveReceivableStoreDisplayName('1070', vendorMaps)).toBe('CM Related')
    expect(vendorMaps.storeToVendor.get('1070')?.name).toBe('Related Party Co., Ltd.')
  })

  it('keeps human store names unchanged', () => {
    const vendorMaps = buildReceivableVendorMapsFromRows([
      { code: '1042', name: 'Silom Co', sales_outlet: 'CM Silom', gps_name: '' },
    ])
    expect(resolveReceivableStoreDisplayName('CM Silom', vendorMaps)).toBe('CM Silom')
  })

  it('groups receivable rows under the human label when store_name is a code', () => {
    const vendorMaps = buildReceivableVendorMapsFromRows([
      {
        code: '1070',
        name: 'Related Party Co., Ltd.',
        sales_outlet: '',
        gps_name: '',
      },
    ])
    const grouped = groupReceivableRowsByStore(
      [{ id: 1, store_name: '1070', amount: 100, ref_type: 'Opening' }],
      vendorMaps,
      emptyAttribution,
      { '1070': 100 }
    )
    expect(grouped).toHaveLength(1)
    expect(grouped[0].storeName).toBe('Related Party Co., Ltd.')
    expect(grouped[0].vendorCode).toBe('1070')
    expect(grouped[0].vendorName).toBe('Related Party Co., Ltd.')
  })
})
