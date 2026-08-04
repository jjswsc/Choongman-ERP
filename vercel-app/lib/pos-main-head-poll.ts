/**
 * 메인 POS 초경량 head 폴링 — items_json 없이 신규·변경만 감지.
 * Realtime 누락 시 heavy poll(자동인쇄·홀 갱신)을 즉시 트리거한다.
 */

export type PosOrderHeadRow = {
  id?: number | null
  orderType?: string | null
  status?: string | null
  updatedAt?: string | null
  createdAt?: string | null
  paymentCash?: number | null
  paymentCard?: number | null
  paymentQr?: number | null
  paymentOther?: number | null
  paymentDeliveryApp?: number | null
}

function paymentSum(h: PosOrderHeadRow): number {
  return (
    Math.max(0, Number(h.paymentCash ?? 0) || 0) +
    Math.max(0, Number(h.paymentCard ?? 0) || 0) +
    Math.max(0, Number(h.paymentQr ?? 0) || 0) +
    Math.max(0, Number(h.paymentOther ?? 0) || 0) +
    Math.max(0, Number(h.paymentDeliveryApp ?? 0) || 0)
  )
}

function isOpenDineInHead(h: PosOrderHeadRow): boolean {
  if (String(h.orderType ?? '').trim().toLowerCase() !== 'dine_in') return false
  const st = String(h.status ?? '').trim().toLowerCase()
  if (st === 'completed' || st === 'cancelled' || st === 'canceled') return false
  if (st === 'paid') return false
  if (paymentSum(h) > 0.005) return false
  return true
}

export function detectMainPosHeadPollChanges(opts: {
  heads: PosOrderHeadRow[]
  lastSeenOrderId: number
  updatedAtByOrderId: Map<number, string>
  /** true면 캐시만 채우고 변경 신호 없음 (초기 1회) */
  seedOnly?: boolean
}): { hasNewOrder: boolean; hasUpdatedOpenOrder: boolean } {
  let hasNewOrder = false
  let hasUpdatedOpenOrder = false
  const lastSeen = Math.max(0, Math.trunc(Number(opts.lastSeenOrderId) || 0))

  for (const h of opts.heads) {
    const oid = Number(h.id)
    if (!Number.isFinite(oid) || oid <= 0) continue
    const updatedAt = String(h.updatedAt || h.createdAt || '').trim()

    if (oid > lastSeen) {
      if (!opts.seedOnly) hasNewOrder = true
    }

    if (isOpenDineInHead(h) && updatedAt) {
      const prev = opts.updatedAtByOrderId.get(oid)
      if (prev == null) {
        opts.updatedAtByOrderId.set(oid, updatedAt)
      } else if (prev !== updatedAt) {
        opts.updatedAtByOrderId.set(oid, updatedAt)
        if (!opts.seedOnly) hasUpdatedOpenOrder = true
      }
    }
  }

  return { hasNewOrder, hasUpdatedOpenOrder }
}
