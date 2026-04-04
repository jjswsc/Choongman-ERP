/**
 * 오프라인 큐에 쌓인 /api/savePosOrder 요청을 PosOrder 형태로 복원해
 * 영수증·테이블 화면(getPosOrdersWithCache)에 합쳐 표시한다.
 * (서버 반영 전까지 로컬에서만 보이는 임시 행 — 동기화 후 큐에서 제거되면 사라짐)
 */

import type { PosOrder, PosOrderItem } from '@/lib/api-client'
import { computePosPricing, type PosPricingAdjustments } from '@/lib/pos-pricing'
import { getPosBusinessDateStr } from '@/lib/pos-business-day'
import { coercePosOrderTypeForDb } from '@/lib/pos-sales-order-type-filter'
import { getAllPending, type PendingRequest } from './queue'

function syntheticOrderId(queueItemId: string, createdAt: number): number {
  let h = 0
  for (let i = 0; i < queueItemId.length; i++) {
    h = Math.imul(31, h) + queueItemId.charCodeAt(i)
    h |= 0
  }
  const u = Math.abs(h) % 0x3fffff
  return -1_000_000_000 - u - (createdAt % 1000)
}

function parseSavePosBody(body: string | undefined): Record<string, unknown> | null {
  if (!body) return null
  try {
    const o = JSON.parse(body) as unknown
    return o && typeof o === 'object' ? (o as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function mapItems(raw: unknown): PosOrderItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map((it) => {
    const x = it as Record<string, unknown>
    return {
      id: String(x.id ?? ''),
      name: String(x.name ?? ''),
      price: Number(x.price ?? 0),
      qty: Math.max(1, Number(x.qty ?? 1) || 1),
      ...(typeof x.note === 'string' && String(x.note).trim() ? { note: String(x.note).trim() } : {}),
    }
  })
}

function pendingRequestToPosOrder(item: PendingRequest): PosOrder | null {
  if (item.api !== '/api/savePosOrder') return null
  const body = parseSavePosBody(item.body)
  if (!body) return null
  const items = mapItems(body.items)
  if (items.length === 0) return null

  const storeCode = String(body.storeCode ?? '').trim()
  if (!storeCode) return null

  const orderType = coercePosOrderTypeForDb(String(body.orderType ?? ''))
  const tableName = String(body.tableName ?? '')
  const memo = String(body.memo ?? '').trim()
  const discountAmt = Math.max(0, Number(body.discountAmt ?? 0))
  const deliveryFee = Math.max(0, Number(body.deliveryFee ?? 0))
  const packagingFee = Math.max(0, Number(body.packagingFee ?? 0))
  const paymentCash = Math.max(0, Number(body.paymentCash ?? 0))
  const paymentCard = Math.max(0, Number(body.paymentCard ?? 0))
  const paymentQr = Math.max(0, Number(body.paymentQr ?? 0))
  const paymentOther = Math.max(0, Number(body.paymentOther ?? 0))
  const paymentDeliveryApp = Math.max(0, Number(body.paymentDeliveryApp ?? 0))
  const pricingAdjustments: PosPricingAdjustments | undefined =
    body.pricingAdjustments && typeof body.pricingAdjustments === 'object'
      ? (body.pricingAdjustments as PosPricingAdjustments)
      : undefined

  let subtotal = 0
  for (const it of items) {
    subtotal += it.price * it.qty
  }
  const pricing = computePosPricing({
    subtotal,
    discountAmt,
    deliveryFee,
    packagingFee,
    cardPaymentAmount: paymentCard,
    adjustments: pricingAdjustments,
  })
  const total = pricing.finalTotal
  const vat = pricing.vatFeeAmt

  const paySum = paymentCash + paymentCard + paymentQr + paymentOther + paymentDeliveryApp
  const closeRaw = String(body.closeStatus ?? '').toLowerCase()
  const status =
    closeRaw === 'completed' || closeRaw === 'paid'
      ? closeRaw
      : paySum >= total - 0.02
        ? 'paid'
        : 'pending'

  const orderNo = String(item.metadata?.localOrderNo ?? '').trim() || `LOCAL-${item.createdAt}`
  const guestCountRaw = Math.trunc(Number(body.guestCount ?? body.guest_count ?? 0))
  const guestCount =
    orderType === 'dine_in' ? Math.max(0, Math.min(99, guestCountRaw)) : undefined

  return {
    id: syntheticOrderId(item.id, item.createdAt),
    orderNo,
    storeCode,
    orderType,
    tableName,
    memo,
    discountAmt: discountAmt || undefined,
    discountReason: String(body.discountReason ?? '').trim() || undefined,
    deliveryFee: deliveryFee || undefined,
    packagingFee: packagingFee || undefined,
    paymentCash: paymentCash || undefined,
    paymentCard: paymentCard || undefined,
    paymentQr: paymentQr || undefined,
    paymentOther: paymentOther || undefined,
    paymentDeliveryApp: paymentDeliveryApp || undefined,
    guestCount,
    items,
    subtotal,
    vat,
    total,
    status,
    createdAt: new Date(item.createdAt).toISOString(),
  }
}

function inDateRange(businessYmd: string, startStr: string, endStr: string): boolean {
  return businessYmd >= startStr && businessYmd <= endStr
}

/**
 * 오프라인 큐의 updatePosOrderStatus — 주문 id별 최종 status (같은 id는 전송 순서상 나중 항목이 우선).
 * 취소·퇴장·완료가 캐시/합성 행에 반영되도록 getPosOrdersWithCache에서 사용한다.
 */
export async function getQueuedPosOrderStatusById(): Promise<Map<number, string>> {
  const pending = await getAllPending()
  const updates = pending.filter((p) => p.api === '/api/updatePosOrderStatus')
  updates.sort((a, b) => a.createdAt - b.createdAt)
  const map = new Map<number, string>()
  for (const item of updates) {
    const body = parseSavePosBody(item.body)
    if (!body) continue
    const id = Number(body.id)
    const st = String(body.status ?? '').trim().toLowerCase()
    if (!Number.isFinite(id) || !st) continue
    map.set(id, st)
  }
  return map
}

/**
 * 큐에만 있는 savePosOrder 를 조회 기간·매장·상태에 맞게 PosOrder 로 반환
 */
export async function getPendingSavePosOrdersMerged(params: {
  startStr: string
  endStr: string
  storeCode?: string
  status?: string
}): Promise<PosOrder[]> {
  const { startStr, endStr, storeCode, status } = params
  const pending = await getAllPending()
  const out: PosOrder[] = []

  for (const item of pending) {
    const row = pendingRequestToPosOrder(item)
    if (!row) continue

    const biz = getPosBusinessDateStr(new Date(item.createdAt))
    if (!inDateRange(biz, startStr, endStr)) continue

    if (storeCode && String(storeCode).trim()) {
      const want = String(storeCode).trim()
      if (row.storeCode !== want && row.storeCode.toLowerCase() !== want.toLowerCase()) continue
    }

    if (status && status !== 'all') {
      if (row.status !== status) continue
    }

    out.push(row)
  }

  out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return out
}
