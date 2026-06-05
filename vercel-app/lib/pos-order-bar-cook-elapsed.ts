import type { Order } from '@/lib/pos-types'
import type { OrderBarStatus } from '@/components/pos/order-bar-list'
import { resolvePosOrderPaidAt } from '@/lib/pos-order-paid-at'

function toIso(raw: Date | string | undefined | null): string {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? '' : raw.toISOString()
  }
  return String(raw ?? '').trim()
}

/** 결제 완료(목록 status=completed) 시 Cook 경과 분 계산 종료 시각 */
export function resolveOrderBarCookElapsedEndAt(
  order: Pick<
    Order,
    | 'status'
    | 'createdAt'
    | 'paidAt'
    | 'updatedAt'
    | 'paymentCash'
    | 'paymentCard'
    | 'paymentQr'
    | 'paymentOther'
    | 'paymentDeliveryApp'
  >,
  barStatus: OrderBarStatus
): string | undefined {
  if (barStatus !== 'completed') return undefined
  const paidAt = resolvePosOrderPaidAt({
    status: order.status,
    createdAt: toIso(order.createdAt),
    updatedAt: order.updatedAt,
    paidAt: order.paidAt,
    paymentCash: order.paymentCash,
    paymentCard: order.paymentCard,
    paymentQr: order.paymentQr,
    paymentOther: order.paymentOther,
    paymentDeliveryApp: order.paymentDeliveryApp,
  })
  const end = String(paidAt ?? '').trim()
  return end || undefined
}

export function getOrderBarCookElapsedMinutes(createdAt?: string, elapsedEndAt?: string): number {
  if (!createdAt) return 0
  const startMs = new Date(createdAt).getTime()
  if (Number.isNaN(startMs)) return 0
  const endRaw = String(elapsedEndAt ?? '').trim()
  const endMs = endRaw ? new Date(endRaw).getTime() : Date.now()
  if (Number.isNaN(endMs)) return 0
  return Math.max(0, Math.floor((endMs - startMs) / 60000))
}
