/**
 * 급여 주기(컷오프·지급일).
 * payroll_records.month 는 YYYY-MM 주기 라벨. 이 모듈은 그 라벨의 근태 기간·지급일만 해석한다.
 */
import { addDayBangkok } from '@/lib/attendance-utils'
import { PAYROLL_PAY_DAY_OF_MONTH, shiftYearMonth } from '@/lib/payroll-utils'

export const PAYROLL_CYCLE_SETTINGS_KEY = 'payroll_cycle'
export const PAYROLL_CYCLE_MAX_PERIOD_END_DAY = 27
export const PAYROLL_CYCLE_MAX_PAY_DAY = 28

export type PayrollCycleVersion = {
  effectiveMonth: string
  /** 0 = 달력 말일. 1~27 = 그날까지(25면 전월 26일~당월 25일) */
  periodEndDay: number
  /** 0 = 지급월 말일. 1~28 = 그 날짜 */
  payDay: number
  /** 0 = 당월 지급. 1 = 익월 지급 */
  payMonthOffset: number
}

export type PayrollCycleSettings = { versions: PayrollCycleVersion[] }

export type ResolvedPayrollPeriod = {
  month: string
  start: string
  end: string
  payYmd: string
  isTransitionShort: boolean
  isLegacy: boolean
}

export const EMPTY_PAYROLL_CYCLE_SETTINGS: PayrollCycleSettings = { versions: [] }

export const PAYROLL_CYCLE_PRESET_CALENDAR: Omit<PayrollCycleVersion, 'effectiveMonth'> = {
  periodEndDay: 0,
  payDay: PAYROLL_PAY_DAY_OF_MONTH,
  payMonthOffset: 1,
}

export const PAYROLL_CYCLE_PRESET_26_25: Omit<PayrollCycleVersion, 'effectiveMonth'> = {
  periodEndDay: 25,
  payDay: 0,
  payMonthOffset: 0,
}

const YM_RE = /^\d{4}-\d{2}$/
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

export function isYearMonth(value: string): boolean {
  return YM_RE.test(String(value || '').slice(0, 7))
}

export function lastDayOfMonthYmd(yearMonth: string): string {
  const m = String(yearMonth || '').slice(0, 7)
  const next = shiftYearMonth(m, 1)
  if (!next) return ''
  return addDayBangkok(`${next}-01`, -1)
}

/** day 0 = 해당 월 말일. day가 말일보다 크면 말일로 자른다. */
export function ymdForDayOfMonth(yearMonth: string, day: number): string {
  const m = String(yearMonth || '').slice(0, 7)
  if (!isYearMonth(m)) return ''
  const last = lastDayOfMonthYmd(m)
  if (!last) return ''
  if (!Number.isFinite(day) || day <= 0) return last
  const lastN = Number(last.slice(8, 10))
  const d = Math.min(Math.floor(day), lastN)
  if (d < 1) return last
  return `${m}-${String(d).padStart(2, '0')}`
}

export function parsePayrollCycleVersion(raw: unknown): PayrollCycleVersion | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const effectiveMonth = String(o.effectiveMonth || o.effective_month || '').slice(0, 7)
  if (!isYearMonth(effectiveMonth)) return null
  const periodEndDay = Math.floor(Number(o.periodEndDay ?? o.period_end_day))
  const payDay = Math.floor(Number(o.payDay ?? o.pay_day))
  const payMonthOffset = Math.floor(Number(o.payMonthOffset ?? o.pay_month_offset))
  if (!Number.isFinite(periodEndDay) || periodEndDay < 0 || periodEndDay > PAYROLL_CYCLE_MAX_PERIOD_END_DAY) {
    return null
  }
  if (!Number.isFinite(payDay) || payDay < 0 || payDay > PAYROLL_CYCLE_MAX_PAY_DAY) return null
  if (payMonthOffset !== 0 && payMonthOffset !== 1) return null
  return { effectiveMonth, periodEndDay, payDay, payMonthOffset }
}

export function parsePayrollCycleSettings(raw: unknown): PayrollCycleSettings {
  if (!raw || typeof raw !== 'object') return { versions: [] }
  const o = raw as Record<string, unknown>
  const list = Array.isArray(o.versions) ? o.versions : []
  const parsed: PayrollCycleVersion[] = []
  for (const item of list) {
    const v = parsePayrollCycleVersion(item)
    if (v) parsed.push(v)
  }
  if (parsed.length === 0) {
    const single = parsePayrollCycleVersion(o)
    if (single) parsed.push(single)
  }
  return normalizePayrollCycleSettings({ versions: parsed })
}

export function normalizePayrollCycleSettings(settings: PayrollCycleSettings): PayrollCycleSettings {
  const byMonth = new Map<string, PayrollCycleVersion>()
  for (const v of settings.versions || []) {
    const parsed = parsePayrollCycleVersion(v)
    if (!parsed) continue
    byMonth.set(parsed.effectiveMonth, parsed)
  }
  const versions = [...byMonth.values()].sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth))
  return { versions }
}

export function upsertPayrollCycleVersion(
  current: PayrollCycleSettings,
  next: PayrollCycleVersion
): PayrollCycleSettings {
  const parsed = parsePayrollCycleVersion(next)
  if (!parsed) return normalizePayrollCycleSettings(current)
  const others = (current.versions || []).filter((v) => v.effectiveMonth !== parsed.effectiveMonth)
  return normalizePayrollCycleSettings({ versions: [...others, parsed] })
}

function versionForMonth(month: string, settings: PayrollCycleSettings): PayrollCycleVersion | null {
  const m = String(month || '').slice(0, 7)
  if (!isYearMonth(m)) return null
  let hit: PayrollCycleVersion | null = null
  for (const v of settings.versions || []) {
    if (v.effectiveMonth <= m) hit = v
  }
  return hit
}

function previousVersion(month: string, settings: PayrollCycleSettings): PayrollCycleVersion | null {
  const current = versionForMonth(month, settings)
  if (!current) return null
  let prev: PayrollCycleVersion | null = null
  for (const v of settings.versions || []) {
    if (v.effectiveMonth < current.effectiveMonth) prev = v
  }
  return prev
}

function isCalendarVersion(v: PayrollCycleVersion | null): boolean {
  if (!v) return true
  return v.periodEndDay === 0
}

function payYmdFromVersion(month: string, v: PayrollCycleVersion | null): string {
  if (!v) {
    const next = shiftYearMonth(month, 1)
    if (!next) return ''
    return ymdForDayOfMonth(next, PAYROLL_PAY_DAY_OF_MONTH)
  }
  const payMonth = shiftYearMonth(month, v.payMonthOffset)
  if (!payMonth) return ''
  return ymdForDayOfMonth(payMonth, v.payDay)
}

function calendarPeriod(month: string, v: PayrollCycleVersion | null): ResolvedPayrollPeriod {
  return {
    month,
    start: `${month}-01`,
    end: lastDayOfMonthYmd(month),
    payYmd: payYmdFromVersion(month, v),
    isTransitionShort: false,
    isLegacy: !v,
  }
}

export function resolvePayrollPeriod(
  monthStr: string,
  settings: PayrollCycleSettings = EMPTY_PAYROLL_CYCLE_SETTINGS
): ResolvedPayrollPeriod {
  const month = String(monthStr || '').slice(0, 7)
  if (!isYearMonth(month)) {
    return { month, start: '', end: '', payYmd: '', isTransitionShort: false, isLegacy: true }
  }
  const normalized = normalizePayrollCycleSettings(settings)
  const version = versionForMonth(month, normalized)
  if (!version || isCalendarVersion(version)) {
    return calendarPeriod(month, version)
  }

  const prev = previousVersion(month, normalized)
  const isTransitionShort = month === version.effectiveMonth && isCalendarVersion(prev)

  if (isTransitionShort) {
    return {
      month,
      start: `${month}-01`,
      end: ymdForDayOfMonth(month, version.periodEndDay),
      payYmd: payYmdFromVersion(month, version),
      isTransitionShort: true,
      isLegacy: false,
    }
  }

  const prevMonth = shiftYearMonth(month, -1)
  return {
    month,
    start: ymdForDayOfMonth(prevMonth, version.periodEndDay + 1),
    end: ymdForDayOfMonth(month, version.periodEndDay),
    payYmd: payYmdFromVersion(month, version),
    isTransitionShort: false,
    isLegacy: false,
  }
}

/** 오늘(방콕) 기준 기간 종료일이 지난 가장 최근 주기 라벨 */
export function defaultPayrollMonthForCycle(
  settings: PayrollCycleSettings = EMPTY_PAYROLL_CYCLE_SETTINGS,
  now = new Date()
): string {
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  const curMonth = today.slice(0, 7)
  if (!isYearMonth(curMonth)) return ''
  const thisPeriod = resolvePayrollPeriod(curMonth, settings)
  if (thisPeriod.end && thisPeriod.end <= today) return curMonth
  return shiftYearMonth(curMonth, -1) || curMonth
}

export function payrollPayYmdForCycle(
  monthStr: string,
  settings: PayrollCycleSettings = EMPTY_PAYROLL_CYCLE_SETTINGS
): string {
  return resolvePayrollPeriod(monthStr, settings).payYmd
}

export function payrollDateRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  const aS = String(aStart || '').slice(0, 10)
  const aE = String(aEnd || '').slice(0, 10)
  const bS = String(bStart || '').slice(0, 10)
  const bE = String(bEnd || '').slice(0, 10)
  if (!YMD_RE.test(aS) || !YMD_RE.test(aE) || !YMD_RE.test(bS) || !YMD_RE.test(bE)) return false
  if (aS > aE || bS > bE) return false
  return aS <= bE && bS <= aE
}

export function confirmedMonthPeriodWouldChange(
  month: string,
  current: PayrollCycleSettings,
  proposed: PayrollCycleSettings
): boolean {
  const a = resolvePayrollPeriod(month, current)
  const b = resolvePayrollPeriod(month, proposed)
  return a.start !== b.start || a.end !== b.end || a.payYmd !== b.payYmd
}

export function findConfirmedMonthBlockedByCycleChange(
  confirmedMonths: string[],
  current: PayrollCycleSettings,
  proposed: PayrollCycleSettings
): string | null {
  for (const raw of confirmedMonths) {
    const m = String(raw || '').slice(0, 7)
    if (!isYearMonth(m)) continue
    if (confirmedMonthPeriodWouldChange(m, current, proposed)) return m
  }
  return null
}

export type PayrollPeriodEmployeeKey = {
  employeeId?: number | null
  store: string
  name: string
}

export function payrollNeighborEmployeeKey(row: PayrollPeriodEmployeeKey): string {
  const eid =
    row.employeeId != null && Number.isFinite(Number(row.employeeId)) ? Math.floor(Number(row.employeeId)) : 0
  if (eid > 0) return `#${eid}`
  return `${String(row.store || '').trim().toLowerCase()}|${String(row.name || '').trim().toLowerCase()}`
}

export function findOverlappingNeighborPeriod(params: {
  start: string
  end: string
  employees: PayrollPeriodEmployeeKey[]
  neighbors: Array<
    PayrollPeriodEmployeeKey & {
      month?: string
      periodStart?: string | null
      periodEnd?: string | null
    }
  >
}): { month: string; name: string } | null {
  const empKeys = new Set(params.employees.map(payrollNeighborEmployeeKey))
  for (const n of params.neighbors) {
    if (!empKeys.has(payrollNeighborEmployeeKey(n))) continue
    const nMonth = String(n.month || '').slice(0, 7)
    const nStart = String(n.periodStart || '').slice(0, 10) || (isYearMonth(nMonth) ? `${nMonth}-01` : '')
    const nEnd = String(n.periodEnd || '').slice(0, 10) || (isYearMonth(nMonth) ? lastDayOfMonthYmd(nMonth) : '')
    if (!payrollDateRangesOverlap(params.start, params.end, nStart, nEnd)) continue
    return { month: nMonth, name: String(n.name || '').trim() }
  }
  return null
}

export function formatPayrollPeriodRange(
  period: Pick<ResolvedPayrollPeriod, 'start' | 'end' | 'payYmd'>
): string {
  if (!period.start || !period.end) return ''
  if (!period.payYmd) return `${period.start} ~ ${period.end}`
  return `${period.start} ~ ${period.end} / ${period.payYmd}`
}

export function validatePayrollCycleVersionInput(
  raw: unknown
): { ok: true; version: PayrollCycleVersion } | { ok: false; message: string } {
  const v = parsePayrollCycleVersion(raw)
  if (!v) {
    return {
      ok: false,
      message:
        '급여 주기 값이 올바르지 않습니다. 마감일은 말일 또는 1~27일, 지급일은 말일 또는 1~28일, 적용월은 YYYY-MM 이어야 합니다.',
    }
  }
  return { ok: true, version: v }
}
