import { isQrTableCreatedBy } from '@/lib/qr-table-types'

export type GuestQrBillPayRow = {
  orderId: number
  orderNo: string
  tableName: string
  paidAt: string | null
  paymentQr: number
  total: number
}

/** 마감 대조용 — QR 테이블 주문 + payment_qr>0 */
export function buildGuestQrBillPayList(
  orders: Array<{
    id?: number | string | null
    order_no?: string | number | null
    table_name?: string | null
    paid_at?: string | null
    created_at?: string | null
    created_by?: string | null
    payment_qr?: number | string | null
    total?: number | string | null
    status?: string | null
  }> | null | undefined
): GuestQrBillPayRow[] {
  const out: GuestQrBillPayRow[] = []
  for (const o of orders || []) {
    if (!isQrTableCreatedBy(o.created_by)) continue
    const paymentQr = Math.round((Number(o.payment_qr) || 0) * 100) / 100
    if (paymentQr < 0.005) continue
    const orderId = Math.trunc(Number(o.id) || 0)
    if (!(orderId > 0)) continue
    out.push({
      orderId,
      orderNo: String(o.order_no ?? orderId).trim() || String(orderId),
      tableName: String(o.table_name || '').trim() || '—',
      paidAt: String(o.paid_at || o.created_at || '').trim() || null,
      paymentQr,
      total: Math.round((Number(o.total) || 0) * 100) / 100,
    })
  }
  out.sort((a, b) => String(a.paidAt || '').localeCompare(String(b.paidAt || '')))
  return out
}

export function sumGuestQrBillPayPaymentQr(rows: GuestQrBillPayRow[]): number {
  return Math.round(rows.reduce((s, r) => s + r.paymentQr, 0) * 100) / 100
}
