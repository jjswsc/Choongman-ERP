import {
  parseAppliedCouponsFromBody,
  resolvePosSalesDiscountAmount,
  type PosAppliedCouponLine,
} from '@/lib/pos-coupon-domain'
import { isCollabDiscountReasonText } from '@/lib/pos-collab-discount'
import {
  isDeliveryPlatformDiscountOrder,
  isPlatformDiscountReasonText,
  resolvePlatformDiscountReasonForAnalytics,
  type DeliveryPlatformDiscountOrderRow,
} from '@/lib/pos-platform-discount-reason'

export type PosPaymentDiscountKind = 'manual' | 'collab' | 'coupon' | 'platform' | 'other'

export type PosSalesPaymentDiscountRow = {
  key: string
  kind: PosPaymentDiscountKind
  label: string
  code: string
  orderCount: number
  discountAmount: number
  discountPctOfGross: number
  discountSharePct: number
}

export type PosSalesPaymentDiscountTotals = {
  discountAmount: number
  orderCountWithDiscount: number
  periodGrossSales: number
  periodOrderCount: number
  discountPctOfGross: number
}

export type PosSalesPaymentKindTotals = {
  kind: PosPaymentDiscountKind
  orderCount: number
  discountAmount: number
  discountPctOfGross: number
  discountSharePct: number
}

export type PosSalesPaymentDiscountResult = {
  rows: PosSalesPaymentDiscountRow[]
  totals: PosSalesPaymentDiscountTotals
  byKind: PosSalesPaymentKindTotals[]
}

type OrderRowForPaymentDiscountAgg = DeliveryPlatformDiscountOrderRow & {
  total?: number
  applied_coupons?: unknown
  coupon_code?: string
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function pctOf(part: number, whole: number): number {
  if (whole <= 0.0001) return 0
  return round2((part / whole) * 100)
}

export function resolveCouponLines(order: OrderRowForPaymentDiscountAgg): PosAppliedCouponLine[] {
  const parsed = parseAppliedCouponsFromBody(order.applied_coupons)
  if (parsed.length > 0) return parsed
  const couponAmt = Math.max(0, Number(order.coupon_discount_amt) || 0)
  const code = str(order.coupon_code).toUpperCase()
  if (couponAmt <= 0.0001) return []
  return [{ code: code || '(쿠폰)', name: code || 'Coupon', discountAmt: couponAmt, quantity: 1 }]
}

/** 주문 1건 — discount_amt·coupon 중복 저장 패턴 보정 후 비쿠폰·쿠폰 분리 */
export function resolveNonCouponDiscountAmt(
  discountAmt: number,
  couponTotal: number
): number {
  const discount = Math.max(0, discountAmt)
  const coupon = Math.max(0, couponTotal)
  if (coupon <= 0.0001) return discount
  if (discount + 0.0001 >= coupon) return Math.max(0, discount - coupon)
  return discount
}

export function classifyNonCouponKind(
  reason: string,
  order?: OrderRowForPaymentDiscountAgg
): Exclude<PosPaymentDiscountKind, 'coupon'> {
  if (isCollabDiscountReasonText(reason)) return 'collab'
  if (isPlatformDiscountReasonText(reason)) return 'platform'
  if (order && isDeliveryPlatformDiscountOrder(order)) return 'platform'
  if (reason) return 'manual'
  return 'other'
}

export function filterPaymentDiscountRows(
  rows: PosSalesPaymentDiscountRow[],
  searchTokens: string[],
  searchAnd: boolean
): PosSalesPaymentDiscountRow[] {
  if (searchTokens.length === 0) return rows
  return rows.filter((row) => {
    const haystack = [row.label, row.code, row.kind, row.key].join(' ').toLowerCase()
    return searchAnd
      ? searchTokens.every((token) => haystack.includes(token))
      : searchTokens.some((token) => haystack.includes(token))
  })
}

/**
 * 완료 주문 — 결제 할인(수동·협업·쿠폰·배달앱 등) 유형별 집계.
 * 총액은 resolvePosSalesDiscountAmount 와 동일 기준.
 */
export function aggregatePosSalesPaymentDiscount(params: {
  orderRows: OrderRowForPaymentDiscountAgg[]
}): PosSalesPaymentDiscountResult {
  const rowBuckets = new Map<
    string,
    Omit<PosSalesPaymentDiscountRow, 'discountPctOfGross' | 'discountSharePct'>
  >()
  const kindBuckets = new Map<
    PosPaymentDiscountKind,
    { kind: PosPaymentDiscountKind; orderCount: number; discountAmount: number; orderKeys: Set<string> }
  >()
  for (const kind of ['manual', 'collab', 'coupon', 'platform', 'other'] as const) {
    kindBuckets.set(kind, { kind, orderCount: 0, discountAmount: 0, orderKeys: new Set() })
  }

  const totals: PosSalesPaymentDiscountTotals = {
    discountAmount: 0,
    orderCountWithDiscount: 0,
    periodGrossSales: 0,
    periodOrderCount: 0,
    discountPctOfGross: 0,
  }

  let orderIndex = 0
  for (const order of params.orderRows) {
    orderIndex += 1
    const orderKey = String(orderIndex)
    totals.periodGrossSales = round2(totals.periodGrossSales + Math.max(0, Number(order.total) || 0))
    totals.periodOrderCount += 1

    const discountAmt = Math.max(0, Number(order.discount_amt) || 0)
    const couponAmtField = Math.max(0, Number(order.coupon_discount_amt) || 0)
    const reason = str(order.discount_reason)
    const couponLines = resolveCouponLines(order)
    const couponFromLines = round2(
      couponLines.reduce((s, line) => s + Math.max(0, Number(line.discountAmt) || 0), 0)
    )
    const couponTotal = couponFromLines > 0.0001 ? couponFromLines : couponAmtField
    const orderTotalDiscount = resolvePosSalesDiscountAmount(discountAmt, couponAmtField)
    if (orderTotalDiscount <= 0.0001) continue

    totals.discountAmount = round2(totals.discountAmount + orderTotalDiscount)
    totals.orderCountWithDiscount += 1

    const nonCouponAmt = resolveNonCouponDiscountAmt(discountAmt, couponTotal)
    if (nonCouponAmt > 0.0001) {
      const kind = classifyNonCouponKind(reason, order)
      const label =
        reason ||
        (kind === 'platform' ? resolvePlatformDiscountReasonForAnalytics(order, nonCouponAmt) : '')
      const code = kind
      const key = `${kind}::${label.toLowerCase()}`
      const prev = rowBuckets.get(key) ?? {
        key,
        kind,
        label,
        code,
        orderCount: 0,
        discountAmount: 0,
      }
      prev.discountAmount = round2(prev.discountAmount + nonCouponAmt)
      prev.orderCount += 1
      rowBuckets.set(key, prev)

      const kindPrev = kindBuckets.get(kind)!
      kindPrev.discountAmount = round2(kindPrev.discountAmount + nonCouponAmt)
      kindPrev.orderKeys.add(orderKey)
    }

    for (const coupon of couponLines) {
      const amt = Math.max(0, Number(coupon.discountAmt) || 0)
      if (amt <= 0.0001) continue
      const code = str(coupon.code).toUpperCase() || '(coupon)'
      const label = str(coupon.name) || code
      const key = `coupon::${code}`
      const prev = rowBuckets.get(key) ?? {
        key,
        kind: 'coupon' as const,
        label,
        code,
        orderCount: 0,
        discountAmount: 0,
      }
      prev.discountAmount = round2(prev.discountAmount + amt)
      prev.orderCount += 1
      rowBuckets.set(key, prev)

      const kindPrev = kindBuckets.get('coupon')!
      kindPrev.discountAmount = round2(kindPrev.discountAmount + amt)
      kindPrev.orderKeys.add(orderKey)
    }

    // discount_amt에 쿠폰이 포함되지 않고 coupon 필드만 있는 레거시는 resolveCouponLines·resolvePosSalesDiscountAmount로 처리
  }

  totals.discountAmount = round2(totals.discountAmount)
  totals.discountPctOfGross = pctOf(totals.discountAmount, totals.periodGrossSales)

  const rows: PosSalesPaymentDiscountRow[] = Array.from(rowBuckets.values())
    .map((row) => ({
      ...row,
      discountPctOfGross: pctOf(row.discountAmount, totals.periodGrossSales),
      discountSharePct: pctOf(row.discountAmount, totals.discountAmount),
    }))
    .sort((a, b) => b.discountAmount - a.discountAmount || a.label.localeCompare(b.label))

  const byKind: PosSalesPaymentKindTotals[] = (
    ['manual', 'collab', 'coupon', 'platform', 'other'] as const
  )
    .map((kind) => {
      const bucket = kindBuckets.get(kind)!
      return {
        kind,
        orderCount: bucket.orderKeys.size,
        discountAmount: bucket.discountAmount,
        discountPctOfGross: pctOf(bucket.discountAmount, totals.periodGrossSales),
        discountSharePct: pctOf(bucket.discountAmount, totals.discountAmount),
      }
    })
    .filter((row) => row.discountAmount > 0.0001)

  return { rows, totals, byKind }
}
