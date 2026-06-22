import {
  parseAppliedCouponsFromBody,
  resolvePosSalesDiscountAmount,
  type PosAppliedCouponLine,
} from '@/lib/pos-coupon-domain'
import { isCollabDiscountReasonText } from '@/lib/pos-collab-discount'
import {
  resolveDeliveryPlatformBundleDiscountAmt,
  type DeliveryPlatformDiscountOrderRow,
} from '@/lib/pos-platform-discount-reason'
import {
  isMemberTierDiscountReasonText,
  resolveMemberTierDiscountLabel,
} from '@/lib/pos-tier-discount-reason'

export type PosPaymentDiscountKind = 'manual' | 'collab' | 'coupon' | 'platform' | 'tier' | 'other'

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

export type OrderRowForPaymentDiscountAgg = DeliveryPlatformDiscountOrderRow & {
  total?: number
  applied_coupons?: unknown
  coupon_code?: string
  tier_discount_amt?: number | null
  member_tier_code?: string | null
}

export type PaymentNonCouponSplit = {
  tier: number
  collab: number
  manual: number
  other: number
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

export function splitPaymentNonCouponDiscount(
  order: OrderRowForPaymentDiscountAgg,
  paymentNonCoupon: number
): PaymentNonCouponSplit {
  const reason = str(order.discount_reason)
  let remaining = Math.max(0, paymentNonCoupon)
  const tierStored = Math.max(0, Number(order.tier_discount_amt ?? 0))
  let tier = Math.min(remaining, tierStored)
  remaining = round2(Math.max(0, remaining - tier))

  // tier_discount_amt 미저장(레거시) — reason 문구로 등급 할인 추정
  if (remaining > 0.0001 && tier <= 0.0001 && isMemberTierDiscountReasonText(reason)) {
    tier = remaining
    remaining = 0
  }

  let collab = 0
  let manual = 0
  let other = 0
  if (remaining > 0 && isCollabDiscountReasonText(reason)) {
    collab = remaining
    remaining = 0
  }
  if (remaining > 0) {
    if (reason) manual = remaining
    else other = remaining
  }
  return { tier, collab, manual, other }
}

export function classifyNonCouponKind(
  reason: string,
  order?: OrderRowForPaymentDiscountAgg
): Exclude<PosPaymentDiscountKind, 'coupon'> {
  if (Math.max(0, Number(order?.tier_discount_amt ?? 0)) > 0.0001) return 'tier'
  if (isMemberTierDiscountReasonText(reason)) return 'tier'
  if (isCollabDiscountReasonText(reason)) return 'collab'
  if (reason) return 'manual'
  return 'other'
}

function addPaymentDiscountBucket(
  rowBuckets: Map<string, Omit<PosSalesPaymentDiscountRow, 'discountPctOfGross' | 'discountSharePct'>>,
  kindBuckets: Map<
    PosPaymentDiscountKind,
    { kind: PosPaymentDiscountKind; orderCount: number; discountAmount: number; orderKeys: Set<string> }
  >,
  orderKey: string,
  kind: PosPaymentDiscountKind,
  label: string,
  code: string,
  amount: number
) {
  if (amount <= 0.0001) return
  const key = kind === 'coupon' ? `coupon::${code.toUpperCase() || '(coupon)'}` : `${kind}::${label.toLowerCase()}`
  const prev = rowBuckets.get(key) ?? {
    key,
    kind,
    label,
    code,
    orderCount: 0,
    discountAmount: 0,
  }
  prev.discountAmount = round2(prev.discountAmount + amount)
  prev.orderCount += 1
  rowBuckets.set(key, prev)

  const kindPrev = kindBuckets.get(kind)!
  kindPrev.discountAmount = round2(kindPrev.discountAmount + amount)
  kindPrev.orderKeys.add(orderKey)
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
 * 완료 주문 — 결제 할인(수동·협업·쿠폰·등급·배달앱 등) 유형별 집계.
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
  for (const kind of ['manual', 'collab', 'coupon', 'platform', 'tier', 'other'] as const) {
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
    const platformBundleDiscount = resolveDeliveryPlatformBundleDiscountAmt(order)
    const paymentDiscountTotal = round2(orderTotalDiscount - platformBundleDiscount)
    if (paymentDiscountTotal <= 0.0001) continue

    totals.discountAmount = round2(totals.discountAmount + paymentDiscountTotal)
    totals.orderCountWithDiscount += 1

    const nonCouponAmt = resolveNonCouponDiscountAmt(discountAmt, couponTotal)
    const paymentNonCoupon = round2(Math.max(0, nonCouponAmt - platformBundleDiscount))
    if (paymentNonCoupon > 0.0001) {
      const split = splitPaymentNonCouponDiscount(order, paymentNonCoupon)
      if (split.tier > 0) {
        addPaymentDiscountBucket(
          rowBuckets,
          kindBuckets,
          orderKey,
          'tier',
          resolveMemberTierDiscountLabel(order),
          str(order.member_tier_code).toUpperCase() || 'tier',
          split.tier
        )
      }
      if (split.collab > 0) {
        addPaymentDiscountBucket(rowBuckets, kindBuckets, orderKey, 'collab', reason, 'collab', split.collab)
      }
      if (split.manual > 0) {
        addPaymentDiscountBucket(rowBuckets, kindBuckets, orderKey, 'manual', reason, 'manual', split.manual)
      }
      if (split.other > 0) {
        addPaymentDiscountBucket(rowBuckets, kindBuckets, orderKey, 'other', reason || 'other', 'other', split.other)
      }
    }

    for (const coupon of couponLines) {
      const amt = Math.max(0, Number(coupon.discountAmt) || 0)
      if (amt <= 0.0001) continue
      const code = str(coupon.code).toUpperCase() || '(coupon)'
      const label = str(coupon.name) || code
      addPaymentDiscountBucket(rowBuckets, kindBuckets, orderKey, 'coupon', label, code, amt)
    }
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
    ['manual', 'collab', 'coupon', 'platform', 'tier', 'other'] as const
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
