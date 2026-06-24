import { roundMoney2 } from '@/lib/invoice-vat-total'

/** 금액 입력 문자열 — 숫자·소수점만, 소수 둘째 자리까지 */
export function normalizeMoneyInputString(raw: string): string {
  const cleaned = String(raw || '').replace(/[^\d.,]/g, '').replace(/,/g, '')
  if (!cleaned) return ''
  const parts = cleaned.split('.')
  if (parts.length <= 1) return parts[0] || ''
  return `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`
}

/** API·DB·URL·폼 입력 → 바트 금액(소수 둘째 자리 반올림, 절대값) */
export function parseMoneyAmount(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') return roundMoney2(Math.abs(raw))
  const normalized = normalizeMoneyInputString(String(raw ?? '').replace(/^-/, ''))
  if (!normalized) return 0
  return roundMoney2(Math.abs(Number(normalized) || 0))
}

/** 두 금액이 동일한지(기본 ±0.01 바트, 반올림 후 비교) */
export function moneyEqual(a: number, b: number, epsilon = 0.01): boolean {
  return Math.abs(roundMoney2(a) - roundMoney2(b)) <= epsilon
}

/** 화면 표시 — 소수점 포함(18669.88) */
export function formatMoneyBaht(amount: number): string {
  return roundMoney2(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** URL·폼 초기값 — 입력한 소수 자릿수 유지(최대 2자리) */
export function moneyInputStringFromAmount(amount: number | string | null | undefined): string {
  const fromRaw =
    typeof amount === 'string' && amount.trim()
      ? normalizeMoneyInputString(amount.trim())
      : ''
  if (fromRaw && parseMoneyAmount(fromRaw) > 0) return fromRaw
  const n = parseMoneyAmount(amount)
  if (n <= 0) return ''
  if (Math.abs(n - Math.round(n)) < 0.001) return String(Math.round(n))
  return n.toFixed(2)
}

/** 쿼리 파라미터 등 — 소수 둘째 자리까지 보존 */
export function formatMoneyAmountParam(amount: number): string {
  return roundMoney2(amount).toFixed(2)
}
