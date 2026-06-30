/**
 * attendance_logs 직원별 조회·병합 — 모바일 버튼 상태·관리자 그리드·submitAttendance 가 동일 규칙 사용.
 */
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  addDayBangkok,
  attendanceStoreNamePostgrestVariantsFilter,
  bangkokDateRangeToUtc,
  todayStrBangkok,
} from '@/lib/attendance-utils'
import {
  normalizeEmployeeCodeForMatch,
  normalizeEmployeeNameForGradeMatch,
} from '@/lib/employee-display-name'

export type AttendanceLogFetchRow = {
  id?: number
  log_at?: string
  log_type?: string
  employee_id?: number | null
  employee_code?: string | null
  name?: string | null
}

export type AttendanceEmployeeMatchTarget = {
  employeeId: number
  employeeCodeNorm: string
  employeeName: string
}

/** 로그 행이 대상 직원 것인지 (employee_id · employee_code · 정규화 이름) */
export function attendanceLogRowMatchesEmployee(
  row: AttendanceLogFetchRow,
  target: AttendanceEmployeeMatchTarget
): boolean {
  const rowEmpId =
    row.employee_id != null && Number.isFinite(Number(row.employee_id))
      ? Math.floor(Number(row.employee_id))
      : 0
  const rowCode = normalizeEmployeeCodeForMatch(String(row.employee_code ?? ''))
  const targetId = target.employeeId > 0 ? target.employeeId : 0
  const targetCode = target.employeeCodeNorm

  if (targetId > 0 && rowEmpId > 0 && rowEmpId === targetId) return true
  if (targetCode && rowCode && rowCode === targetCode) return true

  const targetName = normalizeEmployeeNameForGradeMatch(target.employeeName)
  if (!targetName) return false
  const rowName = normalizeEmployeeNameForGradeMatch(String(row.name ?? ''))
  if (!rowName || rowName.toLowerCase() !== targetName.toLowerCase()) return false
  if (rowEmpId <= 0 || targetId <= 0 || rowEmpId === targetId) return true
  return false
}

function mergeAttendanceLogRows(
  chunks: AttendanceLogFetchRow[][],
  target: AttendanceEmployeeMatchTarget
): AttendanceLogFetchRow[] {
  const seenIds = new Set<number>()
  const seenKeys = new Set<string>()
  const merged: AttendanceLogFetchRow[] = []
  for (const chunk of chunks) {
    for (const r of chunk || []) {
      if (!attendanceLogRowMatchesEmployee(r, target)) continue
      const lid = r.id != null && Number.isFinite(Number(r.id)) ? Math.floor(Number(r.id)) : NaN
      if (!Number.isNaN(lid)) {
        if (seenIds.has(lid)) continue
        seenIds.add(lid)
      } else {
        const k = `${String(r.log_at || '')}|${String(r.log_type || '').trim()}|${String(r.name || '')}`
        if (seenKeys.has(k)) continue
        seenKeys.add(k)
      }
      merged.push(r)
    }
  }
  return merged
}

type FetchParams = {
  storeFilter: string
  employeeName: string
  employeeId?: number
  employeeCode?: string
  /** YYYY-MM-DD — 미지정 시 전날~오늘(방콕) */
  startDate?: string
  endDate?: string
  order?: 'log_at.asc' | 'log_at.desc'
  limit?: number
  select?: string
}

const DEFAULT_SELECT = 'id,log_at,log_type,employee_id,employee_code,name'
const DEFAULT_SELECT_NO_CODE = 'id,log_at,log_type,employee_id,name'

async function selectLogs(
  filter: string,
  opts: { order: 'log_at.asc' | 'log_at.desc'; limit: number; select: string }
): Promise<AttendanceLogFetchRow[]> {
  try {
    return (await supabaseSelectFilter('attendance_logs', filter, opts)) as AttendanceLogFetchRow[]
  } catch (e) {
    const em = e instanceof Error ? e.message : String(e)
    if (!/employee_code|42703|column/i.test(em)) throw e
    const noCode = opts.select.includes('employee_code')
      ? opts.select.replace(/,?employee_code/g, '')
      : opts.select
    return (await supabaseSelectFilter('attendance_logs', filter, {
      ...opts,
      select: noCode || DEFAULT_SELECT_NO_CODE,
    })) as AttendanceLogFetchRow[]
  }
}

/**
 * 직원·매장·기간에 맞는 attendance_logs 병합 조회.
 * employee_code(M0020 등)는 employee_id 유무와 관계없이 동일인으로 인정.
 */
export async function fetchMergedAttendanceLogsForEmployee(
  params: FetchParams
): Promise<AttendanceLogFetchRow[]> {
  const storeFilter = String(params.storeFilter || '').trim()
  const employeeName = String(params.employeeName || '').trim()
  if (!storeFilter || !employeeName) return []

  const employeeId =
    params.employeeId != null && Number.isFinite(Number(params.employeeId))
      ? Math.floor(Number(params.employeeId))
      : 0
  const employeeCodeNorm = normalizeEmployeeCodeForMatch(String(params.employeeCode ?? ''))
  const target: AttendanceEmployeeMatchTarget = {
    employeeId,
    employeeCodeNorm,
    employeeName,
  }

  const todayStr = todayStrBangkok()
  const startDate = (params.startDate || addDayBangkok(todayStr, -1)).trim().slice(0, 10)
  const endDate = (params.endDate || todayStr).trim().slice(0, 10)
  const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startDate, endDate)

  const storeQ = attendanceStoreNamePostgrestVariantsFilter(storeFilter)
  const rangeParts = [
    storeQ,
    `log_at=gte.${encodeURIComponent(startISO)}`,
    `log_at=lt.${encodeURIComponent(endISOExclusive)}`,
  ]
  const order = params.order || 'log_at.desc'
  const limit = params.limit ?? 100
  const select = params.select || DEFAULT_SELECT
  const selectOpts = { order, limit, select }

  const fetches: Promise<AttendanceLogFetchRow[]>[] = []

  if (employeeId > 0) {
    fetches.push(selectLogs([...rangeParts, `employee_id=eq.${employeeId}`].join('&'), selectOpts))
  }
  if (employeeCodeNorm) {
    fetches.push(
      selectLogs(
        [...rangeParts, `employee_code=eq.${encodeURIComponent(employeeCodeNorm)}`].join('&'),
        selectOpts
      )
    )
  }
  fetches.push(
    selectLogs(
      [...rangeParts, `name=ilike.${encodeURIComponent(employeeName)}`].join('&'),
      selectOpts
    )
  )

  const chunks = await Promise.all(fetches)
  const merged = mergeAttendanceLogRows(chunks, target)
  merged.sort((a, b) => {
    const cmp = String(a.log_at || '').localeCompare(String(b.log_at || ''))
    return order === 'log_at.desc' ? -cmp : cmp
  })
  return merged
}
