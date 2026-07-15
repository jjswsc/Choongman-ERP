/**
 * 손익계산서 ← 급여(payroll_records) 자연 연동.
 * - 인건비 = net_pay + sso + tax (귀속월 총근로비용, 원천·근로자 SSO 포함)
 * - 같은 스코프에 확정 급여가 있으면 통장/패티의 급여성 출금은 이중 방지를 위해 제외
 */
import { storeMatchesIncomeFilter } from '@/lib/accounting-store-match'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { isOfficeStore } from '@/lib/permissions'
import { supabaseSelectFilterAllPages } from '@/lib/supabase-server'

function isHqPayrollStore(store: string): boolean {
  const s = String(store || '').trim()
  if (!s) return false
  return isOfficeStore(s) || isHeadOfficeLikeStoreName(s) || s.startsWith('Office-')
}

export type PayrollPlAccountMeta = {
  code: string
  name: string
  nameEn?: string | null
  nameTh?: string | null
  type: string
}

export type PayrollPlRecordRow = {
  id?: number
  month?: string
  store?: string
  name?: string
  net_pay?: number
  sso?: number
  tax?: number
  status?: string | null
}

/** net + 근로자 SSO + 원천 = 총인건비(사업주 SSO는 별도 납부예정·지출) */
export function payrollRecordGrossExpenseBaht(row: {
  net_pay?: number | null
  sso?: number | null
  tax?: number | null
}): number {
  return Math.max(
    0,
    (Number(row.net_pay) || 0) + (Number(row.sso) || 0) + (Number(row.tax) || 0)
  )
}

export function isPayrollRecordIncludedInPl(status: string | null | undefined): boolean {
  const s = String(status || '').trim()
  if (!s) return true
  if (/취소|cancel|void|삭제|delete|draft|초안|미확정|pending/i.test(s)) return false
  return true
}

const SALARY_MEMO_RE = /급여|salary|월급|ค่าจ้าง|\[payroll\]|payroll-/i

export function isSalaryAccountMeta(meta: PayrollPlAccountMeta | undefined | null): boolean {
  if (!meta) return false
  if (String(meta.code || '').trim() === '5310') return true
  const text = `${meta.code || ''} ${meta.name || ''} ${meta.nameEn || ''} ${meta.nameTh || ''}`.toLowerCase()
  return /급여|salary|wage|ค่าจ้าง|เงินเดือน/.test(text)
}

/** 급여 계정 id 집합 + 대표 계정(5310 우선) */
export function resolveSalaryAccountSubjects(
  subjectMeta: Map<number, PayrollPlAccountMeta>
): { preferredId: number | null; salarySubjectIds: Set<number> } {
  const salarySubjectIds = new Set<number>()
  let preferred5310: number | null = null
  let preferredNamed: number | null = null
  for (const [id, meta] of subjectMeta) {
    if (meta.type !== 'expense') continue
    if (!isSalaryAccountMeta(meta)) continue
    salarySubjectIds.add(id)
    if (String(meta.code || '').trim() === '5310' && preferred5310 == null) preferred5310 = id
    else if (preferredNamed == null) preferredNamed = id
  }
  return { preferredId: preferred5310 ?? preferredNamed, salarySubjectIds }
}

export function isSalaryLikePlExpenseRow(params: {
  accountSubjectId?: number | null
  memo?: string | null
  subjectMeta: Map<number, PayrollPlAccountMeta>
  salarySubjectIds: Set<number>
}): boolean {
  const sid =
    params.accountSubjectId != null && !isNaN(Number(params.accountSubjectId))
      ? Number(params.accountSubjectId)
      : null
  if (sid != null && params.salarySubjectIds.has(sid)) return true
  if (sid != null && isSalaryAccountMeta(params.subjectMeta.get(sid))) return true
  if (params.memo && SALARY_MEMO_RE.test(String(params.memo))) return true
  return false
}

export function payrollStoreInIncomeScope(params: {
  store: string
  storeFilter: string
  isHQ: boolean
}): boolean {
  const st = String(params.store || '').trim()
  if (!st) return false
  if (params.isHQ) return isHqPayrollStore(st)
  if (params.storeFilter === 'All') return !isHqPayrollStore(st)
  return storeMatchesIncomeFilter(st, params.storeFilter)
}

export type PayrollPlAggregate = {
  total: number
  preferredSubjectId: number | null
  salarySubjectIds: Set<number>
  rowCount: number
  records: {
    id: number
    store: string
    name: string
    amount: number
    netPay: number
    sso: number
    tax: number
  }[]
}

export function aggregatePayrollRecordsForPl(params: {
  rows: PayrollPlRecordRow[]
  storeFilter: string
  isHQ: boolean
  preferredSubjectId: number | null
  salarySubjectIds: Set<number>
}): PayrollPlAggregate {
  const records: PayrollPlAggregate['records'] = []
  let total = 0
  for (const r of params.rows) {
    if (!isPayrollRecordIncludedInPl(r.status)) continue
    const store = String(r.store || '').trim()
    if (!payrollStoreInIncomeScope({ store, storeFilter: params.storeFilter, isHQ: params.isHQ })) {
      continue
    }
    const amount = payrollRecordGrossExpenseBaht(r)
    if (!amount) continue
    const id = Number(r.id) || 0
    if (!id) continue
    total += amount
    records.push({
      id,
      store,
      name: String(r.name || '').trim() || '—',
      amount,
      netPay: Math.max(0, Number(r.net_pay) || 0),
      sso: Math.max(0, Number(r.sso) || 0),
      tax: Math.max(0, Number(r.tax) || 0),
    })
  }
  records.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'ko'))
  return {
    total: Math.round(total * 100) / 100,
    preferredSubjectId: params.preferredSubjectId,
    salarySubjectIds: params.salarySubjectIds,
    rowCount: records.length,
    records,
  }
}

export async function loadPayrollAggregateForIncomeStatement(params: {
  yearMonth: string
  storeFilter: string
  isHQ: boolean
  subjectMeta: Map<number, PayrollPlAccountMeta>
}): Promise<PayrollPlAggregate> {
  const { preferredId, salarySubjectIds } = resolveSalaryAccountSubjects(params.subjectMeta)
  const month = String(params.yearMonth || '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return {
      total: 0,
      preferredSubjectId: preferredId,
      salarySubjectIds,
      rowCount: 0,
      records: [],
    }
  }
  let rows: PayrollPlRecordRow[] = []
  try {
    rows = (await supabaseSelectFilterAllPages(
      'payroll_records',
      `month=eq.${encodeURIComponent(month)}`,
      {
        select: 'id,month,store,name,net_pay,sso,tax,status',
        order: 'id.asc',
        pageSize: 8000,
        maxRows: 200_000,
      }
    )) as PayrollPlRecordRow[]
  } catch {
    rows = []
  }
  return aggregatePayrollRecordsForPl({
    rows,
    storeFilter: params.storeFilter,
    isHQ: params.isHQ,
    preferredSubjectId: preferredId,
    salarySubjectIds,
  })
}
