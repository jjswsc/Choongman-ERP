import type { PosMenu } from '@/lib/api-client'
import type { MarketingCollabDetail } from '@/lib/marketing-collab-detail'

export type PosCollabCampaignForStore = {
  id: string
  topic: string
  campaignNo?: string
  collabDetail: MarketingCollabDetail
}

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
export function menuMatchesCollabScope(
  menu: Pick<PosMenu, 'id' | 'category' | 'categoryMain' | 'name' | 'code'>,
  detail: MarketingCollabDetail
): boolean {
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
  menuById: Map<string, Pick<PosMenu, 'id' | 'category' | 'categoryMain' | 'name' | 'code'>>
): string[] {
  const explicit = menuIdsForCollabLine(line).filter((id) => menuById.has(id))
  if (explicit.length > 0) return explicit

  const rawId = String(line.id ?? '').trim()
  if (!rawId) return []
  if (menuById.has(rawId)) return [rawId]

  const cartPayloadId = rawId.startsWith('cart-') ? rawId.slice('cart-'.length) : rawId
  const matched: string[] = []
  for (const id of menuById.keys()) {
    if (cartPayloadId === id || cartPayloadId.startsWith(`${id}-`)) matched.push(id)
  }
  return matched
}

function lineEligibleForCollab(
  line: CollabCartLineLike,
  menuById: Map<string, Pick<PosMenu, 'id' | 'category' | 'categoryMain' | 'name' | 'code'>>,
  detail: MarketingCollabDetail
): boolean {
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

export function collabEligibleSubtotal(
  lines: CollabCartLineLike[],
  menuById: Map<string, Pick<PosMenu, 'id' | 'category' | 'categoryMain' | 'name' | 'code'>>,
  detail: MarketingCollabDetail
): number {
  let s = 0
  for (const line of lines) {
    if (lineEligibleForCollab(line, menuById, detail)) {
      const q = Math.max(0, Number(line.quantity ?? line.qty) || 0)
      s += Math.max(0, Number(line.price) || 0) * q
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
  menuById: Map<string, Pick<PosMenu, 'id' | 'category' | 'categoryMain' | 'name' | 'code'>>,
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
