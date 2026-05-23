import type { PosSettlement } from '@/lib/api-client'

/** savePosOrder / updatePosOrder 거부 시 message·code */
export const POS_BUSINESS_OPEN_REQUIRED_CODE = 'pos_business_open_required'

/** 당일 `pos_settlements.cash_actual` 저장 여부 — 영업 시작(시재 등록) 완료 */
export function isPosBusinessOpenRecorded(
  settlement: PosSettlement | null | undefined
): boolean {
  if (!settlement) return false
  const n = Number(settlement.cashActual)
  return settlement.cashActual != null && Number.isFinite(n)
}
