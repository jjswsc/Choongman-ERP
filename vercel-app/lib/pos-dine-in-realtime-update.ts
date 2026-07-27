/** Realtime pos_orders UPDATE — 테이블 이동(table_name만 변경) vs 추가주문·포장체크 구분 */

import {
  isPosOrderPaidLikeStatus,
  posOrderRowPaymentSum,
} from '@/lib/pos-payment-receipt-from-order'

const PACKAGING_STATE_ITEM_KEYS = new Set([
  'servedAt',
  'servedBy',
  'packedAt',
  'packedBy',
  'setChildrenState',
  'cancelledAt',
  'cancelledBy',
  'cancelReason',
])

const PRICING_FIELD_KEYS = ['discount_amt', 'coupon_discount_amt', 'total', 'subtotal'] as const

const PAYMENT_AMT_FIELD_KEYS = [
  'payment_cash',
  'payment_card',
  'payment_qr',
  'payment_other',
  'payment_delivery_app',
] as const

function rowItemsJsonSnapshot(row: Record<string, unknown>): string {
  const raw = row.items_json
  if (raw == null) return ''
  if (typeof raw === 'string') return raw
  try {
    return JSON.stringify(raw)
  } catch {
    return String(raw)
  }
}

function parseItemsJsonArray(raw: unknown): unknown[] {
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : Array.isArray(raw) ? raw : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function stripItemPackagingState(item: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(item)) {
    if (PACKAGING_STATE_ITEM_KEYS.has(key)) continue
    out[key] = value
  }
  return out
}

function normalizeItemsStructuralSnapshot(itemsJson: unknown): string {
  const items = parseItemsJsonArray(itemsJson)
  const stripped = items.map((it) =>
    stripItemPackagingState(typeof it === 'object' && it != null ? (it as Record<string, unknown>) : {})
  )
  return JSON.stringify(stripped)
}

/** Supabase Realtime OLD payload — REPLICA IDENTITY DEFAULT 이면 PK 외 필드가 비어 있을 수 있음 */
export function posOrderRealtimeRowHasField(row: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, key)
}

/** OLD 행에 가격 필드가 없으면 0→실값 오인(repeated hall reprint) 방지 */
export function posOrderRealtimePricingFieldsChanged(
  oldRow: Record<string, unknown>,
  newRow: Record<string, unknown>
): boolean {
  const oldHasAny = PRICING_FIELD_KEYS.some((key) => posOrderRealtimeRowHasField(oldRow, key))
  if (!oldHasAny) return false
  for (const key of PRICING_FIELD_KEYS) {
    if (!posOrderRealtimeRowHasField(oldRow, key) && !posOrderRealtimeRowHasField(newRow, key)) continue
    const oldVal = Math.max(0, Number(oldRow[key] ?? 0) || 0)
    const newVal = Math.max(0, Number(newRow[key] ?? 0) || 0)
    if (Math.abs(oldVal - newVal) > 0.01) return true
  }
  return false
}

/**
 * Realtime UPDATE로 결제 영수증 자동 인쇄할지.
 * — 이미 paid 인 주문에 collab backfill·메모·포장상태 등 비결제 UPDATE가 오면 재인쇄 금지.
 * — OLD 가 PK만 있으면(REPLICA IDENTITY DEFAULT) 전환을 증명할 수 없어 false (폴링 seed/fallback에 맡김).
 * — 로컬 결제 직후 인쇄는 checkout 경로가 담당.
 */
export function shouldAutoprintPaymentReceiptOnRealtimeUpdate(
  oldRow: Record<string, unknown> | null | undefined,
  newRow: Record<string, unknown>
): boolean {
  if (!isPosOrderPaidLikeStatus(String(newRow.status ?? ''))) return false
  if (posOrderRowPaymentSum(newRow) <= 0) return false
  if (!oldRow) return false

  const oldHasStatus = posOrderRealtimeRowHasField(oldRow, 'status')
  const oldHasPayment = PAYMENT_AMT_FIELD_KEYS.some((key) => posOrderRealtimeRowHasField(oldRow, key))
  if (!oldHasStatus && !oldHasPayment) return false

  // 이미 결제 완료 상태였으면 (협업 backfill·세금계산서 외 필드 등) 재인쇄하지 않음
  if (oldHasStatus && isPosOrderPaidLikeStatus(String(oldRow.status ?? ''))) return false
  // status 필드 없이 결제금액만 있고 이미 >0 이면 이미 결제된 것으로 봄
  if (!oldHasStatus && oldHasPayment && posOrderRowPaymentSum(oldRow) > 0) return false

  // unpaid → paid (또는 결제금액 0 → >0) 전환
  return true
}

/**
 * markPosOrderItemServed 등 items_json 포장·서빙 상태만 바뀐 UPDATE.
 * Realtime OLD 가 id 만 있을 때(가격 필드 없음)도 포장 체크로 간주해 자동 인쇄를 막는다.
 */
export function isPosOrderItemsJsonPackagingOnlyUpdate(
  oldRow: Record<string, unknown>,
  newRow: Record<string, unknown>
): boolean {
  if (posOrderRealtimePricingFieldsChanged(oldRow, newRow)) return false
  if (String(oldRow.status ?? '').trim().toLowerCase() !== String(newRow.status ?? '').trim().toLowerCase()) {
    return false
  }

  const newItemsRaw = newRow.items_json
  if (newItemsRaw == null) return false

  const oldHasItemsJson = posOrderRealtimeRowHasField(oldRow, 'items_json') && oldRow.items_json != null
  if (!oldHasItemsJson) {
    const oldHasAnyPricing = PRICING_FIELD_KEYS.some((key) => posOrderRealtimeRowHasField(oldRow, key))
    return !oldHasAnyPricing
  }

  return (
    normalizeItemsStructuralSnapshot(oldRow.items_json) === normalizeItemsStructuralSnapshot(newItemsRaw)
  )
}

/** table_name만 바뀌고 품목·소계가 같으면 true (추가주문 인쇄 제외) */
export function isPosDineInTableNameOnlyUpdate(
  oldRow: Record<string, unknown>,
  newRow: Record<string, unknown>
): boolean {
  const oldTable = String(oldRow.table_name ?? '').trim()
  const newTable = String(newRow.table_name ?? '').trim()
  if (!oldTable || !newTable || oldTable === newTable) return false

  if (rowItemsJsonSnapshot(oldRow) !== rowItemsJsonSnapshot(newRow)) return false

  const oldSub = Number(oldRow.subtotal ?? 0) || 0
  const newSub = Number(newRow.subtotal ?? 0) || 0
  if (Math.abs(oldSub - newSub) > 0.01) return false

  const oldTotal = Number(oldRow.total ?? 0) || 0
  const newTotal = Number(newRow.total ?? 0) || 0
  if (Math.abs(oldTotal - newTotal) > 0.01) return false

  return true
}
