import type { PosMenu } from '@/lib/api-client'
import type { MarketingCollabDetail } from '@/lib/marketing-collab-detail'
import { normalizeCartLineIdForSave } from '@/lib/pos-order-item-map'
import {
  LEGACY_PROMOTION_MAIN_CATEGORY,
  PROMOTION_MAIN_CATEGORY,
  normalizePromotionCategoryMain,
} from '@/lib/pos-promo-constants'

export type PosCollabCampaignForStore = {
  id: string
  topic: string
  campaignNo?: string
  collabDetail: MarketingCollabDetail
}

type CollabMenuPick = Pick<PosMenu, 'id' | 'category' | 'categoryMain' | 'name' | 'code'>

function collabScopeAny(d: MarketingCollabDetail): boolean {
  return (
    collabDynamicScopeAny(d) ||
    d.scopeChicken ||
    d.scopeKorean ||
    d.scopeSide ||
    d.scopeDrinksNonAlcohol ||
    d.scopeAlcohol ||
    d.scopeTopping
  )
}

function collabDynamicScopeAny(d: MarketingCollabDetail): boolean {
  return (
    (d.scopeMainCategories || []).length > 0 ||
    (d.scopeCategoryKeys || []).length > 0 ||
    (d.scopeMenuIds || []).length > 0
  )
}

function scopeSet(values: string[] | undefined): Set<string> {
  return new Set((values || []).map((x) => String(x ?? '').trim()).filter(Boolean))
}

function categoryScopeKey(main: string | undefined | null, category: string | undefined | null): string {
  return `${String(main ?? '').trim()}::${String(category ?? '').trim()}`
}

function normalizeScopeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function textHasAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word))
}

function blobMatchesCollabScope(blobRaw: string, detail: MarketingCollabDetail): boolean {
  if (!collabScopeAny(detail)) return true
  const blob = normalizeScopeText(blobRaw)
  if (!blob) return false

  if (detail.scopeChicken && textHasAny(blob, ['chicken', '치킨', 'ไก่', 'chik', '닭'])) return true
  if (detail.scopeKorean && textHasAny(blob, ['korean', '한식', 'เกาหลี', 'korea'])) return true
  if (detail.scopeSide && textHasAny(blob, ['side', '사이드', 'เครื่องเคียง', 'snack', 'fries', 'fried', '떡', 'tteok'])) return true
  if (
    detail.scopeDrinksNonAlcohol &&
    textHasAny(blob, ['drink', 'beverage', '음료', 'น้ำ', 'soda', 'juice', 'tea', 'coffee', '콜라', '물']) &&
    !textHasAny(blob, ['alcohol', 'beer', 'wine', 'soju', '맥주', '소주', 'whisky', 'vodka', 'เหล้า', 'เบียร์'])
  )
    return true
  if (detail.scopeAlcohol && textHasAny(blob, ['alcohol', 'beer', 'wine', 'soju', '맥주', '소주', 'whisky', 'vodka', 'เหล้า', 'เบียร์'])) return true
  if (detail.scopeTopping && textHasAny(blob, ['topping', '토핑', 'เพิ่มเติม', 'extra', 'sauce', '소스'])) return true

  return false
}

/**
 * 협업 POS 메뉴 범위 — 관리 화면 1·2·3단계 선택은 AND(교집합).
 * 예: Chicken + SNOW + [C008] → SNOW 카테고리 메뉴만(Chicken 전체 아님).
 * 각 단계를 비우면 해당 단계는 제한하지 않음(Chicken만 → 치킨 전체).
 */
export function menuMatchesCollabScope(menu: CollabMenuPick, detail: MarketingCollabDetail): boolean {
  if (collabDynamicScopeAny(detail)) {
    const menuIds = scopeSet(detail.scopeMenuIds)
    const mains = scopeSet(detail.scopeMainCategories)
    const categoryKeys = scopeSet(detail.scopeCategoryKeys)
    const menuId = String(menu.id ?? '').trim()
    const main = String(menu.categoryMain ?? '').trim()
    const cat = String(menu.category ?? '').trim()
    const hasMains = mains.size > 0
    const hasCats = categoryKeys.size > 0
    const hasMenus = menuIds.size > 0
    if (!hasMains && !hasCats && !hasMenus) return false

    if (hasMains && (main === '' || ![...mains].some((m) => scopeMainMatches(main, m)))) return false
    if (hasCats && (main === '' || cat === '' || ![...categoryKeys].some((k) => categoryKeyMatches(menu, k))))
      return false
    if (hasMenus && (menuId === '' || !menuIds.has(menuId))) return false
    return true
  }
  return blobMatchesCollabScope(`${menu.categoryMain ?? ''} ${menu.category ?? ''} ${menu.name ?? ''} ${menu.code ?? ''}`, detail)
}

function menuIdFromCartLineId(id: string): string {
  const s = normalizeCartLineIdForSave(String(id ?? ''))
  if (!s || s.toLowerCase().startsWith('promo-')) return ''
  const i = s.indexOf('-')
  return (i >= 0 ? s.slice(0, i) : s).trim()
}

export type CollabCartLineLike = {
  id: string
  name?: string
  price: number
  /** 장바구니 줄 수량 */
  quantity?: number
  qty?: number
  menuId?: string
  menuId1?: string
  menuId2?: string
  promoId?: string
}

export function isPromoCartLine(line: CollabCartLineLike): boolean {
  if (String(line.promoId ?? '').trim()) return true
  return String(line.id ?? '').trim().toLowerCase().startsWith('promo-')
}

function mainCategoryIsDrinks(mainRaw: string | undefined | null): boolean {
  const main = normalizeScopeText(mainRaw)
  if (!main) return false
  if (main === 'drinks' || main === 'drink' || main === '음료') return true
  return textHasAny(main, ['beverage', 'เครื่องดื่ม'])
}

export function isPromotionMenu(menu: CollabMenuPick): boolean {
  return normalizePromotionCategoryMain(menu.categoryMain) === PROMOTION_MAIN_CATEGORY
}

export function isDrinkMenu(menu: CollabMenuPick): boolean {
  if (mainCategoryIsDrinks(menu.categoryMain)) return true
  const blob = normalizeScopeText(`${menu.categoryMain ?? ''} ${menu.category ?? ''} ${menu.name ?? ''} ${menu.code ?? ''}`)
  return textHasAny(blob, [
    'drink',
    'beverage',
    'coffee',
    'tea',
    'juice',
    'smoothie',
    'soda',
    'beer',
    'wine',
    'soju',
    'whisky',
    'vodka',
    'chang',
    'jinro',
    '음료',
    'น้ำ',
    'เบียร์',
    'เหล้า',
    'เครื่องดื่ม',
  ])
}

function scopeAllowsPromotion(detail: MarketingCollabDetail): boolean {
  if (!collabDynamicScopeAny(detail)) return false
  const mains = scopeSet(detail.scopeMainCategories)
  if (mains.has(PROMOTION_MAIN_CATEGORY) || mains.has(LEGACY_PROMOTION_MAIN_CATEGORY)) return true
  return (detail.scopeCategoryKeys || []).some((key) => {
    const main = String(key.split('::')[0] ?? '').trim()
    return normalizePromotionCategoryMain(main) === PROMOTION_MAIN_CATEGORY
  })
}

function scopeAllowsDrinks(detail: MarketingCollabDetail): boolean {
  if (detail.scopeDrinksNonAlcohol || detail.scopeAlcohol) return true
  if (!collabDynamicScopeAny(detail)) return false
  for (const main of detail.scopeMainCategories || []) {
    if (mainCategoryIsDrinks(main)) return true
  }
  return (detail.scopeCategoryKeys || []).some((key) => mainCategoryIsDrinks(String(key.split('::')[0] ?? '')))
}

function lineFailsDefaultPromoDrinkExclusion(
  line: CollabCartLineLike,
  menuById: Map<string, CollabMenuPick>,
  detail: MarketingCollabDetail
): boolean {
  if (isPromoCartLine(line) && !scopeAllowsPromotion(detail)) return true
  const ids = menuIdsForCollabLineWithCatalog(line, menuById)
  for (const mid of ids) {
    const menu = menuById.get(mid)
    if (!menu) continue
    if (isPromotionMenu(menu) && !scopeAllowsPromotion(detail)) return true
    if (isDrinkMenu(menu) && !scopeAllowsDrinks(detail)) return true
  }
  if (ids.length === 0) {
    const nameBlob = normalizeScopeText(line.name ?? '')
    if (nameBlob && !scopeAllowsDrinks(detail) && textHasAny(nameBlob, ['chang', 'jinro', 'beer', 'soju', 'ml.', 'ml '])) {
      return true
    }
  }
  return false
}

/** 장바구니 한 줄에 연결된 메뉴 id (반반 등) */
export function menuIdsForCollabLine(line: CollabCartLineLike): string[] {
  const out: string[] = []
  const primary = String(line.menuId ?? '').trim()
  const a = String(line.menuId1 ?? '').trim()
  const b = String(line.menuId2 ?? '').trim()
  if (primary) out.push(primary)
  if (a) out.push(a)
  if (b) out.push(b)
  if (out.length === 0) {
    const m = menuIdFromCartLineId(line.id)
    if (m) out.push(m)
  }
  return Array.from(new Set(out))
}

function scopeMainMatches(menuMain: string, scopeMain: string): boolean {
  return normalizeScopeText(menuMain) === normalizeScopeText(scopeMain)
}

function categoryKeyMatches(menu: CollabMenuPick, scopeKey: string): boolean {
  const main = String(menu.categoryMain ?? '').trim()
  const cat = String(menu.category ?? '').trim()
  if (!main || !cat) return false
  return normalizeScopeText(categoryScopeKey(main, cat)) === normalizeScopeText(scopeKey)
}

/** menuId 없는 기존 주문 줄 — 메뉴명으로 POS 카탈로그 역매칭 */
function findMenuIdsByLineName(
  line: CollabCartLineLike,
  menuById: Map<string, CollabMenuPick>
): string[] {
  const raw = String(line.name ?? '').trim()
  if (!raw) return []
  const normLine = normalizeScopeText(raw)

  let bestId = ''
  let bestLen = 0
  for (const [id, menu] of menuById) {
    const menuName = String(menu.name ?? '').trim()
    if (!menuName) continue
    const normMenu = normalizeScopeText(menuName)
    if (!normMenu) continue
    const matches =
      normLine === normMenu ||
      normLine.startsWith(`${normMenu} `) ||
      normLine.startsWith(`${normMenu}(`)
    if (!matches) continue
    if (normMenu.length > bestLen) {
      bestLen = normMenu.length
      bestId = id
    }
  }
  return bestId ? [bestId] : []
}

function menuIdsForCollabLineWithCatalog(
  line: CollabCartLineLike,
  menuById: Map<string, CollabMenuPick>
): string[] {
  const explicit = menuIdsForCollabLine(line).filter((id) => menuById.has(id))
  if (explicit.length > 0) return explicit

  const rawId = normalizeCartLineIdForSave(String(line.id ?? ''))
  if (!rawId || rawId.toLowerCase().startsWith('promo-')) return []
  if (menuById.has(rawId)) return [rawId]

  const matched: string[] = []
  for (const id of menuById.keys()) {
    if (rawId === id || rawId.startsWith(`${id}-`)) matched.push(id)
  }
  if (matched.length > 0) return matched
  return findMenuIdsByLineName(line, menuById)
}

/** 기존 주문·결제 모달 — menuId 없을 때 카탈로그에서 한 개 id 역매칭 */
export function resolveCartLineMenuIdFromCatalog(
  line: Pick<CollabCartLineLike, 'id' | 'name' | 'menuId' | 'menuId1' | 'menuId2'>,
  menuById: Map<string, CollabMenuPick>
): string {
  const withPrice: CollabCartLineLike = { ...line, price: 0 }
  const explicit = menuIdsForCollabLine(withPrice).find((id) => menuById.has(id))
  if (explicit) return explicit
  return menuIdsForCollabLineWithCatalog(withPrice, menuById)[0] ?? ''
}

/** 협업 할인 대상 여부 (영수증 줄 배분·합계 계산 공통) */
export function isCartLineEligibleForCollabDiscount(
  line: CollabCartLineLike,
  menuById: Map<string, CollabMenuPick>,
  detail: MarketingCollabDetail
): boolean {
  if (lineFailsDefaultPromoDrinkExclusion(line, menuById, detail)) return false

  const dynamicScope = collabDynamicScopeAny(detail)
  const ids = menuIdsForCollabLineWithCatalog(line, menuById)
  if (dynamicScope && ids.length === 0) return false
  if (ids.length === 0) return !collabScopeAny(detail)
  const menuMatched = ids.some((mid) => {
    const m = menuById.get(mid)
    if (!m) return !collabScopeAny(detail)
    return menuMatchesCollabScope(m, detail)
  })
  if (menuMatched) return true
  return blobMatchesCollabScope(String(line.name ?? ''), detail)
}

export function collabLineTotal(line: CollabCartLineLike): number {
  const q = Math.max(0, Number(line.quantity ?? line.qty) || 0)
  return Math.max(0, Number(line.price) || 0) * q
}

/** 총 할인액을 줄별 금액 비율로 배분 (마지막 줄에 잔액) */
export function allocateDiscountProportional(lineTotals: number[], totalDiscount: number): number[] {
  const discount = Math.max(0, Number(totalDiscount) || 0)
  if (lineTotals.length === 0 || discount <= 0.0001) return lineTotals.map(() => 0)
  const gross = lineTotals.reduce((sum, v) => sum + v, 0)
  if (gross <= 0.0001) return lineTotals.map(() => 0)

  const out = lineTotals.map(() => 0)
  let used = 0
  const to2 = (n: number) => Math.round(n * 100) / 100
  for (let i = 0; i < lineTotals.length; i += 1) {
    if (i === lineTotals.length - 1) {
      out[i] = to2(Math.max(0, discount - used))
      break
    }
    const share = to2((discount * lineTotals[i]) / gross)
    out[i] = share
    used = to2(used + share)
  }
  return out
}

export function collabLineDiscountAllocations(
  lines: CollabCartLineLike[],
  menuById: Map<string, CollabMenuPick>,
  detail: MarketingCollabDetail,
  totalCollabDiscount: number
): number[] {
  const discount = Math.max(0, Number(totalCollabDiscount) || 0)
  if (discount <= 0.0001) return lines.map(() => 0)
  const weights = lines.map((line) =>
    isCartLineEligibleForCollabDiscount(line, menuById, detail) ? collabLineTotal(line) : 0
  )
  return allocateDiscountProportional(weights, discount)
}

export function buildMixedCartLineDiscountAllocations(input: {
  lines: CollabCartLineLike[]
  menuById: Map<string, CollabMenuPick>
  collabDetail?: MarketingCollabDetail | null
  collabDiscountAmt: number
  otherDiscountAmt: number
  otherDiscountLineTotals?: number[]
}): number[] {
  const { lines, menuById, collabDetail, collabDiscountAmt, otherDiscountAmt } = input
  const collabAlloc =
    collabDetail && collabDiscountAmt > 0.0001
      ? collabLineDiscountAllocations(lines, menuById, collabDetail, collabDiscountAmt)
      : lines.map(() => 0)
  const otherWeights =
    input.otherDiscountLineTotals ??
    lines.map((line) => collabLineTotal(line))
  const otherAlloc =
    otherDiscountAmt > 0.0001 ? allocateDiscountProportional(otherWeights, otherDiscountAmt) : lines.map(() => 0)
  const to2 = (n: number) => Math.round(n * 100) / 100
  return lines.map((_, i) => to2(collabAlloc[i] + otherAlloc[i]))
}

/** 결제 모달 — 줄별 할인·서비스·취소·수동(쿠폰) 배분 (할인적용 메뉴 선택 시 수동·쿠폰은 해당 줄만) */
export type PosCartLineDiscountMode = 'none' | 'discount' | 'service' | 'cancel'

export function buildCartPanelLineDiscountAllocations(input: {
  lines: CollabCartLineLike[]
  menuById: Map<string, CollabMenuPick>
  lineModeById?: Record<string, PosCartLineDiscountMode>
  hasSelectedDiscountScope: boolean
  collabDetail?: MarketingCollabDetail | null
  collabDiscountAmt: number
  serviceDiscountAmt: number
  cancelledLineAmt: number
  /** @deprecated tier·manual·couponLineAlloc 사용 권장 */
  manualAndCouponDiscountAmt?: number
  tierDiscountAmt?: number
  manualDiscountAmt?: number
  couponLineAlloc?: number[]
}): number[] {
  const {
    lines,
    menuById,
    lineModeById,
    hasSelectedDiscountScope,
    collabDetail,
    collabDiscountAmt,
    serviceDiscountAmt,
    cancelledLineAmt,
    manualAndCouponDiscountAmt = 0,
    tierDiscountAmt = 0,
    manualDiscountAmt = 0,
    couponLineAlloc,
  } = input

  const modeForLine = (line: CollabCartLineLike): PosCartLineDiscountMode =>
    lineModeById?.[String(line.id ?? '')] ?? 'none'

  const collabAlloc = (() => {
    if (!collabDetail || collabDiscountAmt <= 0.0001) return lines.map(() => 0)
    if (hasSelectedDiscountScope) {
      const weights = lines.map((line) =>
        modeForLine(line) === 'discount' && isCartLineEligibleForCollabDiscount(line, menuById, collabDetail)
          ? collabLineTotal(line)
          : 0
      )
      return allocateDiscountProportional(weights, collabDiscountAmt)
    }
    return collabLineDiscountAllocations(lines, menuById, collabDetail, collabDiscountAmt)
  })()

  const weightsForModes = (modes: PosCartLineDiscountMode[]) =>
    lines.map((line) => (modes.includes(modeForLine(line)) ? collabLineTotal(line) : 0))

  const serviceAlloc =
    serviceDiscountAmt > 0.0001
      ? allocateDiscountProportional(weightsForModes(['service']), serviceDiscountAmt)
      : lines.map(() => 0)
  const cancelAlloc =
    cancelledLineAmt > 0.0001
      ? allocateDiscountProportional(weightsForModes(['cancel']), cancelledLineAmt)
      : lines.map(() => 0)

  const tierWeights = lines.map((line) => (modeForLine(line) !== 'cancel' ? collabLineTotal(line) : 0))
  const tierAlloc =
    tierDiscountAmt > 0.0001
      ? allocateDiscountProportional(tierWeights, tierDiscountAmt)
      : lines.map(() => 0)

  const manualWeights = hasSelectedDiscountScope
    ? weightsForModes(['discount'])
    : lines.map((line) => (modeForLine(line) !== 'cancel' ? collabLineTotal(line) : 0))

  const useSplitManualTierCoupon =
    tierDiscountAmt > 0.0001 ||
    manualDiscountAmt > 0.0001 ||
    (Array.isArray(couponLineAlloc) && couponLineAlloc.length === lines.length)

  const manualAlloc = useSplitManualTierCoupon
    ? manualDiscountAmt > 0.0001
      ? allocateDiscountProportional(manualWeights, manualDiscountAmt)
      : lines.map(() => 0)
    : manualAndCouponDiscountAmt > 0.0001
      ? allocateDiscountProportional(manualWeights, manualAndCouponDiscountAmt)
      : lines.map(() => 0)

  const couponAlloc =
    useSplitManualTierCoupon && Array.isArray(couponLineAlloc) && couponLineAlloc.length === lines.length
      ? couponLineAlloc
      : lines.map(() => 0)

  const to2 = (n: number) => Math.round(n * 100) / 100
  return lines.map((_, i) => to2(collabAlloc[i] + serviceAlloc[i] + cancelAlloc[i] + tierAlloc[i] + manualAlloc[i] + couponAlloc[i]))
}

function lineEligibleForCollab(
  line: CollabCartLineLike,
  menuById: Map<string, CollabMenuPick>,
  detail: MarketingCollabDetail
): boolean {
  return isCartLineEligibleForCollabDiscount(line, menuById, detail)
}

export function collabEligibleSubtotal(
  lines: CollabCartLineLike[],
  menuById: Map<string, CollabMenuPick>,
  detail: MarketingCollabDetail
): number {
  let s = 0
  for (const line of lines) {
    if (lineEligibleForCollab(line, menuById, detail)) {
      s += collabLineTotal(line)
    }
  }
  return Math.round(s * 100) / 100
}

export function computeCollabDiscountAmount(
  eligibleSubtotal: number,
  detail: MarketingCollabDetail,
  quantity = 1
): number {
  const t = detail.posDiscountType
  const v = Math.max(0, detail.posDiscountValue || 0)
  if (!t || v <= 0 || eligibleSubtotal <= 0) return 0
  if (t === 'percent') {
    const pct = Math.min(100, v)
    return Math.min(eligibleSubtotal, Math.floor((eligibleSubtotal * pct) / 100))
  }
  const qty = normalizeCollabApplyQuantity(detail, quantity)
  const unit = Math.round(v * 100) / 100
  let remaining = eligibleSubtotal
  let total = 0
  for (let i = 0; i < qty; i += 1) {
    const part = Math.min(remaining, unit)
    if (part <= 0.0001) break
    total += part
    remaining = Math.round((remaining - part) * 100) / 100
  }
  return Math.round(total * 100) / 100
}

export function normalizeCollabApplyQuantity(detail: MarketingCollabDetail, raw: unknown): number {
  if (detail.posDiscountType !== 'amount') return 1
  if (!detail.posAllowQuantityEntry) return 1
  const max = Math.max(1, Math.trunc(Number(detail.posMaxPerOrder ?? 10) || 10))
  const n = Math.trunc(Number(raw ?? 1))
  return Math.max(1, Math.min(max, Number.isFinite(n) && n > 0 ? n : 1))
}

export function collabSupportsQuantityEntry(detail: MarketingCollabDetail): boolean {
  return detail.posDiscountType === 'amount' && detail.posAllowQuantityEntry !== false
}

export function collabDiscountAmountForCart(
  lines: CollabCartLineLike[],
  menuById: Map<string, CollabMenuPick>,
  detail: MarketingCollabDetail,
  quantity = 1
): number {
  const eligible = collabEligibleSubtotal(lines, menuById, detail)
  return computeCollabDiscountAmount(eligible, detail, quantity)
}

export function collabHasPosDiscount(detail: MarketingCollabDetail): boolean {
  const t = detail.posDiscountType
  const v = detail.posDiscountValue || 0
  return (t === 'percent' || t === 'amount') && v > 0
}

/** 결제 영수증 `discountReason` — 협업 할인 문구 여부(재인쇄·스냅샷 없을 때 줄 배분용) */
export function isCollabDiscountReasonText(reason: string): boolean {
  const r = String(reason ?? '').trim().toLowerCase()
  if (!r) return false
  const needles = ['collab', 'collaboration', '협업', 'ความร่วมมือ', 'ส่วนลดความร่วมมือ']
  return needles.some((needle) => r.includes(needle))
}

export type ReceiptLineDiscountLike = {
  name?: string
  price: number
  qty?: number
  quantity?: number
  menuId?: string
  promoId?: string
}

/** 영수증 폴백: 프로모·음료 줄에는 0, 나머지 줄에만 할인 배분 */
export function receiptLineWeightForNonDrinkDiscount(
  line: ReceiptLineDiscountLike,
  menuById?: Map<string, CollabMenuPick>
): number {
  const q = Math.max(0, Number(line.quantity ?? line.qty) || 0)
  const collabLine: CollabCartLineLike = {
    id: String(line.menuId ?? line.name ?? ''),
    name: line.name,
    price: line.price,
    qty: q > 0 ? q : 1,
    ...(line.menuId ? { menuId: String(line.menuId) } : {}),
    ...(line.promoId ? { promoId: String(line.promoId) } : {}),
  }
  if (isPromoCartLine(collabLine)) return 0
  const mid = String(line.menuId ?? '').trim()
  if (mid && menuById?.has(mid)) {
    const menu = menuById.get(mid)!
    if (isDrinkMenu(menu) || isPromotionMenu(menu)) return 0
    return collabLineTotal(collabLine)
  }
  const nameBlob = normalizeScopeText(line.name ?? '')
  if (
    nameBlob &&
    textHasAny(nameBlob, ['chang', 'jinro', 'beer', 'soju', 'ml.', 'ml ', 'เบียร์', 'เหล้า', 'น้ำ'])
  ) {
    return 0
  }
  if (isDrinkMenu({ id: mid || 'line', name: line.name ?? '', categoryMain: '', category: '', code: '' })) {
    return 0
  }
  return collabLineTotal(collabLine)
}

/** 협업·음료 제외형 영수증: 대상 줄이 없으면 전체 비율 배분으로 폴백 */
export function allocateDiscountExcludingDrinksAndPromos(
  lines: ReceiptLineDiscountLike[],
  totalDiscount: number,
  menuById?: Map<string, CollabMenuPick>
): number[] {
  const discount = Math.max(0, Number(totalDiscount) || 0)
  if (!lines.length || discount <= 0.0001) return lines.map(() => 0)
  const weights = lines.map((line) => receiptLineWeightForNonDrinkDiscount(line, menuById))
  const eligibleGross = weights.reduce((sum, w) => sum + w, 0)
  if (eligibleGross <= 0.0001) {
    const lineTotals = lines.map((line) => {
      const q = Math.max(1, Number(line.quantity ?? line.qty) || 1)
      return Math.max(0, (Number(line.price) || 0) * q)
    })
    return allocateDiscountProportional(lineTotals, discount)
  }
  return allocateDiscountProportional(weights, discount)
}
