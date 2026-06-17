import { describe, expect, it } from 'vitest'
import {
  buildAccrualStoreByVendorDate,
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
