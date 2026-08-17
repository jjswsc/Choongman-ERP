import { buildDineInAddKitchenAutoPrintDedupeKey } from '@/lib/pos-kitchen-dine-in-delta'
import { coercePosOrderTypeForDb, type PosOrderTypeValue } from '@/lib/pos-sales-order-type-filter'

/**
 * 인쇄 큐 claim 안전망 — Realtime poke가 놓치면 이 간격으로 재시도.
 * 주문 도착은 poke(0/280/800ms)가 1차.
 * Realtime 끊김: 15s. 정상 구독: 60s (빈 손 POST·Edge Request 절감).
 */
export const MAIN_POS_KITCHEN_JOB_POLL_MS = 15_000
/** Realtime INSERT 채널이 SUBSCRIBED 일 때 claim 간격 */
export const MAIN_POS_KITCHEN_JOB_POLL_HEALTHY_MS = 60_000

export function resolveKitchenPrintJobPollMs(realtimeChannelHealthy: boolean): number {
  return realtimeChannelHealthy ? MAIN_POS_KITCHEN_JOB_POLL_HEALTHY_MS : MAIN_POS_KITCHEN_JOB_POLL_MS
}
/** QR enqueue와 주문 UPDATE 레이스를 흡수 */
export const MAIN_POS_KITCHEN_JOB_POKE_RETRY_MS = [0, 280, 800] as const
export const MAIN_POS_KITCHEN_JOB_DRAIN_MAX = 5
/** 이보다 오래된 queued 잡은 claim 하지 않음(과거 백로그 일괄 인쇄 방지) */
export const MAIN_POS_KITCHEN_JOB_MAX_AGE_MS = 8 * 60 * 1000

export function kitchenPrintJobClaimCreatedAtGteIso(nowMs = Date.now()): string {
  return new Date(nowMs - MAIN_POS_KITCHEN_JOB_MAX_AGE_MS).toISOString()
}

const WORKER_ID_STORAGE_KEY = 'cm_pos_kitchen_print_worker_id'

export function kitchenLinesFromPrintJobPayload(
  payload: Record<string, unknown> | null | undefined
): Array<Record<string, unknown>> {
  const raw = payload?.kitchenLines
  if (!Array.isArray(raw)) return []
  return raw.filter((row) => row && typeof row === 'object') as Array<Record<string, unknown>>
}

export function resolveKitchenPrintJobDedupeKey(
  orderId: number,
  payload: Record<string, unknown> | null | undefined
): string {
  const action = String(payload?.action ?? '').trim()
  // savePosOrder create jobs always include kitchenLines. If we keyed those as
  // add:… the job worker printed again 1s after local/Realtime (`order:{id}:kitchen`).
  if (action === 'create_order') return `order:${orderId}:kitchen`
  const lines = kitchenLinesFromPrintJobPayload(payload)
  if (lines.length > 0) return buildDineInAddKitchenAutoPrintDedupeKey(orderId, lines)
  return `order:${orderId}:kitchen:job:${action || 'unknown'}`
}

export function getKitchenPrintWorkerId(storeCodeRaw: unknown): string {
  const storeCode = String(storeCodeRaw ?? '').trim() || 'store'
  if (typeof window === 'undefined') return `main-pos:${storeCode}:ssr`
  try {
    let id = sessionStorage.getItem(WORKER_ID_STORAGE_KEY)
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      sessionStorage.setItem(WORKER_ID_STORAGE_KEY, id)
    }
    return `main-pos:${storeCode}:${id}`
  } catch {
    return `main-pos:${storeCode}:mem`
  }
}

export function kitchenPrintJobOrderFieldsFromPayload(
  payload: Record<string, unknown> | null | undefined
): {
  orderNo: string
  tableName: string
  memo: string
  orderType: PosOrderTypeValue
  deliveryAppCode?: string
  guestCount?: number
} {
  const guestCount = Math.floor(Number(payload?.guestCount ?? 0) || 0)
  const deliveryAppCode = String(payload?.deliveryAppCode ?? payload?.delivery_app_code ?? '')
    .trim()
    .toLowerCase()
  return {
    orderNo: String(payload?.orderNo ?? '').trim(),
    tableName: String(payload?.tableName ?? '').trim(),
    memo: String(payload?.memo ?? '').trim(),
    orderType: coercePosOrderTypeForDb(
      String(payload?.orderType ?? payload?.order_type ?? '')
    ),
    ...(deliveryAppCode ? { deliveryAppCode } : {}),
    ...(guestCount > 0 ? { guestCount } : {}),
  }
}
