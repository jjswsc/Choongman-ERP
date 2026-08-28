/**
 * 시간표 슬롯·저장·조회 — 직원 식별은 employee_code 우선 (이름 오타·표기 차이 방지).
 */
import {
  findStaffForScheduleSlotName,
  formatEmployeeDisplayName,
  normalizeEmployeeCodeForMatch,
  normalizeEmployeeNameFields,
  type StaffRowForScheduleMatch,
} from '@/lib/employee-display-name'

export const SCHEDULE_BREAK_PREFIX = 'BRK_'
export const SCHEDULE_LEAVE_PREFIX = 'LEAVE_'

export type ScheduleRosterEntry = {
  id: number
  name: string
  nick: string
  employeeCode: string
}

export type ScheduleEmployeeRowInput = {
  id?: number
  name?: string
  nick?: string | null
  name_title?: string | null
  employee_code?: string | null
}

export function toScheduleStaffLite(e: ScheduleEmployeeRowInput): StaffRowForScheduleMatch {
  const rawName = String(e.name || '').trim()
  const rawTitle = String(e.name_title || '').trim()
  const { name: normName } = normalizeEmployeeNameFields(rawName, rawTitle)
  const nickVal = String(e.nick || normName || rawName).trim() || rawName
  return { name: normName || rawName, nick: nickVal }
}

/** API·UI 슬롯 키: 정규화 직원코드, 없으면 본명 */
export function scheduleSlotKeyFromEmployee(input: {
  employeeCode?: string | null
  name?: string
}): string {
  const code = normalizeEmployeeCodeForMatch(String(input.employeeCode ?? ''))
  if (code) return code
  return String(input.name || '').trim()
}

export function scheduleBreakSlotKey(workSlotKey: string): string {
  return `${SCHEDULE_BREAK_PREFIX}${workSlotKey}`
}

export function isScheduleBreakSlot(val: string): boolean {
  return String(val || '').startsWith(SCHEDULE_BREAK_PREFIX)
}

export function isScheduleLeaveSlot(val: string): boolean {
  return String(val || '').startsWith(SCHEDULE_LEAVE_PREFIX)
}

/** BRK_M0020 → M0020 */
export function scheduleWorkSlotKeyFromSlot(val: string): string {
  const s = String(val || '').trim()
  if (isScheduleBreakSlot(s)) return s.slice(SCHEDULE_BREAK_PREFIX.length)
  return s
}

export function buildScheduleEmployeeRoster(
  employees: ScheduleEmployeeRowInput[] | null | undefined
): {
  entries: ScheduleRosterEntry[]
  byCode: Map<string, ScheduleRosterEntry>
  byId: Map<number, ScheduleRosterEntry>
  liteList: StaffRowForScheduleMatch[]
} {
  const entries: ScheduleRosterEntry[] = []
  const byCode = new Map<string, ScheduleRosterEntry>()
  const byId = new Map<number, ScheduleRosterEntry>()
  const liteList: StaffRowForScheduleMatch[] = []

  for (const e of employees || []) {
    const idNum = e.id != null && Number.isFinite(Number(e.id)) ? Math.floor(Number(e.id)) : 0
    if (idNum <= 0) continue
    const rawName = String(e.name || '').trim()
    const rawTitle = String(e.name_title || '').trim()
    const { name: normName } = normalizeEmployeeNameFields(rawName, rawTitle)
    const lite = toScheduleStaffLite(e)
    const employeeCode = normalizeEmployeeCodeForMatch(String(e.employee_code ?? ''))
    const entry: ScheduleRosterEntry = {
      id: idNum,
      name: normName || rawName,
      nick: lite.nick,
      employeeCode,
    }
    entries.push(entry)
    liteList.push(lite)
    byId.set(idNum, entry)
    if (employeeCode) byCode.set(employeeCode, entry)
  }

  return { entries, byCode, byId, liteList }
}

/** 슬롯 키(코드·레거시 이름) → 로스터 항목 */
export function resolveScheduleRosterEntry(
  slotKey: string,
  roster: ReturnType<typeof buildScheduleEmployeeRoster>
): ScheduleRosterEntry | undefined {
  const raw = scheduleWorkSlotKeyFromSlot(String(slotKey || '').trim())
  if (!raw) return undefined
  const code = normalizeEmployeeCodeForMatch(raw)
  if (code) {
    const byCode = roster.byCode.get(code)
    if (byCode) return byCode
  }
  const hit = findStaffForScheduleSlotName(roster.liteList, raw)
  if (!hit) return undefined
  return roster.entries.find((e) => e.name === hit.name && e.nick === hit.nick)
}

/** 조회 API 행 → 편집 그리드 슬롯 키 */
export function scheduleSlotKeyFromLoadedRow(
  row: { name?: string; employeeCode?: string | null; employeeId?: number | null },
  roster: ReturnType<typeof buildScheduleEmployeeRoster>
): string {
  const code = normalizeEmployeeCodeForMatch(String(row.employeeCode ?? ''))
  if (code && roster.byCode.has(code)) return code
  const eid =
    row.employeeId != null && Number.isFinite(Number(row.employeeId))
      ? Math.floor(Number(row.employeeId))
      : 0
  if (eid > 0) {
    const byId = roster.byId.get(eid)
    if (byId?.employeeCode) return byId.employeeCode
    if (byId) return scheduleSlotKeyFromEmployee(byId)
  }
  const nm = String(row.name || '').trim()
  if (!nm) return ''
  const hit = resolveScheduleRosterEntry(nm, roster)
  if (hit) return scheduleSlotKeyFromEmployee(hit)
  return nm
}

/** 저장 API 입력: 슬롯 키 → { name, employeeCode, employeeId } */
export function resolveScheduleSavePayloadFromSlot(
  slotKey: string,
  roster: ReturnType<typeof buildScheduleEmployeeRoster>
): { name: string; employeeCode: string; employeeId: number | null } {
  const entry = resolveScheduleRosterEntry(slotKey, roster)
  if (entry) {
    return {
      name: entry.name,
      employeeCode: entry.employeeCode,
      employeeId: entry.id,
    }
  }
  const raw = scheduleWorkSlotKeyFromSlot(slotKey)
  const code = normalizeEmployeeCodeForMatch(raw)
  return { name: raw, employeeCode: code, employeeId: null }
}

/** 이름·코드 맵 (조회 API 닉네임 해석) */
export function buildScheduleNameNickMaps(employees: ScheduleEmployeeRowInput[] | null | undefined): {
  nameToNick: Record<string, string>
  codeToNick: Map<string, string>
  empIdToNick: Map<number, string>
} {
  const nameToNick: Record<string, string> = {}
  const codeToNick = new Map<string, string>()
  const empIdToNick = new Map<number, string>()

  for (const e of employees || []) {
    const rawName = String(e.name || '').trim()
    const rawTitle = String(e.name_title || '').trim()
    const { name: normName } = normalizeEmployeeNameFields(rawName, rawTitle)
    const lite = toScheduleStaffLite(e)
    const nickVal = lite.nick
    const idNum = e.id != null && Number.isFinite(Number(e.id)) ? Math.floor(Number(e.id)) : 0
    if (idNum > 0) empIdToNick.set(idNum, nickVal)
    const codeKey = normalizeEmployeeCodeForMatch(String(e.employee_code ?? ''))
    if (codeKey) codeToNick.set(codeKey, nickVal)
    const keys = new Set<string>()
    if (rawName) keys.add(rawName)
    if (normName) keys.add(normName)
    const displayFull = formatEmployeeDisplayName(normName, rawTitle).trim()
    if (displayFull) keys.add(displayFull)
    if (codeKey) keys.add(codeKey)
    for (const k of keys) nameToNick[k] = nickVal
  }

  return { nameToNick, codeToNick, empIdToNick }
}

export function resolveScheduleDisplayNickFromMaps(
  slotName: string,
  slotEmployeeId: unknown,
  slotEmployeeCode: unknown,
  maps: ReturnType<typeof buildScheduleNameNickMaps>,
  rosterLite: StaffRowForScheduleMatch[]
): string {
  const nm = String(slotName || '').trim()
  const eid =
    slotEmployeeId != null && Number.isFinite(Number(slotEmployeeId))
      ? Math.floor(Number(slotEmployeeId))
      : 0
  if (eid > 0) {
    const byId = maps.empIdToNick.get(eid)
    if (byId) return byId
  }
  const rowCode = normalizeEmployeeCodeForMatch(String(slotEmployeeCode ?? ''))
  if (rowCode) {
    const byRowCode = maps.codeToNick.get(rowCode)
    if (byRowCode) return byRowCode
  }
  const ck = normalizeEmployeeCodeForMatch(nm)
  if (ck) {
    const byCode = maps.codeToNick.get(ck)
    if (byCode) return byCode
  }
  const hit = findStaffForScheduleSlotName(rosterLite, nm)
  if (hit) return hit.nick
  return maps.nameToNick[nm] || nm
}

const SCHEDULE_HOUR_MAX = 29

function clampScheduleHour(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(SCHEDULE_HOUR_MAX, Math.trunc(n)))
}

/**
 * 스케줄 그리드와 같은 30분 슬롯.
 * 24 이상은 익일(예: 26:00 = 다음날 02:00). 24시간 매장 심야 휴게는 00:00이 아니라 24:00+ 를 쓴다.
 */
export function buildScheduleHalfHourOptions(startHour: number, endHour: number): string[] {
  const lo = clampScheduleHour(startHour)
  const hi = Math.max(lo, clampScheduleHour(endHour))
  const out: string[] = []
  for (let h = lo; h <= hi; h++) {
    const hh = String(h).padStart(2, '0')
    out.push(`${hh}:00`, `${hh}:30`)
  }
  return out
}
