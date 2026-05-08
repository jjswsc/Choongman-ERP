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
    d.scopeChicken ||
    d.scopeKorean ||
    d.scopeSide ||
    d.scopeDrinksNonAlcohol ||
    d.scopeAlcohol ||
    d.scopeTopping
  )
}

/** 협업 상세의 카테고리 체크와 pos_menus 대분류·소분류·이름을 대응 (영·한·태국어 일부 키워드) */
export function menuMatchesCollabScope(
  menu: Pick<PosMenu, 'category' | 'categoryMain' | 'name' | 'code'>,
  detail: MarketingCollabDetail
): boolean {
  if (!collabScopeAny(detail)) return true
  const blob = `${menu.categoryMain ?? ''} ${menu.category ?? ''} ${menu.name ?? ''} ${menu.code ?? ''}`.toLowerCase()

  const hit = (re: RegExp) => re.test(blob)

  if (detail.scopeChicken && hit(/\b(chicken|치킨|ไก่|chik|닭)\b/i)) return true
  if (detail.scopeKorean && hit(/\b(korean|한식|เกาหลี|korea)\b/i)) return true
  if (detail.scopeSide && hit(/\b(side|사이드|เครื่องเคียง|snack)\b/i)) return true
  if (
    detail.scopeDrinksNonAlcohol &&
    hit(/\b(drink|beverage|음료|น้ำ|soda|juice|tea|coffee|콜라|물)\b/i) &&
    !hit(/\b(alcohol|beer|wine|soju|맥주|소주|whisky|vodka)\b/i)
  )
    return true
  if (detail.scopeAlcohol && hit(/\b(alcohol|beer|wine|soju|맥주|소주|whisky|vodka|เหล้า|เบียร์)\b/i)) return true
  if (detail.scopeTopping && hit(/\b(topping|토핑|เพิ่มเติม|extra)\b/i)) return true

  return false
}

function menuIdFromCartLineId(id: string): string {
  const s = String(id ?? '')
  const i = s.indexOf('-')
  return (i >= 0 ? s.slice(0, i) : s).trim()
}

export type CollabCartLineLike = {
  id: string
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
  menuById: Map<string, Pick<PosMenu, 'category' | 'categoryMain' | 'name' | 'code'>>
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
  menuById: Map<string, Pick<PosMenu, 'category' | 'categoryMain' | 'name' | 'code'>>,
  detail: MarketingCollabDetail
): boolean {
  const ids = menuIdsForCollabLineWithCatalog(line, menuById)
  if (ids.length === 0) return !collabScopeAny(detail)
  return ids.some((mid) => {
    const m = menuById.get(mid)
    if (!m) return !collabScopeAny(detail)
    return menuMatchesCollabScope(m, detail)
  })
}

export function collabEligibleSubtotal(
  lines: CollabCartLineLike[],
  menuById: Map<string, Pick<PosMenu, 'category' | 'categoryMain' | 'name' | 'code'>>,
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
  menuById: Map<string, Pick<PosMenu, 'category' | 'categoryMain' | 'name' | 'code'>>,
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
