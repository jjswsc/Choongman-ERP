/** SSO 납부액 집계 (서버 의존 없음 — 단위 테스트용) */

export type PayrollRecordSsoRow = {
  store?: string
  sso?: number
  name?: string
}

/** 근로자 부담 + 사업주 부담(동액) 합계 납부액 */
export function ssoRemittanceBahtFromEmployeeContribution(employeeSso: number): number {
  const emp = Math.max(0, Math.floor(Number(employeeSso) || 0))
  return emp * 2
}

export function aggregateSsoRemittanceByStore(
  rows: PayrollRecordSsoRow[]
): Map<string, { totalBaht: number; employeeCount: number }> {
  const byStore = new Map<string, { totalBaht: number; employeeCount: number }>()
  for (const r of rows || []) {
    const store = String(r.store || '').trim()
    if (!store) continue
    const empSso = Math.max(0, Math.floor(Number(r.sso) || 0))
    if (empSso <= 0) continue
    const add = ssoRemittanceBahtFromEmployeeContribution(empSso)
    const prev = byStore.get(store) || { totalBaht: 0, employeeCount: 0 }
    byStore.set(store, {
      totalBaht: prev.totalBaht + add,
      employeeCount: prev.employeeCount + 1,
    })
  }
  return byStore
}
