import { isApiInboundDeliveryOrderMemo } from '@/lib/pos-delivery-platform'
import {
  extractGrabOrderIdFromMemo,
  extractGrabStateFromMemo,
  isGrabAutoPaidMemo,
  mergeGrabStateIntoFullMemo,
} from '@/lib/grab-order-memo'
import { posOrderPaymentSumFromAmounts } from '@/lib/pos-order-paid-at'

export type DeliveryPackSettleOrderRow = {
  order_type?: string | null
  status?: string | null
  memo?: string | null
  total?: number | string | null
  payment_cash?: number | string | null
  payment_card?: number | string | null
  payment_qr?: number | string | null
  payment_other?: number | string | null
  payment_delivery_app?: number | string | null
  payment_crypto?: number | string | null
  delivery_app_code?: string | null
  delivery_payment_channel?: string | null
  paid_at?: string | null
}

function tenderAmounts(row: DeliveryPackSettleOrderRow) {
  return {
    cash: Math.max(0, Number(row.payment_cash ?? 0) || 0),
    card: Math.max(0, Number(row.payment_card ?? 0) || 0),
    qr: Math.max(0, Number(row.payment_qr ?? 0) || 0),
    other: Math.max(0, Number(row.payment_other ?? 0) || 0),
    deliveryApp: Math.max(0, Number(row.payment_delivery_app ?? 0) || 0),
    crypto: Math.max(0, Number(row.payment_crypto ?? 0) || 0),
  }
}

/**
 * 포장 완료(ready) 시점에 매출(paid)로 올려도 되는 배달 주문인가.
 * — 배달앱/플랫폼 결제만 있고 카운터 현금·카드·QR이 없는 경우.
 * — COD(현금 수거)는 직원이 별도 결제해야 하므로 제외.
 */
export function shouldPromoteDeliveryPackReadyToPaid(row: DeliveryPackSettleOrderRow): boolean {
  const status = String(row.status ?? '').trim().toLowerCase()
  if (status === 'paid' || status === 'completed' || status === 'cancelled' || status === 'refunded') {
    return false
  }
  const orderType = String(row.order_type ?? '').trim().toLowerCase()
  if (orderType !== 'delivery') return false

  const { cash, card, qr, other, deliveryApp, crypto } = tenderAmounts(row)
  const customerTender = cash + card + qr + other + crypto
  if (customerTender > 0.005) return false

  if (deliveryApp > 0.005) return true
  // 결제액이 아직 비어 있어도 API 유입(Grab 등)이면 포장 완료 때 배달앱으로 채워 마감
  if (isApiInboundDeliveryOrderMemo(String(row.memo ?? ''))) return true
  return false
}

/**
 * ready → paid 승격 시 결제·paid_at·Grab 자동마감 메모 패치.
 * Grab COLLECTED 웹훅 폴백과 같은 결제 보정 규칙을 쓴다.
 */
export function buildDeliveryPackSettlePatch(
  row: DeliveryPackSettleOrderRow,
  nowIso: string
): Record<string, unknown> {
  const patch: Record<string, unknown> = { status: 'paid' }
  const total = Math.max(0, Number(row.total ?? 0) || 0)
  const { cash, card, qr, other, deliveryApp } = tenderAmounts(row)
  const paymentSum = posOrderPaymentSumFromAmounts({
    paymentCash: cash,
    paymentCard: card,
    paymentQr: qr,
    paymentOther: other,
    paymentDeliveryApp: deliveryApp,
  })

  if (paymentSum <= 0.005 && total > 0.005) {
    patch.payment_delivery_app = total
    const channel =
      String(row.delivery_payment_channel ?? '').trim() ||
      String(row.delivery_app_code ?? '').trim() ||
      (isApiInboundDeliveryOrderMemo(String(row.memo ?? '')) ? 'grab' : '')
    if (channel) patch.delivery_payment_channel = channel
  } else if (cash > 0.005 && card + qr + other <= 0.005 && deliveryApp <= 0.005) {
    // 방어: 고객 창구 현금만 있는 COD는 shouldPromote에서 걸러지지만, 호출부 실수 대비
    return { status: 'ready' }
  }

  if (!String(row.paid_at ?? '').trim()) {
    patch.paid_at = nowIso
  }

  const prevMemo = String(row.memo ?? '')
  const grabOrderId = extractGrabOrderIdFromMemo(prevMemo)
  if (grabOrderId && !isGrabAutoPaidMemo(prevMemo)) {
    const grabState = extractGrabStateFromMemo(prevMemo) || ''
    const merged = mergeGrabStateIntoFullMemo(prevMemo, grabOrderId, grabState, { autoPaid: true })
    if (merged && merged !== prevMemo) patch.memo = merged
  }

  return patch
}
