import { isPosChannelSettlementMemo } from './bank-import-deposit-category'

/**
 * 통장 입금 `receivable_receive`(매출 수령) → 본사 B2B 미수금 보조원장(Receive) 생성 여부.
 *
 * - POS 매장 + Grab·카드·QR 등 채널 정산 적요: 1130 분개만 — 보조원장에 넣지 않음.
 * - POS 매장 + 가맹 B2B 수금(계좌이체 등): 보조원장 생성.
 * - 비-POS 가맹: 출고·회계발주 등 B2B 수금 — 보조원장 생성.
 * @see docs/ACCOUNTING_LEDGER_SOP.md §2–3
 */
export function shouldCreateFranchiseReceivableSubledgerFromBankReceive(params: {
  linkedToChannelSettlement: boolean
  hasPosCompletedOrders: boolean
  memo?: string | null
}): boolean {
  if (params.linkedToChannelSettlement) return false
  if (params.hasPosCompletedOrders && isPosChannelSettlementMemo(params.memo)) return false
  return true
}
