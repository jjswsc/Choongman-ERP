import 'server-only'

import { addBangkokCalendarDays } from '@/lib/bangkok-time'
import type { WorkLogEmployeeRow } from '@/lib/work-log-name-server'

type WorkLogRowLite = {
  log_date?: string | Date
  name?: string
  employee_id?: number | null
  progress?: number
  status?: string
  store?: string | null
}

type AttendanceRowLite = {
  log_date?: string | Date
  name?: string
  employee_id?: number | null
  log_type?: string
  ot_min?: number | null
  store_name?: string | null
}

type EvalRowLite = {
  eval_date?: string | Date
  eval_type?: string
  final_grade?: string
  store_name?: string
  evaluator?: string
  employee_name?: string
}

function toDateStr(v: string | Date | null | undefined): string {
  if (!v) return ''
  return typeof v === 'string' ? v.slice(0, 10) : String(v).slice(0, 10)
}

function enumerateDates(startStr: string, endStr: string): string[] {
  const out: string[] = []
  if (!startStr || !endStr || startStr > endStr) return out
  let cur = startStr
  for (let guard = 0; guard < 400 && cur <= endStr; guard++) {
    out.push(cur)
    if (cur === endStr) break
    cur = addBangkokCalendarDays(cur, 1)
  }
  return out
}

function rowMatchesEmployee(
  row: { name?: string; employee_id?: number | null },
  emp: WorkLogEmployeeRow
): boolean {
  const rowEid = row.employee_id == null ? NaN : Math.floor(Number(row.employee_id))
  if (Number.isFinite(rowEid) && rowEid === emp.id) return true
  const rowName = String(row.name || '').trim()
  if (!rowName) return false
  if (rowName === emp.name) return true
  return Boolean(emp.nick && emp.nick !== emp.name && rowName === emp.nick)
}

function storeMatches(
  rowStore: string | null | undefined,
  filterStore: string | null | undefined
): boolean {
  const sf = String(filterStore || '').trim()
  if (!sf) return true
  const rs = String(rowStore || '').trim()
  if (!rs) return true
  return rs.toLowerCase() === sf.toLowerCase()
}

export function aggregateWorkLogPeriodDays(
  rows: WorkLogRowLite[],
  startStr: string,
  endStr: string,
  emp: WorkLogEmployeeRow | null,
  employeeName?: string | null
) {
  const byDate = new Map<
    string,
    { total: number; completed: number; inProgress: number; carried: number; progressSum: number; count: number }
  >()

  for (const r of rows) {
    const d = toDateStr(r.log_date)
    if (!d || d < startStr || d > endStr) continue
    if (emp) {
      if (!rowMatchesEmployee(r, emp)) continue
    } else {
      const n = String(employeeName || '').trim()
      if (!n || String(r.name || '').trim() !== n) continue
    }
    if (!byDate.has(d)) {
      byDate.set(d, { total: 0, completed: 0, inProgress: 0, carried: 0, progressSum: 0, count: 0 })
    }
    const p = byDate.get(d)!
    p.total++
    const progress = Number(r.progress) || 0
    p.progressSum += progress
    p.count++
    const st = String(r.status || '')
    if (st === 'Finish' || progress >= 100) p.completed++
    else if (st === 'Continue' || st === 'Carry Over') p.carried++
    else if (st === 'Today' && progress < 100) p.inProgress++
    else if (progress < 100) p.inProgress++
  }

  return enumerateDates(startStr, endStr).map((date) => {
    const p = byDate.get(date)
    return {
      date,
      totalTasks: p?.total ?? 0,
      completed: p?.completed ?? 0,
      inProgress: p?.inProgress ?? 0,
      carried: p?.carried ?? 0,
      avgProgress: p && p.count > 0 ? Math.round(p.progressSum / p.count) : 0,
      hasActivity: (p?.total ?? 0) > 0,
    }
  })
}

export function aggregateWorkLogWeeklySummaries(
  rows: WorkLogRowLite[],
  nameToRole: Record<string, string>
) {
  const byEmployee = new Map<
    string,
    { total: number; completed: number; carried: number; inProgress: number; progressSum: number; count: number }
  >()

  for (const r of rows) {
    const name = String(r.name || '').trim()
    if (!name) continue
    if (!byEmployee.has(name)) {
      byEmployee.set(name, { total: 0, completed: 0, carried: 0, inProgress: 0, progressSum: 0, count: 0 })
    }
    const p = byEmployee.get(name)!
    p.total++
    const progress = Number(r.progress) || 0
    p.progressSum += progress
    p.count++
    const st = String(r.status || '')
    if (st === 'Finish' || progress >= 100) p.completed++
    else if (st === 'Continue' || st === 'Carry Over') p.carried++
    else p.inProgress++
  }

  const summaries = Array.from(byEmployee.entries()).map(([employee, p]) => ({
    employee,
    role: nameToRole[employee] || '',
    totalTasks: p.total,
    completed: p.completed,
    carried: p.carried,
    inProgress: p.inProgress,
    avgProgress: p.count > 0 ? Math.round(p.progressSum / p.count) : 0,
  }))

  const totalTasks = summaries.reduce((a, s) => a + s.totalTasks, 0)
  const totalCompleted = summaries.reduce((a, s) => a + s.completed, 0)
  const totalCarried = summaries.reduce((a, s) => a + s.carried, 0)
  const overallAvg =
    summaries.length > 0
      ? Math.round(summaries.reduce((a, s) => a + s.avgProgress, 0) / summaries.length)
      : 0

  return { summaries, totalTasks, totalCompleted, totalCarried, overallAvg }
}

export function buildWorkLogEmployeeInsightsFallback(
  emp: WorkLogEmployeeRow,
  workRows: WorkLogRowLite[],
  attendanceRows: AttendanceRowLite[],
  evalRows: EvalRowLite[],
  startStr: string,
  endStr: string,
  storeFilter?: string | null
) {
  const sf = String(storeFilter || '').trim()
  const workByDate = new Map<
    string,
    { total_tasks: number; completed: number; carried: number; progressSum: number; count: number }
  >()
  for (const r of workRows) {
    const d = toDateStr(r.log_date)
    if (!d || d < startStr || d > endStr) continue
    if (!rowMatchesEmployee(r, emp)) continue
    if (!storeMatches(r.store, sf || null)) continue
    if (!workByDate.has(d)) {
      workByDate.set(d, { total_tasks: 0, completed: 0, carried: 0, progressSum: 0, count: 0 })
    }
    const bucket = workByDate.get(d)!
    bucket.total_tasks++
    const progress = Number(r.progress) || 0
    bucket.progressSum += progress
    bucket.count++
    const st = String(r.status || '')
    if (st === 'Finish' || progress >= 100) bucket.completed++
    else if (st === 'Continue' || st === 'Carry Over') bucket.carried++
  }

  const attendanceByDate = new Map<
    string,
    { clock_in_count: number; clock_out_count: number; ot_min_sum: number }
  >()
  for (const r of attendanceRows) {
    const d = toDateStr(r.log_date)
    if (!d || d < startStr || d > endStr) continue
    if (!rowMatchesEmployee(r, emp)) continue
    if (!storeMatches(r.store_name, sf || null)) continue
    if (!attendanceByDate.has(d)) {
      attendanceByDate.set(d, { clock_in_count: 0, clock_out_count: 0, ot_min_sum: 0 })
    }
    const bucket = attendanceByDate.get(d)!
    const lt = String(r.log_type || '').toLowerCase()
    if (lt.includes('in') || lt.includes('출')) bucket.clock_in_count++
    if (lt.includes('out') || lt.includes('퇴')) bucket.clock_out_count++
    bucket.ot_min_sum += Number(r.ot_min) || 0
  }

  const evaluations = evalRows
    .filter((r) => {
      const d = toDateStr(r.eval_date)
      if (!d || d < startStr || d > endStr) return false
      const en = String(r.employee_name || '').trim()
      if (en && en !== emp.name && en !== emp.nick) return false
      return storeMatches(r.store_name, sf || null)
    })
    .slice(0, 20)
    .map((r) => ({
      eval_date: toDateStr(r.eval_date),
      eval_type: String(r.eval_type || ''),
      final_grade: String(r.final_grade || ''),
      store_name: String(r.store_name || ''),
      evaluator: String(r.evaluator || ''),
    }))

  return {
    employeeName: emp.name,
    employeeStore: sf || emp.store || '',
    work: Array.from(workByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([log_date, v]) => ({
        log_date,
        total_tasks: v.total_tasks,
        completed: v.completed,
        carried: v.carried,
        avg_progress: v.count > 0 ? Math.round(v.progressSum / v.count) : 0,
      })),
    attendance: Array.from(attendanceByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([log_date, v]) => ({
        log_date,
        clock_in_count: v.clock_in_count,
        clock_out_count: v.clock_out_count,
        ot_min_sum: v.ot_min_sum,
      })),
    evaluations,
  }
}
