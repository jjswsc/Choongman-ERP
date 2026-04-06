import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelect,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
} from '@/lib/supabase-server'
import { ATTENDANCE_LOG_PAYROLL_COLS } from '@/lib/postgrest-narrow-select'
import { requireAuth } from '@/lib/verify-auth'
import {
  clockOutCountsForPayroll,
  calcSSO,
  isEmployeeSsoExemptFlag,
  ssoContributionBaseWage,
  OT_PAYROLL_MIN_MINUTES,
  otMinutesForPayroll,
} from '@/lib/payroll-utils'
import { hasOneYearTenureAsOf } from '@/lib/annual-leave'
import { isOfficeStore } from '@/lib/permissions'
import {
  bangkokDateRangeToUtc,
  toDateStrBangkok,
  getBangkokHour,
  addDayBangkok,
  plannedWorkMinutesFromPlans,
  resolveScheduleForEmployeeDay,
  scheduleDateKey,
} from '@/lib/attendance-utils'
import { normalizeEmployeeNameForGradeMatch } from '@/lib/employee-display-name'
import { employeeMeetsMinEvalLetterGrade, hazAllowEligibleWithEvalGrade } from '@/lib/payroll-haz-eval-grade'
import { loadPayrollHazEvalGradeRules } from '@/lib/payroll-haz-eval-grade-settings'

const LATE_DED_HOURS_BASE = 208 // 태국 근로기준: 월 208시간
const OT_MULTIPLIER = 1.5
// 매장 직원: 한 달에 10분 이상 지각 3번 이상 → 반차(0.5일) 급여 삭감
const LATE_HALF_DAY_MIN = 10
const LATE_HALF_DAY_COUNT = 3

/** 인사·휴가·공휴일 날짜: 순수 YYYY-MM-DD는 그대로, 그 외는 방콕 달력 기준(UTC slice 오차 방지) */
function toDateStr(val: unknown): string {
  if (val == null || val === '') return ''
  if (typeof val === 'string') {
    const s = val.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    return toDateStrBangkok(s)
  }
  return toDateStrBangkok(val as Date)
}

function fmtMoney(n: number): string {
  return Math.floor(Number(n) || 0).toLocaleString('en-US')
}

/** 급여월 달력 기준 예정 근무일수(공휴일·매장/오피스 주말, 입사 이후만). resignCapInclusive 있으면 해당일까지(포함). */
function countCalendarExpectedWorkDays(
  year: number,
  targetMonthJs: number,
  daysInMonth: number,
  holidaySet: Set<string>,
  store: string,
  joinDateStr: string,
  resignCapInclusive: string | null
): number {
  let n = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, targetMonthJs, d)
    const dayOfWeek = date.getDay()
    const dateStr = date.toISOString().slice(0, 10)
    if (joinDateStr && dateStr < joinDateStr) continue
    if (resignCapInclusive && dateStr > resignCapInclusive) continue
    if (holidaySet.has(dateStr)) continue
    if (isOfficeStore(store)) {
      if (dayOfWeek !== 0 && dayOfWeek !== 6) n++
    } else {
      if (dayOfWeek !== 0) n++
    }
  }
  return n
}

const DEFAULT_HOLIDAYS: { date: string; name: string }[] = [
  { date: '-01-01', name: "New Year's Day" },
  { date: '-04-06', name: 'Chakri Day' },
  { date: '-04-13', name: 'Songkran' },
  { date: '-05-01', name: "Labour Day" },
  { date: '-05-04', name: 'Coronation Day' },
  { date: '-08-12', name: "Queen's Birthday" },
  { date: '-10-13', name: "King Memorial Day" },
  { date: '-12-05', name: "King's Birthday" },
  { date: '-12-10', name: 'Constitution Day' },
]

type AttSummary = {
  lateMin: number
  lateDaysOver10: number
  earlyMin: number
  otMin: number
  workMin: number
  workDays: number
  workDates: Set<string>
  checkInDates: Set<string>
  /** 방콕 달력일 기준 출근이 있는 날(퇴근 미기록·미승인 포함) — 스케줄 대비 결석 판정용 */
  clockInDates: Set<string>
}

/** 일별 근태 → 급여 산출 근거 표시용 */
export type AttendanceDayLines = {
  late: { date: string; minutes: number }[]
  early: { date: string; minutes: number }[]
  ot: { date: string; rawMin: number; countedMin: number }[]
}

/** 급여 계산 항목별 산출 내역 (클라이언트 다이얼로그) */
export type PayrollExplainEntry = {
  date?: string
  reason: string
  detail?: string
  amount?: number
  minutes?: number
}

export type PayrollCalcExplain = {
  salary: PayrollExplainEntry[]
  posAllow: PayrollExplainEntry[]
  hazAllow: PayrollExplainEntry[]
  diligenceAllow: PayrollExplainEntry[]
  birthBonus: PayrollExplainEntry[]
  holidayPay: PayrollExplainEntry[]
  splBonus: PayrollExplainEntry[]
  ot: PayrollExplainEntry[]
  lateEarly: PayrollExplainEntry[]
  sso: PayrollExplainEntry[]
  otherDed: PayrollExplainEntry[]
}

function normalizeNameForSchedule(name: string): string {
  return normalizeEmployeeNameForGradeMatch(name)
}

function payrollEmployeeKey(store: string, name: string, employeeId?: number | null): string {
  const sid =
    employeeId != null && Number.isFinite(Number(employeeId)) ? Math.floor(Number(employeeId)) : 0
  if (sid > 0) return `${store}_#${sid}`
  return `${store}_${name}`
}

/** store+name / store+정규화이름 양쪽 키에 걸린 승인 휴가를 한 직원 기준으로 합침(근면·결석 연동 누락 방지) */
function mergeLeaveEventsForEmployee<T extends { date: string; type: string; days: number; kind: string }>(
  byKey: Record<string, T[]>,
  store: string,
  name: string,
  employeeId?: number | null
): T[] {
  const keys = new Set<string>([payrollEmployeeKey(store, name, employeeId)])
  const sid = employeeId != null && Number.isFinite(Number(employeeId)) ? Math.floor(Number(employeeId)) : 0
  if (sid > 0) keys.add(`${store}_#${sid}`)
  keys.add(`${store}_${name}`)
  const nn = normalizeNameForSchedule(name)
  if (nn && nn !== name) keys.add(`${store}_${nn}`)
  const seen = new Set<string>()
  const out: T[] = []
  for (const k of keys) {
    for (const ev of byKey[k] || []) {
      const id = `${ev.date}|${ev.type}|${ev.days}|${ev.kind}`
      if (seen.has(id)) continue
      seen.add(id)
      out.push(ev)
    }
  }
  return out
}

/** 직원 ID → 퇴사일(인사). 근태 store_name ≠ employees.store 여도 퇴직일 이후 집계 제외 */
function buildResignByEmpId(
  empRows: { id?: number; resign_date?: unknown }[] | null
): Record<number, string> {
  const m: Record<number, string> = {}
  for (const e of empRows || []) {
    const eid = e.id != null && Number.isFinite(Number(e.id)) ? Math.floor(Number(e.id)) : 0
    if (eid <= 0) continue
    const rs = toDateStr(e.resign_date)
    if (!rs) continue
    m[eid] = rs
  }
  return m
}

/** 인사 기준 퇴사일(YYYY-MM-DD) → 근태 로그 store|name 키로 조회 */
function resignCutoffForRow(
  store: string,
  name: string,
  employeeId: number | null | undefined,
  resignByAttKey: Record<string, string>,
  resignByEmpId: Record<number, string>
): string | undefined {
  const sid =
    employeeId != null && Number.isFinite(Number(employeeId)) ? Math.floor(Number(employeeId)) : 0
  if (sid > 0) {
    if (resignByEmpId[sid]) return resignByEmpId[sid]
    const k0 = `${store}_#${sid}`
    if (resignByAttKey[k0]) return resignByAttKey[k0]
  }
  const k1 = `${store}_${name}`
  const k2 = `${store}_${normalizeNameForSchedule(name)}`
  return resignByAttKey[k1] || resignByAttKey[k2]
}

function buildResignByAttKey(
  empRows: { id?: number; store?: string; name?: string; resign_date?: unknown }[] | null
): Record<string, string> {
  const m: Record<string, string> = {}
  for (const e of empRows || []) {
    const store = String(e.store || '').trim()
    const name = String(e.name || '').trim()
    const rs = toDateStr(e.resign_date)
    if (!store || !name || !rs) continue
    const sid = e.id != null && Number.isFinite(Number(e.id)) ? Math.floor(Number(e.id)) : 0
    if (sid > 0) m[`${store}_#${sid}`] = rs
    m[`${store}_${name}`] = rs
    const nn = normalizeNameForSchedule(name)
    if (nn && nn !== name) m[`${store}_${nn}`] = rs
  }
  return m
}

/** getPayrollPreview 근태 집계와 동일: 방콕 날짜, 자정 넘김 병합, 완료 근무일만 지각·근무 반영 */
function buildAttendanceSummary(
  monthStr: string,
  attRows: {
    log_at?: string
    store_name?: string
    name?: string
    employee_id?: number | null
    log_type?: string
    late_min?: number
    early_min?: number
    ot_min?: number
    break_min?: number
    status?: string
    approved?: string
  }[],
  scheduleMap: Record<string, { plan_in?: string; plan_out?: string; break_start?: string; break_end?: string; plan_in_prev_day?: boolean }>,
  resignByAttKey: Record<string, string> = {},
  resignByEmpId: Record<number, string> = {}
): { summary: Record<string, AttSummary>; dayLines: Record<string, AttendanceDayLines> } {
  const startStr = monthStr + '-01'
  const lastDay = new Date(parseInt(monthStr.slice(0, 4), 10), parseInt(monthStr.slice(5, 7), 10), 0)
  const endStr = lastDay.toISOString().slice(0, 10)

  const map: Record<string, AttSummary> = {}
  const dayLines: Record<string, AttendanceDayLines> = {}
  type DayV = {
    attKey: string
    store: string
    name: string
    employeeId: number
    inMs: number | null
    outMs: number | null
    breakMin: number
    outApproved: boolean
    /** 직전 반영 퇴근 로그 status (정상(승인) + early_min 조정 판별) */
    outStatus: string
    lateMin: number
    otMin: number
    /** 퇴근 로그 ot_min null=미입력(스케줄 차이로 산정), 숫자=승인 조정값 */
    otMinExplicit: number | null
    /** 퇴근 로그 early_min: 급여 집계 시 정상(승인)이면 조퇴 면제·감액에 사용 */
    earlyMinExplicit: number | null
  }
  const byDay: Record<string, DayV> = {}

  function addCalendarDay(dateStr: string, delta: number): string {
    const d = new Date(dateStr + 'T12:00:00')
    d.setDate(d.getDate() + delta)
    return d.toISOString().slice(0, 10)
  }

  for (const r of attRows || []) {
    const rowDate = toDateStrBangkok(r.log_at)
    const type = String(r.log_type || '').trim()
    const logAt = r.log_at || ''
    if (!rowDate || rowDate < startStr) continue
    if (rowDate > endStr) {
      const allowOvernightOut =
        type === '퇴근' && getBangkokHour(logAt) <= 7 && rowDate === addDayBangkok(endStr, 1)
      if (!allowOvernightOut) continue
    }

    const store = String(r.store_name || '').trim()
    const name = String(r.name || '').trim()
    if (!store || !name) continue
    const employeeId =
      r.employee_id != null && Number.isFinite(Number(r.employee_id)) ? Math.floor(Number(r.employee_id)) : 0
    const attKey = payrollEmployeeKey(store, name, employeeId)
    if (!map[attKey]) {
      map[attKey] = {
        lateMin: 0,
        lateDaysOver10: 0,
        earlyMin: 0,
        otMin: 0,
        workMin: 0,
        workDays: 0,
        workDates: new Set(),
        checkInDates: new Set(),
        clockInDates: new Set(),
      }
    }

    const dayKey = `${rowDate}|${store}|${name}`
    if (!byDay[dayKey]) {
      byDay[dayKey] = {
        attKey,
        store,
        name,
        employeeId,
        inMs: null,
        outMs: null,
        breakMin: 0,
        outApproved: false,
        outStatus: '',
        lateMin: 0,
        otMin: 0,
        otMinExplicit: null,
        earlyMinExplicit: null,
      }
    }
    const v = byDay[dayKey]
    const approval = String(r.approved || '').trim()
    const status = String(r.status || '').trim()
    const isApproved = approval === '승인' || approval === '승인완료'
    const needsApproval = /위치미확인|승인대기/.test(status)
    const dt = r.log_at ? new Date(r.log_at).getTime() : 0

    if (type === '출근') {
      const lateMinRow = Number(r.late_min) || 0
      const lateWaived = status === '정상(승인)'
      if (!v.inMs || dt < v.inMs) {
        v.inMs = dt
        if ((!needsApproval || isApproved) && !lateWaived) {
          v.lateMin = lateMinRow
        } else {
          v.lateMin = 0
        }
      }
    } else if (type === '퇴근') {
      const logAtStr = r.log_at || ''
      const bangkokHour = getBangkokHour(logAtStr)
      const isOvernightOut = bangkokHour < 7
      const prevDayKey = `${addCalendarDay(rowDate, -1)}|${store}|${name}`
      const prev = byDay[prevDayKey]
      const applyClockOut = (target: (typeof byDay)[string]) => {
        if (!target.outMs || dt > target.outMs) {
          target.outMs = dt
          // break_min은 휴식종료 누적만 반영(근태 getAttendanceRecordsAdmin과 동일). 퇴근 행 값으로 덮으면 휴식 합(예: 85분)이 사라져 조퇴·OT가 틀어짐.
          target.outApproved = clockOutCountsForPayroll(r.approved, r.status)
          const stOut = String(r.status || '').trim()
          target.outStatus = stOut
          const rawOt = (r as { ot_min?: unknown }).ot_min
          target.otMin = Number(rawOt) || 0
          const otParsed =
            rawOt != null &&
            (typeof rawOt !== 'string' || rawOt.trim() !== '') &&
            Number.isFinite(Number(rawOt))
              ? Number(rawOt)
              : null
          target.otMinExplicit = otParsed
          const rawEarly = (r as { early_min?: unknown }).early_min
          if (
            target.outApproved &&
            stOut.includes('정상(승인)') &&
            rawEarly != null &&
            rawEarly !== '' &&
            Number.isFinite(Number(rawEarly))
          ) {
            target.earlyMinExplicit = Math.max(0, Math.min(9999, Math.round(Number(rawEarly))))
          } else {
            target.earlyMinExplicit = null
          }
        }
      }
      if (isOvernightOut && prev?.inMs != null && prev.outMs == null) {
        applyClockOut(prev)
      } else if (!isOvernightOut) {
        applyClockOut(v)
      }
    } else if (type === '휴식종료') {
      v.breakMin += Number(r.break_min) || 0
    }
  }

  for (const [dayKey, v] of Object.entries(byDay)) {
    const shouldCarryOutToPrev =
      v.outMs != null && (v.inMs == null || (v.inMs != null && v.outMs < v.inMs))
    if (shouldCarryOutToPrev) {
      const parts = dayKey.split('|')
      const rowDate = parts[0]
      const prevKey = `${addCalendarDay(rowDate, -1)}|${v.store}|${v.name}`
      const prev = byDay[prevKey]
      if (prev && prev.inMs != null && prev.outMs == null) {
        prev.outMs = v.outMs
        prev.breakMin += v.breakMin
        prev.outApproved = v.outApproved
        prev.outStatus = v.outStatus
        prev.otMin = v.otMin
        prev.otMinExplicit = v.otMinExplicit
        prev.earlyMinExplicit = v.earlyMinExplicit
        v.outMs = null
        v.breakMin = 0
        v.outApproved = false
        v.outStatus = ''
        v.otMin = 0
        v.otMinExplicit = null
        v.earlyMinExplicit = null
      }
    }
  }

  // 스케줄 대비 '출석' 판정: 완료 근무일뿐 아니라 출근만 찍힌 날도 결석에서 제외(퇴근 승인 대기 등)
  for (const [dayKey, v] of Object.entries(byDay)) {
    const parts = dayKey.split('|')
    const rowDate = parts[0]
    const attKey = v.attKey
    if (!rowDate || rowDate < startStr || rowDate > endStr) continue
    const resignEnd = resignCutoffForRow(v.store, v.name, v.employeeId, resignByAttKey, resignByEmpId)
    if (resignEnd && rowDate > resignEnd) continue
    if (v.inMs == null) continue
    if (!map[attKey]) {
      map[attKey] = {
        lateMin: 0,
        lateDaysOver10: 0,
        earlyMin: 0,
        otMin: 0,
        workMin: 0,
        workDays: 0,
        workDates: new Set(),
        checkInDates: new Set(),
        clockInDates: new Set(),
      }
    }
    map[attKey].clockInDates.add(rowDate)
  }

  for (const [dayKey, v] of Object.entries(byDay)) {
    const parts = dayKey.split('|')
    const rowDate = parts[0]
    const attKey = v.attKey
    if (!rowDate || rowDate < startStr || rowDate > endStr) continue
    const resignEnd = resignCutoffForRow(v.store, v.name, v.employeeId, resignByAttKey, resignByEmpId)
    if (resignEnd && rowDate > resignEnd) continue

    const complete = v.inMs != null && v.outMs != null && v.outApproved && v.outMs > v.inMs
    if (!complete) continue

    if (!map[attKey]) {
      map[attKey] = {
        lateMin: 0,
        lateDaysOver10: 0,
        earlyMin: 0,
        otMin: 0,
        workMin: 0,
        workDays: 0,
        workDates: new Set(),
        checkInDates: new Set(),
        clockInDates: new Set(),
      }
    }
    if (v.inMs != null) {
      map[attKey].checkInDates!.add(rowDate)
    }
    if (!dayLines[attKey]) {
      dayLines[attKey] = { late: [], early: [], ot: [] }
    }

    const minWork = Math.max(0, Math.floor((v.outMs! - v.inMs!) / 60000) - v.breakMin)
    map[attKey].workMin += minWork
    const sch = resolveScheduleForEmployeeDay(rowDate, v.store, v.employeeId, v.name, scheduleMap, minWork, 'payroll')
    const plannedWorkMin = sch
      ? plannedWorkMinutesFromPlans(
          String(sch.plan_in || ''),
          String(sch.plan_out || ''),
          String(sch.break_start || ''),
          String(sch.break_end || ''),
          !!sch.plan_in_prev_day
        )
      : 0
    const diffMin = plannedWorkMin > 0 ? Math.round(minWork - plannedWorkMin) : 0
    // 근태 화면과 동일: 당일 순증 근무(diff>0)면 출근 지각 분은 공제·집계하지 않음(지각했어도 계획보다 길게 근무한 날)
    const dayLateMin =
      plannedWorkMin > 0 && diffMin > 0 ? 0 : v.lateMin || 0
    map[attKey].lateMin += dayLateMin
    if (dayLateMin >= LATE_HALF_DAY_MIN) {
      map[attKey].lateDaysOver10 = (map[attKey].lateDaysOver10 || 0) + 1
    }
    // 조퇴: 스케줄 대비 부족분. 퇴근이 정상(승인)이고 DB early_min이 있으면 근태 조정 반영(0이면 면제, 상한은 산정 부족분).
    const computedEarly = plannedWorkMin > 0 && diffMin < 0 ? Math.abs(diffMin) : 0
    const useDbEarly =
      v.outApproved &&
      String(v.outStatus || '').includes('정상(승인)') &&
      plannedWorkMin > 0 &&
      diffMin < 0 &&
      v.earlyMinExplicit != null &&
      Number.isFinite(v.earlyMinExplicit)
    const dayEarlyMin = useDbEarly
      ? Math.min(Math.max(0, Math.round(v.earlyMinExplicit!)), computedEarly)
      : plannedWorkMin > 0
        ? Math.max(0, -diffMin)
        : 0
    const diffBasedOt = Math.max(0, diffMin)
    const otRaw =
      plannedWorkMin > 0
        ? diffMin < 0
          ? 0
          : v.otMinExplicit != null
            ? Math.max(0, v.otMinExplicit)
            : diffBasedOt
        : v.otMinExplicit != null
          ? Math.max(0, v.otMinExplicit)
          : Number(v.otMin) || 0
    const otCounted = otMinutesForPayroll(otRaw)
    map[attKey].otMin += otCounted
    map[attKey].earlyMin += dayEarlyMin
    map[attKey].workDays += 1
    map[attKey].workDates!.add(rowDate)

    if (dayLateMin > 0) dayLines[attKey].late.push({ date: rowDate, minutes: dayLateMin })
    const earlyM = dayEarlyMin
    if (earlyM > 0) dayLines[attKey].early.push({ date: rowDate, minutes: earlyM })
    if (otRaw > 0 || otCounted > 0) {
      dayLines[attKey].ot.push({ date: rowDate, rawMin: otRaw, countedMin: otCounted })
    }
  }

  return { summary: map, dayLines }
}

export interface PayrollCalcRow {
  id: string
  month: string
  store: string
  name: string
  employeeId?: number
  employeeCode?: string
  dept: string
  role: string
  salary: number
  posAllow: number
  hazAllow: number
  diligenceAllow: number
  birthBonus: number
  holidayPay: number
  holidayWorkDays: number
  splBonus: number
  ot15: number
  ot20: number
  ot30: number
  otAmt: number
  lateMin: number
  lateDed: number
  earlyMin: number
  earlyDed: number
  sso: number
  /** SSO 산정 기준 임금(기본급·시급제 월 환산) — 사회보험 신고 열 wage_base 와 동일 */
  ssoBase?: number
  /** 인사 마스터 SSO 공제 제외 */
  ssoExempt?: boolean
  /** 인사 id_number (신분증 번호, 엑셀 citizen_id 등에 사용) */
  idNumber?: string
  /** 인사 name_title (คำนำหน้า) */
  nameTitle?: string
  /** 인사 sso_number — SSO 가입자/증 번호(공식 양식 ประจำตัวผู้ประกันตน) */
  ssoMemberNo?: string
  /** 생년월일 YYYY-MM-DD */
  dateOfBirth?: string
  /** 입사일 YYYY-MM-DD */
  joinDate?: string
  /** 퇴사일 YYYY-MM-DD */
  resignDate?: string
  /** 태국 ม.33 일반: 고용주 부담금 = 본인 부담금(각 5%) */
  employerSso?: number
  tax: number
  otherDed: number
  netPay: number
  status: string
  /** 급여 계산 직후 산출 근거 (DB 저장 없음) */
  calcExplain?: PayrollCalcExplain
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const { auth } = authResult

  const { searchParams } = new URL(request.url)
  const monthStr = String(searchParams.get('month') || searchParams.get('monthStr') || '').trim()
  let storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const userStore = (auth.store || '').trim()
  const userRole = (auth.role || '').toLowerCase()
  if (userRole.includes('manager') && userStore) storeFilter = userStore

  if (!monthStr || monthStr.length < 7) {
    return NextResponse.json(
      { success: false, msg: '조회할 월(yyyy-MM)을 선택해주세요.' },
      { status: 400, headers }
    )
  }

  const normMonth = monthStr.slice(0, 7)
  const isAll = !storeFilter || storeFilter === 'All' || storeFilter === '전체'
  const isOffice = storeFilter === 'Office' || storeFilter === '오피스' || storeFilter === '본사'
  const canSeeOffice = userRole.includes('director') || userRole.includes('ceo') || userRole.includes('hr')

  if (isOffice && !canSeeOffice) {
    return NextResponse.json({ success: true, list: [] }, { headers })
  }

  try {
    const startStr = normMonth + '-01'
    // 해당 달 말일: new Date(y, m, 0) 에서 m = 문자열 월(1~12) → JS month index m 가 아닌 «다음 달 day 0» = 이번 달 말일
    const y = parseInt(normMonth.slice(0, 4), 10)
    const mo = parseInt(normMonth.slice(5, 7), 10)
    const lastDay = new Date(y, mo, 0)
    const endStr = lastDay.toISOString().slice(0, 10)
    const { startISO } = bangkokDateRangeToUtc(startStr, endStr)
    const logEndISOExclusive = `${addDayBangkok(endStr, 1)}T00:00:00.000Z`

    // attendance_allowance·sso_exempt 미적용 DB는 후보 순으로 내려가며 조회 (42703 등)
    const empPayrollSelectCandidatesBase = [
      // name_title·sso_number 포함 (미배포 DB는 아래 블록으로 폴백)
      'id,store,name,job,role,grade,sal_type,sal_amt,position_allowance,haz_allow,attendance_allowance,birth,join_date,resign_date,id_number,name_title,sso_number,sso_exempt',
      'id,store,name,job,role,grade,sal_type,sal_amt,position_allowance,haz_allow,attendance_allowance,birth,join_date,resign_date,id_number,name_title,sso_number',
      'id,store,name,job,role,grade,sal_type,sal_amt,position_allowance,haz_allow,birth,join_date,resign_date,id_number,name_title,sso_number,sso_exempt',
      'id,store,name,job,role,grade,sal_type,sal_amt,position_allowance,haz_allow,birth,join_date,resign_date,id_number,name_title,sso_number',
      'id,store,name,job,role,sal_type,sal_amt,position_allowance,haz_allow,attendance_allowance,birth,join_date,resign_date,id_number,name_title,sso_number,sso_exempt',
      'id,store,name,job,role,sal_type,sal_amt,position_allowance,haz_allow,attendance_allowance,birth,join_date,resign_date,id_number,name_title,sso_number',
      'id,store,name,job,role,sal_type,sal_amt,position_allowance,haz_allow,birth,join_date,resign_date,id_number,name_title,sso_number,sso_exempt',
      'id,store,name,job,role,sal_type,sal_amt,position_allowance,haz_allow,birth,join_date,resign_date,id_number,name_title,sso_number',
      'id,store,name,job,role,grade,sal_type,sal_amt,position_allowance,haz_allow,attendance_allowance,birth,join_date,resign_date,name_title,sso_number,sso_exempt',
      'id,store,name,job,role,grade,sal_type,sal_amt,position_allowance,haz_allow,attendance_allowance,birth,join_date,resign_date,name_title,sso_number',
      'id,store,name,job,role,grade,sal_type,sal_amt,position_allowance,haz_allow,birth,join_date,resign_date,name_title,sso_number,sso_exempt',
      'id,store,name,job,role,grade,sal_type,sal_amt,position_allowance,haz_allow,birth,join_date,resign_date,name_title,sso_number',
      'id,store,name,job,role,sal_type,sal_amt,position_allowance,haz_allow,attendance_allowance,birth,join_date,resign_date,name_title,sso_number,sso_exempt',
      'id,store,name,job,role,sal_type,sal_amt,position_allowance,haz_allow,attendance_allowance,birth,join_date,resign_date,name_title,sso_number',
      'id,store,name,job,role,sal_type,sal_amt,position_allowance,haz_allow,birth,join_date,resign_date,name_title,sso_number,sso_exempt',
      'id,store,name,job,role,sal_type,sal_amt,position_allowance,haz_allow,birth,join_date,resign_date,name_title,sso_number',
      // id_number·name_title·sso_number 미배포 DB
      'id,store,name,job,role,grade,sal_type,sal_amt,position_allowance,haz_allow,attendance_allowance,birth,join_date,resign_date,id_number,sso_exempt',
      'id,store,name,job,role,grade,sal_type,sal_amt,position_allowance,haz_allow,attendance_allowance,birth,join_date,resign_date,id_number',
      'id,store,name,job,role,grade,sal_type,sal_amt,position_allowance,haz_allow,birth,join_date,resign_date,id_number,sso_exempt',
      'id,store,name,job,role,grade,sal_type,sal_amt,position_allowance,haz_allow,birth,join_date,resign_date,id_number',
      'id,store,name,job,role,sal_type,sal_amt,position_allowance,haz_allow,attendance_allowance,birth,join_date,resign_date,id_number,sso_exempt',
      'id,store,name,job,role,sal_type,sal_amt,position_allowance,haz_allow,attendance_allowance,birth,join_date,resign_date,id_number',
      'id,store,name,job,role,sal_type,sal_amt,position_allowance,haz_allow,birth,join_date,resign_date,id_number,sso_exempt',
      'id,store,name,job,role,sal_type,sal_amt,position_allowance,haz_allow,birth,join_date,resign_date,id_number',
      'id,store,name,job,role,grade,sal_type,sal_amt,position_allowance,haz_allow,attendance_allowance,birth,join_date,resign_date,sso_exempt',
      'id,store,name,job,role,grade,sal_type,sal_amt,position_allowance,haz_allow,attendance_allowance,birth,join_date,resign_date',
      'id,store,name,job,role,grade,sal_type,sal_amt,position_allowance,haz_allow,birth,join_date,resign_date,sso_exempt',
      'id,store,name,job,role,grade,sal_type,sal_amt,position_allowance,haz_allow,birth,join_date,resign_date',
      'id,store,name,job,role,sal_type,sal_amt,position_allowance,haz_allow,attendance_allowance,birth,join_date,resign_date,sso_exempt',
      'id,store,name,job,role,sal_type,sal_amt,position_allowance,haz_allow,attendance_allowance,birth,join_date,resign_date',
      'id,store,name,job,role,sal_type,sal_amt,position_allowance,haz_allow,birth,join_date,resign_date,sso_exempt',
      'id,store,name,job,role,sal_type,sal_amt,position_allowance,haz_allow,birth,join_date,resign_date',
    ]
    const empPayrollSelectCandidates = [
      ...empPayrollSelectCandidatesBase.map((s) => s.replace(/^id,/, 'id,employee_code,')),
      ...empPayrollSelectCandidatesBase,
    ]
    type EmpRowPayroll = {
      id?: number
      employee_code?: string | null
      store?: string
      name?: string
      job?: string
      role?: string
      grade?: string
      sal_type?: string
      sal_amt?: number
      position_allowance?: number
      haz_allow?: number
      attendance_allowance?: number | null
      birth?: string
      join_date?: string
      resign_date?: string
      sso_exempt?: boolean | null
      id_number?: string | null
      name_title?: string | null
      sso_number?: string | null
    }
    let empRows: EmpRowPayroll[] | null = null
    let empLoadErr: unknown = null
    for (const sel of empPayrollSelectCandidates) {
      try {
        empRows = (await supabaseSelect('employees', {
          order: 'id.asc',
          select: sel,
        })) as EmpRowPayroll[] | null
        empLoadErr = null
        break
      } catch (e) {
        empLoadErr = e
      }
    }
    if (empLoadErr) throw empLoadErr

    const hazEvalRules = await loadPayrollHazEvalGradeRules()

    const loadAttRows = async () => {
      try {
        return (await supabaseSelectFilterAllPages(
          'attendance_logs',
          `log_at=gte.${encodeURIComponent(startISO)}&log_at=lt.${encodeURIComponent(logEndISOExclusive)}`,
          {
            order: 'log_at.asc',
            select: `${ATTENDANCE_LOG_PAYROLL_COLS},employee_id`,
            pageSize: 2500,
            maxRows: 120000,
          }
        )) as {
          log_at?: string
          store_name?: string
          name?: string
          employee_id?: number | null
          log_type?: string
          late_min?: number
          early_min?: number
          ot_min?: number
          break_min?: number
          status?: string
          approved?: string
        }[]
      } catch (e) {
        const em = e instanceof Error ? e.message : String(e)
        if (!/employee_id|42703|column/i.test(em)) throw e
        return (await supabaseSelectFilterAllPages(
          'attendance_logs',
          `log_at=gte.${encodeURIComponent(startISO)}&log_at=lt.${encodeURIComponent(logEndISOExclusive)}`,
          {
            order: 'log_at.asc',
            select: ATTENDANCE_LOG_PAYROLL_COLS,
            pageSize: 2500,
            maxRows: 120000,
          }
        )) as {
          log_at?: string
          store_name?: string
          name?: string
          log_type?: string
          late_min?: number
          early_min?: number
          ot_min?: number
          break_min?: number
          status?: string
          approved?: string
        }[]
      }
    }
    const loadScheduleRows = async () => {
      try {
        return (await supabaseSelectFilterAllPages(
          'schedules',
          `schedule_date=gte.${startStr}&schedule_date=lte.${endStr}`,
          {
            order: 'schedule_date.asc',
            select: 'schedule_date,store_name,name,employee_id,plan_in,plan_out,break_start,break_end,plan_in_prev_day',
            pageSize: 2500,
            maxRows: 120000,
          }
        )) as {
          schedule_date?: string
          store_name?: string
          name?: string
          employee_id?: number | null
          plan_in?: string
          plan_out?: string
          break_start?: string
          break_end?: string
          plan_in_prev_day?: boolean
        }[]
      } catch (e) {
        const em = e instanceof Error ? e.message : String(e)
        if (!/employee_id|42703|column/i.test(em)) throw e
        return (await supabaseSelectFilterAllPages(
          'schedules',
          `schedule_date=gte.${startStr}&schedule_date=lte.${endStr}`,
          {
            order: 'schedule_date.asc',
            select: 'schedule_date,store_name,name,plan_in,plan_out,break_start,break_end,plan_in_prev_day',
            pageSize: 2500,
            maxRows: 120000,
          }
        )) as {
          schedule_date?: string
          store_name?: string
          name?: string
          employee_id?: number | null
          plan_in?: string
          plan_out?: string
          break_start?: string
          break_end?: string
          plan_in_prev_day?: boolean
        }[]
      }
    }
    const loadLeaveRows = async () => {
      try {
        return (await supabaseSelectFilter(
          'leave_requests',
          `leave_date=gte.${startStr}&leave_date=lte.${endStr}`,
          { order: 'leave_date.asc', limit: 1000, select: 'store,name,leave_date,type,status,employee_id' }
        )) as {
          store?: string
          name?: string
          leave_date?: string
          type?: string
          status?: string
          employee_id?: number | null
        }[] | null
      } catch (e) {
        const em = e instanceof Error ? e.message : String(e)
        if (!/employee_id|42703|column/i.test(em)) throw e
        return (await supabaseSelectFilter(
          'leave_requests',
          `leave_date=gte.${startStr}&leave_date=lte.${endStr}`,
          { order: 'leave_date.asc', limit: 1000, select: 'store,name,leave_date,type,status' }
        )) as {
          store?: string
          name?: string
          leave_date?: string
          type?: string
          status?: string
          employee_id?: number | null
        }[] | null
      }
    }

    const [attRows, phRows, leaveRows, scheduleRows] = await Promise.all([
      loadAttRows(),
      supabaseSelectFilter('public_holidays', `year=eq.${parseInt(normMonth.slice(0, 4), 10)}`, { order: 'date.asc' }) as Promise<{ date?: string }[] | null>,
      loadLeaveRows(),
      loadScheduleRows(),
    ])
    const scheduleMap: Record<string, { plan_in?: string; plan_out?: string; break_start?: string; break_end?: string; plan_in_prev_day?: boolean }> = {}
    for (const s of scheduleRows || []) {
      const d = scheduleDateKey(s.schedule_date as string | Date)
      const store = String(s.store_name || '').trim()
      const nm = String(s.name || '').trim()
      if (!d || !store || !nm) continue
      const sid = s.employee_id != null && Number.isFinite(Number(s.employee_id)) ? Math.floor(Number(s.employee_id)) : 0
      if (sid > 0) {
        scheduleMap[`${d}|${store}|#${sid}`] = s
      }
      scheduleMap[`${d}|${store}|${nm}`] = s
      const nmNorm = normalizeNameForSchedule(nm)
      if (nmNorm && nmNorm !== nm) {
        scheduleMap[`${d}|${store}|${nmNorm}`] = s
      }
    }

    const resignByAttKey = buildResignByAttKey(empRows)
    const resignByEmpId = buildResignByEmpId(empRows)
    const { summary: attSummary, dayLines: attDayLines } = buildAttendanceSummary(
      normMonth,
      attRows || [],
      scheduleMap,
      resignByAttKey,
      resignByEmpId
    )
    const firstDay = new Date(normMonth + '-01')
    const targetMonth = firstDay.getMonth()
    const year = firstDay.getFullYear()

    // 휴가 집계: 무급휴가 일수, 유급휴가(연차/병가) 일수 (store_name별)
    const empMap: Record<string, { join_date?: string }> = {}
    const empById: Record<number, { store?: string; name?: string; join_date?: string }> = {}
    for (const e of empRows || []) {
      const s = String(e.store || '').trim()
      const n = String(e.name || '').trim()
      if (s && n) empMap[s + '_' + n] = e
      const eid = e.id != null && Number.isFinite(Number(e.id)) ? Math.floor(Number(e.id)) : 0
      if (eid > 0) {
        empById[eid] = e
        empMap[`${s}_#${eid}`] = e
      }
    }
    const unpaidLeaveDaysMap: Record<string, number> = {}
    const paidLeaveDaysMap: Record<string, number> = {}
    type LeaveEvt = { date: string; type: string; days: number; note: string; kind: 'paid' | 'unpaid' }
    const leaveEventsByKey: Record<string, LeaveEvt[]> = {}
    for (const lr of leaveRows || []) {
      if (String(lr.status || '').trim() !== '승인') continue
      let store = String(lr.store || '').trim()
      let name = String(lr.name || '').trim()
      const leaveEmpId =
        lr.employee_id != null && Number.isFinite(Number(lr.employee_id)) ? Math.floor(Number(lr.employee_id)) : 0
      if (leaveEmpId > 0 && empById[leaveEmpId]) {
        store = String(empById[leaveEmpId].store || '').trim() || store
        name = String(empById[leaveEmpId].name || '').trim() || name
      }
      const type = String(lr.type || '').trim()
      const dateStr = toDateStr(lr.leave_date)
      if (!store || !name || !dateStr || dateStr < startStr || dateStr > endStr) continue
      const key = payrollEmployeeKey(store, name, leaveEmpId)
      const days = /반차|half/i.test(type) ? 0.5 : 1
      const emp = leaveEmpId > 0 ? empById[leaveEmpId] ?? empMap[key] ?? null : empMap[key] ?? null
      const isAnnualType = /연차|반차|annual|half/i.test(type)
      const underOneYear = isAnnualType && !hasOneYearTenureAsOf(emp, dateStr)

      const note = underOneYear ? '입사 1년 미만 연차·반차 → 무급 처리' : ''
      const isUnpaid = /무급|unpaid/i.test(type) || underOneYear
      const evt: LeaveEvt = { date: dateStr, type, days, note, kind: isUnpaid ? 'unpaid' : 'paid' }
      const leaveKeys = new Set<string>([key, `${store}_${name}`])
      if (leaveEmpId > 0) leaveKeys.add(`${store}_#${leaveEmpId}`)
      const nameNorm = normalizeNameForSchedule(name)
      if (nameNorm && nameNorm !== name) leaveKeys.add(`${store}_${nameNorm}`)
      for (const lk of leaveKeys) {
        if (!leaveEventsByKey[lk]) leaveEventsByKey[lk] = []
        leaveEventsByKey[lk].push(evt)
      }

      if (isUnpaid) {
        unpaidLeaveDaysMap[key] = (unpaidLeaveDaysMap[key] || 0) + days
      } else if (/연차|반차|병가|annual|half|sick|ลากิจ|lakij/i.test(type)) {
        paidLeaveDaysMap[key] = (paidLeaveDaysMap[key] || 0) + days
      }
    }

    // 해당 월 평일 수 (공휴일 제외) - 결석 산정용
    const holidaySet = new Set<string>()
    if (phRows && phRows.length > 0) {
      const startStr = normMonth + '-01'
      const lastDay = new Date(year, targetMonth + 1, 0)
      const endStr = lastDay.toISOString().slice(0, 10)
      for (const r of phRows) {
        const d = toDateStr(r.date)
        if (d && d >= startStr && d <= endStr) holidaySet.add(d)
      }
    } else {
      for (const h of DEFAULT_HOLIDAYS) {
        const d = year + h.date
        if (d >= normMonth + '-01' && d <= normMonth + '-31') holidaySet.add(d)
      }
    }

    const scheduleWorkDatesByKey: Record<string, Set<string>> = {}
    for (const s of scheduleRows || []) {
      const d = scheduleDateKey(s.schedule_date as string | Date)
      const store = String(s.store_name || '').trim()
      const name = String(s.name || '').trim()
      const pIn = String(s.plan_in || '').trim()
      const pOut = String(s.plan_out || '').trim()
      if (!d || !store || !name) continue
      if (!pIn || !pOut) continue
      const sid = s.employee_id != null && Number.isFinite(Number(s.employee_id)) ? Math.floor(Number(s.employee_id)) : 0
      const nameNorm = normalizeNameForSchedule(name)
      const keys = new Set<string>([`${store}_${name}`])
      if (sid > 0) keys.add(`${store}_#${sid}`)
      if (nameNorm && nameNorm !== name) keys.add(`${store}_${nameNorm}`)
      for (const key of keys) {
        if (!scheduleWorkDatesByKey[key]) scheduleWorkDatesByKey[key] = new Set<string>()
        scheduleWorkDatesByKey[key].add(d)
      }
    }

    const empYmd = (v: unknown): string => {
      if (v == null || v === '') return ''
      const s = typeof v === 'string' ? v.trim() : String(v).trim()
      return s ? s.slice(0, 10) : ''
    }

    const list: PayrollCalcRow[] = []

    for (const e of empRows || []) {
      const store = String(e.store || '').trim()
      const name = String(e.name || '').trim()
      if (!name) continue
      const employeeId = e.id != null && Number.isFinite(Number(e.id)) ? Math.floor(Number(e.id)) : 0
      const employeeCodeRaw = String(e.employee_code || '').trim().toUpperCase()
      const employeeCode = employeeCodeRaw.replace(/[^A-Z0-9]/g, '').slice(0, 5)

      let include = false
      if (isAll) {
        if (canSeeOffice) include = true
        else if (!isOfficeStore(store)) include = true
      } else {
        if (isOffice) include = isOfficeStore(store)
        else include = store === storeFilter
      }
      if (!include) continue

      const dept = String(e.job || '').trim()
      const role = String(e.role || '').trim()
      const isDirectorRole = role.toLowerCase().includes('director')
      const salType = String(e.sal_type || 'Monthly').trim().toLowerCase()
      const isHourly = /시급|hourly|hour|part-time|part time/.test(salType)
      const salAmt = Number(e.sal_amt) || 0
      const posAllow = e.position_allowance != null ? Number(e.position_allowance) : 0
      let posAllowAmount = posAllow
      const hazAllowPerDay = e.haz_allow != null ? Number(e.haz_allow) : 0
      const joinDate = e.join_date ? new Date(e.join_date) : new Date()
      const birth = e.birth ? new Date(e.birth) : null
      const workYears = (firstDay.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24 * 365)
      const birthBonus = birth && birth.getMonth() === targetMonth && workYears >= 1 ? 500 : 0
      const joinDateStr = toDateStr(e.join_date)
      const resignDateStr = toDateStr((e as { resign_date?: unknown }).resign_date)
      if (resignDateStr && resignDateStr < startStr) continue

      const empId = e.id != null && Number.isFinite(Number(e.id)) ? Math.floor(Number(e.id)) : 0
      const attKey = payrollEmployeeKey(store, name, empId)
      const scheduleExpectedDates = new Set<string>()
      const scheduleLookupKeys = new Set<string>([attKey, `${store}_${normalizeNameForSchedule(name)}`])
      if (empId > 0) scheduleLookupKeys.add(`${store}_#${empId}`)
      for (const lk of scheduleLookupKeys) {
        const raw = scheduleWorkDatesByKey[lk]
        if (!raw || raw.size === 0) continue
        for (const ds of raw) {
          if (joinDateStr && ds < joinDateStr) continue
          if (resignDateStr && ds > resignDateStr) continue
          scheduleExpectedDates.add(ds)
        }
      }
      const hasScheduleBasis = scheduleExpectedDates.size > 0
      let expectedWorkDaysForEmp = 0
      if (hasScheduleBasis) {
        expectedWorkDaysForEmp = scheduleExpectedDates.size
      } else {
        for (let d = 1; d <= lastDay.getDate(); d++) {
          const date = new Date(year, targetMonth, d)
          const dayOfWeek = date.getDay()
          const dateStr = date.toISOString().slice(0, 10)
          if (joinDateStr && dateStr < joinDateStr) continue
          if (resignDateStr && dateStr > resignDateStr) continue
          if (holidaySet.has(dateStr)) continue
          if (isOfficeStore(store)) {
            if (dayOfWeek !== 0 && dayOfWeek !== 6) expectedWorkDaysForEmp++
          } else {
            if (dayOfWeek !== 0) expectedWorkDaysForEmp++
          }
        }
      }
      const daysInMonth = lastDay.getDate()
      const calendarWorkDaysFullMonth = countCalendarExpectedWorkDays(
        year,
        targetMonth,
        daysInMonth,
        holidaySet,
        store,
        joinDateStr,
        null
      )
      const calendarWorkDaysThroughResign =
        resignDateStr && resignDateStr >= startStr && resignDateStr <= endStr
          ? countCalendarExpectedWorkDays(
              year,
              targetMonth,
              daysInMonth,
              holidaySet,
              store,
              joinDateStr,
              resignDateStr
            )
          : calendarWorkDaysFullMonth
      const inMonthResign =
        !!resignDateStr && resignDateStr >= startStr && resignDateStr <= endStr
      /** 월급제: 퇴사일 이후는 달력상 예정근무에서 제외한 일수로만 기본급·일당 분모 통일(스케줄 유무와 무관) */
      const effectiveExpectedWorkDays =
        !isHourly && inMonthResign && calendarWorkDaysFullMonth > 0
          ? calendarWorkDaysThroughResign
          : expectedWorkDaysForEmp

      const att = attSummary[attKey] || {
        lateMin: 0,
        lateDaysOver10: 0,
        earlyMin: 0,
        otMin: 0,
        workMin: 0,
        workDays: 0,
        workDates: new Set<string>(),
        checkInDates: new Set<string>(),
        clockInDates: new Set<string>(),
      }
      const lateMin = att.lateMin
      const lateDaysOver10 = att.lateDaysOver10 || 0
      const earlyMin = att.earlyMin || 0
      const otMin = att.otMin
      const workMin = att.workMin
      const workDays = att.workDays
      const workDates = att.workDates || new Set<string>()
      const checkInDates = att.checkInDates || new Set<string>()
      const clockInDatesSet = att.clockInDates || new Set<string>()
      const presentDates = new Set<string>([...workDates, ...checkInDates, ...clockInDatesSet])

      const otLinesForEmp = attDayLines[attKey]?.ot || []
      const lateLinesForEmp = attDayLines[attKey]?.late || []
      const earlyLinesForEmp = attDayLines[attKey]?.early || []
      let salary: number
      let lateDed: number
      let earlyDed: number
      let otAmt: number
      if (isHourly) {
        salary = salAmt > 0 && workMin > 0 ? Math.floor((workMin / 60) * salAmt) : 0
        lateDed = 0
        earlyDed = 0
        if (salAmt > 0) {
          for (const l of lateLinesForEmp) {
            if (l.minutes > 0) lateDed += Math.floor((l.minutes / 60) * salAmt)
          }
          for (const el of earlyLinesForEmp) {
            if (el.minutes > 0) earlyDed += Math.floor((el.minutes / 60) * salAmt)
          }
        }
        otAmt = 0
        if (salAmt > 0) {
          for (const ol of otLinesForEmp) {
            if (ol.countedMin > 0) {
              otAmt += Math.floor((ol.countedMin / 60) * salAmt * OT_MULTIPLIER)
            }
          }
        }
      } else {
        // 월급제: 급여월 내 퇴사 시 항상 달력 예정근무 비율로 기본급·직책수당 일할(퇴사일 당일까지 포함, 이후 제외)
        let salaryMonthly = salAmt
        posAllowAmount = posAllow
        if (salAmt > 0 && inMonthResign && calendarWorkDaysFullMonth > 0) {
          if (calendarWorkDaysThroughResign > 0) {
            const ratio = calendarWorkDaysThroughResign / calendarWorkDaysFullMonth
            salaryMonthly = Math.floor(salAmt * ratio)
            posAllowAmount = Math.floor(posAllow * ratio)
          } else {
            salaryMonthly = 0
            posAllowAmount = 0
          }
        }
        salary = salaryMonthly
        const hourlyLateEarly = LATE_DED_HOURS_BASE > 0 && salary ? salary / LATE_DED_HOURS_BASE : 0
        lateDed = 0
        earlyDed = 0
        if (hourlyLateEarly > 0) {
          for (const l of lateLinesForEmp) {
            if (l.minutes > 0) lateDed += Math.floor((l.minutes / 60) * hourlyLateEarly)
          }
          for (const el of earlyLinesForEmp) {
            if (el.minutes > 0) earlyDed += Math.floor((el.minutes / 60) * hourlyLateEarly)
          }
        }
        const hourlyForOt = LATE_DED_HOURS_BASE > 0 && salary ? salary / LATE_DED_HOURS_BASE : 0
        otAmt = 0
        if (hourlyForOt > 0) {
          for (const ol of otLinesForEmp) {
            if (ol.countedMin > 0) {
              otAmt += Math.floor((ol.countedMin / 60) * hourlyForOt * OT_MULTIPLIER)
            }
          }
        }
      }
      // 매장 직원: 10분 이상 지각 3번 이상 → 반차(0.5일) 급여 삭감
      const expectedWorkDaysForDed = effectiveExpectedWorkDays
      if (!isOfficeStore(store) && lateDaysOver10 >= LATE_HALF_DAY_COUNT && salary > 0 && expectedWorkDaysForDed > 0) {
        const dailyRate = salary / expectedWorkDaysForDed
        lateDed += Math.floor(dailyRate * 0.5)
      }

      let holidayWorkDays = 0
      for (const d of workDates) {
        if (holidaySet.has(d)) holidayWorkDays++
      }

      const isKitchen = /주방|kitchen|chef|쿡|cook/i.test(dept)
      const empGrade = String((e as EmpRowPayroll).grade || '').trim()
      const hazAllow = hazAllowEligibleWithEvalGrade(
        isKitchen,
        hazAllowPerDay,
        workDays,
        empGrade,
        hazEvalRules
      )
        ? Math.floor(workDays * hazAllowPerDay)
        : 0

      // 월 기본급·시급 근무시간에 해당 일의 통상 임금이 이미 포함되므로, 공휴일 가산은 일당(또는 8h분) 1회분만
      let holidayPay = 0
      if (holidayWorkDays > 0) {
        if (isHourly && salAmt > 0) holidayPay = Math.floor(holidayWorkDays * 8 * salAmt)
        else if (salary > 0) holidayPay = Math.floor((salary / 30) * holidayWorkDays)
      }

      // 무급 휴가 + 결석 공제 (월급제만, 시급제는 미근무일 이미 급여 없음)
      const leaveEventsRaw = mergeLeaveEventsForEmployee(leaveEventsByKey, store, name, empId)
      const leaveEvents =
        resignDateStr && resignDateStr >= startStr && resignDateStr <= endStr
          ? leaveEventsRaw.filter((x) => x.date <= resignDateStr)
          : leaveEventsRaw
      const unpaidLeaveDays = leaveEvents.filter((x) => x.kind === 'unpaid').reduce((s, x) => s + x.days, 0)
      const paidLeaveDaysFromEvents = leaveEvents.filter((x) => x.kind === 'paid').reduce((s, x) => s + x.days, 0)
      const paidLeaveDateSet = new Set(leaveEvents.filter((x) => x.kind === 'paid').map((x) => x.date))
      const unpaidLeaveDateSet = new Set(leaveEvents.filter((x) => x.kind === 'unpaid').map((x) => x.date))
      const expectedWorkDays = effectiveExpectedWorkDays
      const absenceDateList: string[] = []
      if (hasScheduleBasis) {
        for (const ds of Array.from(scheduleExpectedDates).sort()) {
          if (presentDates.has(ds)) continue
          if (paidLeaveDateSet.has(ds) || unpaidLeaveDateSet.has(ds)) continue
          absenceDateList.push(ds)
        }
      } else {
        const rawAbsenceDays = Math.max(0, expectedWorkDays - workDays - paidLeaveDaysFromEvents)
        if (rawAbsenceDays > 0) {
          for (let d = 1; d <= lastDay.getDate(); d++) {
            const dateObj = new Date(year, targetMonth, d)
            const dow = dateObj.getDay()
            const ds = dateObj.toISOString().slice(0, 10)
            if (joinDateStr && ds < joinDateStr) continue
            if (resignDateStr && ds > resignDateStr) continue
            if (holidaySet.has(ds)) continue
            if (isOfficeStore(store)) {
              if (dow === 0 || dow === 6) continue
            } else {
              if (dow === 0) continue
            }
            if (presentDates.has(ds)) continue
            if (paidLeaveDateSet.has(ds) || unpaidLeaveDateSet.has(ds)) continue
            absenceDateList.push(ds)
          }
        }
      }
      // 출퇴근 0건이면 집계 미연동·키 불일치와 무근무를 구분할 수 없어 자동 '결석' 공제는 하지 않음(무급휴가는 leave만)
      const absenceDays = workDays === 0 ? 0 : absenceDateList.length
      // 태국 관행: 일급 = 월급 ÷ 당월 근무일수. 금액은 상세(일별·휴가 건별 floor) 합과 표시 일치
      const dailyRate = expectedWorkDays > 0 ? salary / expectedWorkDays : 0
      let unpaidAbsenceDed = 0
      if (!isHourly && salary > 0 && expectedWorkDays > 0 && dailyRate > 0) {
        const unpaidEvts = leaveEvents.filter((x) => x.kind === 'unpaid')
        for (const lv of unpaidEvts) {
          unpaidAbsenceDed += Math.floor(dailyRate * lv.days)
        }
        if (workDays > 0 && absenceDateList.length > 0) {
          unpaidAbsenceDed += Math.floor(dailyRate) * absenceDateList.length
        }
      }

      const rawDiligenceCfg = (e as { attendance_allowance?: unknown }).attendance_allowance
      const diligenceCfg =
        rawDiligenceCfg == null || rawDiligenceCfg === ''
          ? 500
          : Math.max(0, Math.floor(Number(rawDiligenceCfg)))
      const diligentEligible =
        !isDirectorRole &&
        diligenceCfg > 0 &&
        workDays > 0 &&
        leaveEvents.length === 0 &&
        absenceDays === 0 &&
        unpaidLeaveDays === 0 &&
        lateMin === 0 &&
        earlyMin === 0 &&
        lateDaysOver10 < LATE_HALF_DAY_COUNT
      const diligenceAllow = diligentEligible ? diligenceCfg : 0

      const income =
        salary + posAllowAmount + hazAllow + diligenceAllow + birthBonus + holidayPay + otAmt
      const ssoExempt = isEmployeeSsoExemptFlag((e as EmpRowPayroll).sso_exempt)
      const ssoBase = ssoContributionBaseWage(isHourly, salAmt, salary)
      const sso = ssoExempt ? 0 : calcSSO(ssoBase, year)
      const deduct = lateDed + earlyDed + sso + unpaidAbsenceDed
      const netPay = Math.max(0, income - deduct)
      const ot15 = Math.round((otMin / 60) * 10) / 10
      const explain: PayrollCalcExplain = {
        salary: [],
        posAllow: [],
        hazAllow: [],
        diligenceAllow: [],
        birthBonus: [],
        holidayPay: [],
        splBonus: [],
        ot: [],
        lateEarly: [],
        sso: [],
        otherDed: [],
      }

      explain.salary.push({
        reason: isHourly ? '시급제 기본급' : '월급제 기본급',
        detail: isHourly
          ? `근무 ${Math.round((workMin / 60) * 10) / 10}시간 × 시급 ${Math.floor(salAmt)}`
          : (() => {
              const inR =
                resignDateStr &&
                resignDateStr >= startStr &&
                resignDateStr <= endStr &&
                salAmt > 0 &&
                calendarWorkDaysFullMonth > 0
              if (!inR) return `인사 등록 월급 ${Math.floor(salAmt)}`
              const pN = calendarWorkDaysThroughResign
              const pD = calendarWorkDaysFullMonth
              if (pN < pD)
                return `퇴사 ${resignDateStr} 반영 일할 (달력 예정근무 ${pN}/${pD}일, 등록 월급 ${Math.floor(salAmt)})`
              if (pN === 0)
                return `퇴사 ${resignDateStr} — 해당 월 달력 예정근무 0일 (등록 월급 ${Math.floor(salAmt)})`
              return `퇴사 ${resignDateStr} 해당월 만근에 해당 (달력 예정 ${pD}일, 등록 월급 ${Math.floor(salAmt)})`
            })(),
        amount: salary,
      })
      if (posAllowAmount > 0) {
        explain.posAllow.push({
          reason: '직책수당',
          detail: '인사 정보의 월 고정 수당',
          amount: posAllowAmount,
        })
      }
      if (hazAllow > 0) {
        const sortedWorkDates = Array.from(workDates).sort()
        const hazDailyAmt = hazAllowPerDay > 0 ? Math.floor(hazAllowPerDay) : 0
        for (const d of sortedWorkDates) {
          explain.hazAllow.push({
            date: d,
            reason: '주방 위험수당',
            detail: '근무 1일분',
            amount: hazDailyAmt,
          })
        }
        explain.hazAllow.push({
          reason: '위험수당 합계',
          detail: `${workDays}일 × ${Math.floor(hazAllowPerDay)}`,
          amount: hazAllow,
        })
      } else if (
        isKitchen &&
        hazAllowPerDay > 0 &&
        workDays > 0 &&
        hazEvalRules.requireEvalGrade &&
        !employeeMeetsMinEvalLetterGrade(empGrade, hazEvalRules.minEvalGrade)
      ) {
        explain.hazAllow.push({
          reason: '위험수당 미지급',
          detail: `평가등급 ${hazEvalRules.minEvalGrade} 이상 필요 (현재: ${empGrade || '미등록'})`,
          amount: 0,
        })
      }

      if (diligenceAllow > 0) {
        explain.diligenceAllow.push({
          reason: '근면수당',
          detail: '해당 월 휴가 미사용(유급·무급 승인 건 포함), 지각·조퇴·결석 없음',
          amount: diligenceAllow,
        })
      } else if (diligenceCfg > 0 && !isDirectorRole && workDays > 0) {
        const missReason = leaveEvents.length > 0
          ? '승인 휴가 사용(유급·무급 포함)'
          : unpaidLeaveDays > 0 || absenceDays > 0
            ? '무급휴가 또는 결석'
            : lateMin > 0 || earlyMin > 0 || lateDaysOver10 >= LATE_HALF_DAY_COUNT
              ? '지각·조퇴 또는 반차 공제 대상'
              : '조건 미충족'
        explain.diligenceAllow.push({
          reason: '근면수당 미지급',
          detail: missReason,
          amount: 0,
        })
      }

      if (birthBonus > 0 && birth) {
        const mm = String(birth.getMonth() + 1).padStart(2, '0')
        const dd = String(birth.getDate()).padStart(2, '0')
        explain.birthBonus.push({
          date: `${year}-${mm}-${dd}`,
          reason: '생일 보너스',
          detail: '근속 1년 이상',
          amount: birthBonus,
        })
      }

      const holidayWorkDates = Array.from(workDates).filter((d) => holidaySet.has(d)).sort()
      if (holidayPay > 0) {
        const perHoliday =
          isHourly && salAmt > 0
            ? Math.floor(8 * salAmt)
            : (salary > 0 ? Math.floor(salary / 30) : 0)
        for (const d of holidayWorkDates) {
          explain.holidayPay.push({
            date: d,
            reason: '공휴일 근무수당',
            detail: isHourly ? '시급제 8시간분' : '월급제 일당 1회분',
            amount: perHoliday,
          })
        }
        explain.holidayPay.push({
          reason: '공휴일 수당 합계',
          detail: `${holidayWorkDays}일`,
          amount: holidayPay,
        })
      }

      const otBaseHourly =
        isHourly
          ? salAmt
          : (LATE_DED_HOURS_BASE > 0 && salary > 0 ? salary / LATE_DED_HOURS_BASE : 0)
      const otLines = attDayLines[attKey]?.ot || []
      for (const otLine of otLines) {
        const dayAmt =
          otLine.countedMin > 0 && otBaseHourly > 0
            ? Math.floor((otLine.countedMin / 60) * otBaseHourly * OT_MULTIPLIER)
            : 0
        explain.ot.push({
          date: otLine.date,
          reason: otLine.countedMin > 0 ? '연장근무(1.5배)' : '연장근무 미인정',
          detail:
            otLine.countedMin > 0
              ? `${Math.round((otLine.countedMin / 60) * 10) / 10}시간 반영`
              : `${otLine.rawMin}분 (최소 ${OT_PAYROLL_MIN_MINUTES}분 미만)`,
          minutes: otLine.countedMin,
          amount: dayAmt,
        })
      }
      if (otAmt > 0 || otLines.length > 0) {
        explain.ot.push({
          reason: 'OT 합계',
          detail: `${Math.round((otMin / 60) * 10) / 10}시간`,
          minutes: otMin,
          amount: otAmt,
        })
      }

      const lateEarlyHourly =
        isHourly
          ? salAmt
          : (LATE_DED_HOURS_BASE > 0 && salary > 0 ? salary / LATE_DED_HOURS_BASE : 0)
      const lateLines = attDayLines[attKey]?.late || []
      for (const l of lateLines) {
        explain.lateEarly.push({
          date: l.date,
          reason: '지각 공제',
          detail: `${l.minutes}분`,
          minutes: l.minutes,
          amount: lateEarlyHourly > 0 ? Math.floor((l.minutes / 60) * lateEarlyHourly) : 0,
        })
      }
      const earlyLines = attDayLines[attKey]?.early || []
      for (const eLine of earlyLines) {
        explain.lateEarly.push({
          date: eLine.date,
          reason: '조퇴 공제',
          detail: `${eLine.minutes}분`,
          minutes: eLine.minutes,
          amount: lateEarlyHourly > 0 ? Math.floor((eLine.minutes / 60) * lateEarlyHourly) : 0,
        })
      }
      if (!isOfficeStore(store) && lateDaysOver10 >= LATE_HALF_DAY_COUNT && salary > 0 && expectedWorkDaysForDed > 0) {
        explain.lateEarly.push({
          reason: '반차 공제',
          detail: `10분 이상 지각 ${lateDaysOver10}회`,
          amount: Math.floor((salary / expectedWorkDaysForDed) * 0.5),
        })
      }
      if (lateDed > 0 || earlyDed > 0) {
        explain.lateEarly.push({
          reason: '지각/조퇴 공제 합계',
          detail: `지각 ${lateMin}분, 조퇴 ${earlyMin}분`,
          amount: lateDed + earlyDed,
        })
      }

      const unpaidLeaves = leaveEvents.filter((x) => x.kind === 'unpaid')
      for (const lv of unpaidLeaves) {
        explain.otherDed.push({
          date: lv.date,
          reason: '무급휴가',
          detail: `${lv.type}${lv.note ? ` (${lv.note})` : ''}`,
          amount: dailyRate > 0 ? Math.floor(dailyRate * lv.days) : 0,
        })
      }
      if (!isHourly && absenceDays > 0) {
        for (const ad of absenceDateList) {
          explain.otherDed.push({
            date: ad,
            reason: '결석 공제',
            detail: '무급 결석 1일',
            amount: dailyRate > 0 ? Math.floor(dailyRate) : 0,
          })
        }
      }
      if (unpaidAbsenceDed > 0) {
        explain.otherDed.push({
          reason: '기타 공제 합계',
          detail: `무급휴가 ${unpaidLeaveDays}일 + 결석 ${absenceDays}일`,
          amount: unpaidAbsenceDed,
        })
      }

      explain.sso.push({
        reason: 'SSO(사회보험) 공제',
        detail: ssoExempt
          ? '인사 설정: SSO 공제 제외 (미가입 등)'
          : `기본급 기준 ${fmtMoney(ssoBase)} × 5% (연도 상한 적용)`,
        amount: sso,
      })

      const idNumRaw = (e as EmpRowPayroll).id_number != null ? String((e as EmpRowPayroll).id_number).trim() : ''
      const idDigits = idNumRaw.replace(/\D/g, '')
      const nameTitle =
        (e as EmpRowPayroll).name_title != null ? String((e as EmpRowPayroll).name_title).trim() : ''
      const ssoMemRaw =
        (e as EmpRowPayroll).sso_number != null ? String((e as EmpRowPayroll).sso_number).trim() : ''

      list.push({
        id: employeeId > 0 ? `${normMonth}_${store}_${employeeId}` : normMonth + '_' + store + '_' + name,
        month: normMonth,
        store,
        name,
        ...(employeeId > 0 ? { employeeId } : {}),
        ...(employeeCode ? { employeeCode } : {}),
        dept,
        role,
        salary,
        posAllow: posAllowAmount,
        hazAllow,
        diligenceAllow,
        birthBonus,
        holidayPay,
        holidayWorkDays,
        splBonus: 0,
        ot15,
        ot20: 0,
        ot30: 0,
        otAmt,
        lateMin,
        lateDed,
        earlyMin,
        earlyDed,
        sso,
        ssoBase,
        ssoExempt,
        ...(idDigits ? { idNumber: idDigits.length === 13 ? idDigits : idNumRaw } : {}),
        ...(nameTitle ? { nameTitle } : {}),
        ...(ssoMemRaw ? { ssoMemberNo: ssoMemRaw } : {}),
        dateOfBirth: empYmd((e as EmpRowPayroll).birth),
        joinDate: empYmd((e as EmpRowPayroll).join_date),
        resignDate: empYmd((e as EmpRowPayroll).resign_date),
        employerSso: ssoExempt ? 0 : sso,
        tax: 0,
        otherDed: unpaidAbsenceDed,
        netPay,
        status: '대기',
        calcExplain: explain,
      })
    }

    list.sort((a, b) => (a.store !== b.store ? a.store.localeCompare(b.store) : a.name.localeCompare(b.name)))
    return NextResponse.json({ success: true, list }, { headers })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    const errStack = e instanceof Error ? e.stack : ''
    console.error('getPayrollCalc:', errMsg, errStack)
    return NextResponse.json(
      { success: false, msg: '급여 계산 중 오류가 발생했습니다.', detail: errMsg },
      { status: 500, headers }
    )
  }
}
