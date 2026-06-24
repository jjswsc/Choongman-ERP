/** 지출 발생 총액(인보이스·세금포함)에서 원천징수를 뺀 실제 지급 대상액 */
export function expenseAccrualNetPayable(grossAmount: number, withholdingTaxAmount: number): number {
  const g = Math.abs(Number(grossAmount) || 0)
  const w = Math.max(0, Math.abs(Number(withholdingTaxAmount) || 0))
  return Math.max(0, Math.round((g - w) * 100) / 100)
}
