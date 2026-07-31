/** 오피스(본사) 급여 지출 합산 (서버 의존 없음 — 단위 테스트용) */

export type PayrollOfficeNetRow = {
  store?: string
  netPay?: number
  name?: string
}

function normalizeToken(src: string): string {
  return (
    String(src || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'na'
  )
}

/** 매장·월 단위 합산 지급예정 payee_code (직원명 미포함) */
export function buildOfficePayrollAggregatePayeeCode(monthStr: string, store: string): string {
  const base = `payroll-${monthStr}-${normalizeToken(store)}-agg`
  return `${base}::wm::expense`
}

export function isOfficePayrollAggregatePayeeCode(payeeCode: string): boolean {
  const c = String(payeeCode || '').trim().toLowerCase()
  return c.endsWith('-agg::wm::expense')
}

/** 해당 월 급여 지출 payee_code 접두 (개인·합산 공통) */
export function payrollExpensePayeePrefix(monthStr: string): string {
  return `payroll-${monthStr}-`
}

export function aggregateOfficeNetPayByStore(
  rows: PayrollOfficeNetRow[],
  isOfficeStore: (store: string) => boolean
): Map<string, { totalBaht: number; employeeCount: number }> {
  const byStore = new Map<string, { totalBaht: number; employeeCount: number }>()
  for (const r of rows || []) {
    const store = String(r.store || '').trim()
    if (!store || !isOfficeStore(store)) continue
    const net = Math.max(0, Math.round(Number(r.netPay) || 0))
    if (net <= 0) continue
    const prev = byStore.get(store) || { totalBaht: 0, employeeCount: 0 }
    byStore.set(store, {
      totalBaht: prev.totalBaht + net,
      employeeCount: prev.employeeCount + 1,
    })
  }
  return byStore
}
