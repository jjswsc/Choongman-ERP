import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import {
  ATTENDANCE_LOG_ADMIN_GRID_COLS,
  ATTENDANCE_LOG_ADMIN_GRID_COLS_NO_CODE,
} from '@/lib/postgrest-narrow-select'
import {
  attendanceStoreNamePostgrestFilter,
  attendanceStoreNamePostgrestFilterFragments,
  bangkokDateRangeToUtc,
  parsePlanToMinutes,
  plannedWorkMinutesFromPlans,
  resolveScheduleForEmployeeDay,
  scheduleDateKey,
} from '@/lib/attendance-utils'
import { resolveAttendanceEmployeeIdentity } from '@/lib/attendance-employee-resolve-server'
import { attendanceLogRowMatchesEmployee } from '@/lib/attendance-log-fetch-server'
import { otMinutesForPayroll } from '@/lib/payroll-utils'
import {
  buildAttendanceDisplayMapsFromEmployees,
  normalizeEmployeeCodeForMatch,
  normalizeEmployeeNameForGradeMatch,
  resolveEmployeeDisplayNameForAttendanceGrid,
} from '@/lib/employee-display-name'
import { requireAuth } from '@/lib/verify-auth'
import { hasOfficeStaffScope, isManagerOrFranchiseeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import {
  appendSaasTenantFilter,
  isSaasTenantQueryBlocked,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'

const TZ = 'Asia/Bangkok'

/** log_at(UTC ISO) → 방콕 기준 날짜 YYYY-MM-DD */
function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: TZ })
}

/** log_at(UTC ISO) → 방콕 기준 시간 HH:mm */
function toTimeStr(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
}

/** log_at(UTC ISO) → 방콕 기준 시간 HH:mm:ss (출근=퇴근 여부 확인용) */
function toTimeStrWithSec(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

/** 방콕 기준 날짜(YYYY-MM-DD)에서 N일 더한 날짜 */
function addDay(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** log_at(ISO) → 방콕 기준 시각의 시(hour) 0~23 */
function getBangkokHour(iso: string): number {
  if (!iso) return 12
  const d = new Date(iso)
  const str = d.toLocaleTimeString('en-US', { timeZone: TZ, hour: '2-digit', hour12: false })
  return parseInt(str, 10) || 0
}

/** log_at(ISO) → 방콕 기준 분(minute of day) 0~1439 */
function getBangkokMinuteOfDay(iso: string): number {
  if (!iso) return 0
  const d = new Date(iso)
  const hh = d.toLocaleTimeString('en-US', { timeZone: TZ, hour: '2-digit', hour12: false })
  const mm = d.toLocaleTimeString('en-US', { timeZone: TZ, minute: '2-digit', hour12: false })
  const h = parseInt(hh, 10)
  const m = parseInt(mm, 10)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return Math.max(0, Math.min(23, h)) * 60 + Math.max(0, Math.min(59, m))
}

/** Mr./Ms./Mrs./Miss 접두어 제거 - 스케줄·근태 이름 매칭용 */
function normalizeNameForSchedule(name: string): string {
  return normalizeEmployeeNameForGradeMatch(name)
}

export interface AttendanceDailyRow {
  date: string
  store: string
  name: string
  employeeId?: number
  employeeCode?: string
  inTimeStr: string
  outTimeStr: string
  breakMin: number
  breakOverMin: number
  actualWorkHrs: number
  plannedWorkHrs: number
  diffMin: number
  lateMin: number
  lateBeforeMin?: number
  lateAfterMin?: number
  earlyMin?: number
  earlyBeforeMin?: number
  earlyAfterMin?: number
  otMin: number
  otBeforeMin?: number
  otAfterMin?: number
  status: string
  approval: string
  /** @deprecated use pendingInId/pendingOutId */
  pendingId: number | null
  pendingInId: number | null
  pendingOutId: number | null
  /** 출근 로그 id (승인 여부 무관, 지각 조정 반영 시 사용) */
  inLogId?: number | null
  /** 퇴근 로그 id (승인 여부 무관, 조정 반영 시 사용) */
  outLogId: number | null
  inStatus?: string
  /** 파트타임/시급이면 계획 0이어도 빨간 행 표시 안 함 */
  isPartTime?: boolean
}

export const dynamic = 'force-dynamic' // 조정 반영 후 최신 데이터 조회를 위해 캐시 비활성화

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    authResult.errorResponse.headers.set('Cache-Control', 'no-store, max-age=0')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const tenantScope = await resolveSaasTenantScope({ auth })
  if (isSaasTenantQueryBlocked(tenantScope, 'employees')) {
    return NextResponse.json([], { headers })
  }
  const { searchParams } = new URL(request.url)
  const startDate = String(searchParams.get('startDate') || searchParams.get('start') || '').trim()
  const endDate = String(searchParams.get('endDate') || searchParams.get('end') || '').trim()
  let storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  let employeeFilter = String(searchParams.get('employeeFilter') || searchParams.get('employee') || searchParams.get('name') || '').trim()
  const queryEmployeeIdRaw = String(searchParams.get('employeeId') || '').trim()
  let employeeIdFilter =
    queryEmployeeIdRaw && Number.isFinite(Number(queryEmployeeIdRaw)) ? Math.floor(Number(queryEmployeeIdRaw)) : 0
  const employeeCodeNorm = normalizeEmployeeCodeForMatch(
    String(
      searchParams.get('employeeCode') ||
        searchParams.get('code') ||
        auth.employeeCode ||
        ''
    ).trim()
  )
  const statusFilter = String(searchParams.get('statusFilter') || searchParams.get('status') || 'all').trim()
  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').toLowerCase()
  const allowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(userStore)
  if (storeFilter === 'null' || storeFilter === 'undefined') storeFilter = ''
  if (employeeFilter === 'null' || employeeFilter === 'undefined') employeeFilter = ''

  if (!startDate || !endDate) {
    return NextResponse.json([], { headers })
  }

  const startStr = startDate.slice(0, 10)
  const endStr = endDate.slice(0, 10)
  /** 전일 미퇴근 마감 퇴근을 전날 행에 붙이려면 하루 전 로그가 필요함 (getPayrollCalc buildAttendanceSummary와 동일 취지) */
  const fetchStartStr = addDay(startStr, -1)
  const { startISO } = bangkokDateRangeToUtc(fetchStartStr, endStr)
  // 자정 넘김 퇴근(익일 00:00~06:59 방콕) 포함: log_at 조회 끝을 익일 07:00 방콕(= 익일 00:00 UTC)까지 연장
  const logEndISOExclusive = addDay(endStr, 1) + 'T00:00:00.000Z'

  const isAllStores = !storeFilter || storeFilter === 'All' || storeFilter.toLowerCase() === 'all' || storeFilter === '전체' || storeFilter === '전체 매장'
  const isAllEmployeesByName = !employeeFilter || employeeFilter === 'All' || employeeFilter === '전체 직원'
  const pendingOnly = statusFilter === 'pending'

  /** 본사·회계: 쿼리(매장·직원) 필터 그대로. 매장 관리자: 허용 매장 내. 그 외(Staff 등): 본인만(로그인 session 기준) */
  const isWideAccess = hasOfficeStaffScope(userRole, userStore)
  const isManagerScope = !isWideAccess && isManagerOrFranchiseeRole(userRole)
  if (isManagerScope) {
    const authEmployeeIdRaw = Number((auth as { employeeId?: unknown }).employeeId)
    const authEmployeeId =
      Number.isFinite(authEmployeeIdRaw) && authEmployeeIdRaw > 0 ? Math.floor(authEmployeeIdRaw) : 0
    employeeFilter = String(auth.name || '').trim()
    employeeIdFilter = authEmployeeId
    if (!storeFilter || storeFilter === 'All' || storeFilter.toLowerCase() === 'all' || storeFilter === '전체' || storeFilter === '전체 매장') {
      const fallbackStore = String(allowedStores[0] || '').trim()
      if (!fallbackStore) return NextResponse.json([], { status: 403, headers })
      storeFilter = fallbackStore
    } else {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, storeFilter))
      if (!allowed) return NextResponse.json([], { status: 403, headers })
    }
  } else if (!isWideAccess) {
    const authEmployeeIdRaw = Number((auth as { employeeId?: unknown }).employeeId)
    const authEmployeeId =
      Number.isFinite(authEmployeeIdRaw) && authEmployeeIdRaw > 0 ? Math.floor(authEmployeeIdRaw) : 0
    const sessionName = String(employeeFilter || auth.name || '').trim()
    if (!sessionName || !userStore) {
      return NextResponse.json([], { status: 403, headers })
    }
    employeeFilter = sessionName
    employeeIdFilter = authEmployeeId > 0 ? authEmployeeId : employeeIdFilter
    storeFilter = userStore
  }
  const hasEmployeeIdFilter = employeeIdFilter > 0
  const isAllEmployees = !hasEmployeeIdFilter && isAllEmployeesByName

  try {
    type AttRow = {
      id?: number
      log_at?: string
      store_name?: string
      name?: string
      employee_id?: number | null
      employee_code?: string | null
      log_type?: string
      late_min?: number
      early_min?: number
      ot_min?: number
      break_min?: number
      status?: string
      approved?: string
    }

    // 급여(getPayrollCalc)와 동일 구간의 로그를 모두 수집. limit 2000만 쓰면 log_at.asc 앞쪽 행만 오고
    // 직원 필터는 루프에서 적용되어 말일·특정 직원 행이 누락될 수 있음(지각 공제는 있는데 근태 표에 없음).
    const attGridPage = {
      order: 'log_at.asc' as const,
      pageSize: 2500,
      maxRows: 120_000,
    }
    const fetchAttGrid = async (filter: string): Promise<AttRow[]> => {
      try {
        return (await supabaseSelectFilterAllPages('attendance_logs', filter, {
          ...attGridPage,
          select: ATTENDANCE_LOG_ADMIN_GRID_COLS,
        })) as AttRow[]
      } catch (e) {
        const em = e instanceof Error ? e.message : String(e)
        if (!/employee_code|42703|column/i.test(em)) throw e
        return (await supabaseSelectFilterAllPages('attendance_logs', filter, {
          ...attGridPage,
          select: ATTENDANCE_LOG_ADMIN_GRID_COLS_NO_CODE,
        })) as AttRow[]
      }
    }
    const mergeAttByLogId = (chunks: AttRow[][]): AttRow[] => {
      const seenLogIds = new Set<number>()
      const merged: AttRow[] = []
      for (const chunk of chunks) {
        for (const r of chunk || []) {
          const lid = r.id != null && Number.isFinite(Number(r.id)) ? Math.floor(Number(r.id)) : NaN
          if (!Number.isNaN(lid)) {
            if (seenLogIds.has(lid)) continue
            seenLogIds.add(lid)
          }
          merged.push(r)
        }
      }
      merged.sort((a, b) => String(a.log_at || '').localeCompare(String(b.log_at || '')))
      return merged
    }

    let effectiveEmployeeId = employeeIdFilter
    let effectiveEmployeeFilter = employeeFilter
    let effectiveEmployeeCodeNorm = employeeCodeNorm
    const employeeCodeRaw = String(
      searchParams.get('employeeCode') || searchParams.get('code') || auth.employeeCode || ''
    ).trim()

    if (!isAllEmployees) {
      const resolved = await resolveAttendanceEmployeeIdentity({
        storeName: storeFilter || userStore,
        name: effectiveEmployeeFilter || String(auth.name || '').trim(),
        ...(effectiveEmployeeId > 0 ? { employeeId: effectiveEmployeeId } : {}),
        ...(employeeCodeRaw ? { employeeCode: employeeCodeRaw } : {}),
      })
      if (resolved.employeeId > 0) effectiveEmployeeId = resolved.employeeId
      if (resolved.employeeName) effectiveEmployeeFilter = resolved.employeeName
      if (resolved.employeeCodeNorm) effectiveEmployeeCodeNorm = resolved.employeeCodeNorm
    }

    const employeeMatchTarget = {
      employeeId: effectiveEmployeeId,
      employeeCodeNorm: effectiveEmployeeCodeNorm,
      employeeName: effectiveEmployeeFilter,
    }
    const effHasEmployeeId = effectiveEmployeeId > 0
    const effHasEmployeeCode = effectiveEmployeeCodeNorm.length > 0

    const dateRangeParts = [
      `log_at=gte.${encodeURIComponent(startISO)}`,
      `log_at=lt.${encodeURIComponent(logEndISOExclusive)}`,
    ]
    const storeFragments =
      !isAllStores && storeFilter ? attendanceStoreNamePostgrestFilterFragments(storeFilter) : []
    const attLogBases = (): string[][] => {
      if (storeFragments.length === 0) return [dateRangeParts]
      return storeFragments.map((sf) => [sf, ...dateRangeParts])
    }
    const fetchAttGridForEmployeeParts = async (employeeParts: string[]): Promise<AttRow[]> => {
      const chunks: AttRow[][] = []
      for (const ep of employeeParts) {
        for (const base of attLogBases()) {
          chunks.push(await fetchAttGrid([...base, ep].join('&')))
        }
      }
      return mergeAttByLogId(chunks)
    }

    let attRows: AttRow[]
    if (effHasEmployeeId && effectiveEmployeeFilter.trim()) {
      const trimmedName = effectiveEmployeeFilter.trim()
      const employeeParts = [
        `employee_id=eq.${effectiveEmployeeId}`,
        `name=eq.${encodeURIComponent(trimmedName)}&employee_id=is.null`,
      ]
      if (effHasEmployeeCode) {
        employeeParts.push(`employee_code=eq.${encodeURIComponent(effectiveEmployeeCodeNorm)}`)
      }
      attRows = await fetchAttGridForEmployeeParts(employeeParts)
    } else if (effHasEmployeeId) {
      const employeeParts = [`employee_id=eq.${effectiveEmployeeId}`]
      if (effHasEmployeeCode) {
        employeeParts.push(`employee_code=eq.${encodeURIComponent(effectiveEmployeeCodeNorm)}`)
      }
      attRows = await fetchAttGridForEmployeeParts(employeeParts)
    } else {
      const employeeParts: string[] = []
      if (!isAllEmployeesByName && effectiveEmployeeFilter) {
        employeeParts.push(`name=eq.${encodeURIComponent(effectiveEmployeeFilter)}`)
      }
      if (employeeParts.length === 0) {
        const chunks: AttRow[][] = []
        for (const base of attLogBases()) {
          chunks.push(await fetchAttGrid(base.join('&')))
        }
        attRows = mergeAttByLogId(chunks)
      } else {
        attRows = await fetchAttGridForEmployeeParts(employeeParts)
      }
    }

    // 조정 이력(원본 보존): 최초 before + 최신 after를 log_id/metric 별로 구성
    const firstBeforeByMetricKey: Record<string, number> = {}
    const latestAfterByMetricKey: Record<string, number> = {}
    const attLogIds = Array.from(
      new Set(
        (attRows || [])
          .map((r) => (r.id != null && Number.isFinite(Number(r.id)) ? Math.floor(Number(r.id)) : 0))
          .filter((n) => n > 0)
      )
    )
    if (attLogIds.length > 0) {
      const chunkSize = 180
      type AdjRow = {
        attendance_log_id?: number | null
        metric?: string | null
        before_value?: number | null
        after_value?: number | null
        changed_at?: string | null
      }
      const adjRowsAll: AdjRow[] = []
      for (let i = 0; i < attLogIds.length; i += chunkSize) {
        const chunk = attLogIds.slice(i, i + chunkSize)
        const filter = `attendance_log_id=in.(${chunk.join(',')})`
        try {
          const rows = (await supabaseSelectFilter('attendance_log_adjustments', filter, {
            select: 'attendance_log_id,metric,before_value,after_value,changed_at',
            order: 'changed_at.asc',
            limit: 5000,
          })) as AdjRow[]
          adjRowsAll.push(...(rows || []))
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          // 운영 전환 중(테이블 미생성)에는 조용히 폴백
          if (!/attendance_log_adjustments|42P01|relation/i.test(msg)) throw e
          break
        }
      }
      for (const a of adjRowsAll) {
        const lid =
          a.attendance_log_id != null && Number.isFinite(Number(a.attendance_log_id))
            ? Math.floor(Number(a.attendance_log_id))
            : 0
        const metric = String(a.metric || '').trim()
        if (lid <= 0 || !['late_min', 'early_min', 'ot_min'].includes(metric)) continue
        const b =
          a.before_value != null && Number.isFinite(Number(a.before_value))
            ? Math.max(0, Math.min(9999, Math.round(Number(a.before_value))))
            : null
        const af =
          a.after_value != null && Number.isFinite(Number(a.after_value))
            ? Math.max(0, Math.min(9999, Math.round(Number(a.after_value))))
            : null
        const k = `${lid}|${metric}`
        if (b != null && firstBeforeByMetricKey[k] == null) firstBeforeByMetricKey[k] = b
        if (af != null) latestAfterByMetricKey[k] = af
      }
    }
    const hasMetricAdjustment = (
      logId: number | null | undefined,
      metric: 'late_min' | 'early_min' | 'ot_min'
    ) => {
      if (!logId || logId <= 0) return false
      const k = `${logId}|${metric}`
      return firstBeforeByMetricKey[k] != null || latestAfterByMetricKey[k] != null
    }
    const metricBefore = (logId: number | null | undefined, metric: 'late_min' | 'early_min' | 'ot_min', fallback: number) => {
      if (!logId || logId <= 0) return fallback
      const k = `${logId}|${metric}`
      return firstBeforeByMetricKey[k] != null ? Number(firstBeforeByMetricKey[k]) : fallback
    }
    const metricAfter = (logId: number | null | undefined, metric: 'late_min' | 'early_min' | 'ot_min', fallback: number) => {
      if (!logId || logId <= 0) return fallback
      const k = `${logId}|${metric}`
      return latestAfterByMetricKey[k] != null ? Number(latestAfterByMetricKey[k]) : fallback
    }

    /** 파트타임/시급 식별 + 직원코드 맵 + 그리드 표시명(Mr./Ms. + name) */
    const partTimeKeys = new Set<string>()
    const codeByStoreName: Record<string, string> = {}
    const codeByEmployeeId: Record<number, string> = {}
    let displayByEmployeeId: Record<number, string> = {}
    let displayByStoreAndBareName: Record<string, string> = {}
    try {
      const empRows = (await supabaseSelectFilter('employees', appendSaasTenantFilter('id=gt.0', tenantScope, 'employees'), {
        select: 'id,store,name,name_title,nick,job,sal_type,employee_code',
        limit: 5000,
      })) as {
        id?: number
        store?: string
        name?: string
        name_title?: string | null
        nick?: string | null
        job?: string
        sal_type?: string
        employee_code?: string | null
      }[]
      const maps = buildAttendanceDisplayMapsFromEmployees(empRows)
      displayByEmployeeId = maps.displayByEmployeeId
      displayByStoreAndBareName = maps.displayByStoreAndBareName
      const partTimeSal = /시급|hourly|hour|part-time|part\s*time/i
      const partTimeJob = /part|파트|part-time/i
      for (const e of empRows || []) {
        const store = String(e.store || '').trim()
        const nm = String(e.name || '').trim()
        if (!store || !nm) continue
        const code = String(e.employee_code || '')
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .slice(0, 5)
        const eid = e.id != null && Number.isFinite(Number(e.id)) ? Math.floor(Number(e.id)) : 0
        if (code) {
          codeByStoreName[`${store}|${nm}`] = code
          const nmNorm = normalizeNameForSchedule(nm)
          if (nmNorm) codeByStoreName[`${store}|${nmNorm}`] = code
          if (eid > 0) codeByEmployeeId[eid] = code
        }
        const job = String(e.job || '').trim()
        const salType = String(e.sal_type || '').trim()
        const isPart = partTimeSal.test(salType) || partTimeJob.test(job)
        if (isPart) {
          partTimeKeys.add(`${store}|${nm}`)
          partTimeKeys.add(`${store}|${normalizeNameForSchedule(nm)}`)
        }
      }
    } catch { /* ignore */ }

    type SchRow = {
      schedule_date?: string
      store_name?: string
      name?: string
      employee_id?: number | null
      plan_in?: string
      plan_out?: string
      break_start?: string
      break_end?: string
      plan_in_prev_day?: boolean
    }
    const scheduleMap: Record<string, SchRow> = {}
    /** schedules: 고정 limit는 데이터 증가 시 항상 부족 → Range 페이지로 전부 수집. 매장 필터로 트래픽·메모리 절감 */
    const schParts = [`schedule_date=gte.${startStr}`, `schedule_date=lte.${endStr.slice(0, 10)}`]
    if (!isAllStores && storeFilter) {
      schParts.push(attendanceStoreNamePostgrestFilter(storeFilter))
    }
    const schFilter = schParts.join('&')
    const schRows = (await supabaseSelectFilterAllPages('schedules', schFilter, {
      order: 'schedule_date.asc',
      pageSize: 8000,
      maxRows: 2_000_000,
    })) as SchRow[]
    for (const s of schRows || []) {
      const d = scheduleDateKey(s.schedule_date)
      const store = String(s.store_name || '').trim()
      const nm = String(s.name || '').trim()
      if (d && store && nm) {
        const sid =
          s.employee_id != null && Number.isFinite(Number(s.employee_id))
            ? Math.floor(Number(s.employee_id))
            : 0
        if (sid > 0) scheduleMap[`${d}|${store}|#${sid}`] = s
        scheduleMap[`${d}|${store}|${nm}`] = s
        const nmNorm = normalizeNameForSchedule(nm)
        if (nmNorm !== nm) scheduleMap[`${d}|${store}|${nmNorm}`] = s
      }
    }

    const byKey: Record<
      string,
      {
        date: string
        store: string
        name: string
        employeeId: number
        inTime: string | null
        outTime: string | null
        breakMin: number
        lateMin: number
        /** 퇴근 로그 early_min (NULL=미설정·계산값 사용, 0=조정으로 면제) */
        earlyMinFromDb: number | null
        otMin: number | null // null = DB에 미설정, 계산값 사용
        status: string
        approval: string
        inId: number | null
        /** 당일 출근 로그 id (지각 분 조정·표시용, 승인 여부와 무관) */
        inLogId: number | null
        outId: number | null
        outLogId: number | null
        outApproved: string
        inStatus: string
        breakSeen: Set<string>
      }
    > = {}

    for (const r of attRows || []) {
      const rowDate = toDateStr(r.log_at)
      const type = String(r.log_type || '').trim()
      const logAt = r.log_at || ''
      if (!rowDate || rowDate < fetchStartStr) continue
      // 조회 구간 밖 날짜: 익일 새벽 퇴근(자정 넘김)만 허용 → 전날 행에 붙이기 위함
      if (rowDate > endStr) {
        const isOvernightOutForRange = type === '퇴근' && getBangkokHour(logAt) <= 7 && rowDate === addDay(endStr, 1)
        if (!isOvernightOutForRange) continue
      }
      const rowStore = String(r.store_name || '').trim()
      const name = String(r.name || '').trim()
      if (!isAllEmployees && !attendanceLogRowMatchesEmployee(r, employeeMatchTarget)) continue

      const eid =
        r.employee_id != null && Number.isFinite(Number(r.employee_id)) ? Math.floor(Number(r.employee_id)) : 0
      const key = eid > 0 ? `${rowDate}|${rowStore}|#${eid}` : `${rowDate}|${rowStore}|${name}`
      if (!byKey[key]) {
        byKey[key] = {
          date: rowDate,
          store: rowStore,
          name,
          employeeId: eid,
          inTime: null,
          outTime: null,
          breakMin: 0,
          lateMin: 0,
          earlyMinFromDb: null,
          otMin: null,
          status: '',
          approval: '대기',
          inId: null,
          inLogId: null,
          outId: null,
          outLogId: null,
          outApproved: '',
          inStatus: '',
          breakSeen: new Set<string>(),
        }
      }
      const rec = byKey[key]
      const approved = String(r.approved || '').trim()
      const st = String(r.status || '').trim()
      const isGpsOrForced = /위치미확인|승인대기|강제퇴근/.test(st)
      const needsInApproval = approved === '대기' && (isGpsOrForced || (Number(r.late_min) || 0) > 0)
      const needsOutApproval = approved === '대기' && (isGpsOrForced || (Number(r.ot_min) || 0) > 0 || (Number(r.early_min) || 0) > 0)

      if (type === '출근') {
        if (!rec.inTime || logAt < (rec.inTime || '')) {
          rec.inTime = logAt
          rec.lateMin = Number(r.late_min) || 0
          rec.inLogId = r.id != null ? Number(r.id) : null
          if (needsInApproval) {
            rec.inId = r.id ?? null
            rec.inStatus = st || ''
          }
        }
      } else if (type === '퇴근') {
        const bangkokHour = getBangkokHour(logAt)
        const isOvernightOut = bangkokHour <= 7
        const prevDayKey = eid > 0 ? `${addDay(rowDate, -1)}|${rowStore}|#${eid}` : `${addDay(rowDate, -1)}|${rowStore}|${name}`
        const prevRec = byKey[prevDayKey]

        if (isOvernightOut && prevRec?.inTime && !prevRec.outTime) {
          prevRec.outTime = logAt
          prevRec.earlyMinFromDb =
            r.early_min != null && Number.isFinite(Number(r.early_min))
              ? Math.round(Number(r.early_min))
              : null
          prevRec.otMin = r.ot_min != null ? Number(r.ot_min) : null
          prevRec.status = st || prevRec.status
          prevRec.outApproved = approved || ''
          if (needsOutApproval) prevRec.outId = r.id ?? null
          prevRec.outLogId = r.id ?? null
        } else if (!isOvernightOut && (!rec.outTime || logAt > (rec.outTime || ''))) {
          rec.outTime = logAt
          rec.earlyMinFromDb =
            r.early_min != null && Number.isFinite(Number(r.early_min))
              ? Math.round(Number(r.early_min))
              : null
          rec.otMin = r.ot_min != null ? Number(r.ot_min) : null
          rec.status = st || rec.status
          rec.outApproved = approved || ''
          if (needsOutApproval) rec.outId = r.id ?? null
          rec.outLogId = r.id ?? null
        }
      } else if (type === '휴식종료') {
        const breakLogKey = `${String(logAt).slice(0, 19)}|${Number(r.break_min) || 0}`
        if (!rec.breakSeen.has(breakLogKey)) {
          rec.breakSeen.add(breakLogKey)
          rec.breakMin += Number(r.break_min) || 0
        }
      }
    }

    // 익일 아침에 찍힌 "전일 세션 마감" 퇴근이 당일 버킷에 출근보다 먼저 잡히는 경우 → 전날로 이동 (급여 집계와 동일)
    for (const rec of Object.values(byKey)) {
      if (!rec.outTime) continue
      const inMs = rec.inTime ? new Date(rec.inTime).getTime() : NaN
      const outMs = new Date(rec.outTime).getTime()
      const shouldCarryToPrev =
        Number.isFinite(outMs) &&
        (!rec.inTime || (Number.isFinite(inMs) && outMs < inMs))
      if (!shouldCarryToPrev) continue
      const prevKey =
        rec.employeeId > 0
          ? `${addDay(rec.date, -1)}|${rec.store}|#${rec.employeeId}`
          : `${addDay(rec.date, -1)}|${rec.store}|${rec.name}`
      const prevRec = byKey[prevKey]
      if (!prevRec?.inTime || prevRec.outTime) continue
      prevRec.outTime = rec.outTime
      prevRec.earlyMinFromDb = rec.earlyMinFromDb
      prevRec.otMin = rec.otMin
      if (rec.status) prevRec.status = rec.status
      prevRec.outApproved = rec.outApproved
      prevRec.outId = rec.outId
      prevRec.outLogId = rec.outLogId
      prevRec.breakMin += rec.breakMin
      rec.outTime = null
      rec.earlyMinFromDb = null
      rec.otMin = null
      rec.status = ''
      rec.outApproved = ''
      rec.outId = null
      rec.outLogId = null
      rec.breakMin = 0
    }

    const result: AttendanceDailyRow[] = []
    for (const rec of Object.values(byKey)) {
      if (rec.date < startStr || rec.date > endStr) continue
      if (!rec.inTime) continue
      const dateForRow = rec.date
      const inTimeForRow = rec.inTime
      let outTimeForRow = rec.outTime
      let breakMinForRow = rec.breakMin
      const lateMinForRow = rec.lateMin
      let earlyMinDb = rec.earlyMinFromDb
      let otMinForRow = rec.otMin
      let statusForRow = rec.status
      let outApprovedForRow = rec.outApproved
      let outIdForRow = rec.outId
      let outLogIdForRow = rec.outLogId
      const inIdForRow = rec.inId
      const inLogIdForRow = rec.inLogId
      const inStatusForRow = rec.inStatus || ''

      if (!outTimeForRow) {
        const nextDay = (() => {
          const d = new Date(rec.date + 'T12:00:00')
          d.setDate(d.getDate() + 1)
          return d.toISOString().slice(0, 10)
        })()
        const nextKey =
          rec.employeeId > 0
            ? `${nextDay}|${rec.store}|#${rec.employeeId}`
            : `${nextDay}|${rec.store}|${rec.name}`
        const nextRec = byKey[nextKey]
        if (nextRec && nextRec.outTime && !nextRec.inTime) {
          outTimeForRow = nextRec.outTime
          earlyMinDb = nextRec.earlyMinFromDb
          otMinForRow = nextRec.otMin
          statusForRow = nextRec.status || ''
          outApprovedForRow = nextRec.outApproved
          outIdForRow = nextRec.outId
          outLogIdForRow = nextRec.outLogId
          breakMinForRow += nextRec.breakMin
          // 자정 넘김 근무: 행은 출근한 날(오늘) 기준 유지, 퇴근만 익일 기록 사용
        }
      }

      let actualWorkMin = 0
      if (inTimeForRow && outTimeForRow) {
        const inMs = new Date(inTimeForRow).getTime()
        const outMs = new Date(outTimeForRow).getTime()
        actualWorkMin = Math.max(0, Math.floor((outMs - inMs) / 60000) - breakMinForRow)
      }

      const sch = resolveScheduleForEmployeeDay(
        dateForRow,
        rec.store,
        rec.employeeId,
        rec.name,
        scheduleMap,
        actualWorkMin,
        'payroll'
      )
      const planIn = sch?.plan_in || ''
      const planOut = sch?.plan_out || ''
      const planBS = sch?.break_start || ''
      const planBE = sch?.break_end || ''
      const planInPrevDay = !!sch?.plan_in_prev_day
      const plannedWorkMin = sch
        ? plannedWorkMinutesFromPlans(planIn, planOut, planBS, planBE, planInPrevDay)
        : 0
      const plannedBreakMin =
        sch && parsePlanToMinutes(planBE) > parsePlanToMinutes(planBS)
          ? Math.max(0, parsePlanToMinutes(planBE) - parsePlanToMinutes(planBS))
          : 0
      const plannedWorkHrs = Math.round((plannedWorkMin / 60) * 100) / 100
      const actualWorkHrs = actualWorkMin / 60
      const diffMin = Math.round(actualWorkMin - plannedWorkMin)
      const breakOverMin = Math.max(0, Math.round(breakMinForRow - plannedBreakMin))

      const approval = outTimeForRow ? (outApprovedForRow || '대기') : '대기'
      const isPending = inIdForRow != null || outIdForRow != null
      const outAppr = String(outApprovedForRow || '').trim()
      const approvedOut = outAppr === '승인완료' || outAppr === '승인'
      const statusStr = String(statusForRow || '').trim()
      const hasLateAdjustment = hasMetricAdjustment(inLogIdForRow ?? null, 'late_min')
      // 실제 근무시간이 0이면 지각 의미 없음. 늦게 퇴근해 diff>0이어도 출근 지각 분은 별도 유지(OT와 상쇄하지 않음)
      const rawLateMin = actualWorkMin <= 0 ? 0 : lateMinForRow
      const planInMin = parsePlanToMinutes(planIn)
      const inMinuteOfDay = getBangkokMinuteOfDay(inTimeForRow)
      const lateFromPlan =
        plannedWorkMin > 0 && planInMin > 0
          ? Math.max(0, inMinuteOfDay - planInMin)
          : 0
      // DB late_min이 0/미설정이면서 조정 이력도 없으면, 스케줄 plan_in 기준으로 지각분을 보정.
      const effectiveLateMin =
        rawLateMin > 0 || hasLateAdjustment ? rawLateMin : lateFromPlan
      // 조퇴 기본값은 "총 부족분 - 지각분"으로 산출해 지각이 조퇴 칸으로 중복 집계되지 않게 한다.
      const computedEarlyMin =
        plannedWorkMin > 0 && diffMin < 0
          ? Math.max(0, Math.abs(diffMin) - effectiveLateMin)
          : 0
      const hasEarlyAdjustment = hasMetricAdjustment(outLogIdForRow ?? null, 'early_min')
      const hasEarlyOverride =
        (earlyMinDb != null && Number.isFinite(earlyMinDb) && Number(earlyMinDb) > 0) || hasEarlyAdjustment
      /** 퇴근 승인 후 DB early_min은 "조정값"이 있을 때만 우선 적용(기본 0 오인 방지). */
      const useDbEarly =
        approvedOut &&
        statusStr.includes('정상(승인)') &&
        plannedWorkMin > 0 &&
        diffMin < 0 &&
        hasEarlyOverride &&
        earlyMinDb != null &&
        Number.isFinite(earlyMinDb)
      const displayEarlyMin = useDbEarly
        ? Math.min(Math.max(0, Math.round(earlyMinDb as number)), computedEarlyMin)
        : computedEarlyMin

      // 연장: 차이가 음수(조퇴)면 OT 없음.
      // DB ot_min=0이 "기본값(미조정)"일 수 있어, 조정 이력/승인 상태가 없으면 diff 기반 계산을 우선한다.
      const hasOtAdjustment = hasMetricAdjustment(outLogIdForRow ?? null, 'ot_min')
      const otFromDb =
        otMinForRow != null && Number.isFinite(Number(otMinForRow))
          ? Math.max(0, Math.round(Number(otMinForRow)))
          : null
      const shouldUseDbOt =
        otFromDb != null &&
        (otFromDb > 0 || hasOtAdjustment || approvedOut)
      const effectiveOtMinRaw =
        actualWorkMin <= 0 || plannedWorkMin <= 0 || diffMin < 0
          ? 0
          : shouldUseDbOt
            ? (otFromDb as number)
            : Math.max(0, diffMin)
      // 급여 기준과 동일: OT 30분 미만은 0분으로 표시/반영
      const displayOtMin = diffMin < 0 ? 0 : otMinutesForPayroll(Math.max(0, effectiveOtMinRaw))

      if (pendingOnly && !isPending) continue

      // 상태 표시: 퇴근 승인·정상(승인)이면 DB 상태 유지(조정 반영 후에도 조퇴로 덮어쓰지 않음). 그 외 차이 음수→조퇴 등
      const displayStatus =
        !outTimeForRow
          ? '퇴근미기록'
          : (statusForRow && String(statusForRow).includes('강제퇴근(승인)'))
            ? statusForRow
            : approvedOut && statusStr.includes('정상(승인)')
              ? statusForRow
              : diffMin < 0
                ? '조퇴'
                : displayOtMin >= 30
                  ? '연장'
                  : statusForRow === '조퇴'
                    ? '정상'
                    : statusForRow

      const isPartTime =
        partTimeKeys.has(`${rec.store}|${rec.name}`) ||
        partTimeKeys.has(`${rec.store}|${normalizeNameForSchedule(rec.name)}`)
      // 출근·퇴근이 동일하게 보이면(같은 분 또는 실제 동일) 초까지 표시해 오입력/앱 버그 확인 가능하도록
      const inStr = toTimeStr(inTimeForRow)
      const outStr = outTimeForRow ? toTimeStr(outTimeForRow) : '-'
      const sameMinute = outTimeForRow && inStr === outStr
      const lateBeforeMin = metricBefore(inLogIdForRow ?? null, 'late_min', effectiveLateMin)
      const lateAfterMin = metricAfter(inLogIdForRow ?? null, 'late_min', effectiveLateMin)
      const earlyBeforeMin = metricBefore(outLogIdForRow ?? null, 'early_min', displayEarlyMin)
      const earlyAfterMin = metricAfter(outLogIdForRow ?? null, 'early_min', displayEarlyMin)
      // OT 전(before): 실제(원시) 분, OT 후(after): 급여 기준(30분 미만 0)으로 표시
      const otBeforeRaw = metricBefore(outLogIdForRow ?? null, 'ot_min', effectiveOtMinRaw)
      const otAfterRaw = metricAfter(outLogIdForRow ?? null, 'ot_min', effectiveOtMinRaw)
      const otBeforeMin = Math.max(0, Math.round(otBeforeRaw))
      const otAfterMin = otMinutesForPayroll(Math.max(0, otAfterRaw))
      result.push({
        date: dateForRow,
        store: rec.store,
        name: resolveEmployeeDisplayNameForAttendanceGrid(
          rec.store,
          rec.name,
          rec.employeeId,
          displayByEmployeeId,
          displayByStoreAndBareName
        ),
        ...(rec.employeeId > 0 ? { employeeId: rec.employeeId } : {}),
        ...(() => {
          const c0 = rec.employeeId > 0 ? codeByEmployeeId[rec.employeeId] || '' : ''
          const c1 = codeByStoreName[`${rec.store}|${rec.name}`] || ''
          const code = (c0 || c1).trim()
          return code ? { employeeCode: code } : {}
        })(),
        inTimeStr: sameMinute ? toTimeStrWithSec(inTimeForRow) : inStr,
        outTimeStr: outTimeForRow ? (sameMinute ? toTimeStrWithSec(outTimeForRow) : outStr) : '-',
        breakMin: breakMinForRow,
        breakOverMin,
        actualWorkHrs: Math.round(actualWorkHrs * 100) / 100,
        plannedWorkHrs: Math.round(plannedWorkHrs * 100) / 100,
        diffMin,
        lateMin: effectiveLateMin,
        lateBeforeMin,
        lateAfterMin,
        earlyMin: displayEarlyMin,
        earlyBeforeMin,
        earlyAfterMin,
        otMin: displayOtMin,
        otBeforeMin,
        otAfterMin,
        status: displayStatus,
        approval: approval || '대기',
        pendingId: outIdForRow ?? inIdForRow,
        pendingInId: inIdForRow,
        pendingOutId: outIdForRow,
        inLogId: inLogIdForRow ?? null,
        outLogId: outLogIdForRow ?? null,
        inStatus: inStatusForRow,
        isPartTime,
      })
    }

    result.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1
      if (a.store !== b.store) return a.store.localeCompare(b.store)
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('getAttendanceRecordsAdmin:', e)
    return NextResponse.json([], { headers })
  }
}
