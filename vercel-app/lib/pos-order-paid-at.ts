import type { PosOrder } from '@/lib/api-client'
import { isPosOrderPaidLikeStatus, posOrderPaymentSum } from '@/lib/pos-payment-receipt-from-order'

type PosOrderPaidAtSource = Pick<
  PosOrder,
  | 'status'
  | 'createdAt'
  | 'updatedAt'
  | 'linkposRespondedAt'
  | 'paymentCash'
  | 'paymentCard'
  | 'paymentQr'
  | 'paymentOther'
  | 'paymentDeliveryApp'
>

function parseValidIso(raw: string | undefined | null): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return s
}

/** 결제·완료 영수증·목록 정렬용 시각 — 접수(created_at)가 아닌 결제 완료에 가까운 시각 */
export function resolvePosOrderPaidAt(order: PosOrderPaidAtSource): string {
  const createdAt = parseValidIso(order.createdAt)
  const linkposAt = parseValidIso(order.linkposRespondedAt)
  const paymentSum = posOrderPaymentSum(order as PosOrder)
  const hasPayment =
    paymentSum > 0.005 || isPosOrderPaidLikeStatus(String(order.status ?? ''))

  if (linkposAt && hasPayment) return linkposAt

  if (hasPayment) {
    const updatedAt = parseValidIso(order.updatedAt)
    if (updatedAt) {
      if (!createdAt) return updatedAt
      const u = new Date(updatedAt).getTime()
      const c = new Date(createdAt).getTime()
      if (u >= c) return updatedAt
    }
  }

  return createdAt ?? ''
}

export function resolvePosOrderPaidAtDate(order: PosOrderPaidAtSource): Date {
  const raw = resolvePosOrderPaidAt(order)
  const d = raw ? new Date(raw) : new Date()
  return Number.isNaN(d.getTime()) ? new Date() : d
}
