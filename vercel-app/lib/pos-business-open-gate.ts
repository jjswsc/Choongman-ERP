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

export type PosBusinessOpenBlockReason = 'none' | 'never_opened' | 'new_business_day'

/**
 * 5분 주기 quiet 재확인 — 이미 개점한 세션을 조회 실패(never_opened)로 다시 막지 않는다.
 * 새 영업일(new_business_day)만 차단으로 내린다.
 */
export function shouldKeepPosBusinessOpenOnQuietRecheck(params: {
  previouslyAllowed: boolean
  resultAllowed: boolean
  blockReason: PosBusinessOpenBlockReason
}): boolean {
  if (params.resultAllowed) return true
  if (!params.previouslyAllowed) return false
  return params.blockReason !== 'new_business_day'
}
