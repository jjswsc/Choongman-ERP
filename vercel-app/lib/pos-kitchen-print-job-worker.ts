import { buildDineInAddKitchenAutoPrintDedupeKey } from '@/lib/pos-kitchen-dine-in-delta'
import { coercePosOrderTypeForDb, type PosOrderTypeValue } from '@/lib/pos-sales-order-type-filter'

/**
 * 인쇄 큐 claim 안전망 — INSERT Realtime poke가 놓쳐도 이 간격으로 가져간다.
 * QR 주방은 주문 UPDATE(홀 화면)보다 먼저 나가야 하므로, 주문 Realtime이 살아 있어도 60s로 늘리지 않는다.
 * 오픈 전·마감 후면 인터벌만 쉼. 오래된 잡은 MAX_AGE·DRAIN_MAX 로 막는다.
 */
export const MAIN_POS_KITCHEN_JOB_POLL_MS = 2_000
/** 오픈 전·마감 후 스케줄만 유지 (drain 은 pause 에서 건너뜀) */
export const MAIN_POS_KITCHEN_JOB_POLL_PAUSED_MS = 60_000
/** @deprecated 주문 Realtime 건강과 무관. POLL_MS 와 같음 */
export const MAIN_POS_KITCHEN_JOB_POLL_HEALTHY_MS = MAIN_POS_KITCHEN_JOB_POLL_MS

export function resolveKitchenPrintJobPollMs(_opts?: {
  realtimeChannelHealthy?: boolean
  realtimeRecentlyActive?: boolean
  jobsInsertChannelHealthy?: boolean
}): number {
  return MAIN_POS_KITCHEN_JOB_POLL_MS
}
/** QR enqueue 직후·주문 UPDATE 레이스를 흡수 */
export const MAIN_POS_KITCHEN_JOB_POKE_RETRY_MS = [0, 400, 1_200, 2_500] as const
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

export function resolveQrTableKitchenJobDedupeKey(
  orderId: number,
  lines: Array<{ id?: unknown }>
): string {
  const ids = lines
    .map((line) => String(line.id ?? '').trim())
    .filter(Boolean)
    .sort()
  if (ids.length > 0) return `order:${orderId}:kitchen:qr:${ids.join(',')}`
  return `order:${orderId}:kitchen:qr:job`
}

export function resolveKitchenPrintJobDedupeKey(
  orderId: number,
  payload: Record<string, unknown> | null | undefined
): string {
  const action = String(payload?.action ?? '').trim()
  // savePosOrder create jobs always include kitchenLines. If we keyed those as
  // add:… the job worker printed again 1s after local/Realtime (`order:{id}:kitchen`).
  if (action === 'create_order') return `order:${orderId}:kitchen`
  const source = String(payload?.source ?? '').trim()
  const lines = kitchenLinesFromPrintJobPayload(payload)
  if (source === 'qr_table_submit' || source === 'qr_table_extras_paid') {
    return resolveQrTableKitchenJobDedupeKey(orderId, lines)
  }
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
