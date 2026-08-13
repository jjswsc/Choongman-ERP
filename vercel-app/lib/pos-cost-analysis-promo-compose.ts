import { normalizeMenuIngredientOptionKeySeg } from '@/lib/pos-menu-ingredient-scope'
import { aggregatePromoChoiceAwareTotals, type PromoEconomicsLineInput } from '@/lib/promo-economics'

export type PromoComposeItem = {
  promo_id?: number
  menu_id?: number
  option_id?: number | null
  quantity?: number
  choice_group?: string | null
  choice_pick_count?: number | null
}

export type PromoComposeCostRow = {
  menuId: string
  optionId: string | null
  costHall: number
  costDelivery: number
  breakdown?: unknown[]
  hasBom?: boolean
  /** 프로모션 세트 구성(pos_promo_items)으로 원가를 채움 */
  costFromPromoItems?: boolean
}

function isBaseRow(r: PromoComposeCostRow): boolean {
  return r.optionId == null || String(r.optionId).trim() === ''
}

function rowKey(menuId: string | number, optionId: unknown): string {
  return `${String(menuId)}:${normalizeMenuIngredientOptionKeySeg(optionId)}`
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function toChoiceLine(item: PromoComposeItem): PromoEconomicsLineInput | null {
  const menuId = Number(item.menu_id ?? 0)
  if (!Number.isFinite(menuId) || menuId <= 0) return null
  const qty = Number(item.quantity ?? 1)
  return {
    menuId: String(menuId),
    optionId: item.option_id == null || String(item.option_id).trim() === '' ? null : String(item.option_id),
    quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
    choiceGroup: item.choice_group != null ? String(item.choice_group).trim() || null : null,
    choicePickCount:
      item.choice_pick_count != null && Number.isFinite(Number(item.choice_pick_count))
        ? Math.max(1, Math.floor(Number(item.choice_pick_count)))
        : null,
  }
}

/**
 * 프로모션 미러 메뉴 원가 = pos_promo_items 합성 (프로모션 세트 조회와 동일).
 * - 잔여 BOM/옵션 원가가 있어도 구성 원가로 덮어쓴다.
 * - 선택 그룹(choice_group)은 pickCount만큼 원가 상위 라인만 합산한다.
 */
export function applyPromoMirrorCostsFromItems<T extends PromoComposeCostRow>(params: {
  rows: T[]
  menusById: Record<number, { promo_id?: number | null } | undefined>
  promoItemsByPromoId: Record<number, PromoComposeItem[]>
  /** 중첩 세트(구성에 다른 프로모 미러)용 반복. 기본 3 */
  passes?: number
}): T[] {
  const { rows, menusById, promoItemsByPromoId } = params
  const passes = Math.max(1, Math.min(5, params.passes ?? 3))

  const lookupChild = (map: Map<string, T>, menuId: string, optionId: string | null): T | undefined => {
    return map.get(rowKey(menuId, optionId)) ?? map.get(rowKey(menuId, null))
  }

  for (let pass = 0; pass < passes; pass++) {
    const byKey = new Map<string, T>()
    for (const r of rows) {
      byKey.set(rowKey(r.menuId, r.optionId), r)
    }

    for (const r of rows) {
      if (!isBaseRow(r)) continue
      const mid = Number(r.menuId)
      if (!Number.isFinite(mid) || mid <= 0) continue
      const promoId = Number(menusById[mid]?.promo_id ?? 0)
      if (!Number.isFinite(promoId) || promoId <= 0) continue
      const comp = promoItemsByPromoId[promoId] || []
      if (comp.length === 0) continue

      const lines = comp.map(toChoiceLine).filter((x): x is PromoEconomicsLineInput => x != null)
      if (lines.length === 0) continue

      const hall = aggregatePromoChoiceAwareTotals(lines, (it) => {
        const child = lookupChild(byKey, it.menuId, it.optionId ?? null)
        const q = Number(it.quantity) || 1
        return (child?.costHall ?? 0) * q
      })
      const del = aggregatePromoChoiceAwareTotals(lines, (it) => {
        const child = lookupChild(byKey, it.menuId, it.optionId ?? null)
        const q = Number(it.quantity) || 1
        return (child?.costDelivery ?? child?.costHall ?? 0) * q
      })

      r.costHall = round1(hall)
      r.costDelivery = round1(del)
      r.costFromPromoItems = true
      r.hasBom = hall > 0 || del > 0
      r.breakdown = []
    }
  }

  return rows
}
