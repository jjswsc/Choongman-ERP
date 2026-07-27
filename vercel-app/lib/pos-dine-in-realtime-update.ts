/** Realtime pos_orders UPDATE — 테이블 이동(table_name만 변경) vs 추가주문·포장체크 구분 */

import {
  isPosMergeAbsorbedLineId,
  isPosOrderMergedKeepReceive,
  isRecentPosOrderMergeKeepReceive,
  parseLatestPosOrderMergeKeepStamp,
} from '@/lib/pos-order-merge'
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

function itemIdsFromItemsJson(itemsJson: unknown): Set<string> {
  const ids = new Set<string>()
  for (const raw of parseItemsJsonArray(itemsJson)) {
    if (typeof raw !== 'object' || raw == null) continue
    const id = String((raw as Record<string, unknown>).id ?? '').trim()
    if (id) ids.add(id)
  }
  return ids
}

/** 합석으로 새로 붙은 absorb 줄 id (`m{absorbOrderId}-…`)가 생겼는지 */
export function hasNewPosMergeAbsorbedLineIds(
  oldItemsJson: unknown,
  newItemsJson: unknown
): boolean {
  const oldIds = itemIdsFromItemsJson(oldItemsJson)
  for (const id of itemIdsFromItemsJson(newItemsJson)) {
    if (oldIds.has(id)) continue
    if (isPosMergeAbsorbedLineId(id)) return true
  }
  return false
}

/**
 * 합석(keep 품목 흡수) UPDATE — 추가주문 자동 주방/홀 인쇄 대상이 아님.
 * - keep memo에 ORDER_MERGE_KEEP 스탬프가 **새로** 생기거나
 * - (스탬프 존재 시) items에 `m{absorbId}-` 줄이 새로 붙은 경우
 * ※ OLD에 memo 필드가 없으면(Replica Identity) “최근 스탬프”만으로 true 하지 않는다
 *   → 합석 직후 정상 추가주문까지 막히는 것을 방지.
 */
export function isPosDineInTableMergeItemsUpdate(
  oldRow: Record<string, unknown> | null | undefined,
  newRow: Record<string, unknown>
): boolean {
  const newMemo = String(newRow.memo ?? '')
  const newHasKeepStamp = isPosOrderMergedKeepReceive(newMemo)
  if (!newHasKeepStamp) return false

  if (
    oldRow &&
    posOrderRealtimeRowHasField(oldRow, 'items_json') &&
    oldRow.items_json != null
  ) {
    if (hasNewPosMergeAbsorbedLineIds(oldRow.items_json, newRow.items_json)) return true
  }

  // 스탬프가 이번 UPDATE에 처음 붙은 경우만 (OLD memo를 볼 수 있을 때)
  if (!oldRow || !posOrderRealtimeRowHasField(oldRow, 'memo')) return false
  return !isPosOrderMergedKeepReceive(String(oldRow.memo ?? ''))
}

/** 동일 합석 스탬프에 대한 qty-only 스킵은 주문당 1회만 (45초 창 전체 차단 방지) */
const mergeQtyOnlySkipAppliedKeys = new Set<string>()

function consumeMergeQtyOnlySkipOnce(orderId: number, memo: string): boolean {
  const parsed = parseLatestPosOrderMergeKeepStamp(memo)
  if (!parsed) return false
  const key = `${Math.floor(orderId)}:${parsed.atMs}`
  if (mergeQtyOnlySkipAppliedKeys.has(key)) return false
  mergeQtyOnlySkipAppliedKeys.add(key)
  // 메모리 누수 방지 — 최근 키만 유지
  if (mergeQtyOnlySkipAppliedKeys.size > 200) {
    const first = mergeQtyOnlySkipAppliedKeys.values().next().value
    if (first != null) mergeQtyOnlySkipAppliedKeys.delete(first)
  }
  return true
}

/** 테스트용 */
export function resetMergeQtyOnlySkipAppliedKeysForTests(): void {
  mergeQtyOnlySkipAppliedKeys.clear()
}

/**
 * Realtime·폴링 공통: 합석으로 늘어난 수량/줄을 추가주문 자동인쇄에서 제외.
 * @returns true면 스냅샷만 갱신하고 인쇄 스킵
 *
 * 결제 영수증·로컬 발주 인쇄는 건드리지 않는다.
 * 동일메뉴 consolidate(수량만 증가)는 스탬프당 1회만 스킵 → 직후 같은 줄 추가주문은 출력됨.
 */
export function shouldSkipDineInAddonAutoprintForTableMerge(opts: {
  orderId?: number
  oldRow?: Record<string, unknown> | null
  newRow?: Record<string, unknown> | null
  newMemo?: string | null
  changedKeys: Iterable<string>
  prevQtyById?: Map<string, number>
  nowMs?: number
}): boolean {
  const changed = [...opts.changedKeys]
  if (changed.length === 0) return false

  const newRow = opts.newRow
  if (opts.oldRow && newRow && isPosDineInTableMergeItemsUpdate(opts.oldRow, newRow)) {
    const memo = String(newRow.memo ?? opts.newMemo ?? '')
    const orderId = opts.orderId ?? Number(newRow.id ?? 0)
    if (Number.isFinite(orderId) && orderId > 0) {
      // Realtime이 합석을 처리했으면 poll의 qty-only 1회 스킵도 소진
      void consumeMergeQtyOnlySkipOnce(orderId, memo)
    }
    return true
  }

  const memo = opts.newMemo ?? (newRow ? String(newRow.memo ?? '') : '')
  if (!isPosOrderMergedKeepReceive(memo)) return false
  if (!isRecentPosOrderMergeKeepReceive(memo, 45_000, opts.nowMs)) return false

  const prev = opts.prevQtyById
  const brandNewIds = changed.filter((id) => (prev?.get(id) ?? 0) <= 0)

  // absorb 줄이 m-접두로 붙은 경우 (스탬프 최근)
  if (brandNewIds.length > 0) {
    return brandNewIds.every((id) => isPosMergeAbsorbedLineId(id))
  }

  // 동일메뉴 consolidate: qty만 증가 — 스탬프당 1회만 스킵
  const orderId = opts.orderId ?? (newRow ? Number(newRow.id ?? 0) : 0)
  if (!Number.isFinite(orderId) || orderId <= 0) return false
  return consumeMergeQtyOnlySkipOnce(orderId, memo)
}
