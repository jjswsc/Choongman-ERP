/**
 * POS 쿠폰 다중 적용 — 순수 도메인(검증·합산·레거시 요약)
 */

export type PosCouponRedemptionMode = 'reusable_code' | 'single_use_serial' | 'member_issue'
export type PosCouponStackMode = 'fixed_only' | 'percent_only' | 'any'
export type PosCouponCalcBase = 'remaining' | 'subtotal'
export type PosCouponDiscountType = 'percent' | 'fixed' | 'amount' | 'bogo' | 'set_fixed' | 'item_fixed'

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
  discountType: PosCouponDiscountType
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
  setQty?: number
  itemScope?: {
    menuIds?: string[]
    categoryCodes?: string[]
  }
  priority?: number
  allowWithManualDiscount?: boolean
}

export interface PosCouponItemScope {
  menuIds?: string[]
  categoryCodes?: string[]
}

export interface PosAppliedCouponLine {
  code: string
  name?: string
  discountAmt: number
  quantity?: number
  couponId?: number
  serialId?: number
  memberCouponIssueId?: number
  priority?: number
  /** 영수증 줄 배분 — 검증 시 템플릿에서 스냅샷 */
  itemScope?: PosCouponItemScope
  discountType?: PosCouponDiscountType
}

export interface PosCouponCartLine {
  menuId?: string
  menuCode?: string
  categoryCode?: string
  quantity: number
  lineSubtotal: number
}

export interface PosCouponValidationContext {
  subtotal: number
  manualDiscountAmt: number
  collabDiscountAmt?: number
  tierDiscountAmt?: number
  applied: PosAppliedCouponLine[]
  cartLines?: PosCouponCartLine[]
  todayYmd: string
  loyalty: PosLoyaltySettings
}

export interface PosCouponCandidateInput {
  code: string
  quantity?: number
  /** 회원 쿠폰 QR 등에서 특정 발급 건을 지정할 때 */
  memberIssueId?: number
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
  /** 회원 발급 쿠폰 QR 등 — POS 회원 연결용 */
  resolvedMemberId?: number
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
  const tier = Math.max(0, Number(ctx.tierDiscountAmt ?? 0) || 0)
  const couponPart = sumAppliedCouponDiscount(ctx.applied)
  return round2(Math.max(0, subtotal - manual - collab - tier - couponPart))
}

function normalizeList(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return values.map((v) => String(v ?? '').trim()).filter(Boolean)
}

export function couponItemScopeIsRestricted(scope: PosCouponItemScope | undefined): boolean {
  if (!scope) return false
  return normalizeList(scope.menuIds).length > 0 || normalizeList(scope.categoryCodes).length > 0
}

export function cartLineMatchesScope(
  line: PosCouponCartLine,
  scope: PosCouponItemScope | undefined
): boolean {
  if (!scope) return true
  const menuIds = normalizeList(scope.menuIds)
  const categories = normalizeList(scope.categoryCodes).map((v) => v.toUpperCase())
  if (menuIds.length === 0 && categories.length === 0) return true
  const menuId = String(line.menuId ?? '').trim()
  const menuCode = String(line.menuCode ?? '').trim().toUpperCase()
  const category = String(line.categoryCode ?? '').trim().toUpperCase()
  if (menuIds.length > 0) {
    const idSet = new Set(menuIds)
    const idUpperSet = new Set(menuIds.map((v) => v.toUpperCase()))
    if (menuId && (idSet.has(menuId) || idUpperSet.has(menuId.toUpperCase()))) return true
    // 옵션 포함 복합 id (예: 26-opt) → scope 메뉴 id(26)와 매칭
    if (menuId) {
      for (const sid of menuIds) {
        const s = String(sid ?? '').trim()
        if (!s) continue
        if (menuId === s || menuId.startsWith(`${s}-`)) return true
        if (menuId.toUpperCase() === s.toUpperCase() || menuId.toUpperCase().startsWith(`${s.toUpperCase()}-`)) {
          return true
        }
      }
    }
    if (menuCode && idUpperSet.has(menuCode)) return true
  }
  if (categories.length > 0 && category && categories.includes(category)) return true
  return false
}

function allocateDiscountProportionalToWeights(weights: number[], totalDiscount: number): number[] {
  const discount = Math.max(0, Number(totalDiscount) || 0)
  if (weights.length === 0 || discount <= 0.0001) return weights.map(() => 0)
  const gross = weights.reduce((sum, v) => sum + v, 0)
  if (gross <= 0.0001) {
    const per = round2(discount / weights.length)
    let used = 0
    return weights.map((_, i) => {
      if (i === weights.length - 1) return round2(Math.max(0, discount - used))
      used += per
      return per
    })
  }
  const out = weights.map(() => 0)
  let used = 0
  for (let i = 0; i < weights.length; i += 1) {
    if (i === weights.length - 1) {
      out[i] = round2(Math.max(0, discount - used))
      break
    }
    const share = round2((discount * weights[i]) / gross)
    out[i] = share
    used += share
  }
  return out
}

/** 적용 쿠폰 할인을 메뉴 범위(itemScope)에 맞는 줄에만 배분 */
export function buildCouponDiscountLineAllocations(
  cartLines: PosCouponCartLine[],
  appliedCoupons: PosAppliedCouponLine[]
): number[] {
  if (!cartLines.length) return []
  const out = cartLines.map(() => 0)
  if (!appliedCoupons.length) return out

  for (const coupon of appliedCoupons) {
    const amt = Math.max(0, Number(coupon.discountAmt ?? 0) || 0)
    if (amt <= 0.0001) continue

    const scope = coupon.itemScope
    const eligibleIndices: number[] = []
    cartLines.forEach((line, i) => {
      if (cartLineMatchesScope(line, scope)) eligibleIndices.push(i)
    })
    if (eligibleIndices.length === 0) continue

    const eligibleWeights = eligibleIndices.map((i) => Math.max(0, Number(cartLines[i]?.lineSubtotal ?? 0) || 0))
    const chunk = allocateDiscountProportionalToWeights(eligibleWeights, amt)
    eligibleIndices.forEach((idx, j) => {
      out[idx] = round2(out[idx] + chunk[j])
    })
  }
  return out
}

function resolveEligibleCartStats(
  template: PosCouponTemplate,
  cartLines: PosCouponCartLine[] | undefined
): {
  eligibleSubtotal: number
  eligibleQty: number
  unitPrices: number[]
} {
  if (!Array.isArray(cartLines) || cartLines.length === 0) {
    return { eligibleSubtotal: 0, eligibleQty: 0, unitPrices: [] }
  }
  let eligibleSubtotal = 0
  let eligibleQty = 0
  const unitPrices: number[] = []
  for (const rawLine of cartLines) {
    const qty = Math.max(1, Math.trunc(Number(rawLine.quantity ?? 1) || 1))
    const lineSubtotal = Math.max(0, Number(rawLine.lineSubtotal ?? 0) || 0)
    if (!cartLineMatchesScope(rawLine, template.itemScope)) continue
    eligibleSubtotal += lineSubtotal
    eligibleQty += qty
    const unit = qty > 0 ? lineSubtotal / qty : 0
    for (let i = 0; i < qty; i += 1) unitPrices.push(unit)
  }
  return {
    eligibleSubtotal: round2(eligibleSubtotal),
    eligibleQty,
    unitPrices,
  }
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
  const eligible = resolveEligibleCartStats(template, ctx.cartLines)

  if (template.discountType === 'bogo') {
    const units = [...eligible.unitPrices].sort((a, b) => a - b)
    const freeQty = Math.floor(units.length / 2)
    let amt = 0
    for (let i = 0; i < freeQty; i += 1) amt += units[i] || 0
    const cap = Number(template.maxDiscountAmt ?? 0)
    if (cap > 0) amt = Math.min(amt, cap)
    return round2(Math.min(remaining, amt))
  }

  if (template.discountType === 'set_fixed') {
    const setQty = Math.max(2, Math.trunc(Number(template.setQty ?? 2) || 2))
    const sets = Math.floor(eligible.eligibleQty / setQty)
    const perSetDiscount = Math.max(0, Number(template.discountValue) || 0)
    let amt = sets * perSetDiscount
    const cap = Number(template.maxDiscountAmt ?? 0)
    if (cap > 0) amt = Math.min(amt, cap)
    return round2(Math.min(remaining, amt))
  }

  if (template.discountType === 'item_fixed') {
    const perItemDiscount = Math.max(0, Number(template.discountValue) || 0)
    let amt = eligible.eligibleQty * perItemDiscount
    const cap = Number(template.maxDiscountAmt ?? 0)
    if (cap > 0) amt = Math.min(amt, cap)
    return round2(Math.min(remaining, amt))
  }

  if (template.discountType === 'percent') {
    const pct = Math.max(0, Number(template.discountValue) || 0)
    const scopedBase = template.itemScope ? Math.min(base, eligible.eligibleSubtotal) : base
    let amt = Math.round(scopedBase * pct / 100)
    const cap = Number(template.maxDiscountAmt ?? 0)
    if (cap > 0) amt = Math.min(amt, cap)
    return round2(Math.min(remaining, amt))
  }

  const unit = Math.max(0, Number(template.discountValue) || 0)
  const qtyForFixed =
    template.itemScope && eligible.eligibleQty > 0
      ? Math.min(qty, eligible.eligibleQty)
      : qty
  const raw = unit * qtyForFixed
  return round2(Math.min(remaining, raw))
}

function canStackTemplate(
  template: PosCouponTemplate,
  ctx: PosCouponValidationContext
): string | null {
  const applied = ctx.applied
  const stackMode = template.stackMode || 'fixed_only'
  if (template.allowWithManualDiscount === false && (ctx.manualDiscountAmt || 0) > 0.0001) {
    return '이 쿠폰은 수동 할인과 함께 사용할 수 없습니다.'
  }
  const fixedLike = ['fixed', 'amount', 'set_fixed', 'item_fixed', 'bogo']
  if (applied.length === 0) return null
  if (stackMode === 'fixed_only' && !fixedLike.includes(template.discountType)) {
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

  const stackErr = canStackTemplate(c, ctx)
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
    if (
      couponItemScopeIsRestricted(c.itemScope) &&
      resolveEligibleCartStats(c, ctx.cartLines).eligibleQty <= 0
    ) {
      return { valid: false, message: '장바구니에 쿠폰 대상 메뉴가 없습니다.' }
    }
    return { valid: false, message: '적용 가능한 할인 금액이 없습니다.' }
  }

  const nextLine: PosAppliedCouponLine = {
    code,
    name: c.name || code,
    discountAmt,
    quantity,
    couponId: c.id,
    priority: Number(c.priority ?? 0) || 0,
    ...(c.itemScope ? { itemScope: c.itemScope } : {}),
    discountType: c.discountType,
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
  const sorted = [...applied].sort((a, b) => {
    const aTemplate = templatesByCode.get(normalizeCode(a.code))
    const bTemplate = templatesByCode.get(normalizeCode(b.code))
    const aPriority = Number(a.priority ?? aTemplate?.priority ?? 0)
    const bPriority = Number(b.priority ?? bTemplate?.priority ?? 0)
    if (aPriority === bPriority) return 0
    return bPriority - aPriority
  })
  const kept: PosAppliedCouponLine[] = []
  for (const row of sorted) {
    const template = templatesByCode.get(normalizeCode(row.code))
    const memberIssueId =
      Math.max(0, Math.trunc(Number(row.memberCouponIssueId ?? 0) || 0)) || undefined
    const serialId = Math.max(0, Math.trunc(Number(row.serialId ?? 0) || 0)) || undefined
    const result = validatePosCouponCandidate(
      template,
      { ...ctx, applied: kept },
      {
        code: row.code,
        quantity: row.quantity ?? 1,
      },
      {
        ...(memberIssueId ? { memberIssueId } : {}),
        ...(serialId ? { serialId } : {}),
      }
    )
    if (result.valid && result.appliedCoupons?.length) {
      const next = result.appliedCoupons[result.appliedCoupons.length - 1]!
      kept.push({
        ...next,
        memberCouponIssueId: next.memberCouponIssueId ?? memberIssueId,
        serialId: next.serialId ?? serialId,
        itemScope: next.itemScope ?? template?.itemScope,
        discountType: next.discountType ?? template?.discountType,
      })
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

/** API·영수증 공통 — 적용 쿠폰 JSON 파싱 (server-only 무관) */
export function parseAppliedCouponsFromBody(body: unknown): PosAppliedCouponLine[] {
  if (!Array.isArray(body)) return []
  const out: PosAppliedCouponLine[] = []
  for (const raw of body) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const code = normalizeCode(String(row.code ?? ''))
    if (!code) continue
    out.push({
      code,
      name: String(row.name ?? code).trim() || code,
      discountAmt: Math.max(0, Number(row.discountAmt ?? row.discount_amt ?? 0) || 0),
      quantity: Math.max(1, Math.trunc(Number(row.quantity ?? 1) || 1)),
      couponId: Number(row.couponId ?? row.coupon_id ?? 0) || undefined,
      serialId: Number(row.serialId ?? row.serial_id ?? 0) || undefined,
      memberCouponIssueId:
        Number(row.memberCouponIssueId ?? row.member_coupon_issue_id ?? 0) || undefined,
      priority: Number(row.priority ?? row.coupon_priority ?? 0) || undefined,
      ...(row.itemScope && typeof row.itemScope === 'object'
        ? { itemScope: row.itemScope as PosCouponItemScope }
        : row.item_scope && typeof row.item_scope === 'object'
          ? { itemScope: row.item_scope as PosCouponItemScope }
          : {}),
      ...(String(row.discountType ?? row.discount_type ?? '').trim()
        ? {
            discountType: String(row.discountType ?? row.discount_type).trim() as PosCouponDiscountType,
          }
        : {}),
    })
  }
  return out
}

export function parseAppliedCouponsFromOrderRow(raw: unknown): PosAppliedCouponLine[] {
  if (Array.isArray(raw)) return parseAppliedCouponsFromBody(raw)
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return parseAppliedCouponsFromBody(JSON.parse(raw))
    } catch {
      return []
    }
  }
  return []
}
