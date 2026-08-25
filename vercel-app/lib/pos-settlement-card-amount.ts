/** POS 결산 카드 금액: 불완전 브랜드 AUTO가 주문 카드 합을 덮지 않게 */

export const SETTLEMENT_CARD_AMOUNT_TOLERANCE = 1

export type SettlementCardMismatchKind = 'none' | 'incomplete' | 'edc_diff'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function sumSettlementBreakdownAmounts(
  breakdown: Record<string, number | string | undefined> | null | undefined
): number {
  if (!breakdown || typeof breakdown !== 'object') return 0
  let s = 0
  for (const v of Object.values(breakdown)) {
    s += Math.max(0, Number(v) || 0)
  }
  return round2(s)
}

export function countFilledSettlementBreakdownLines(
  breakdown: Record<string, number | string | undefined> | null | undefined
): number {
  if (!breakdown || typeof breakdown !== 'object') return 0
  let n = 0
  for (const v of Object.values(breakdown)) {
    if (Math.max(0, Number(v) || 0) > 0.005) n += 1
  }
  return n
}

/**
 * LinkPOS AUTO 브랜드 합이 POS 주문 카드 합을 거의 다 커버할 때만 브랜드 칸을 채운다.
 * (일부만 분류된 Other 398이 카드 전체 14,185을 덮는 사고 방지)
 */
export function shouldApplyAutoCardBreakdown(params: {
  preferLiveAuto: boolean
  savedBreakdownEmpty: boolean
  autoCardTotal: number
  posCardOrdersTotal: number
  tolerance?: number
}): boolean {
  const auto = round2(Math.max(0, Number(params.autoCardTotal) || 0))
  const pos = round2(Math.max(0, Number(params.posCardOrdersTotal) || 0))
  const tol = params.tolerance ?? SETTLEMENT_CARD_AMOUNT_TOLERANCE
  if (!(params.preferLiveAuto || params.savedBreakdownEmpty)) return false
  if (auto <= 0.005) return false
  if (pos <= tol) return true
  return Math.abs(auto - pos) <= tol
}

/** 브랜드 칸이 비면 POS 주문 카드 합을 쓰고, 하나라도 있으면 브랜드 합을 쓴다 */
export function resolveSettlementCardAmount(params: {
  brandSum: number
  posCardOrdersTotal: number
  cardAmtFallback?: number
}): number {
  const brand = round2(Math.max(0, Number(params.brandSum) || 0))
  if (brand > 0.005) return brand
  const pos = round2(Math.max(0, Number(params.posCardOrdersTotal) || 0))
  if (pos > 0.005) return pos
  return round2(Math.max(0, Number(params.cardAmtFallback) || 0))
}

/**
 * incomplete: Other만 채우는 등 브랜드 합이 POS 카드의 일부만인 경우 → 저장 차단
 * edc_diff: EDC 합과 POS 카드가 다른 경우(예: +398) → 마감 시 확인
 */
export function classifySettlementCardMismatch(params: {
  brandSum: number
  posCardOrdersTotal: number
  filledBrandCount: number
  tolerance?: number
}): { kind: SettlementCardMismatchKind; diff: number } {
  const pos = round2(Math.max(0, Number(params.posCardOrdersTotal) || 0))
  const brand = round2(Math.max(0, Number(params.brandSum) || 0))
  const diff = round2(brand - pos)
  const tol = params.tolerance ?? SETTLEMENT_CARD_AMOUNT_TOLERANCE
  const filled = Math.max(0, Math.floor(Number(params.filledBrandCount) || 0))

  if (brand <= 0.005) return { kind: 'none', diff: 0 }
  if (Math.abs(diff) <= tol) return { kind: 'none', diff }

  if (brand > 0.005 && brand < pos - tol) {
    const half = round2(pos * 0.5)
    const looksPartial = brand < half || (filled <= 1 && pos - brand > 100)
    if (looksPartial) return { kind: 'incomplete', diff }
  }

  return { kind: 'edc_diff', diff }
}
