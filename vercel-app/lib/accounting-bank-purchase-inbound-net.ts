/** 손익 매입 — 통장 매입지급에서 입고 연동분 제외 (입고가 이미 발생 매입으로 반영됨) */

export function netBankPurchasePaymentForIncomeStatement(
  paidAmount: number,
  inboundLinkedAmount: number
): number {
  const paid = Math.abs(Number(paidAmount) || 0)
  const linked = Math.abs(Number(inboundLinkedAmount) || 0)
  return Math.max(0, paid - linked)
}

export function sumInboundLinkAmountsByBankTransactionId(
  links: { bank_transaction_id?: number; amount?: number }[]
): Map<number, number> {
  const out = new Map<number, number>()
  for (const row of links) {
    const bankId = Number(row.bank_transaction_id || 0)
    if (!bankId) continue
    const amount = Math.abs(Number(row.amount || 0))
    if (amount <= 0) continue
    out.set(bankId, (out.get(bankId) || 0) + amount)
  }
  return out
}
