/**
 * 주간 근무표 저장 전후를 직원·날짜 단위로 비교한다.
 * 값이 같은 직원은 기록하지 않는다. 한 주를 통째로 저장해도 바뀐 칸만 남긴다.
 */
import { normalizeEmployeeCodeForMatch, normalizeEmployeeNameForGradeMatch } from '@/lib/employee-display-name'

export type ScheduleSlotSnapshot = {
  date: string
  employeeId: number
  employeeCode: string
  name: string
  planIn: string
  planOut: string
  breakStart: string
  breakEnd: string
  area: string
  planInPrevDay: boolean
}

export type ScheduleEditField =
  | 'plan_in'
  | 'plan_out'
  | 'break_start'
  | 'break_end'
  | 'area'
  | 'plan_in_prev_day'
  | 'shift'

export type ScheduleEditDiff = {
  date: string
  employeeId: number
  employeeCode: string
  employeeName: string
  fieldName: ScheduleEditField
  beforeValue: string
  afterValue: string
}

export function formatPlanHm(raw: string | null | undefined): string {
  const m = String(raw || '').trim().match(/(\d{1,2})\s*[:\s]\s*(\d{1,2})/)
  if (!m) return ''
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (!Number.isFinite(h) || !Number.isFinite(min)) return ''
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function normName(name: string): string {
  return normalizeEmployeeNameForGradeMatch(name).trim().toLowerCase()
}

function normCode(code: string): string {
  return normalizeEmployeeCodeForMatch(code).trim().toLowerCase()
}

function comparable(slot: ScheduleSlotSnapshot): Record<ScheduleEditField, string> {
  return {
    plan_in: formatPlanHm(slot.planIn),
    plan_out: formatPlanHm(slot.planOut),
    break_start: formatPlanHm(slot.breakStart),
    break_end: formatPlanHm(slot.breakEnd),
    area: String(slot.area || '').trim(),
    plan_in_prev_day: slot.planInPrevDay ? '1' : '0',
    shift: '',
  }
}

export function shiftSummary(slot: ScheduleSlotSnapshot): string {
  const c = comparable(slot)
  const prev = slot.planInPrevDay ? '*' : ''
  const span = `${prev}${c.plan_in || '-'}-${c.plan_out || '-'}`
  const br = c.break_start || c.break_end ? ` ${c.break_start || '-'}-${c.break_end || '-'}` : ''
  const area = c.area ? ` ${c.area}` : ''
  return `${span}${br}${area}`.trim()
}

function matchKey(slot: ScheduleSlotSnapshot, kind: 'id' | 'code' | 'name'): string {
  if (kind === 'id' && slot.employeeId > 0) return `${slot.date}|#${slot.employeeId}`
  if (kind === 'code') {
    const code = normCode(slot.employeeCode)
    if (code) return `${slot.date}|c:${code}`
  }
  if (kind === 'name') {
    const name = normName(slot.name)
    if (name) return `${slot.date}|n:${name}`
  }
  return ''
}

const FIELD_ORDER: ScheduleEditField[] = [
  'plan_in',
  'plan_out',
  'break_start',
  'break_end',
  'area',
  'plan_in_prev_day',
]

export function diffScheduleWeek(before: ScheduleSlotSnapshot[], after: ScheduleSlotSnapshot[]): ScheduleEditDiff[] {
  const pool = before.map((slot, index) => ({ slot, index, used: false }))
  const diffs: ScheduleEditDiff[] = []

  const take = (slot: ScheduleSlotSnapshot) => {
    for (const kind of ['id', 'code', 'name'] as const) {
      const key = matchKey(slot, kind)
      if (!key) continue
      const hit = pool.find((row) => !row.used && matchKey(row.slot, kind) === key)
      if (hit) {
        hit.used = true
        return hit.slot
      }
    }
    return null
  }

  for (const next of after) {
    const prev = take(next)
    if (!prev) {
      diffs.push({
        date: next.date,
        employeeId: next.employeeId,
        employeeCode: next.employeeCode,
        employeeName: next.name,
        fieldName: 'shift',
        beforeValue: '',
        afterValue: shiftSummary(next),
      })
      continue
    }
    const a = comparable(prev)
    const b = comparable(next)
    for (const field of FIELD_ORDER) {
      if (a[field] === b[field]) continue
      diffs.push({
        date: next.date,
        employeeId: next.employeeId > 0 ? next.employeeId : prev.employeeId,
        employeeCode: next.employeeCode || prev.employeeCode,
        employeeName: next.name || prev.name,
        fieldName: field,
        beforeValue: a[field],
        afterValue: b[field],
      })
    }
  }

  for (const row of pool) {
    if (row.used) continue
    diffs.push({
      date: row.slot.date,
      employeeId: row.slot.employeeId,
      employeeCode: row.slot.employeeCode,
      employeeName: row.slot.name,
      fieldName: 'shift',
      beforeValue: shiftSummary(row.slot),
      afterValue: '',
    })
  }

  return diffs
}
