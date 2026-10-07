import { normalizePosTableNameForMatch } from '@/lib/pos-print-translate'

const OPEN_DINE_IN_STATUSES = new Set(['pending', 'cooking', 'ready'])

export type QrBillAttachCandidate = {
  id: number
  tableName: string
  orderType?: string | null
  status?: string | null
  createdAt?: string | null
  paymentSum: number
}

export function qrTableNamesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePosTableNameForMatch(a)
  const nb = normalizePosTableNameForMatch(b)
  return Boolean(na) && na === nb
}

export function posOrderOpenPaymentSum(row: {
  payment_cash?: unknown
  payment_card?: unknown
  payment_qr?: unknown
  payment_other?: unknown
  payment_delivery_app?: unknown
}): number {
  return (
    (Number(row.payment_cash) || 0) +
    (Number(row.payment_card) || 0) +
    (Number(row.payment_qr) || 0) +
    (Number(row.payment_other) || 0) +
    (Number(row.payment_delivery_app) || 0)
  )
}

export function isQrAttachableOpenDineIn(row: {
  orderType?: string | null
  status?: string | null
}): boolean {
  const type = String(row.orderType || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
  if (type && type !== 'dine_in') return false
  return OPEN_DINE_IN_STATUSES.has(String(row.status || '').trim().toLowerCase())
}

export function filterOpenDineInOrdersForTable<T extends QrBillAttachCandidate>(
  orders: T[],
  tableName: string
): T[] {
  return orders.filter(
    (order) => order.id > 0 && isQrAttachableOpenDineIn(order) && qrTableNamesMatch(order.tableName, tableName)
  )
}

function byOldest(a: QrBillAttachCandidate, b: QrBillAttachCandidate): number {
  const ta = Date.parse(a.createdAt || '') || 0
  const tb = Date.parse(b.createdAt || '') || 0
  if (ta !== tb) return ta - tb
  return a.id - b.id
}

function byNewest(a: QrBillAttachCandidate, b: QrBillAttachCandidate): number {
  return -byOldest(a, b)
}

/**
 * 같은 테이블에 열린 홀 빌이 여러 장이면 한 장으로 붙인다.
 * 결제 없는 빌은 가장 먼저 열린 주문(음식 빌)을 남기고, 나중에 생긴 QR 음료 빌을 흡수한다.
 * 결제된 빌이 하나면 그 빌을 남긴다. 결제된 빌이 둘 이상이면 자동으로 합치지 않는다.
 */
export function resolveQrBillAttach(params: {
  sessionOrderId: number
  tableName: string
  openOrders: QrBillAttachCandidate[]
}): { targetOrderId: number; absorbOrderIds: number[] } {
  const sessionOrderId = Math.trunc(Number(params.sessionOrderId) || 0)
  const matching = filterOpenDineInOrdersForTable(params.openOrders, params.tableName)
  if (matching.length === 0) {
    return { targetOrderId: sessionOrderId, absorbOrderIds: [] }
  }
  if (matching.length === 1) {
    return { targetOrderId: matching[0].id, absorbOrderIds: [] }
  }
  const paid = matching.filter((order) => order.paymentSum > 0.005)
  const unpaid = matching.filter((order) => order.paymentSum <= 0.005)
  let keep: QrBillAttachCandidate
  let absorb: QrBillAttachCandidate[]
  if (paid.length === 1) {
    keep = paid[0]
    absorb = unpaid
  } else if (paid.length === 0) {
    keep = [...matching].sort(byOldest)[0]
    absorb = matching.filter((order) => order.id !== keep.id)
  } else {
    const sessionHit = matching.find((order) => order.id === sessionOrderId)
    keep = sessionHit || [...matching].sort(byNewest)[0]
    absorb = []
  }
  return {
    targetOrderId: keep.id,
    absorbOrderIds: absorb.map((order) => order.id).filter((id) => id !== keep.id),
  }
}

export function remapAbsorbedPosOrderLine(
  line: Record<string, unknown>,
  absorbOrderId: number,
  index: number
): Record<string, unknown> {
  const rawId = String(line.id ?? '').trim()
  const prefix = `m${absorbOrderId}-`
  const id = rawId.startsWith(prefix) ? rawId : `${prefix}${rawId || String(index)}`
  return { ...line, id }
}

export function memoAlreadyAbsorbedOrder(memo: string | null | undefined, absorbOrderId: number): boolean {
  const id = Math.trunc(Number(absorbOrderId) || 0)
  if (!id) return false
  return String(memo ?? '').includes(`absorb_id=${id}]`)
}
