const STORAGE_KEY = 'cm_erp_income_statement_sales_override_v1'

export function incomeStatementScopeKey(yearMonth: string, storeFilter: string): string {
  return `${yearMonth}|${storeFilter}`
}

export function readIncomeStatementSalesOverride(
  yearMonth: string,
  storeFilter: string
): { enabled: boolean; amount: number } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const map = JSON.parse(raw) as Record<string, { enabled?: boolean; amount?: number }>
    const row = map[incomeStatementScopeKey(yearMonth, storeFilter)]
    if (!row || typeof row.amount !== 'number' || !Number.isFinite(row.amount)) return null
    return {
      enabled: Boolean(row.enabled),
      amount: Math.max(0, row.amount),
    }
  } catch {
    return null
  }
}

export function writeIncomeStatementSalesOverride(
  yearMonth: string,
  storeFilter: string,
  enabled: boolean,
  amount: number
): void {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const map: Record<string, { enabled: boolean; amount: number }> = raw ? JSON.parse(raw) : {}
    const key = incomeStatementScopeKey(yearMonth, storeFilter)
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

export function parseSalesOverrideInput(text: string): number | null {
  const s = text.replace(/,/g, '').trim()
  if (s === '') return null
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}
