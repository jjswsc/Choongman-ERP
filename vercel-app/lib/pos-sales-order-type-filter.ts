/** pos_orders.order_type — 매출 집계 API 공통 필터 */

export const POS_ORDER_TYPE_DB_VALUES = ['dine_in', 'takeout', 'delivery'] as const
export type PosOrderTypeValue = (typeof POS_ORDER_TYPE_DB_VALUES)[number]

const ALLOWED = new Set<string>(POS_ORDER_TYPE_DB_VALUES)

/**
 * 하이픈/대소문자 차이(dine-in vs dine_in)를 DB 표준값 비교용으로 통일.
 */
export function normalizePosOrderTypeKey(raw: string | undefined | null): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
}

/** 저장·집계용 표준 order_type (미인식 시 dine_in) */
export function coercePosOrderTypeForDb(raw: string | undefined | null): PosOrderTypeValue {
  const k = normalizePosOrderTypeKey(raw)
  if (k === 'dine_in') return 'dine_in'
  if (k === 'takeout') return 'takeout'
  if (k === 'delivery') return 'delivery'
  return 'dine_in'
}

/** guest_count 적용 대상: 홀(dine_in) 또는 DB에 타입 미기재(구데이터) */
export function isDineInOrderTypeForGuestCount(raw: string | undefined | null): boolean {
  const k = normalizePosOrderTypeKey(raw)
  return k === 'dine_in' || k === ''
}

/** 테이블 바닥도 점유: DB order_type 우선(목록 API의 memo 추론 delivery 제외) */
export function isDineInOrderForTableDisplay(
  orderType: string | undefined | null,
  dbOrderType?: string | undefined | null
): boolean {
  const k = normalizePosOrderTypeKey(dbOrderType ?? orderType)
  return k === 'dine_in'
}

/**
 * pos_orders.table_name 저장값.
 * - 홀: 테이블명
 * - 배달·포장: 표시 라벨(예: `Line Man #GF-1234`, 포장 슬롯명) — 비우면 리스트/영수증이 POS 내부 번호만 노출됨
 */
export function sanitizePosOrderTableNameForDb(
  orderType: string | undefined | null,
  rawTableName: unknown,
  maxLen = 500
): string {
  const tableName = String(rawTableName ?? '').trim()
  if (!tableName) return ''
  const k = normalizePosOrderTypeKey(orderType)
  if (k !== 'dine_in' && k !== 'delivery' && k !== 'takeout') return ''
  return tableName.length > maxLen ? tableName.slice(0, maxLen) : tableName
}

/**
 * 쿼리 `orderTypes=dine_in,takeout` 파싱.
 * 없거나 비어 있으면 필터 없음(전체).
 */
export function parseOrderTypesParam(raw: string | null | undefined): PosOrderTypeValue[] | null {
  if (raw == null || !String(raw).trim()) return null
  const out: PosOrderTypeValue[] = []
  for (const p of String(raw).split(',')) {
    const s = p.trim()
    if (ALLOWED.has(s)) out.push(s as PosOrderTypeValue)
  }
  return out.length > 0 ? out : null
}

export function rowMatchesOrderFilter(
  orderType: string | undefined,
  allowed: PosOrderTypeValue[] | null
): boolean {
  if (allowed == null) return true
  const t = normalizePosOrderTypeKey(orderType)
  /** 구 POS 데이터: order_type 미기재 → 홀(dine_in)과 동일하게 집계 */
  if (t === '' && allowed.includes('dine_in')) return true
  return (allowed as readonly string[]).includes(t)
}

/** URL·state용: 빈 문자열 = 필터 없음(전체) */
export function normalizeOrderTypesQueryString(raw: string | null | undefined): string {
  const p = parseOrderTypesParam(raw)
  if (!p?.length) return ''
  return [...p].sort().join(',')
}

/**
 * pos_orders 행 → API·Realtime 공통 order_type.
 * DB에 dine_in 이어도 Line Man/Grab memo·table_name 이면 delivery 로 본다.
 */
export function inferPosOrderTypeFromRow(row: {
  order_type?: string | null
  memo?: string | null
  table_name?: string | null
  delivery_payment_channel?: string | null
  items_json?: string | unknown | null
}): PosOrderTypeValue {
  const explicit = coercePosOrderTypeForDb(row.order_type)
  if (explicit !== 'dine_in') return explicit
  const channel = String(row.delivery_payment_channel ?? '').trim().toLowerCase()
  if (channel === 'grab' || channel === 'lineman' || channel === 'shopee') return 'delivery'
  const memo = String(row.memo ?? '').toLowerCase()
  const tableName = String(row.table_name ?? '').toLowerCase()
  if (
    memo.includes('grab_order:') ||
    memo.includes('lineman_order:') ||
    memo.includes('shopee_order:') ||
    memo.includes('delivery') ||
    tableName.includes('grab') ||
    tableName.includes('line man') ||
    tableName.includes('lineman') ||
    tableName.includes('shopee')
  ) {
    return 'delivery'
  }
  try {
    const raw = row.items_json
    const items =
      typeof raw === 'string' ? JSON.parse(raw) : Array.isArray(raw) ? raw : JSON.parse(String(raw ?? '[]'))
    if (
      Array.isArray(items) &&
      items.some((it) => String((it as { deliveryAppCode?: string }).deliveryAppCode ?? '').trim())
    ) {
      return 'delivery'
    }
  } catch {
    // keep dine_in fallback
  }
  return 'dine_in'
}

export function isPosOrderTypeRawKey(raw: string | undefined | null): boolean {
  const key = normalizePosOrderTypeKey(raw)
  return key === 'dine_in' || key === 'takeout' || key === 'delivery'
}

/** 홀 주문서·영수증 인쇄용 주문 유형 표시 라벨 */
export function resolvePosOrderTypeReceiptLabel(
  orderType: string | undefined | null,
  t: (key: string) => string
): string {
  const key = normalizePosOrderTypeKey(orderType)
  if (key === 'delivery') return t('posOrderTypeDelivery') || 'Delivery'
  if (key === 'takeout') return t('posOrderTypeTakeout') || 'Takeaway'
  if (key === 'dine_in') return t('posOrderTypeDineIn') || 'Dine In'
  const trimmed = String(orderType ?? '').trim()
  return trimmed || t('posOrderTypeDineIn') || 'Dine In'
}
