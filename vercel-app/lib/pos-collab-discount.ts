import type { PosMenu } from '@/lib/api-client'
import type { MarketingCollabDetail } from '@/lib/marketing-collab-detail'
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

/** 협업 상세의 카테고리 체크와 pos_menus 대분류·소분류·이름을 대응 (영·한·태국어 일부 키워드) */
export function menuMatchesCollabScope(menu: CollabMenuPick, detail: MarketingCollabDetail): boolean {
  if (collabDynamicScopeAny(detail)) {
    const menuIds = scopeSet(detail.scopeMenuIds)
    const mains = scopeSet(detail.scopeMainCategories)
    const categoryKeys = scopeSet(detail.scopeCategoryKeys)
    const menuId = String(menu.id ?? '').trim()
    const main = String(menu.categoryMain ?? '').trim()
    const cat = String(menu.category ?? '').trim()
    return (
      (menuId !== '' && menuIds.has(menuId)) ||
      (main !== '' && mains.has(main)) ||
      (main !== '' && cat !== '' && categoryKeys.has(categoryScopeKey(main, cat)))
    )
  }
  return blobMatchesCollabScope(`${menu.categoryMain ?? ''} ${menu.category ?? ''} ${menu.name ?? ''} ${menu.code ?? ''}`, detail)
}

function menuIdFromCartLineId(id: string): string {
  const s = String(id ?? '')
  if (s.toLowerCase().startsWith('promo-')) return ''
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

function menuIdsForCollabLineWithCatalog(
  line: CollabCartLineLike,
  menuById: Map<string, CollabMenuPick>
): string[] {
  const explicit = menuIdsForCollabLine(line).filter((id) => menuById.has(id))
  if (explicit.length > 0) return explicit

  const rawId = String(line.id ?? '').trim()
  if (!rawId || rawId.toLowerCase().startsWith('promo-')) return []
  if (menuById.has(rawId)) return [rawId]

  const cartPayloadId = rawId.startsWith('cart-') ? rawId.slice('cart-'.length) : rawId
  const matched: string[] = []
  for (const id of menuById.keys()) {
    if (cartPayloadId === id || cartPayloadId.startsWith(`${id}-`)) matched.push(id)
  }
  return matched
}

/** 협업 할인 대상 여부 (영수증 줄 배분·합계 계산 공통) */
export function isCartLineEligibleForCollabDiscount(
  line: CollabCartLineLike,
  menuById: Map<string, CollabMenuPick>,
  detail: MarketingCollabDetail
): boolean {
  if (lineFailsDefaultPromoDrinkExclusion(line, menuById, detail)) return false

  const dynamicScope = collabDynamicScopeAny(detail)
  if (dynamicScope) {
    const selectedMenuIds = scopeSet(detail.scopeMenuIds)
    if (menuIdsForCollabLine(line).some((id) => selectedMenuIds.has(id))) return true
  }
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
  detail: MarketingCollabDetail
): number {
  const t = detail.posDiscountType
  const v = Math.max(0, detail.posDiscountValue || 0)
  if (!t || v <= 0 || eligibleSubtotal <= 0) return 0
  if (t === 'percent') {
    const pct = Math.min(100, v)
    return Math.min(eligibleSubtotal, Math.floor((eligibleSubtotal * pct) / 100))
  }
  return Math.min(eligibleSubtotal, Math.round(v * 100) / 100)
}

export function collabDiscountAmountForCart(
  lines: CollabCartLineLike[],
  menuById: Map<string, CollabMenuPick>,
  detail: MarketingCollabDetail
): number {
  const eligible = collabEligibleSubtotal(lines, menuById, detail)
  return computeCollabDiscountAmount(eligible, detail)
}

export function collabHasPosDiscount(detail: MarketingCollabDetail): boolean {
  const t = detail.posDiscountType
  const v = detail.posDiscountValue || 0
  return (t === 'percent' || t === 'amount') && v > 0
}
