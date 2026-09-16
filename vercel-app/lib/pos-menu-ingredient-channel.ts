/**
 * 메뉴 BOM 재료의 홀/배달 적용 범위.
 * 기본 both — 기존 행(컬럼 없음)과 동일하게 식재는 양쪽, 포장재는 배달만.
 */
export type PosMenuIngredientChannel = 'both' | 'hall' | 'delivery'

export type BomCostChannel = 'hall' | 'delivery'

export function normalizePosMenuIngredientChannel(raw: unknown): PosMenuIngredientChannel {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
  if (s === 'hall' || s === 'dine-in' || s === 'dinein' || s === 'store') return 'hall'
  if (s === 'delivery' || s === 'delivery-only' || s === 'takeout') return 'delivery'
  return 'both'
}

/**
 * 원가 합산 규칙 (기존 동작 유지 + 채널 확장):
 * - both + food → 홀·배달
 * - both + packaging → 배달만 (홀 원가에서 포장재 제외)
 * - hall → 홀만
 * - delivery → 배달만
 */
export function ingredientAppliesToCostChannel(
  channel: PosMenuIngredientChannel,
  ingredientType: 'food' | 'packaging',
  costChannel: BomCostChannel
): boolean {
  if (channel === 'hall') return costChannel === 'hall'
  if (channel === 'delivery') return costChannel === 'delivery'
  if (ingredientType === 'packaging') return costChannel === 'delivery'
  return true
}

export function ingredientAppliesToOrderChannel(
  channel: PosMenuIngredientChannel,
  ingredientType: 'food' | 'packaging',
  isDeliveryOrder: boolean
): boolean {
  return ingredientAppliesToCostChannel(channel, ingredientType, isDeliveryOrder ? 'delivery' : 'hall')
}

export function lineCostForChannels(
  costTotal: number,
  ingredientType: 'food' | 'packaging',
  channel: PosMenuIngredientChannel
): { hall: number; delivery: number } {
  const n = Number(costTotal)
  const amt = Number.isFinite(n) ? n : 0
  return {
    hall: ingredientAppliesToCostChannel(channel, ingredientType, 'hall') ? amt : 0,
    delivery: ingredientAppliesToCostChannel(channel, ingredientType, 'delivery') ? amt : 0,
  }
}
