import { describe, expect, it } from 'vitest'
import {
  buildPayableListWithCumulative,
  cumulativeBalanceByVendor,
  filterPayableRowsByStore,
  filterPurchasePayableLedgerRows,
  isPurchasePayableLedgerRow,
  payableRowsOnOrAfterStart,
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
    ...partial,
  }
}

describe('resolvePayableAttributedStore purchase payment', () => {
  it('uses bank store only — never vendor/date/inbound-link guess', () => {
    const m = maps({
      storeByPoId: new Map([[42, 'CM Office']]),
      storeByBankId: new Map([[6061, 'CM True Digital']]),
      locationByInboundId: new Map([[99, 'CM Office']]),
    })
    const payment: PayableTransactionRow = {
      vendor_code: '1008',
      amount: -29437.1,
      ref_type: 'Payment',
      trans_date: '2026-05-29',
      bank_transaction_id: 6061,
    }
    expect(resolvePayableAttributedStore(payment, m)).toBe('CM True Digital')
  })

  it('does not move Office bank payment to Bangna via inbound link', () => {
    const m = maps({
      locationByInboundId: new Map([[55, 'CM Bangna']]),
      storeByBankId: new Map([[9, 'CM Office']]),
    })
    const payment: PayableTransactionRow = {
      vendor_code: '1002',
      amount: -891124.04,
      ref_type: 'Payment',
      trans_date: '2026-04-20',
      bank_transaction_id: 9,
    }
    expect(resolvePayableAttributedStore(payment, m)).toBe('CM Office')
  })

  it('uses accrual store only when Payment has no bank id', () => {
    const m = maps({
      storeByAccrualId: new Map([[10, 'CM Silom']]),
    })
    const payment: PayableTransactionRow = {
      vendor_code: '1002',
      amount: -5000,
      ref_type: 'Payment',
      trans_date: '2026-05-20',
      expense_accrual_id: 10,
    }
    expect(resolvePayableAttributedStore(payment, m)).toBe('CM Silom')
  })

  it('prefers bank store over accrual store when both exist', () => {
    const m = maps({
      storeByBankId: new Map([[9, 'CM Office']]),
      storeByAccrualId: new Map([[10, 'CM Silom']]),
    })
    const payment: PayableTransactionRow = {
      vendor_code: '1002',
      amount: -5000,
      ref_type: 'Payment',
      trans_date: '2026-05-20',
      bank_transaction_id: 9,
      expense_accrual_id: 10,
    }
    expect(resolvePayableAttributedStore(payment, m)).toBe('CM Office')
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

  it('keeps cumulative balance stable when only startStr changes', () => {
    const scopedRows: PayableTransactionRow[] = [
      { vendor_code: '1014', ref_type: 'Inbound', amount: 100000, trans_date: '2026-01-15' },
      { vendor_code: '1014', ref_type: 'Payment', amount: -40000, trans_date: '2026-02-01' },
      { vendor_code: '1014', ref_type: 'Inbound', amount: 50000, trans_date: '2026-04-01' },
      { vendor_code: '1014', ref_type: 'Payment', amount: -20000, trans_date: '2026-05-01' },
    ]
    const cumulativeByVendor = cumulativeBalanceByVendor(scopedRows)
    expect(cumulativeByVendor['1014']).toBe(90000)

    for (const startStr of ['2025-12-01', '2026-03-01', '2026-06-01']) {
      const periodRows = payableRowsOnOrAfterStart(scopedRows, startStr)
      const periodByVendor: Record<string, { total: number; items: PayableTransactionRow[] }> = {}
      for (const r of periodRows) {
        const vc = String(r.vendor_code || '').trim()
        if (!periodByVendor[vc]) periodByVendor[vc] = { total: 0, items: [] }
        periodByVendor[vc].items.push(r)
        periodByVendor[vc].total += Number(r.amount ?? 0)
      }
      const list = buildPayableListWithCumulative({ cumulativeByVendor, periodByVendor })
      expect(list[0].cumulativeBalance).toBe(90000)
      if (startStr === '2026-03-01') {
        expect(list[0].balance).toBe(30000)
        expect(list[0].balance).not.toBe(list[0].cumulativeBalance)
      }
    }
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
        amount: 1000,
        ref_type: 'Inbound',
        ref_id: 1,
        trans_date: '2026-06-01',
      })
    ).toBe(true)
    expect(
      isPurchasePayableLedgerRow({
        vendor_code: '1002',
        amount: -1000,
        ref_type: 'Payment',
        trans_date: '2026-06-10',
      })
    ).toBe(true)
  })
})

describe('filterPurchasePayableLedgerRows', () => {
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
  it('keeps Bangna inbound and Office bank payment in their own store filters only', () => {
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
    const officeScoped = filterPayableRowsByStore(rows, 'CM Office', m)
    expect(officeScoped).toHaveLength(1)
    expect(officeScoped[0].ref_type).toBe('Payment')

    const bangnaScoped = filterPayableRowsByStore(rows, 'CM Bangna', m)
    expect(bangnaScoped).toHaveLength(1)
    expect(bangnaScoped[0].ref_type).toBe('Inbound')
  })

  it('CM Office filter excludes other stores bank payments', () => {
    const m = maps({
      storeByBankId: new Map([
        [5871, 'CM Office'],
        [6061, 'CM True Digital'],
        [6271, 'CM Silom'],
      ]),
    })
    const rows: PayableTransactionRow[] = [
      {
        vendor_code: '1008',
        ref_type: 'Payment',
        trans_date: '2026-05-29',
        amount: -3126.99,
        bank_transaction_id: 5871,
      },
      {
        vendor_code: '1008',
        ref_type: 'Payment',
        trans_date: '2026-05-29',
        amount: -29437.1,
        bank_transaction_id: 6061,
      },
      {
        vendor_code: '1008',
        ref_type: 'Payment',
        trans_date: '2026-05-29',
        amount: -18279.81,
        bank_transaction_id: 6271,
      },
    ]
    const officeScoped = filterPayableRowsByStore(rows, 'CM Office', m)
    expect(officeScoped).toHaveLength(1)
    expect(officeScoped[0].bank_transaction_id).toBe(5871)
  })

  it('treats CM Office filter and 입고등록 inbound as the same office scope', () => {
    const m = maps({
      locationByInboundId: new Map([[77, '입고등록']]),
      storeByBankId: new Map([[9, 'CM Office']]),
    })
    const rows: PayableTransactionRow[] = [
      { vendor_code: '1002', ref_type: 'Inbound', ref_id: 77, trans_date: '2026-04-01', amount: 50000 },
      {
        vendor_code: '1002',
        ref_type: 'Payment',
        trans_date: '2026-04-20',
        amount: -10000,
        bank_transaction_id: 9,
      },
    ]
    const officeScoped = filterPayableRowsByStore(rows, 'CM Office', m)
    expect(officeScoped).toHaveLength(2)
  })
})
