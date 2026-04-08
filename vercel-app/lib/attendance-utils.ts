/**
 * 근태 공통: 관리자 페이지 기준 방콕(Asia/Bangkok) 타임존
 */

import { normalizeEmployeeNameForGradeMatch } from '@/lib/employee-display-name'

export const ATTENDANCE_TZ = 'Asia/Bangkok'

/**
 * PostgREST `store_name=ilike` 값(인코딩 전): *부분일치* — "Union Mall" ↔ "CM Union Mall" 등.
 * submitAttendance·모바일 근태와 동일 취지.
 */
export function attendanceStoreIlikeFragment(storeName: string): string {
  return '*' + String(storeName || '').replace(/\*/g, '').trim() + '*'
}

function postgrestIlikeColumnFilter(column: 'store_name' | 'store', storeFilter: string): string {
  const raw = String(storeFilter || '').trim().replace(/\s+/g, ' ')
  if (!raw) return ''
  // 단일 `store_name=ilike.*검색어*` 만 사용 (PostgREST 에서 * = SQL %).
  // `or=(...)` / `ilike(any).{...}` 는 환경에 따라 400 이거나 200+빈 결과로 나와 조회가 통째로 비는 사례가 있음.
  // "Office" 선택 시 `*Office*` 로 "CM Office" 로그도 부분 일치.
  const frag = '*' + raw.replace(/\*/g, '') + '*'
  return `${column}=ilike.${encodeURIComponent(frag)}`
}

/**
 * attendance_logs / schedules 의 `store_name` — 부분일치 `*…*` (CM 접두·표기는 검색어 부분 문자열로 커버).
 */
export function attendanceStoreNamePostgrestFilter(storeFilter: string): string {
  return postgrestIlikeColumnFilter('store_name', storeFilter)
}

/** employees / leave_requests 등 `store` 컬럼 — 동일 CM·표기 차이 허용 */
export function employeeStorePostgrestFilter(storeFilter: string): string {
  return postgrestIlikeColumnFilter('store', storeFilter)
}

/** 퇴근 로그 `approved` — 급여·getAttendanceRecordsAdmin은 승인/승인완료 모두 승인 처리. UI도 동일해야 조정 반영 버튼이 빠지지 않음 */
export function isAttendanceOutApproved(approval: string | undefined | null): boolean {
  const a = String(approval || '').trim()
  return a === '승인완료' || a === '승인'
}

/** 현재 시각을 방콕 기준 날짜 YYYY-MM-DD */
export function todayStrBangkok(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: ATTENDANCE_TZ })
}

/** log_at(UTC ISO) → 방콕 기준 날짜 YYYY-MM-DD (급여/근태 집계용) */
export function toDateStrBangkok(val: string | Date | null | undefined): string {
  if (!val) return ''
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: ATTENDANCE_TZ })
}

/** schedules.schedule_date: date 컬럼·ISO 문자열 모두 YYYY-MM-DD로 (UTC slice와 근태 그리드 키 불일치 방지) */
export function scheduleDateKey(val: string | Date | null | undefined): string {
  if (val == null) return ''
  if (typeof val === 'string') {
    const s = val.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10)
  }
  const d = new Date(val as string | Date)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: ATTENDANCE_TZ })
}

/** log_at(ISO) → 방콕 기준 시각의 시(hour) 0~23. 자정 넘김 퇴근 판별용 */
export function getBangkokHour(iso: string | Date | null | undefined): number {
  if (iso == null) return 12
  const d = new Date(iso)
  const str = d.toLocaleTimeString('en-US', { timeZone: ATTENDANCE_TZ, hour: '2-digit', hour12: false })
  return parseInt(str, 10) || 0
}

/**
 * 근태(getTodayAttendanceSummary)와 동일: 방콕 달력 00:00~07:59 시각은 전날 근무일로 간주
 * (익일 새벽 퇴근·기록을 전날 집계에 포함하는 규칙과 맞춤)
 *
 * 예: 달력 22일 02:00 기록 → 근무일은 21일. 22일로 검색하면 안 나오고 21일로 검색되어야 함.
 */
export function attendanceBusinessDateStrBangkok(isoOrMs: Date | number): string {
  const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : isoOrMs
  if (isNaN(d.getTime())) return todayStrBangkok()
  const cal = d.toLocaleDateString('en-CA', { timeZone: ATTENDANCE_TZ })
  const h = getBangkokHour(d)
  if (h >= 0 && h <= 7) return addDayBangkok(cal, -1)
  return cal
}

/**
 * 근무일 D에 속하는 실시간 구간: D 00:00 ~ (D+1) 08:00 방콕 (08:00 미포함).
 * getTodayAttendanceSummary가 D일 조회 시 익일 00~07시 로그를 포함하는 범위와 동일.
 */
export function attendanceBusinessDayBoundsMs(businessDateStr: string): { startMs: number; endMsExclusive: number } {
  const s = businessDateStr.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return attendanceBusinessDayBoundsMs(todayStrBangkok())
  }
  const startMs = new Date(`${s}T00:00:00+07:00`).getTime()
  const nextCal = addDayBangkok(s, 1)
  const endMsExclusive = new Date(`${nextCal}T08:00:00+07:00`).getTime()
  return { startMs, endMsExclusive }
}

export function segmentOverlapsAttendanceBusinessDay(
  segmentStartMs: number,
  segmentEndMs: number | null,
  ongoing: boolean,
  winStartMs: number,
  winEndExclusiveMs: number,
  nowMs: number
): boolean {
  const effectiveEnd = ongoing ? nowMs : segmentEndMs ?? nowMs
  return effectiveEnd > winStartMs && segmentStartMs < winEndExclusiveMs
}

function normalizeVisitTimePart(visitTime: string | undefined, createdAt: string | undefined): string {
  const t = String(visitTime ?? '').trim()
  if (t.includes('T')) {
    const iso = t.substring(t.indexOf('T') + 1)
    if (iso.length >= 8) return iso.substring(0, 8)
    if (iso.length >= 5) return iso.substring(0, 5) + ':00'
    return '00:00:00'
  }
  if (t.length >= 8) return t.substring(0, 8)
  if (t.length >= 5) return t.substring(0, 5) + ':00'
  if (createdAt && String(createdAt).includes('T')) {
    const tPart = String(createdAt).substring(String(createdAt).indexOf('T') + 1)
    if (tPart.length >= 8) return tPart.substring(0, 8)
    if (tPart.length >= 5) return tPart.substring(0, 5) + ':00'
  }
  return '00:00:00'
}

/** store_visits visit_date + visit_time(+created_at) → 시각(ms), 방콕 +07:00 해석 */
export function visitInstantMsBangkok(
  visitDate: string,
  visitTime?: string | null,
  createdAt?: string | null
): number {
  const date = String(visitDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 0
  const time = normalizeVisitTimePart(visitTime ?? undefined, createdAt ?? undefined)
  const inst = new Date(`${date}T${time}+07:00`)
  const ms = inst.getTime()
  return Number.isNaN(ms) ? 0 : ms
}

export function visitRowBusinessDateStrBangkok(row: {
  visit_date?: string
  visit_time?: string
  created_at?: string
}): string {
  const ms = visitInstantMsBangkok(String(row.visit_date || ''), row.visit_time, row.created_at)
  if (!ms) return String(row.visit_date || '').slice(0, 10) || todayStrBangkok()
  return attendanceBusinessDateStrBangkok(ms)
}

/** 방콕 기준 N일 전 날짜 YYYY-MM-DD */
export function daysAgoStrBangkok(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toLocaleDateString('en-CA', { timeZone: ATTENDANCE_TZ })
}

/** 방콕 기준 날짜 문자열(YYYY-MM-DD)을 해당일 00:00 방콕 ~ 다음날 00:00 방콕(미포함)의 UTC ISO 구간으로 변환 */
export function bangkokDateToUtcRange(bangkokDateStr: string): { startISO: string; endISOExclusive: string } {
  const s = bangkokDateStr.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const fallback = new Date().toISOString().slice(0, 10)
    return bangkokDateToUtcRange(fallback)
  }
  const [y, m, d] = s.split('-').map(Number)
  // 00:00 Bangkok = UTC - 7h
  const startUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - 7 * 60 * 60 * 1000
  const endUtcMs = Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0) - 7 * 60 * 60 * 1000
  return {
    startISO: new Date(startUtcMs).toISOString().slice(0, 23) + 'Z',
    endISOExclusive: new Date(endUtcMs).toISOString().slice(0, 23) + 'Z',
  }
}

/** 방콕 기준 startDate~endDate(포함) 구간을 DB log_at 필터용 UTC ISO 구간으로 변환 */
export function bangkokDateRangeToUtc(
  startDate: string,
  endDate: string
): { startISO: string; endISOExclusive: string } {
  const startStr = startDate.trim().slice(0, 10)
  const endStr = endDate.trim().slice(0, 10)
  if (!startStr || !endStr) {
    const t = todayStrBangkok()
    return bangkokDateToUtcRange(t)
  }
  const start = bangkokDateToUtcRange(startStr)
  const end = bangkokDateToUtcRange(endStr)
  return {
    startISO: start.startISO,
    endISOExclusive: end.endISOExclusive,
  }
}

/** 날짜 문자열(YYYY-MM-DD)에 N일 더한 날짜. 자정 넘김 조회 연장용 */
export function addDayBangkok(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** 날짜 문자열(YYYY-MM-DD)의 방콕 기준 요일. 0=일요일, 1=월요일, ..., 6=토요일 */
export function getDayOfWeekBangkok(dateStr: string): number {
  const s = dateStr.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 0
  const d = new Date(s + 'T12:00:00Z')
  const w = d.toLocaleDateString('en-US', { timeZone: ATTENDANCE_TZ, weekday: 'short' })
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[w] ?? 0
}

/** 해당 주의 방콕 기준 월요일 날짜 YYYY-MM-DD. dateStr 없으면 방콕 오늘 기준 */
export function getMondayOfWeekBangkok(dateStr?: string): string {
  const today = dateStr ? dateStr.trim().slice(0, 10) : todayStrBangkok()
  if (!today) return todayStrBangkok()
  const day = getDayOfWeekBangkok(today)
  const diff = day === 0 ? -6 : -(day - 1)
  const [y, m, d] = today.split('-').map(Number)
  const utc = Date.UTC(y, m - 1, d + diff)
  return new Date(utc).toISOString().slice(0, 10)
}

/** 날짜 문자열에 N일 더하기 (UTC 기준 달력 연산, 시간표용) */
export function addDaysSchedule(dateStr: string, delta: number): string {
  const s = dateStr.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return dateStr
  const [y, m, d] = s.split('-').map(Number)
  const utc = Date.UTC(y, m - 1, d + delta)
  return new Date(utc).toISOString().slice(0, 10)
}

/** 스케줄 plan_in/plan_out 문자열 → 당일 기준 분 (급여·근태 동일) */
export function parsePlanToMinutes(plan: string | null | undefined): number {
  if (!plan || typeof plan !== 'string') return 0
  const m = plan.trim().match(/(\d{1,2})\s*[:\s]\s*(\d{1,2})/)
  if (!m) return 0
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

/**
 * 스케줄상 순수 근무 분(휴게 차감). 급여 getPayrollCalc·근태 그리드 차이(분) 계산에 공통 사용.
 * plan_out이 당일 시각으로 새벽(예: 02:00)이고 plan_in이 오후면 익일 퇴근으로 간주(plan_in_prev_day 미체크 DB 보정).
 */
export function plannedWorkMinutesFromPlans(
  planIn: string,
  planOut: string,
  breakStart: string,
  breakEnd: string,
  planInPrevDay?: boolean
): number {
  const inMin = parsePlanToMinutes(planIn)
  let outMin = parsePlanToMinutes(planOut)
  if (outMin < inMin && (planInPrevDay || inMin >= 15 * 60)) {
    outMin += 24 * 60
  }
  if (inMin >= outMin) return 0
  let workMin = outMin - inMin
  const bsMin = parsePlanToMinutes(breakStart)
  const beMin = parsePlanToMinutes(breakEnd)
  if (bsMin && beMin && beMin > bsMin) workMin -= beMin - bsMin
  return Math.max(0, workMin)
}

export type ScheduleRowForPlan = {
  plan_in?: string
  plan_out?: string
  break_start?: string
  break_end?: string
  plan_in_prev_day?: boolean
}

function normSchedEmployeeName(name: string): string {
  return normalizeEmployeeNameForGradeMatch(name)
}

/** grid: 근태 그리드(부분 이름 매칭 허용). payroll: 급여 집계 — 모호한 퍼지는 제외해 잘못된 조퇴 방지 */
export type ScheduleResolveMode = 'grid' | 'payroll'

/**
 * 같은 날·매장에 스케줄 후보가 여러 개일 때(부분 이름 일치 등) 첫 키가 아니라
 * 실제 근무분과 계획 분 차이가 가장 작은 행을 선택 — 잘못된 조퇴·연장 방지.
 * 실근무 0(미퇴근 등)이면 정확 키만 사용.
 * mode=payroll: 퍼지 후보가 2개 이상이면 스케줄 키 이름이 근태명(정규화)과 완전 일치하는 행만 남기고, 없으면 퍼지 전부 제외.
 */
export function resolveScheduleForAttendanceDay(
  rowDate: string,
  store: string,
  name: string,
  scheduleMap: Record<string, ScheduleRowForPlan>,
  actualWorkMin: number,
  mode: ScheduleResolveMode = 'grid'
): ScheduleRowForPlan | null {
  const exactFull = `${rowDate}|${store}|${name}`
  const exactNorm = `${rowDate}|${store}|${normSchedEmployeeName(name)}`
  const recNorm = normSchedEmployeeName(name)
  const prefix = `${rowDate}|${store}|`

  if (actualWorkMin <= 0) {
    const ex = scheduleMap[exactFull] || scheduleMap[exactNorm]
    if (ex) return ex
    if (mode === 'payroll') return null
    const fuzzyKeys0 = Object.keys(scheduleMap)
      .filter((k) => k.startsWith(prefix))
      .sort()
    for (const key of fuzzyKeys0) {
      const schName = key.slice(prefix.length)
      if (!schName) continue
      if (recNorm.includes(schName) || schName.includes(recNorm)) {
        return scheduleMap[key]
      }
    }
    return null
  }

  type Cand = { sch: ScheduleRowForPlan; pref: number; keySuffix: string }
  const candidates: Cand[] = []
  const seen = new Set<ScheduleRowForPlan>()
  const add = (sch: ScheduleRowForPlan | undefined, pref: number, keySuffix: string) => {
    if (!sch || seen.has(sch)) return
    seen.add(sch)
    candidates.push({ sch, pref, keySuffix })
  }

  add(scheduleMap[exactFull], 0, String(name).trim())
  add(scheduleMap[exactNorm], 1, recNorm)

  const fuzzyKeys = Object.keys(scheduleMap)
    .filter((k) => k.startsWith(prefix))
    .sort()
  for (const key of fuzzyKeys) {
    const schName = key.slice(prefix.length)
    if (!schName) continue
    if (recNorm.includes(schName) || schName.includes(recNorm)) {
      add(scheduleMap[key], 2, schName)
    }
  }

  let workCandidates = candidates
  if (mode === 'payroll') {
    const hasExact = workCandidates.some((c) => c.pref <= 1)
    if (!hasExact) {
      const fOnly = workCandidates.filter((c) => c.pref === 2)
      const loneFullName =
        fOnly.length === 1 && fOnly[0].keySuffix.trim() === recNorm.trim()
      workCandidates = loneFullName ? workCandidates : []
    }
    const fuzzy = workCandidates.filter((c) => c.pref === 2)
    if (fuzzy.length > 1) {
      const sameName = fuzzy.filter((c) => c.keySuffix.trim() === recNorm.trim())
      if (sameName.length === 1) {
        const keep = sameName[0].sch
        workCandidates = workCandidates.filter((c) => c.pref !== 2 || c.sch === keep)
      } else {
        workCandidates = workCandidates.filter((c) => c.pref !== 2)
      }
    }
  }

  type PickMeta = { score: number; earlyRisk: number; pref: number; planned: number }
  const beats = (c: PickMeta, b: PickMeta): boolean => {
    if (c.score < b.score) return true
    if (c.score > b.score) return false
    if (c.earlyRisk < b.earlyRisk) return true
    if (c.earlyRisk > b.earlyRisk) return false
    if (c.pref < b.pref) return true
    if (c.pref > b.pref) return false
    if (c.earlyRisk === 1) return c.planned < b.planned
    return c.planned > b.planned
  }

  let best: ScheduleRowForPlan | null = null
  let bestMeta: PickMeta | null = null

  for (const { sch, pref } of workCandidates) {
    const planned = plannedWorkMinutesFromPlans(
      String(sch.plan_in || ''),
      String(sch.plan_out || ''),
      String(sch.break_start || ''),
      String(sch.break_end || ''),
      !!sch.plan_in_prev_day
    )
    if (planned <= 0) continue
    const score = Math.abs(planned - actualWorkMin)
    const earlyRisk = planned > actualWorkMin ? 1 : 0
    const meta: PickMeta = { score, earlyRisk, pref, planned }
    if (!bestMeta || beats(meta, bestMeta)) {
      bestMeta = meta
      best = sch
    }
  }

  if (best) return best
  if (mode === 'payroll') {
    return scheduleMap[exactFull] || scheduleMap[exactNorm] || null
  }
  return scheduleMap[exactFull] || scheduleMap[exactNorm] || candidates[0]?.sch || null
}

/**
 * 근태 로그에는 employee_id가 있는데 `schedules` 행에는 employee_id가 비어 이름 키만 있는 경우가 많음.
 * `#id`만 조회하면 맵에 키가 없어 계획 근무가 전부 0이 됨 → id 우선, 실패 시 표시 이름으로 재조회.
 */
export function resolveScheduleForEmployeeDay(
  rowDate: string,
  store: string,
  employeeId: number,
  employeeName: string,
  scheduleMap: Record<string, ScheduleRowForPlan>,
  actualWorkMin: number,
  mode: ScheduleResolveMode = 'payroll'
): ScheduleRowForPlan | null {
  if (employeeId > 0) {
    const byId = resolveScheduleForAttendanceDay(
      rowDate,
      store,
      `#${employeeId}`,
      scheduleMap,
      actualWorkMin,
      mode
    )
    if (byId) return byId
  }
  const nm = String(employeeName || '').trim()
  if (!nm) return null
  return resolveScheduleForAttendanceDay(rowDate, store, nm, scheduleMap, actualWorkMin, mode)
}
