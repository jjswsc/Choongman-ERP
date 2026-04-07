const STORAGE_KEY = "cm_erp_income_statement_override_source_v1"

export type IncomeStatementOverrideSource = "local" | "shared"

export function readIncomeStatementOverrideSource(): IncomeStatementOverrideSource {
  if (typeof window === "undefined") return "local"
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v === "shared" ? "shared" : "local"
  } catch {
    return "local"
  }
}

export function writeIncomeStatementOverrideSource(source: IncomeStatementOverrideSource): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, source)
  } catch {
    // ignore
  }
}
