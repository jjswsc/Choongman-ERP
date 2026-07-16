/** 지출 발생 총액(인보이스·세금포함)에서 원천징수를 뺀 실제 지급 대상액 */
export function expenseAccrualNetPayable(grossAmount: number, withholdingTaxAmount: number): number {
  const g = Math.abs(Number(grossAmount) || 0)
  const w = Math.max(0, Math.abs(Number(withholdingTaxAmount) || 0))
  return Math.max(0, Math.round((g - w) * 100) / 100)
}

/** 지출 등록 화면 WHT 세율 선택지 (%) */
export const EXPENSE_WHT_RATE_OPTIONS = [1, 2, 3, 5, 10, 15, 20] as const

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100
}

/** WHT 과세표준: 총액(세금포함) − VAT (PO·증명서와 동일) */
export function expenseWhtBaseExVat(grossAmount: number, vatAmount: number): number {
  const g = Math.max(0, Math.abs(Number(grossAmount) || 0))
  const v = Math.max(0, Math.abs(Number(vatAmount) || 0))
  return roundMoney2(Math.max(0, g - v))
}

/** 세율(%) × (총액 − VAT) → 원천징수 금액 */
export function expenseWhtAmountFromRate(
  grossAmount: number,
  vatAmount: number,
  ratePercent: number
): number {
  const rate = Math.max(0, Number(ratePercent) || 0)
  if (rate <= 0) return 0
  const base = expenseWhtBaseExVat(grossAmount, vatAmount)
  return roundMoney2(base * (rate / 100))
}
