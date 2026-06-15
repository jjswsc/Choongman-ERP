/** 미수·미지급 조회 기간 금액 집계 (양수=발생, 음수=수령·지급) */

export type ReceivablePayablePeriodTotals = {
  salesSum: number
  receiveSum: number
  periodNet: number
  lineCount: number
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function sumReceivablePayablePeriodAmounts(
  items: { amount?: number }[] | undefined
): ReceivablePayablePeriodTotals {
  const rows = items ?? []
  let salesSum = 0
  let receiveSum = 0
  let periodNet = 0
  for (const r of rows) {
    const amount = Number(r.amount ?? 0)
    if (!Number.isFinite(amount)) continue
    periodNet += amount
    salesSum += Math.max(0, amount)
    receiveSum += Math.max(0, -amount)
  }
  return {
    salesSum: roundMoney(salesSum),
    receiveSum: roundMoney(receiveSum),
    periodNet: roundMoney(periodNet),
    lineCount: rows.length,
  }
}

/** 종료일 누적 잔액 − 조회 기간 순잔액 = 기간 시작 이전 잔액 */
export function priorCumulativeBalance(
  cumulative: number | undefined,
  periodNet: number
): number | undefined {
  if (cumulative == null || !Number.isFinite(cumulative)) return undefined
  return roundMoney(cumulative - periodNet)
}

export function periodTotalsReconcile(
  periodNet: number,
  salesSum: number,
  receiveSum: number,
  epsilon = 0.02
): boolean {
  return Math.abs(roundMoney(salesSum - receiveSum) - roundMoney(periodNet)) <= epsilon
}
