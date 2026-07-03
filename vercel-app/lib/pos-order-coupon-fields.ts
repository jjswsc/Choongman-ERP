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

/**
 * 결제 저장 시 재검증이 쿠폰을 제거해도, 클라이언트·병합 결과(appliedPre)는 DB에 보존한다.
 * 이후 redemption·상태 동기화가 applied_coupons를 읽을 수 있게 한다.
 */
export function resolveAppliedCouponsForOrderDbSave(params: {
  appliedPre: PosAppliedCouponLine[]
  validated: PosAppliedCouponLine[]
  validatedCouponCode: string
  validatedCouponDiscountAmt: number
}): {
  appliedCoupons: PosAppliedCouponLine[]
  appliedCouponsJson: PosAppliedCouponLine[] | null
  couponCode: string
  couponDiscountAmt: number
} {
  const appliedForSave =
    params.validated.length > 0 ? params.validated : params.appliedPre
  const preLegacy = summarizeLegacyCouponFields(params.appliedPre)
  const saveLegacy = summarizeLegacyCouponFields(appliedForSave)
  return {
    appliedCoupons: appliedForSave,
    appliedCouponsJson: appliedForSave.length > 0 ? appliedForSave : null,
    couponCode:
      params.validatedCouponCode || saveLegacy.couponCode || preLegacy.couponCode,
    couponDiscountAmt:
      params.validatedCouponDiscountAmt > 0.0001
        ? params.validatedCouponDiscountAmt
        : saveLegacy.couponDiscountAmt > 0.0001
          ? saveLegacy.couponDiscountAmt
          : preLegacy.couponDiscountAmt,
  }
}

/** 결제 완료 판정 — 쿠폰만으로 0원 결제·paid_at 스탬프도 포함 */
export function isPosOrderCouponPaymentSettled(params: {
  total: number
  paymentSum: number
  preCouponSum?: number
  appliedPreCount?: number
  paidAtStamp?: string | null
}): boolean {
  const total = Math.max(0, Number(params.total) || 0)
  const paymentSum = Math.max(0, Number(params.paymentSum) || 0)
  const preCouponSum = Math.max(0, Number(params.preCouponSum ?? 0) || 0)
  const appliedPreCount = Math.max(0, Math.trunc(Number(params.appliedPreCount ?? 0) || 0))
  if (total > 0.02) return paymentSum >= total - 0.02
  if (paymentSum > 0) return true
  if (String(params.paidAtStamp ?? '').trim()) return true
  return preCouponSum > 0.02 || appliedPreCount > 0
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
