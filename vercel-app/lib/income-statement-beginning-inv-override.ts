const STORAGE_KEY = 'cm_erp_income_statement_beginning_inv_override_v1'

export function incomeStatementBeginningInvScopeKey(yearMonth: string, storeFilter: string): string {
  return `${yearMonth}|${storeFilter}`
}

export function readIncomeStatementBeginningInvOverride(
  yearMonth: string,
  storeFilter: string
): { enabled: boolean; amount: number } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const map = JSON.parse(raw) as Record<string, { enabled?: boolean; amount?: number }>
    const row = map[incomeStatementBeginningInvScopeKey(yearMonth, storeFilter)]
    if (!row || typeof row.amount !== 'number' || !Number.isFinite(row.amount)) return null
    return {
      enabled: Boolean(row.enabled),
      amount: Math.max(0, row.amount),
    }
  } catch {
    return null
  }
}

export function writeIncomeStatementBeginningInvOverride(
  yearMonth: string,
  storeFilter: string,
  enabled: boolean,
  amount: number
): void {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const map: Record<string, { enabled: boolean; amount: number }> = raw ? JSON.parse(raw) : {}
    const key = incomeStatementBeginningInvScopeKey(yearMonth, storeFilter)
    if (!enabled) {
      delete map[key]
    } else {
      map[key] = { enabled: true, amount: Math.max(0, amount) }
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}
