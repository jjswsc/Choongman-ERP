import { describe, expect, it } from 'vitest'
import {
  collectReceivableTaxInvoicePrintTargets,
  isReceivableTaxInvoicePrintableRow,
  mergeReceivablePayableCumulativeByKey,
  printableReceivableTaxInvoiceKeys,
  RECEIVABLE_TAX_INVOICE_PRINT_MAX_BATCH,
  receivableTaxInvoicePrintSelectionKey,
  resolveEffectivePayableStoreFilter,
  resolveReceivableTaxInvoicePrintSource,
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

describe('receivable tax invoice print selection', () => {
  it('allows Order / ForceOutbound / AccountingPO only', () => {
    expect(isReceivableTaxInvoicePrintableRow({ ref_type: 'Order', ref_id: 2426, id: 1 })).toBe(true)
    expect(isReceivableTaxInvoicePrintableRow({ ref_type: 'ForceOutbound', ref_id: 88, id: 2 })).toBe(true)
    expect(isReceivableTaxInvoicePrintableRow({ ref_type: 'AccountingPO', ref_id: 12, id: 3 })).toBe(true)
    expect(isReceivableTaxInvoicePrintableRow({ ref_type: 'Receive', ref_id: 1, id: 4 })).toBe(false)
    expect(isReceivableTaxInvoicePrintableRow({ ref_type: 'Opening', id: 5 })).toBe(false)
  })

  it('maps AccountingPO print source to PO (same as single-row print)', () => {
    expect(resolveReceivableTaxInvoicePrintSource({ ref_type: 'AccountingPO', ref_id: 89, id: 10 })).toEqual({
      refType: 'PO',
      refId: 89,
      loadKey: 'tax-apo-10',
    })
  })

  it('uses row id as selection key so one outbound stays one document', () => {
    expect(receivableTaxInvoicePrintSelectionKey({ ref_type: 'Order', ref_id: 2426, id: 11751 })).toBe(
      'rec-print:11751'
    )
    expect(receivableTaxInvoicePrintSelectionKey({ ref_type: 'Receive', ref_id: 11751, id: 99 })).toBeNull()
  })

  it('collects selected outbound rows in list order without merging', () => {
    const targets = collectReceivableTaxInvoicePrintTargets(
      [
        {
          storeName: 'A',
          items: [
            { id: 1, ref_type: 'Order', ref_id: 10 },
            { id: 2, ref_type: 'Receive', ref_id: 1 },
            { id: 3, ref_type: 'Order', ref_id: 11 },
          ],
        },
      ],
      ['rec-print:3', 'rec-print:1']
    )
    expect(targets.map((t) => t.key)).toEqual(['rec-print:1', 'rec-print:3'])
    expect(targets).toHaveLength(2)
  })

  it('lists printable keys and keeps batch cap above 1', () => {
    expect(
      printableReceivableTaxInvoiceKeys([
        { id: 1, ref_type: 'Order', ref_id: 10 },
        { id: 2, ref_type: 'Receive', ref_id: 1 },
        { id: 1, ref_type: 'Order', ref_id: 10 },
      ])
    ).toEqual(['rec-print:1'])
    expect(RECEIVABLE_TAX_INVOICE_PRINT_MAX_BATCH).toBe(50)
  })
})
