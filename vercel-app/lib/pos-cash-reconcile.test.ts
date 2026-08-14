import { describe, expect, it } from 'vitest'
import {
  aggregateCashBankDeposits,
  attributedSalesDateForCashBankDeposit,
  isCashBankDepositRow,
} from '@/lib/pos-cash-bank-deposit'
import {
  aggregateCashReconcileRows,
  applyCashBankDepositsToRows,
  buildCashReconcileResult,
} from '@/lib/pos-cash-reconcile'

describe('aggregateCashReconcileRows', () => {
  it('sums payment_cash by store for completed orders only', () => {
    const rows = aggregateCashReconcileRows([
      {
        store_code: 'CT001',
        status: 'paid',
        payment_cash: 100,
        created_at: '2026-08-13T10:00:00+07:00',
      },
      {
        store_code: 'CT001',
        status: 'completed',
        payment_cash: 50.5,
        created_at: '2026-08-13T11:00:00+07:00',
      },
      {
        store_code: 'CT001',
        status: 'pending',
        payment_cash: 999,
        created_at: '2026-08-13T12:00:00+07:00',
      },
      {
        store_code: 'CT002',
        status: 'paid',
        payment_cash: 0,
        created_at: '2026-08-13T10:00:00+07:00',
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.storeCode).toBe('CM CT001')
    expect(rows[0]?.orderCount).toBe(2)
    expect(rows[0]?.cashSales).toBe(150.5)
  })

  it('splits by business date when provided', () => {
    const rows = aggregateCashReconcileRows(
      [
        {
          store_code: 'A',
          status: 'paid',
          payment_cash: 10,
          created_at: 'x',
        },
        {
          store_code: 'A',
          status: 'paid',
          payment_cash: 20,
          created_at: 'y',
        },
      ],
      {
        businessDateForRow: (row) =>
          String(row.created_at) === 'x' ? '2026-08-12' : '2026-08-13',
      }
    )
    expect(rows[0]?.days).toEqual([
      { date: '2026-08-12', orderCount: 1, cashSales: 10, bankDepositAmt: null },
      { date: '2026-08-13', orderCount: 1, cashSales: 20, bankDepositAmt: null },
    ])
  })
})

describe('attributedSalesDateForCashBankDeposit', () => {
  it('prefers sales_date', () => {
    expect(
      attributedSalesDateForCashBankDeposit({ transDate: '2026-08-13', salesDate: '2026-08-12' })
    ).toBe('2026-08-12')
  })

  it('falls back to deposit date (same day), not minus one', () => {
    expect(attributedSalesDateForCashBankDeposit({ transDate: '2026-08-13' })).toBe('2026-08-13')
  })
})

describe('isCashBankDepositRow', () => {
  it('keeps revenue_cash deposits', () => {
    expect(
      isCashBankDepositRow({
        transType: 'deposit',
        category: 'revenue_cash',
        memo: '현금입금',
        amount: 5000,
        storeName: 'CM Union Mall',
      })
    ).toBe(true)
  })

  it('keeps GL 4140 even without cash in memo', () => {
    expect(
      isCashBankDepositRow({
        transType: 'deposit',
        category: '',
        memo: '이체입금 | X3812',
        accountSubjectCode: '4140',
        amount: 1200,
        storeName: 'CM Union Mall',
      })
    ).toBe(true)
  })

  it('skips card and delivery deposits', () => {
    expect(
      isCashBankDepositRow({
        transType: 'deposit',
        category: 'revenue_card',
        memo: 'VISA',
        amount: 5000,
        storeName: 'CM Union Mall',
      })
    ).toBe(false)
    expect(
      isCashBankDepositRow({
        transType: 'deposit',
        category: 'revenue_delivery',
        memo: 'GRABFOOD',
        amount: 800,
        storeName: 'CM Union Mall',
      })
    ).toBe(false)
  })
})

describe('applyCashBankDepositsToRows', () => {
  it('attaches bank totals and per-day amounts, including bank-only stores', () => {
    const pos = aggregateCashReconcileRows([
      {
        store_code: 'A',
        status: 'paid',
        payment_cash: 100,
        created_at: '2026-08-13T10:00:00+07:00',
      },
    ])
    const bank = aggregateCashBankDeposits({
      rows: [
        {
          transType: 'deposit',
          category: 'revenue_cash',
          transDate: '2026-08-13',
          amount: 90,
          storeName: 'A',
        },
        {
          transType: 'deposit',
          category: 'revenue_cash',
          transDate: '2026-08-13',
          amount: 40,
          storeName: 'B',
        },
      ],
      startStr: '2026-08-13',
      endStr: '2026-08-13',
    })
    const rows = applyCashBankDepositsToRows(pos, bank)
    const a = rows.find((r) => r.storeCode === 'A' || r.storeCode.endsWith('A'))
    const b = rows.find((r) => r.storeCode === 'B' || r.storeCode.endsWith('B'))
    expect(a?.cashSales).toBe(100)
    expect(a?.bankDepositAmt).toBe(90)
    expect(a?.days[0]?.bankDepositAmt).toBe(90)
    expect(b?.cashSales).toBe(0)
    expect(b?.bankDepositAmt).toBe(40)
    expect(buildCashReconcileResult(rows).kpi.bankDepositAmt).toBe(130)
  })

  it('compares POS and bank on the same sales date, not the period total', () => {
    const pos = aggregateCashReconcileRows([
      {
        store_code: 'CM Ekkamai',
        status: 'paid',
        payment_cash: 100,
        created_at: '2026-08-06T10:00:00+07:00',
      },
      {
        store_code: 'CM Ekkamai',
        status: 'paid',
        payment_cash: 50,
        created_at: '2026-08-07T10:00:00+07:00',
      },
    ])
    const bank = aggregateCashBankDeposits({
      rows: [
        {
          transType: 'deposit',
          category: 'revenue_cash',
          transDate: '2026-08-06',
          amount: 100,
          storeName: 'CM Ekkamai',
        },
        {
          transType: 'deposit',
          category: 'revenue_cash',
          transDate: '2026-08-08',
          salesDate: '2026-08-08',
          amount: 40,
          storeName: 'CM Ekkamai',
        },
      ],
      startStr: '2026-08-06',
      endStr: '2026-08-08',
    })
    const rows = applyCashBankDepositsToRows(pos, bank)
    const store = rows.find((r) => r.storeCode.includes('Ekkamai'))
    expect(store?.days.map((d) => d.date)).toEqual(['2026-08-06', '2026-08-07', '2026-08-08'])
    expect(store?.days[0]).toMatchObject({ date: '2026-08-06', cashSales: 100, bankDepositAmt: 100 })
    expect(store?.days[1]).toMatchObject({ date: '2026-08-07', cashSales: 50, bankDepositAmt: null })
    expect(store?.days[2]).toMatchObject({ date: '2026-08-08', cashSales: 0, bankDepositAmt: 40 })
  })

  it('does not dump empty-store cash deposits onto the selected store', () => {
    const bank = aggregateCashBankDeposits({
      rows: [
        {
          transType: 'deposit',
          category: 'revenue_cash',
          transDate: '2026-08-13',
          memo: '현금입금',
          amount: 9000,
          storeName: '',
        },
      ],
      startStr: '2026-08-13',
      endStr: '2026-08-13',
      storeCodes: ['CM Ekkamai'],
    })
    expect(bank.byStore.size).toBe(0)
  })
})
