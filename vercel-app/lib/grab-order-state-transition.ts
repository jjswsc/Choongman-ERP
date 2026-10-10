import { posOrderPaymentSumFromAmounts } from '@/lib/pos-order-paid-at'

/** 음식이 매장을 떠난 Grab 상태 — 이 시점에 POS 주문을 배달앱 결제로 마감한다 */
const GRAB_HANDED_OVER_STATES = new Set(['COLLECTED', 'DELIVERED'])

/** 직원이 아직 결제 마감하지 않은 배달 주문 상태 */
export const GRAB_AUTO_SETTLE_FROM_STATUSES = ['pending', 'cooking', 'preparing', 'ready'] as const

export function mapGrabStateToPosStatus(state: string): string | null {
  const s = String(state || '').trim().toUpperCase()
  if (!s) return null
  if (s === 'REFUNDED') return 'refunded'
  if (s === 'CANCELLED' || s === 'FAILED') return 'cancelled'
  if (GRAB_HANDED_OVER_STATES.has(s)) return 'paid'
  return null
}

export function canApplyGrabStatusTransition(
  prevStatus: string,
  nextStatus: string,
  opts?: { autoPaid?: boolean }
): boolean {
  const prev = String(prevStatus || '').trim().toLowerCase()
  const next = String(nextStatus || '').trim().toLowerCase()
  if (!next) return false
  if (prev === next) return false
  if (next === 'paid') {
    return (GRAB_AUTO_SETTLE_FROM_STATUSES as readonly string[]).includes(prev)
  }
  if (next !== 'cancelled' && next !== 'refunded') return false
  if (!prev) return true
  if (prev === 'cancelled' || prev === 'refunded' || prev === 'completed') return false
  // 직원이 결제한 주문은 POS 판단을 유지하고, 웹훅이 마감한 주문만 Grab 취소를 따른다.
  if (prev === 'paid') return opts?.autoPaid === true
  return true
}

export type GrabAutoSettleOrderRow = {
  total?: number | string | null
  payment_cash?: number | string | null
  payment_card?: number | string | null
  payment_qr?: number | string | null
  payment_other?: number | string | null
  payment_delivery_app?: number | string | null
  paid_at?: string | null
}

/**
 * Grab 주문은 저장 시 payment_delivery_app(또는 현금)이 이미 채워져 있다.
 * 비어 있는 예외 주문만 총액을 배달앱 결제로 채운다.
 */
export function buildGrabAutoSettlePaymentPatch(
  row: GrabAutoSettleOrderRow,
  nowIso: string
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const total = Math.max(0, Number(row.total ?? 0) || 0)
  const paymentSum = posOrderPaymentSumFromAmounts({
    paymentCash: Number(row.payment_cash ?? 0) || 0,
    paymentCard: Number(row.payment_card ?? 0) || 0,
    paymentQr: Number(row.payment_qr ?? 0) || 0,
    paymentOther: Number(row.payment_other ?? 0) || 0,
    paymentDeliveryApp: Number(row.payment_delivery_app ?? 0) || 0,
  })
  if (paymentSum <= 0.005 && total > 0.005) {
    patch.payment_delivery_app = total
    patch.delivery_payment_channel = 'grab'
  }
  if (!String(row.paid_at ?? '').trim()) {
    patch.paid_at = nowIso
  }
  return patch
}
