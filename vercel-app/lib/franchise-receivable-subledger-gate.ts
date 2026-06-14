/**
 * 통장 입금 `receivable_receive`(매출 수령) → 본사 B2B 미수금 보조원장(Receive) 생성 여부.
 *
 * - POS 매장: 고객 매출 입금(1130 소거 분개)만 — 보조원장에 넣지 않음.
 * - 비-POS 가맹: 출고·회계발주 등 B2B 수금 — 보조원장 생성.
 * @see docs/ACCOUNTING_LEDGER_SOP.md §2–3
 */
export function shouldCreateFranchiseReceivableSubledgerFromBankReceive(params: {
  linkedToChannelSettlement: boolean
  hasPosCompletedOrders: boolean
}): boolean {
  if (params.linkedToChannelSettlement) return false
  if (params.hasPosCompletedOrders) return false
  return true
}
