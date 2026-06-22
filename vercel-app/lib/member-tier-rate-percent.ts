/** DB·API는 소수(0.05 = 5%). 관리자 UI는 퍼센트(5 = 5%)로 입력·표시. */

export function tierRateDecimalToPercent(decimal: number): number {
  return Math.max(0, Number(decimal || 0)) * 100
}

export function tierRatePercentToDecimal(percent: number): number {
  const n = Number(percent)
  if (!Number.isFinite(n) || n < 0) return 0
  return n / 100
}

export function formatTierRatePercentInput(decimal: number): string {
  const pct = tierRateDecimalToPercent(decimal)
  if (pct === 0) return '0'
  const rounded = Math.round(pct * 1000) / 1000
  return String(rounded)
}

export function parseTierRatePercentInput(raw: string): number {
  const trimmed = raw.trim()
  if (!trimmed) return 0
  return tierRatePercentToDecimal(Number(trimmed))
}
