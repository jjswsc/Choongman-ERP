/**
 * 손익·재무상태표 등 금액 표시: 바트 단위 정수(반올림).
 */
export function roundFinancialAmount(n: number | null | undefined): number {
  return Math.round(Number(n) || 0)
}

export function formatBahtInteger(n: number | null | undefined): string {
  const v = roundFinancialAmount(n)
  return `฿${v.toLocaleString()}`
}
