import { describe, expect, it } from 'vitest'
import {
  buildAccrualStoreByVendorDate,
  buildPayableListWithCumulative,
  filterPayableRowsByStore,
  filterPurchasePayableLedgerRows,
  isPurchasePayableLedgerRow,
  resolvePayableAttributedStore,
  type PayableAttributionMaps,
  type PayableTransactionRow,
} from './payable-attributed-store'

function maps(partial: Partial<PayableAttributionMaps>): PayableAttributionMaps {
  return {
    locationByInboundId: new Map(),
    storeByPoId: new Map(),
    storeByAccrualId: new Map(),
    storeByPettyId: new Map(),
    storeByBankId: new Map(),
    accrualStoreByVendorDate: new Map(),
    accrualStoreByVendorAmount: new Map(),
    ...partial,
  }
}

describe('resolvePayableAttributedStore purchase payment', () => {
  it('prefers same-day PO store over bank store for Payment rows', () => {
    const m = maps({
      storeByPoId: new Map([[42, 'CM Bangna']]),
      storeByBankId: new Map([[9, 'CM Office']]),
      accrualStoreByVendorDate: new Map([['1002|2026-05-20', 'CM Bangna']]),
    })
    const payment: PayableTransactionRow = {
      vendor_code: '1002',
      amount: -201562.32,
      ref_type: 'Payment',
      trans_date: '2026-05-20',
      bank_transaction_id: 9,
    }
    expect(resolvePayableAttributedStore(payment, m)).toBe('CM Bangna')
  })

  it('falls back to bank store when no matching PO accrual on that date', () => {
    const m = maps({
      storeByBankId: new Map([[9, 'CM Office']]),
      accrualStoreByVendorDate: new Map(),
    })
    const payment: PayableTransactionRow = {
      vendor_code: '1002',
      amount: -5000,
      ref_type: 'Payment',
      trans_date: '2026-05-20',
      bank_transaction_id: 9,
    }
    expect(resolvePayableAttributedStore(payment, m)).toBe('CM Office')
  })

  it('falls back to vendor+amount PO store when payment date differs', () => {
    const m = maps({
      storeByBankId: new Map([[9, 'CM Office']]),
      accrualStoreByVendorAmount: new Map([['1002|201562.32', 'CM Bangna']]),
    })
    const payment: PayableTransactionRow = {
      vendor_code: '1002',
      amount: -201562.32,
      ref_type: 'Payment',
      trans_date: '2026-06-04',
      bank_transaction_id: 9,
    }
    expect(resolvePayableAttributedStore(payment, m)).toBe('CM Bangna')
  })
})

describe('buildAccrualStoreByVendorDate', () => {
  it('indexes PO accrual store by vendor and trans_date', () => {
    const base = maps({
      storeByPoId: new Map([[7, 'CM Office']]),
    })
    const rows: PayableTransactionRow[] = [
      { vendor_code: '1002', ref_type: 'PO', ref_id: 7, trans_date: '2026-06-04', amount: 62916 },
    ]
    const index = buildAccrualStoreByVendorDate(rows, base)
    expect(index.get('1002|2026-06-04')).toBe('CM Office')
  })
})

describe('buildPayableListWithCumulative', () => {
  it('includes cumulative-only vendors outside the search period', () => {
    const cumulativeByVendor = { V001: 50000 }
    const list = buildPayableListWithCumulative({
      cumulativeByVendor,
      periodByVendor: {},
    })
    expect(list).toHaveLength(1)
    expect(list[0].vendorCode).toBe('V001')
    expect(list[0].balance).toBe(0)
    expect(list[0].cumulativeBalance).toBe(50000)
    expect(list[0].items).toHaveLength(0)
  })
})

describe('isPurchasePayableLedgerRow', () => {
  it('excludes payroll expense accruals', () => {
    expect(
      isPurchasePayableLedgerRow({
        vendor_code: 'EMPID:42',
        amount: 147375,
        ref_type: 'Expense',
        expense_accrual_id: 99,
        trans_date: '2026-05-01',
      })
    ).toBe(false)
  })

  it('excludes purchase orders (PO) — payable is recognized on inbound, not order', () => {
    expect(
      isPurchasePayableLedgerRow({
        vendor_code: '1002',
        amount: 62916,
        ref_type: 'PO',
        ref_id: 7,
        trans_date: '2026-06-04',
      })
    ).toBe(false)
  })

  it('includes inbound, payment, and opening rows', () => {
    expect(
      isPurchasePayableLedgerRow({
        vendor_code: '1002',
        amount: 12000,
        ref_type: 'Inbound',
        ref_id: 55,
        trans_date: '2026-06-05',
      })
    ).toBe(true)
    expect(
      isPurchasePayableLedgerRow({
        vendor_code: '1002',
        amount: -62916,
        ref_type: 'Payment',
        trans_date: '2026-06-10',
      })
    ).toBe(true)
    expect(
      isPurchasePayableLedgerRow({
        vendor_code: '1002',
        amount: 5000,
        ref_type: 'Opening',
        trans_date: '2026-01-01',
      })
    ).toBe(true)
  })

  it('includes purchase-payment accrual settlements but excludes general expense payments', () => {
    const purchaseAccrualIds = new Set([42])
    expect(
      isPurchasePayableLedgerRow(
        {
          vendor_code: '1006',
          amount: -231120,
          ref_type: 'Payment',
          expense_accrual_id: 42,
          trans_date: '2026-05-27',
        },
        { purchaseAccrualIds }
      )
    ).toBe(true)
    expect(
      isPurchasePayableLedgerRow(
        {
          vendor_code: '1006',
          amount: -5000,
          ref_type: 'Payment',
          expense_accrual_id: 99,
          trans_date: '2026-05-27',
        },
        { purchaseAccrualIds }
      )
    ).toBe(false)
  })

  it('filterPurchasePayableLedgerRows drops PO and expense rows', () => {
    const rows = [
      { vendor_code: '1002', amount: 1000, ref_type: 'Inbound', ref_id: 55, trans_date: '2026-06-01' },
      { vendor_code: '1002', amount: 2712000, ref_type: 'PO', ref_id: 90, trans_date: '2026-05-15' },
      { vendor_code: 'EMPID:1', amount: 5000, ref_type: 'Expense', expense_accrual_id: 1, trans_date: '2026-06-01' },
      { vendor_code: '1002', amount: -1000, ref_type: 'Payment', trans_date: '2026-06-10' },
    ]
    const kept = filterPurchasePayableLedgerRows(rows)
    expect(kept).toHaveLength(2)
    expect(kept.map((r) => r.ref_type).sort()).toEqual(['Inbound', 'Payment'])
  })
})

describe('filterPayableRowsByStore', () => {
  it('includes full vendor ledger when only payment matches store filter', () => {
    const m = maps({
      locationByInboundId: new Map([[55, 'CM Bangna']]),
      storeByBankId: new Map([[9, 'CM Office']]),
    })
    const rows: PayableTransactionRow[] = [
      { vendor_code: '1002', ref_type: 'Inbound', ref_id: 55, trans_date: '2026-04-01', amount: 891124.04 },
      {
        vendor_code: '1002',
        ref_type: 'Payment',
        trans_date: '2026-04-20',
        amount: -891124.04,
        bank_transaction_id: 9,
      },
    ]
    const scoped = filterPayableRowsByStore(rows, 'CM Office', m)
    expect(scoped).toHaveLength(2)
    expect(scoped.some((r) => r.ref_type === 'Inbound')).toBe(true)
    expect(scoped.some((r) => r.ref_type === 'Payment')).toBe(true)
  })
})
