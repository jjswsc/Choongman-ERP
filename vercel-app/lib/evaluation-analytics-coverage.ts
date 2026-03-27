/**
 * 기간 내 재직 직원(employees) 대비 평가 미실시 인원 — evaluation_results 와 이름 매칭
 */

import { supabaseSelect, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import type { JwtPayload } from '@/lib/jwt-auth'
import { userCanAccessEmployeeStore, storeMatches } from '@/lib/admin-employee-store-access'

export type EvalCoverageUnevaluatedRow = {
  store: string
  name: string
  nick: string
  job: string
}

export type EvalCoverageStats = {
  /** 기간과 겹치는 재직(또는 재직으로 간주) 직원 수 */
  activeEmployeesInPeriod: number
  /** 선택한 평가 유형 기준 기간 내 1회 이상 평가된 직원 수 */
  evaluatedEmployees: number
  /** 평가 없음 */
  unevaluatedEmployees: number
  unevaluated: EvalCoverageUnevaluatedRow[]
}

function normalizeNameForEvalMatch(name: string): string {
  const s = String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(Mr\.?|Ms\.?|Mrs\.?)\s*/i, '')
    .trim()
  return s || String(name || '').trim()
}

function toYmd(val: unknown): string {
  if (val == null || val === '') return ''
  if (typeof val === 'string') return val.trim().slice(0, 10)
  const d = new Date(val as string)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/**
 * 입사·퇴사일과 [periodStart, periodEnd] 가 하루라도 겹치면 true.
 * 입사일 없음 → 과거부터 재직으로 간주. 퇴사일 없음 → 아직 재직.
 */
export function isEmployeeActiveInPeriod(
  joinYmd: string,
  resignYmd: string,
  periodStart: string,
  periodEnd: string
): boolean {
  const j = joinYmd || '1900-01-01'
  const r = resignYmd || '9999-12-31'
  if (j > periodEnd) return false
  if (r < periodStart) return false
  return true
}

type EvalKeyRow = { store_name?: string; employee_name?: string; eval_type?: string }

/** 기간 내 평가 행으로부터 (매장+이름 변형) 키 집합 */
export function buildEvaluatedEmployeeKeys(rows: EvalKeyRow[], evalTypeFilter: 'all' | 'kitchen' | 'service'): Set<string> {
  const set = new Set<string>()
  for (const r of rows) {
    const et = String(r.eval_type || '').toLowerCase().trim()
    if (evalTypeFilter === 'kitchen' && et !== 'kitchen') continue
    if (evalTypeFilter === 'service' && et !== 'service') continue
    const st = String(r.store_name || '').trim().replace(/\s+/g, ' ')
    const en = String(r.employee_name || '').trim().replace(/\s+/g, ' ')
    if (!st || !en) continue
    const variants = new Set([en, normalizeNameForEvalMatch(en)])
    for (const v of variants) {
      if (v) {
        set.add(`${st}\n${v}`)
        set.add(`${st.toLowerCase()}\n${v.toLowerCase()}`)
      }
    }
  }
  return set
}

function employeeCandidateKeys(store: string, name: string, nick: string): string[] {
  const s = store.trim().replace(/\s+/g, ' ')
  const n = name.trim().replace(/\s+/g, ' ')
  const nk = nick.trim().replace(/\s+/g, ' ')
  const keys: string[] = []
  const add = (a: string, b: string) => {
    if (!a || !b) return
    keys.push(`${a}\n${b}`)
    keys.push(`${a.toLowerCase()}\n${b.toLowerCase()}`)
  }
  if (n) {
    add(s, n)
    add(s, normalizeNameForEvalMatch(n))
  }
  if (nk && nk !== n) {
    add(s, nk)
    add(s, normalizeNameForEvalMatch(nk))
  }
  return keys
}

function isMatchedToEvaluated(keys: string[], evaluated: Set<string>): boolean {
  for (const k of keys) {
    if (evaluated.has(k)) return true
  }
  return false
}

function employeeInStoreScope(empStore: string, pStore: string | null): boolean {
  if (!pStore || !pStore.trim()) return true
  const a = empStore.trim()
  const b = pStore.trim()
  if (a === b) return true
  return storeMatches(b, a) || storeMatches(a, b)
}

async function fetchEvalKeyRows(
  evalType: string,
  start: string,
  end: string,
  storeName: string | null
): Promise<EvalKeyRow[]> {
  async function one(typeVal: string) {
    const filters: string[] = [`eval_type=eq.${encodeURIComponent(typeVal)}`]
    if (start) filters.push(`eval_date=gte.${start}`)
    if (end) filters.push(`eval_date=lte.${end}`)
    if (storeName && storeName.trim()) {
      filters.push(`store_name=eq.${encodeURIComponent(storeName.trim())}`)
    }
    const part = (await supabaseSelectFilterAllPages('evaluation_results', filters.join('&'), {
      select: 'store_name,employee_name,eval_type',
      order: 'eval_date.desc',
      pageSize: 8000,
      maxRows: 120_000,
    })) as EvalKeyRow[]
    return Array.isArray(part) ? part : []
  }
  const t = evalType.toLowerCase()
  if (t === 'all' || t === '') {
    const [a, b] = await Promise.all([one('kitchen'), one('service')])
    return [...a, ...b]
  }
  return one(t === 'service' ? 'service' : 'kitchen')
}

export type ComputeCoverageParams = {
  auth: JwtPayload
  periodStart: string
  periodEnd: string
  evalType: string
  /** null = 전체 매장(본사·회계) */
  pStore: string | null
}

/**
 * employees 마스터와 기간 내 평가 행을 비교해 미평가 직원 목록 생성
 */
export async function computeEvalCoverageStats(params: ComputeCoverageParams): Promise<EvalCoverageStats | null> {
  const role = String(params.auth.role || '')
  const userStore = String(params.auth.store || '').trim()
  const start = params.periodStart.slice(0, 10)
  const end = params.periodEnd.slice(0, 10)
  const typeLower = params.evalType.toLowerCase()
  const evalFilter: 'all' | 'kitchen' | 'service' =
    typeLower === 'kitchen' ? 'kitchen' : typeLower === 'service' ? 'service' : 'all'

  let empRows: Record<string, unknown>[]
  try {
    empRows = (await supabaseSelect('employees', {
      order: 'id.asc',
      limit: 8000,
      select: 'store,name,nick,job,join_date,resign_date',
    })) as Record<string, unknown>[]
  } catch (e) {
    console.warn('computeEvalCoverageStats employees:', e)
    return null
  }

  const activeScoped: EvalCoverageUnevaluatedRow[] = []
  for (const r of empRows || []) {
    const empStore = String(r.store || '').trim()
    const name = String(r.name || '').trim()
    if (!empStore || !name) continue
    if (!userCanAccessEmployeeStore(role, userStore, empStore)) continue
    if (!employeeInStoreScope(empStore, params.pStore)) continue

    const joinYmd = toYmd(r.join_date)
    const resignYmd = toYmd(r.resign_date)
    if (!isEmployeeActiveInPeriod(joinYmd, resignYmd, start, end)) continue

    activeScoped.push({
      store: empStore,
      name,
      nick: String(r.nick || '').trim(),
      job: String(r.job || '').trim(),
    })
  }

  let evalRows: EvalKeyRow[]
  try {
    evalRows = await fetchEvalKeyRows(params.evalType, start, end, params.pStore)
  } catch (e) {
    console.warn('computeEvalCoverageStats evaluation_results:', e)
    return null
  }

  const evaluatedKeys = buildEvaluatedEmployeeKeys(evalRows, evalFilter)

  const unevaluated: EvalCoverageUnevaluatedRow[] = []
  for (const emp of activeScoped) {
    const keys = employeeCandidateKeys(emp.store, emp.name, emp.nick)
    if (!isMatchedToEvaluated(keys, evaluatedKeys)) {
      unevaluated.push({
        store: emp.store,
        name: emp.name,
        nick: emp.nick,
        job: emp.job,
      })
    }
  }

  unevaluated.sort((a, b) => {
    const c = a.store.localeCompare(b.store)
    if (c !== 0) return c
    return a.name.localeCompare(b.name)
  })

  const activeEmployeesInPeriod = activeScoped.length
  const unevaluatedEmployees = unevaluated.length
  const evaluatedEmployees = Math.max(0, activeEmployeesInPeriod - unevaluatedEmployees)

  return {
    activeEmployeesInPeriod,
    evaluatedEmployees,
    unevaluatedEmployees,
    unevaluated,
  }
}
