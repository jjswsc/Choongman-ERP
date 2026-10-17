/** 결산 시재·출금 vs 현금매출 / มัดจำ 안내용 순수 판정 */

function round2Signed(n: number): number {
  return Math.round(n * 100) / 100
}

/** 현금매출 + 시재순액(출금은 음수). 0에 가깝면 출금이 현금매출에 맞음(Future). Silom은 크게 어긋남. */
export function cashSalesVsTillNetGap(cashSales: number, tillNet: number): number {
  return round2Signed((Number(cashSales) || 0) + (Number(tillNet) || 0))
}

/** 시재 입출금이 있고, 현금매출과 출금(순액)이 안 맞을 때 */
export function shouldWarnCashSalesVsTill(cashSales: number, tillNet: number): boolean {
  const till = Number(tillNet) || 0
  if (Math.abs(till) <= 0.02) return false
  return Math.abs(cashSalesVsTillNetGap(cashSales, till)) > 0.02
}

/**
 * 돈통 차이 ≈ −มัดจำ 현금일 때(예약금이 예상 시제에 들어갔지만 실사/출금 처리와 어긋난 패턴).
 * Future 테스트: deposit +5010, drawerDiff −5010.
 */
export function shouldExplainDepositDrawerVariance(
  depositCashDelta: number,
  drawerDiff: number | null | undefined
): boolean {
  if (drawerDiff == null || !Number.isFinite(Number(drawerDiff))) return false
  const deposit = Number(depositCashDelta) || 0
  if (Math.abs(deposit) <= 0.02) return false
  return Math.abs(round2Signed(Number(drawerDiff) + deposit)) <= 0.02
}

/** 저장 cash_amt 가 주문 현금과 다르면(예약금 혼입 포함) 주문 합으로 맞출지 */
export function shouldAutoAlignSettlementCashToLive(savedCash: number | null | undefined, liveCash: number): boolean {
  if (savedCash == null || !Number.isFinite(Number(savedCash))) return false
  return Math.abs(round2Signed(Number(savedCash)) - round2Signed(Number(liveCash) || 0)) > 0.02
}
