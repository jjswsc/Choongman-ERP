import {
  parseAppliedCouponsFromBody,
  parseAppliedCouponsFromOrderRow,
  summarizeLegacyCouponFields,
  type PosAppliedCouponLine,
} from '@/lib/pos-coupon-domain'

/** 결제 요청 body + DB 기존 주문에서 쿠폰 목록 병합 (결제-only update 대비) */
export function mergePosOrderAppliedCouponsFromRequest(
  body: Record<string, unknown> | null | undefined,
  existingApplied?: unknown
): PosAppliedCouponLine[] {
  const fromBody = parseAppliedCouponsFromBody(body?.appliedCoupons ?? body?.applied_coupons)
  if (fromBody.length > 0) return fromBody

  const fromDb = parseAppliedCouponsFromOrderRow(existingApplied)
  if (fromDb.length > 0) return fromDb

  const legacyCode = String(body?.couponCode ?? body?.coupon_code ?? '').trim().toUpperCase()
  const legacyAmt = Math.max(0, Number(body?.couponDiscountAmt ?? body?.coupon_discount_amt ?? 0))
  if (legacyCode) {
    return [{ code: legacyCode, name: legacyCode, discountAmt: legacyAmt, quantity: 1 }]
  }

  return []
}

/** CartPanel·터미널 payload → savePosOrder/updatePosOrder 쿠폰 필드 (memberCouponIssueId 포함) */
export function posOrderCouponFieldsFromPayload(payload: {
  couponCode?: string
  couponDiscountAmt?: number
  appliedCoupons?: PosAppliedCouponLine[]
}): {
  couponCode?: string
  couponDiscountAmt?: number
  appliedCoupons?: PosAppliedCouponLine[]
} {
  const applied = Array.isArray(payload.appliedCoupons)
    ? payload.appliedCoupons.filter((row) => String(row?.code ?? '').trim())
    : []
  if (applied.length > 0) {
    const legacy = summarizeLegacyCouponFields(applied)
    return {
      appliedCoupons: applied,
      ...(legacy.couponCode ? { couponCode: legacy.couponCode } : {}),
      ...(legacy.couponDiscountAmt > 0.0001 ? { couponDiscountAmt: legacy.couponDiscountAmt } : {}),
    }
  }

  const couponCode = String(payload.couponCode ?? '').trim().toUpperCase()
  const couponDiscountAmt = Math.max(0, Number(payload.couponDiscountAmt ?? 0))
  if (!couponCode) return {}
  return {
    couponCode,
    ...(couponDiscountAmt > 0.0001 ? { couponDiscountAmt } : {}),
  }
}

/** pos_orders 행 스냅샷 → updatePosOrder 쿠폰 필드 */
export function posOrderCouponFieldsFromOrderRow(order: {
  couponCode?: string
  couponDiscountAmt?: number
  appliedCoupons?: PosAppliedCouponLine[]
  applied_coupons?: unknown
}): ReturnType<typeof posOrderCouponFieldsFromPayload> {
  const fromRow = parseAppliedCouponsFromOrderRow(order.appliedCoupons ?? order.applied_coupons)
  return posOrderCouponFieldsFromPayload({
    couponCode: order.couponCode,
    couponDiscountAmt: order.couponDiscountAmt,
    appliedCoupons: fromRow.length ? fromRow : undefined,
  })
}
