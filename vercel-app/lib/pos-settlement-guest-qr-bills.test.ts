import { describe, expect, it } from 'vitest'
import { buildGuestQrBillPayList, sumGuestQrBillPayPaymentQr } from '@/lib/pos-settlement-guest-qr-bills'

describe('buildGuestQrBillPayList', () => {
  it('keeps qr_table rows with payment_qr only', () => {
    const rows = buildGuestQrBillPayList([
      {
        id: 1,
        order_no: 'A1',
        table_name: '5',
        created_by: 'qr_table:9',
        payment_qr: 320,
        total: 320,
        paid_at: '2026-11-16T04:00:00.000Z',
      },
      {
        id: 2,
        created_by: 'pos',
        payment_qr: 100,
        total: 100,
        table_name: '1',
      },
      {
        id: 3,
        created_by: 'qr_table:10',
        payment_qr: 0,
        total: 200,
        table_name: '2',
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ orderId: 1, tableName: '5', paymentQr: 320 })
    expect(sumGuestQrBillPayPaymentQr(rows)).toBe(320)
  })
})
