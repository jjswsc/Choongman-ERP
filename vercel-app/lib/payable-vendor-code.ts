/**
 * payable_transactions.vendor_code 는 NOT NULL.
 * 세금·자동지급처(auto_*) 도 null 로 넣지 않는다 — 23502 후 오프라인 재시도가 지급예정만 복제한다.
 */
export function resolvePayableVendorCode(payeeCode: string, fallback = 'UNASSIGNED'): string {
  const c = String(payeeCode || '').trim()
  return c || fallback
}

export function isNonRetryableExpenseAccrualErrorMessage(message: string | null | undefined): boolean {
  const t = String(message || '')
  if (!t) return false
  if (/\b23502\b/.test(t)) return true
  if (/not_null_violation/i.test(t)) return true
  if (/null value in column "?vendor_code"?/i.test(t)) return true
  return false
}
