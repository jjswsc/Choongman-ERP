import {
  parseAppliedCouponsFromBody,
  parseAppliedCouponsFromOrderRow,
  resolvePosSalesDiscountAmount,
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

/**
 * 주문 저장 시 가격(total/discount_amt)에 쓸 쿠폰 금액.
 * DB에 남기는 coupon_discount_amt와 동일해야 한다.
 * (재검증이 0이어도 appliedPre가 보존되면 그 금액을 total에 반영)
 */
export function resolveCouponDiscountAmtForOrderPricing(couponDbSave: {
  couponDiscountAmt: number
}): number {
  return Math.max(0, Number(couponDbSave.couponDiscountAmt) || 0)
}

/** 영수증 목록·상세 — 수동할인·쿠폰을 이중계산 없이 합산 */
export function resolvePosOrderDisplayDiscountAmt(order: {
  discountAmt?: number | null
  couponDiscountAmt?: number | null
}): number {
  return resolvePosSalesDiscountAmount(
    Math.max(0, Number(order.discountAmt) || 0),
    Math.max(0, Number(order.couponDiscountAmt) || 0)
  )
}

/**
 * 영수증 목록 표시용 합계.
 * coupon_discount_amt만 있고 discount_amt/total에 미반영된 레거시 행은 쿠폰만큼 차감.
 */
export function resolvePosOrderDisplayTotal(order: {
  total?: number | null
  discountAmt?: number | null
  couponDiscountAmt?: number | null
}): number {
  const total = Math.max(0, Number(order.total) || 0)
  const discountAmt = Math.max(0, Number(order.discountAmt) || 0)
  const couponAmt = Math.max(0, Number(order.couponDiscountAmt) || 0)
  if (couponAmt > 0.02 && discountAmt + 0.02 < couponAmt) {
    return Math.max(0, Math.round((total - couponAmt) * 100) / 100)
  }
  return total
}

/** 영수증 상세 — 쿠폰 코드·명칭 한 줄 */
export function formatPosOrderAppliedCouponLabel(order: {
  couponCode?: string | null
  appliedCoupons?: Array<{ code?: string | null; name?: string | null }> | null
}): string {
  const applied = Array.isArray(order.appliedCoupons) ? order.appliedCoupons : []
  const parts = applied
    .map((row) => {
      const code = String(row.code ?? '')
        .trim()
        .toUpperCase()
      if (!code) return ''
      const name = String(row.name ?? '').trim()
      if (name && name.toUpperCase() !== code) return `${name} (${code})`
      return code
    })
    .filter(Boolean)
  if (parts.length) return parts.join(', ')
  return String(order.couponCode ?? '')
    .trim()
    .toUpperCase()
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
  if (total > 0.02) {
    if (paymentSum >= total - 0.02) return true
    // total이 쿠폰 미반영(gross)인 레거시: 결제액 + 쿠폰 ≈ total 이면 정산 완료로 본다
    if (preCouponSum > 0.02 && paymentSum >= total - preCouponSum - 0.02) return true
    return false
  }
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
