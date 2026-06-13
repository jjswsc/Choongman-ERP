import 'server-only'

import { supabaseSelectFilter } from '@/lib/supabase-server'
import { workLogStoredNameFromEmployeeMaster } from '@/lib/work-log-name'

export type WorkLogEmployeeRow = {
  id: number
  name: string
  nick: string
  job: string
  store: string
}

/**
 * 업무일지 저장·조회: `employees.id`로 마스터 행을 확정할 때 사용.
 */
export async function resolveWorkLogEmployeeById(employeeId: unknown): Promise<WorkLogEmployeeRow | null> {
  const id = Math.floor(Number(employeeId))
  if (!Number.isFinite(id) || id <= 0) return null
  const rows = (await supabaseSelectFilter('employees', `id=eq.${id}`, {
    limit: 1,
    select: 'id,name,nick,job,store',
  })) as { id?: number; name?: string; nick?: string; job?: string; store?: string }[]
  const r = rows?.[0]
  if (!r || r.id == null) return null
  const eid = Math.floor(Number(r.id))
  if (!Number.isFinite(eid) || eid <= 0) return null
  return {
    id: eid,
    name: workLogStoredNameFromEmployeeMaster(r.name),
    nick: String(r.nick || '').trim(),
    job: String(r.job || '').trim() || 'Staff',
    store: String(r.store || '').trim(),
  }
}

/**
 * PostgREST: 해당 직원의 신규 행(employee_id 일치) + 이름만 있던 레거시 행(name 일치) 동시 조회
 */
export function workLogsOrEmployeeIdOrNameFilter(employeeId: number, fullName: string): string {
  return workLogsEmployeeMatchFilter({ id: employeeId, name: fullName, nick: '' })
}

/** work_logs·attendance_logs: employee_id + 풀네임 + (다를 때) 닉 레거시 동시 매칭 */
export function workLogsEmployeeMatchFilter(emp: {
  id: number
  name: string
  nick?: string
}): string {
  const parts = [`employee_id.eq.${emp.id}`]
  const full = String(emp.name || '').trim()
  if (full) parts.push(`name.eq.${encodeURIComponent(full)}`)
  const nick = String(emp.nick || '').trim()
  if (nick && nick !== full) parts.push(`name.eq.${encodeURIComponent(nick)}`)
  return `or=(${parts.join(',')})`
}

export function attendanceLogsEmployeeMatchFilter(emp: {
  id: number
  name: string
  nick?: string
}): string {
  return workLogsEmployeeMatchFilter(emp)
}

/**
 * 주간·승인 탭 필터: `employee`가 숫자면 employees.id 로 해석 후 풀네임 반환.
 * 레거시(닉 문자열 등) 호환은 null 이고 호출측에서 기존처럼 `name=eq.${param}` 사용.
 */
export async function resolveWorkLogFilterNameFromEmployeeIdParam(param: string): Promise<string | null> {
  const id = Number.parseInt(String(param || '').trim(), 10)
  if (!Number.isFinite(id) || id <= 0) return null
  const rows = (await supabaseSelectFilter('employees', `id=eq.${id}`, {
    limit: 1,
    select: 'name',
  })) as { name?: string }[]
  const n = workLogStoredNameFromEmployeeMaster(rows?.[0]?.name)
  return n || null
}
