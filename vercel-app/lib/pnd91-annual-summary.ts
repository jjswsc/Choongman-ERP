/** P.N.D.91 연간 직원 소득·원천징수 집계 (급여 DB + 원장 대조) */

export type Pnd91PayrollRow = {
  month?: string | null
  store?: string | null
  name?: string | null
  employee_id?: number | null
  status?: string | null
  salary?: number | null
  pos_allow?: number | null
  haz_allow?: number | null
  diligence_allow?: number | null
  birth_bonus?: number | null
  spl_bonus?: number | null
  ot_amt?: number | null
  holiday_pay?: number | null
  tax?: number | null
  sso?: number | null
  net_pay?: number | null
}

export type Pnd91WhtLedgerRow = {
  tax_month?: string | null
  store_name?: string | null
  payee_name?: string | null
  wht_amount?: number | null
  gross_amount?: number | null
  memo?: string | null
  form_hint?: string | null
}

export type Pnd91EmployeeAnnual = {
  employeeKey: string
  employeeId: number | null
  name: string
  store: string
  taxId: string | null
  monthCount: number
  annualGross: number
  annualWhtPayroll: number
  annualWhtLedger: number
  annualSso: number
  annualNetPay: number
  whtLedgerMismatch: boolean
}

export type Pnd91AnnualSummary = {
  year: number
  storeFilter: string
  filingDueDate: string
  employees: Pnd91EmployeeAnnual[]
  totals: {
    employeeCount: number
    annualGross: number
    annualWhtPayroll: number
    annualWhtLedger: number
    annualSso: number
    annualNetPay: number
    whtMismatchCount: number
  }
  warnings: string[]
}

function toFinite(n: unknown): number {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function isPayrollRowPaidForPnd91(status: unknown): boolean {
  const s = String(status || '').trim().toLowerCase()
  if (!s) return true
  if (s === 'cancel' || s === 'cancelled' || s === 'canceled' || s === 'rejected' || s === '반려') {
    return false
  }
  return true
}

export function payrollGrossForPnd91(row: Pnd91PayrollRow): number {
  return (
    toFinite(row.salary) +
    toFinite(row.pos_allow) +
    toFinite(row.haz_allow) +
    toFinite(row.diligence_allow) +
    toFinite(row.birth_bonus) +
    toFinite(row.spl_bonus) +
    toFinite(row.ot_amt) +
    toFinite(row.holiday_pay)
  )
}

function normalizeEmployeeName(name: string): string {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function pnd91EmployeeKey(store: string, name: string, employeeId: number): string {
  if (employeeId > 0) return `id:${employeeId}`
  return `sn:${String(store || '').trim().toLowerCase()}|${normalizeEmployeeName(name)}`
}

function isPayrollLinkedWhtRow(row: Pnd91WhtLedgerRow): boolean {
  const memo = String(row.memo || '')
  if (/\[AUTO:PAYROLL_RECORD_WHT:/i.test(memo)) return true
  const income = String(row.memo || '').toLowerCase()
  if (income.includes('급여 원천세')) return true
  const hint = String(row.form_hint || '').toUpperCase()
  return hint === 'PND1' || hint === 'PND3'
}

/** 태국 귀속 연도 Y → PND91 제출 기한(익년 3/31, 방콕 달력) */
export function pnd91FilingDueDateForYear(year: number): string {
  return `${year + 1}-03-31`
}

export function buildPnd91AnnualSummary(params: {
  year: number
  storeFilter: string
  payrollRows: Pnd91PayrollRow[]
  whtRows: Pnd91WhtLedgerRow[]
  taxIdByEmployeeId: Map<number, string>
  taxIdByStoreName: Map<string, string>
}): Pnd91AnnualSummary {
  const yearPrefix = `${params.year}-`
  const byKey = new Map<
    string,
    {
      employeeKey: string
      employeeId: number | null
      name: string
      store: string
      months: Set<string>
      annualGross: number
      annualWhtPayroll: number
      annualSso: number
      annualNetPay: number
    }
  >()

  for (const row of params.payrollRows || []) {
    const month = String(row.month || '').slice(0, 7)
    if (!month.startsWith(yearPrefix)) continue
    if (!isPayrollRowPaidForPnd91(row.status)) continue

    const store = String(row.store || '').trim()
    const name = String(row.name || '').trim()
    if (!name) continue

    const employeeId =
      row.employee_id != null && Number.isFinite(Number(row.employee_id))
        ? Math.floor(Number(row.employee_id))
        : 0
    const key = pnd91EmployeeKey(store, name, employeeId)
    const hit =
      byKey.get(key) ||
      {
        employeeKey: key,
        employeeId: employeeId > 0 ? employeeId : null,
        name,
        store,
        months: new Set<string>(),
        annualGross: 0,
        annualWhtPayroll: 0,
        annualSso: 0,
        annualNetPay: 0,
      }

    hit.months.add(month)
    hit.annualGross += payrollGrossForPnd91(row)
    hit.annualWhtPayroll += toFinite(row.tax)
    hit.annualSso += toFinite(row.sso)
    hit.annualNetPay += toFinite(row.net_pay)
    byKey.set(key, hit)
  }

  const whtByStoreName = new Map<string, number>()
  for (const row of params.whtRows || []) {
    if (!isPayrollLinkedWhtRow(row)) continue
    const month = String(row.tax_month || '').slice(0, 7)
    if (!month.startsWith(yearPrefix)) continue
    const store = String(row.store_name || '').trim()
    const name = String(row.payee_name || '').trim()
    if (!name) continue
    const mapKey = `${store.toLowerCase()}|${normalizeEmployeeName(name)}`
    whtByStoreName.set(mapKey, (whtByStoreName.get(mapKey) || 0) + toFinite(row.wht_amount))
  }

  const employees: Pnd91EmployeeAnnual[] = []
  for (const hit of byKey.values()) {
    const tinById =
      hit.employeeId != null && hit.employeeId > 0
        ? params.taxIdByEmployeeId.get(hit.employeeId) || null
        : null
    const tinByName =
      params.taxIdByStoreName.get(`${hit.store.toLowerCase()}|${normalizeEmployeeName(hit.name)}`) ||
      null
    const taxId = tinById || tinByName || null
    const ledgerKey = `${hit.store.toLowerCase()}|${normalizeEmployeeName(hit.name)}`
    const annualWhtLedger = round2(whtByStoreName.get(ledgerKey) || 0)
    const annualWhtPayroll = round2(hit.annualWhtPayroll)
    const whtLedgerMismatch = Math.abs(annualWhtLedger - annualWhtPayroll) > 1

    employees.push({
      employeeKey: hit.employeeKey,
      employeeId: hit.employeeId,
      name: hit.name,
      store: hit.store,
      taxId,
      monthCount: hit.months.size,
      annualGross: round2(hit.annualGross),
      annualWhtPayroll,
      annualWhtLedger,
      annualSso: round2(hit.annualSso),
      annualNetPay: round2(hit.annualNetPay),
      whtLedgerMismatch,
    })
  }

  employees.sort((a, b) => {
    if (a.store !== b.store) return a.store.localeCompare(b.store)
    return a.name.localeCompare(b.name)
  })

  const totals = employees.reduce(
    (acc, e) => {
      acc.employeeCount += 1
      acc.annualGross += e.annualGross
      acc.annualWhtPayroll += e.annualWhtPayroll
      acc.annualWhtLedger += e.annualWhtLedger
      acc.annualSso += e.annualSso
      acc.annualNetPay += e.annualNetPay
      if (e.whtLedgerMismatch) acc.whtMismatchCount += 1
      return acc
    },
    {
      employeeCount: 0,
      annualGross: 0,
      annualWhtPayroll: 0,
      annualWhtLedger: 0,
      annualSso: 0,
      annualNetPay: 0,
      whtMismatchCount: 0,
    }
  )

  return {
    year: params.year,
    storeFilter: params.storeFilter || 'All',
    filingDueDate: pnd91FilingDueDateForYear(params.year),
    employees,
    totals: {
      employeeCount: totals.employeeCount,
      annualGross: round2(totals.annualGross),
      annualWhtPayroll: round2(totals.annualWhtPayroll),
      annualWhtLedger: round2(totals.annualWhtLedger),
      annualSso: round2(totals.annualSso),
      annualNetPay: round2(totals.annualNetPay),
      whtMismatchCount: totals.whtMismatchCount,
    },
    warnings: [
      'PND91 체크리스트는 급여 DB 확정 건을 연간 합산합니다. 직원 개인 신고 여부는 현장에서 확인하세요.',
      '원장 WHT 합계는 급여 자동 원천징수 행(PND1/PND3) 기준이며, 급여 tax 합계와 1바트 초과 차이 시 경고합니다.',
    ],
  }
}
