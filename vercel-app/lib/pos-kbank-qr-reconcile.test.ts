import { describe, expect, it } from 'vitest'
import {
  aggregateKbankQrReconcileRows,
  aggregateQrBankDeposits,
  applyQrBankDepositsToRows,
  buildKbankQrReconcileResult,
} from '@/lib/pos-kbank-qr-reconcile'
import { channelReconcilePosCalendarDate } from '@/lib/pos-channel-reconcile-match'

describe('aggregateKbankQrReconcileRows', () => {
  it('sums payment_qr by store for completed orders only', () => {
    const rows = aggregateKbankQrReconcileRows([
      {
        store_code: 'CT001',
        status: 'paid',
        payment_qr: 100,
        created_at: '2026-08-13T10:00:00+07:00',
      },
      {
        store_code: 'CT001',
        status: 'completed',
        payment_qr: 50.5,
        created_at: '2026-08-13T11:00:00+07:00',
      },
      {
        store_code: 'CT001',
        status: 'pending',
        payment_qr: 999,
        created_at: '2026-08-13T12:00:00+07:00',
      },
      {
        store_code: 'CT002',
        status: 'paid',
        payment_qr: 0,
        created_at: '2026-08-13T10:00:00+07:00',
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.storeCode).toBe('CM CT001')
    expect(rows[0]?.orderCount).toBe(2)
    expect(rows[0]?.qrSales).toBe(150.5)
  })

  it('splits by business date when provided', () => {
    const rows = aggregateKbankQrReconcileRows(
      [
        {
          store_code: 'A',
          status: 'paid',
          payment_qr: 10,
          created_at: 'x',
        },
        {
          store_code: 'A',
          status: 'paid',
          payment_qr: 20,
          created_at: 'y',
        },
      ],
      {
        businessDateForRow: (row) =>
          String(row.created_at) === 'x' ? '2026-08-12' : '2026-08-13',
      }
    )
    expect(rows[0]?.days).toEqual([
      { date: '2026-08-12', orderCount: 1, qrSales: 10, bankDepositAmt: null },
      { date: '2026-08-13', orderCount: 1, qrSales: 20, bankDepositAmt: null },
    ])
  })
})

describe('buildKbankQrReconcileResult', () => {
  it('builds kpi', () => {
    const kpi = buildKbankQrReconcileResult([
      { storeCode: 'A', orderCount: 2, qrSales: 100, bankDepositAmt: null, days: [] },
      { storeCode: 'B', orderCount: 1, qrSales: 50, bankDepositAmt: null, days: [] },
    ]).kpi
    expect(kpi).toEqual({ orderCount: 3, qrSales: 150, bankDepositAmt: 0, storeCount: 2 })
  })
})

describe('aggregateQrBankDeposits', () => {
  it('matches POS calendar day to bank deposit date, ignoring sales_date T-1', () => {
    const pos = aggregateKbankQrReconcileRows(
      [
        {
          store_code: 'CM Union Mall',
          status: 'paid',
          payment_qr: 17010,
          paid_at: '2026-07-03T21:00:00+07:00',
          created_at: '2026-07-03T20:00:00+07:00',
        },
      ],
      { businessDateForRow: channelReconcilePosCalendarDate }
    )
    const bank = aggregateQrBankDeposits({
      startStr: '2026-07-02',
      endStr: '2026-07-03',
      storeCodes: ['CM Union Mall'],
      rows: [
        {
          transType: 'deposit',
          transDate: '2026-07-03',
          salesDate: '2026-07-02',
          accountSubjectCode: '4130',
          amount: 17010,
          accountStore: 'CM Union Mall',
        },
      ],
    })
    const rows = applyQrBankDepositsToRows(pos, bank)
    const store = rows.find((r) => r.storeCode.includes('Union Mall'))
    expect(store?.days).toEqual([
      { date: '2026-07-03', orderCount: 1, qrSales: 17010, bankDepositAmt: 17010 },
    ])
  })

  it('puts after-midnight QR on the calendar payment day', () => {
    const rows = aggregateKbankQrReconcileRows(
      [
        {
          store_code: 'CM Union Mall',
          status: 'paid',
          payment_qr: 13,
          paid_at: '2026-07-04T00:40:00+07:00',
          created_at: '2026-07-03T23:50:00+07:00',
        },
      ],
      { businessDateForRow: channelReconcilePosCalendarDate }
    )
    expect(rows[0]?.days).toEqual([
      { date: '2026-07-04', orderCount: 1, qrSales: 13, bankDepositAmt: null },
    ])
  })
})
