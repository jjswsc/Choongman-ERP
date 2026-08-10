/** 통장·패티에 실제로 연결된 지급(Payment)만 "정산 완료"로 본다. */

export function isSettledExpensePayment(row: {
  amount?: number | null
  bank_transaction_id?: number | null
  petty_cash_transaction_id?: number | null
}): boolean {
  const amt = Number(row.amount || 0)
  if (!(amt < 0)) return false
  return Number(row.bank_transaction_id || 0) > 0 || Number(row.petty_cash_transaction_id || 0) > 0
}

export function settledPaidAbsFromPayableRows(
  rows: Array<{
    amount?: number | null
    bank_transaction_id?: number | null
    petty_cash_transaction_id?: number | null
  }>
): number {
  let sum = 0
  for (const row of rows || []) {
    if (!isSettledExpensePayment(row)) continue
    sum += Math.abs(Number(row.amount) || 0)
  }
  return sum
}

/** DB status 가 paid/done 이어도 통장·패티 정산이 없으면 연결 가능한 상태로 본다. */
export function isOrphanPaidExpenseAccrualStatus(
  status: string | null | undefined,
  hasSettledPayment: boolean
): boolean {
  const s = String(status || '').toLowerCase()
  return (s === 'paid' || s === 'done') && !hasSettledPayment
}
