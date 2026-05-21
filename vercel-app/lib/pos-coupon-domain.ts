/**
 * POS 쿠폰 다중 적용 — 순수 도메인(검증·합산·레거시 요약)
 */

export type PosCouponRedemptionMode = 'reusable_code' | 'single_use_serial' | 'member_issue'
export type PosCouponStackMode = 'fixed_only' | 'percent_only' | 'any'
export type PosCouponCalcBase = 'remaining' | 'subtotal'

export interface PosLoyaltySettings {
  brandKey: string
  maxCouponsPerOrder: number
  couponStackWithManualDiscount: boolean
  couponStackWithPoints: boolean
  couponCalcBase: PosCouponCalcBase
}

export const DEFAULT_POS_LOYALTY_SETTINGS: PosLoyaltySettings = {
  brandKey: 'default',
  maxCouponsPerOrder: 10,
  couponStackWithManualDiscount: true,
  couponStackWithPoints: true,
  couponCalcBase: 'remaining',
}

export interface PosCouponTemplate {
  id?: number
  code: string
  name?: string
  discountType: 'percent' | 'fixed'
  discountValue: number
  validFrom?: string | null
  validTo?: string | null
  isActive?: boolean
  minOrderAmt?: number
  maxPerOrder?: number
  redemptionMode?: PosCouponRedemptionMode
  allowQuantityEntry?: boolean
  stackMode?: PosCouponStackMode
  maxUses?: number | null
  usedCount?: number
  maxDiscountAmt?: number | null
}

export interface PosAppliedCouponLine {
  code: string
  name?: string
  discountAmt: number
  quantity?: number
  couponId?: number
  serialId?: number
  memberCouponIssueId?: number
}

export interface PosCouponValidationContext {
  subtotal: number
  manualDiscountAmt: number
  collabDiscountAmt?: number
  applied: PosAppliedCouponLine[]
  todayYmd: string
  loyalty: PosLoyaltySettings
}

export interface PosCouponCandidateInput {
  code: string
  quantity?: number
}

export interface PosCouponValidationResult {
  valid: boolean
  message?: string
  couponName?: string
  discountAmt?: number
  discountReason?: string
  quantity?: number
  couponId?: number
  serialId?: number
  memberCouponIssueId?: number
  appliedCoupons?: PosAppliedCouponLine[]
  couponDiscountTotal?: number
  remainingSubtotal?: number
}

function round2(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100
}

function normalizeCode(code: string): string {
  return String(code ?? '').trim().toUpperCase()
}

function normalizeQty(raw: unknown, allowQuantity: boolean): number {
  const n = Math.trunc(Number(raw ?? 1))
  if (!allowQuantity) return 1
  return Math.max(1, Math.min(99, n || 1))
}

function countAppliedSheets(applied: PosAppliedCouponLine[]): number {
  return applied.reduce((sum, row) => sum + Math.max(1, Math.trunc(Number(row.quantity ?? 1) || 1)), 0)
}

function countAppliedSheetsForCode(applied: PosAppliedCouponLine[], code: string): number {
  const target = normalizeCode(code)
  return applied
    .filter((row) => normalizeCode(row.code) === target)
    .reduce((sum, row) => sum + Math.max(1, Math.trunc(Number(row.quantity ?? 1) || 1)), 0)
}

function sumAppliedCouponDiscount(applied: PosAppliedCouponLine[]): number {
  return round2(applied.reduce((sum, row) => sum + Math.max(0, Number(row.discountAmt ?? 0) || 0), 0))
}

function isCouponDateValid(template: PosCouponTemplate, todayYmd: string): string | null {
  if (template.validFrom && todayYmd < template.validFrom) return '아직 사용 기간이 아닙니다.'
  if (template.validTo && todayYmd > template.validTo) return '사용 기간이 지났습니다.'
  return null
}

function computeRemainingSubtotal(ctx: PosCouponValidationContext): number {
  const subtotal = Math.max(0, Number(ctx.subtotal) || 0)
  const manual = ctx.loyalty.couponStackWithManualDiscount
    ? Math.max(0, Number(ctx.manualDiscountAmt) || 0)
    : 0
  const collab = Math.max(0, Number(ctx.collabDiscountAmt ?? 0) || 0)
  const couponPart = sumAppliedCouponDiscount(ctx.applied)
  return round2(Math.max(0, subtotal - manual - collab - couponPart))
}

function computeDiscountForTemplate(
  template: PosCouponTemplate,
  ctx: PosCouponValidationContext,
  quantity: number
): number {
  const qty = Math.max(1, quantity)
  const remaining = computeRemainingSubtotal(ctx)
  const baseSubtotal = Math.max(0, Number(ctx.subtotal) || 0)
  const base =
    ctx.loyalty.couponCalcBase === 'subtotal'
      ? baseSubtotal
      : remaining

  if (template.discountType === 'percent') {
    const pct = Math.max(0, Number(template.discountValue) || 0)
    let amt = Math.round(base * pct / 100)
    const cap = Number(template.maxDiscountAmt ?? 0)
    if (cap > 0) amt = Math.min(amt, cap)
    return round2(Math.min(remaining, amt))
  }

  const unit = Math.max(0, Number(template.discountValue) || 0)
  const raw = unit * qty
  return round2(Math.min(remaining, raw))
}

function canStackTemplate(template: PosCouponTemplate, applied: PosAppliedCouponLine[]): string | null {
  const stackMode = template.stackMode || 'fixed_only'
  if (applied.length === 0) return null
  if (stackMode === 'fixed_only' && template.discountType !== 'fixed') {
    return '이 쿠폰은 다른 쿠폰과 함께 사용할 수 없습니다.'
  }
  if (stackMode === 'percent_only' && template.discountType !== 'percent') {
    return '이 쿠폰은 다른 쿠폰과 함께 사용할 수 없습니다.'
  }
  for (const row of applied) {
    if (row.couponId && template.id && row.couponId !== template.id) {
      if (stackMode !== 'any') continue
    }
  }
  return null
}

export function summarizeLegacyCouponFields(applied: PosAppliedCouponLine[]): {
  couponCode: string
  couponDiscountAmt: number
} {
  const total = sumAppliedCouponDiscount(applied)
  if (!applied.length) return { couponCode: '', couponDiscountAmt: 0 }
  if (applied.length === 1) {
    const row = applied[0]!
    const qty = Math.max(1, Math.trunc(Number(row.quantity ?? 1) || 1))
    const code = normalizeCode(row.code)
    return {
      couponCode: qty > 1 ? `${code}×${qty}` : code,
      couponDiscountAmt: total,
    }
  }
  const codes = applied.map((row) => {
    const qty = Math.max(1, Math.trunc(Number(row.quantity ?? 1) || 1))
    const code = normalizeCode(row.code)
    return qty > 1 ? `${code}×${qty}` : code
  })
  return {
    couponCode: codes.slice(0, 3).join(', ') + (codes.length > 3 ? ` +${codes.length - 3}` : ''),
    couponDiscountAmt: total,
  }
}

export function validatePosCouponCandidate(
  template: PosCouponTemplate | null | undefined,
  ctx: PosCouponValidationContext,
  candidate: PosCouponCandidateInput,
  opts?: {
    serialAlreadyRedeemed?: boolean
    memberIssueAvailable?: boolean
    memberIssueId?: number
    serialId?: number
  }
): PosCouponValidationResult {
  const code = normalizeCode(candidate.code)
  if (!code) {
    return { valid: false, message: '쿠폰 코드를 입력하세요.' }
  }

  const c = template
  if (!c || !c.isActive) {
    return { valid: false, message: '유효하지 않거나 만료된 쿠폰입니다.' }
  }

  const dateMsg = isCouponDateValid(c, ctx.todayYmd)
  if (dateMsg) return { valid: false, message: dateMsg }

  const redemptionMode = c.redemptionMode || 'reusable_code'
  const allowQuantity = Boolean(c.allowQuantityEntry) && redemptionMode === 'reusable_code'
  const quantity = normalizeQty(candidate.quantity, allowQuantity)

  if (redemptionMode === 'single_use_serial' && opts?.serialAlreadyRedeemed) {
    return { valid: false, message: '이미 사용된 쿠폰입니다.' }
  }
  if (redemptionMode === 'member_issue' && opts?.memberIssueAvailable === false) {
    return { valid: false, message: '사용 가능한 회원 쿠폰이 없습니다.' }
  }

  const maxUses = Number(c.maxUses ?? 0)
  const usedCount = Math.max(0, Number(c.usedCount ?? 0) || 0)
  if (maxUses > 0 && usedCount + quantity > maxUses) {
    return { valid: false, message: '쿠폰 사용 한도를 초과했습니다.' }
  }

  const minOrder = Math.max(0, Number(c.minOrderAmt ?? 0) || 0)
  if (minOrder > 0 && ctx.subtotal + 0.0001 < minOrder) {
    return { valid: false, message: `최소 주문 금액 ${minOrder}바트 이상이어야 합니다.` }
  }

  const stackErr = canStackTemplate(c, ctx.applied)
  if (stackErr) return { valid: false, message: stackErr }

  const maxPerOrder = Math.max(1, Math.trunc(Number(c.maxPerOrder ?? 1) || 1))
  const alreadyForCode = countAppliedSheetsForCode(ctx.applied, code)
  if (alreadyForCode + quantity > maxPerOrder) {
    return {
      valid: false,
      message: `이 쿠폰은 주문당 최대 ${maxPerOrder}장까지 사용할 수 있습니다.`,
    }
  }

  const maxSheets = Math.max(1, Math.trunc(Number(ctx.loyalty.maxCouponsPerOrder) || 1))
  const totalSheets = countAppliedSheets(ctx.applied) + quantity
  if (totalSheets > maxSheets) {
    return {
      valid: false,
      message: `영수증당 쿠폰은 최대 ${maxSheets}장까지 사용할 수 있습니다.`,
    }
  }

  const discountAmt = computeDiscountForTemplate(c, ctx, quantity)
  if (discountAmt <= 0.0001) {
    return { valid: false, message: '적용 가능한 할인 금액이 없습니다.' }
  }

  const nextLine: PosAppliedCouponLine = {
    code,
    name: c.name || code,
    discountAmt,
    quantity,
    couponId: c.id,
    ...(opts?.memberIssueId ? { memberCouponIssueId: opts.memberIssueId } : {}),
    ...(opts?.serialId ? { serialId: opts.serialId } : {}),
  }
  const appliedCoupons = [...ctx.applied, nextLine]
  const couponDiscountTotal = sumAppliedCouponDiscount(appliedCoupons)
  const remainingSubtotal = round2(Math.max(0, ctx.subtotal - couponDiscountTotal))

  return {
    valid: true,
    couponName: c.name || code,
    discountAmt,
    discountReason: quantity > 1 ? `쿠폰: ${code}×${quantity}` : `쿠폰: ${code}`,
    quantity,
    couponId: c.id,
    memberCouponIssueId: opts?.memberIssueId,
    serialId: opts?.serialId,
    appliedCoupons,
    couponDiscountTotal,
    remainingSubtotal,
  }
}

export function revalidateAppliedPosCoupons(
  templatesByCode: Map<string, PosCouponTemplate>,
  ctx: Omit<PosCouponValidationContext, 'applied'>,
  applied: PosAppliedCouponLine[]
): PosAppliedCouponLine[] {
  const kept: PosAppliedCouponLine[] = []
  for (const row of applied) {
    const template = templatesByCode.get(normalizeCode(row.code))
    const result = validatePosCouponCandidate(template, { ...ctx, applied: kept }, {
      code: row.code,
      quantity: row.quantity ?? 1,
    })
    if (result.valid && result.appliedCoupons?.length) {
      kept.push(result.appliedCoupons[result.appliedCoupons.length - 1]!)
    }
  }
  return kept
}

export function resolveOrderDiscountAmt(params: {
  manualDiscountAmt: number
  collabDiscountAmt?: number
  couponDiscountAmt: number
  serviceAmt?: number
  subtotal: number
}): number {
  const manual = Math.max(0, Number(params.manualDiscountAmt) || 0)
  const collab = Math.max(0, Number(params.collabDiscountAmt ?? 0) || 0)
  const coupon = Math.max(0, Number(params.couponDiscountAmt) || 0)
  const subtotal = Math.max(0, Number(params.subtotal) || 0)
  return round2(Math.min(subtotal, manual + collab + coupon))
}

export function resolvePosSalesDiscountAmount(discountAmt: number, couponDiscountAmt: number): number {
  const discount = Math.max(0, Number(discountAmt) || 0)
  const coupon = Math.max(0, Number(couponDiscountAmt) || 0)
  if (coupon <= 0.0001) return discount
  if (discount + 0.0001 >= coupon) return discount
  return round2(discount + coupon)
}
