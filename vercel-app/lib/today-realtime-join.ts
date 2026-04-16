/**
 * 당일 실시간 근무: 스케줄 행 ↔ 출근 요약 매칭.
 * 우선순위: 직원코드(정규화) > employee_id > 정규화 이름 (레거시)
 * 소속 매장 외 지원 매장(extra_stores) 직원도 스케줄·로그 매장과 맞춤 (실롬 vs 에까마이 등).
 */
import { expandStoreVariantsForGrade, storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { normalizeEmployeeCodeForMatch, normalizeEmployeeNameForGradeMatch } from '@/lib/employee-display-name'
import { parseExtraStoresColumn } from '@/lib/extra-stores-column'

/**
 * schedules.store_name vs attendance_logs.store_name 이 "CM Silom" / "Silom" 등으로 달라도
 * 동일한 joinKey 접두가 되도록 통일 (등급·매장 매칭과 동일 변형 집합 사용).
 */
export function canonicalStoreSegmentForJoinKey(raw: string): string {
  const t = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!t) return ''
  const vs = expandStoreVariantsForGrade(t)
    .map((v) => String(v || '').trim().replace(/\s+/g, ' '))
    .filter(Boolean)
  if (vs.length === 0) return t
  const low = vs.map((v) => v.toLowerCase())
  const cmIdx = low.findIndex((v) => v.startsWith('cm '))
  if (cmIdx >= 0) return vs[cmIdx]
  return vs[0]
}

export type EmpRowForRealtimeJoin = {
  id?: number
  name?: string
  nick?: string
  store?: string
  job?: string
  employee_code?: string | null
  /** JSON/배열 — 소속 외 근무 가능 매장 (getWeeklySchedule 과 동일) */
  extra_stores?: unknown
}

/** 스케줄/출근 로그의 store_name 과 직원 소속·지원 매장이 맞는지 */
export function empWorksAtRealtimeStore(e: EmpRowForRealtimeJoin, scheduleOrLogStore: string): boolean {
  const target = String(scheduleOrLogStore || '').trim()
  if (!target) return false
  const primary = String(e.store || '').trim()
  if (storesMatchForGradeLookup(primary, target)) return true
  for (const ex of parseExtraStoresColumn(e.extra_stores)) {
    if (storesMatchForGradeLookup(ex, target)) return true
  }
  return false
}

/**
 * 스케줄/로그 문자열이 employees.name·nick 과 같은 사람인지.
 * schedules.name 에만 "Mr. …" 가 붙어 있고 마스터는 접두 없을 때도 같은 사람으로 본다
 * (joinKey 가 …|c:코드 vs …|n:Mr. … 로 갈라져 실시간 격자만 빨강이 되는 문제 방지).
 */
function rawNameMatchesEmployee(raw: string, e: EmpRowForRealtimeJoin): boolean {
  const en = String(e.name || '').trim()
  const nk = String(e.nick || '').trim()
  if (!en) return false
  const lower = raw.toLowerCase()
  if (
    raw === en ||
    (nk && raw === nk) ||
    raw.toLowerCase() === en.toLowerCase() ||
    (nk && lower === nk.toLowerCase())
  )
    return true
  const rawBare = normalizeEmployeeNameForGradeMatch(raw)
  const enBare = normalizeEmployeeNameForGradeMatch(en)
  if (rawBare && enBare && rawBare === enBare) return true
  if (nk) {
    const nkBare = normalizeEmployeeNameForGradeMatch(nk)
    if (rawBare && nkBare && rawBare === nkBare) return true
  }
  return false
}

/** 출근 로그 name(닉·표기 차이) → schedules/employees 와 동일한 employees.name */
export function resolveCanonicalEmployeeName(
  employees: EmpRowForRealtimeJoin[],
  storeFromLog: string,
  rawName: string
): string {
  const raw = String(rawName || '').trim()
  if (!raw) return raw
  for (const e of employees || []) {
    if (!rawNameMatchesEmployee(raw, e)) continue
    if (empWorksAtRealtimeStore(e, storeFromLog)) return String(e.name || '').trim()
  }
  return raw
}

function findEmployeeAtStore(
  employees: EmpRowForRealtimeJoin[],
  storeFromContext: string,
  rawName: string
): EmpRowForRealtimeJoin | undefined {
  const raw = String(rawName || '').trim()
  if (!raw) return undefined
  for (const e of employees || []) {
    if (!rawNameMatchesEmployee(raw, e)) continue
    if (empWorksAtRealtimeStore(e, storeFromContext)) return e
  }
  return undefined
}

/** 매장 내 직원코드 문자열로 직원 찾기 (스케줄 슬롯에 코드만 적힌 경우) */
function findEmployeeByCodeAtStore(
  employees: EmpRowForRealtimeJoin[],
  storeFromContext: string,
  codeNorm: string
): EmpRowForRealtimeJoin | undefined {
  if (!codeNorm) return undefined
  for (const e of employees || []) {
    const c = normalizeEmployeeCodeForMatch(String(e.employee_code ?? ''))
    if (c !== codeNorm) continue
    if (empWorksAtRealtimeStore(e, storeFromContext)) return e
  }
  return undefined
}

export function todayRealtimeJoinKey(params: {
  store: string
  employeeCode?: string | null
  employeeId?: number | null
  canonicalName: string
}): string {
  const st = canonicalStoreSegmentForJoinKey(String(params.store ?? ''))
  const code = normalizeEmployeeCodeForMatch(String(params.employeeCode ?? ''))
  if (code) return `${st}|c:${code}`
  const id =
    params.employeeId != null && Number.isFinite(Number(params.employeeId))
      ? Math.floor(Number(params.employeeId))
      : 0
  if (id > 0) return `${st}|id:${id}`
  return `${st}|n:${String(params.canonicalName || '').trim()}`
}

/** employees.id 로 마스터 직원코드 보강 — 로그에 코드 누락돼도 SI014 로 통일 */
export function employeeCodeForJoinFromMaster(
  empList: EmpRowForRealtimeJoin[],
  employeeId: number,
  fallbackCode?: string | null
): string {
  const code = normalizeEmployeeCodeForMatch(String(fallbackCode ?? ''))
  if (code) return code
  if (employeeId <= 0) return ''
  const emp = empList.find((e) => e.id != null && Math.floor(Number(e.id)) === employeeId)
  return normalizeEmployeeCodeForMatch(String(emp?.employee_code ?? ''))
}

/** attendance_logs 한 건 → 당일 실시간용 조인 키 */
export function joinKeyFromAttendanceLog(
  rowStore: string,
  r: { name?: string; employee_id?: number | null; employee_code?: string | null },
  empList: EmpRowForRealtimeJoin[]
): string {
  const id = r.employee_id != null && Number.isFinite(Number(r.employee_id)) ? Math.floor(Number(r.employee_id)) : 0
  const code = employeeCodeForJoinFromMaster(empList, id, r.employee_code)
  const canonical = resolveCanonicalEmployeeName(empList, rowStore, String(r.name || ''))
  return todayRealtimeJoinKey({
    store: rowStore,
    employeeCode: code || undefined,
    employeeId: code ? undefined : id > 0 ? id : undefined,
    canonicalName: canonical,
  })
}

function resolveScheduleEmployeeForSlot(
  rowStore: string,
  scheduleNameRaw: string,
  scheduleEmployeeId: number | null | undefined,
  empList: EmpRowForRealtimeJoin[]
): { emp?: EmpRowForRealtimeJoin; canonical: string; idNum: number } {
  const slot = String(scheduleNameRaw || '').trim()
  let idNum =
    scheduleEmployeeId != null && Number.isFinite(Number(scheduleEmployeeId))
      ? Math.floor(Number(scheduleEmployeeId))
      : 0
  const codeFromSlot = normalizeEmployeeCodeForMatch(slot)
  let emp: EmpRowForRealtimeJoin | undefined =
    idNum > 0 ? empList.find((e) => e.id != null && Math.floor(Number(e.id)) === idNum) : undefined
  if (!emp && codeFromSlot) emp = findEmployeeByCodeAtStore(empList, rowStore, codeFromSlot)
  if (!emp) emp = findEmployeeAtStore(empList, rowStore, slot)
  if (emp?.id != null) idNum = Math.floor(Number(emp.id))
  const canonical = emp
    ? String(emp.name || '').trim() || resolveCanonicalEmployeeName(empList, rowStore, slot)
    : resolveCanonicalEmployeeName(empList, rowStore, slot)
  return { emp, canonical, idNum }
}

/** schedules / 휴가 병합 행 → joinKey + 직원코드(API 응답용) */
export function scheduleJoinMetaFromRow(
  rowStore: string,
  scheduleNameRaw: string,
  scheduleEmployeeId: number | null | undefined,
  empList: EmpRowForRealtimeJoin[]
): { joinKey: string; employeeCode?: string } {
  const { emp, canonical, idNum } = resolveScheduleEmployeeForSlot(
    rowStore,
    scheduleNameRaw,
    scheduleEmployeeId,
    empList
  )
  /** schedules.employee_id 또는 슬롯으로 찾은 emp → 마스터 직원코드(SI014)로 스케줄·출근 키 통일 */
  const code = employeeCodeForJoinFromMaster(empList, idNum, emp?.employee_code)
  const joinKey = todayRealtimeJoinKey({
    store: rowStore,
    employeeCode: code || undefined,
    employeeId: code ? undefined : idNum > 0 ? idNum : undefined,
    canonicalName: canonical,
  })
  return { joinKey, employeeCode: code || undefined }
}

/** schedules / 휴가 병합 행 → 당일 실시간용 조인 키 */
export function joinKeyFromScheduleRow(
  rowStore: string,
  scheduleNameRaw: string,
  scheduleEmployeeId: number | null | undefined,
  empList: EmpRowForRealtimeJoin[]
): string {
  return scheduleJoinMetaFromRow(rowStore, scheduleNameRaw, scheduleEmployeeId, empList).joinKey
}

/** getTodayAttendanceSummary 한 행 (실시간 격자 조인용) */
export type AttendanceSummaryRowLike = {
  store: string
  name: string
  /** employees.nick — 화면이 닉네임일 때 이름 키와 맞추기 위함 */
  nick?: string
  joinKey?: string
  employeeCode?: string
  employeeId?: number
}

/** API 응답 배열 → 조회 맵 (직원코드·id·풀네임·별명) */
export function buildAttendanceSummaryLookupMap<T extends AttendanceSummaryRowLike>(
  rows: T[]
): Record<string, T> {
  const attByKey: Record<string, T> = {}
  for (const a of rows) {
    if (a.joinKey) attByKey[a.joinKey] = a
    const stRaw = String(a.store ?? '').trim()
    const stCanon = canonicalStoreSegmentForJoinKey(stRaw)
    attByKey[`${stRaw}|${a.name}`] = a
    if (stCanon !== stRaw) attByKey[`${stCanon}|${a.name}`] = a
    const ac = normalizeEmployeeCodeForMatch(String(a.employeeCode ?? ''))
    if (ac) {
      attByKey[`${stRaw}|c:${ac}`] = a
      if (stCanon !== stRaw) attByKey[`${stCanon}|c:${ac}`] = a
    }
    const aid = a.employeeId != null && Number.isFinite(Number(a.employeeId)) ? Math.floor(Number(a.employeeId)) : 0
    if (aid > 0) {
      attByKey[`${stRaw}|id:${aid}`] = a
      if (stCanon !== stRaw) attByKey[`${stCanon}|id:${aid}`] = a
    }
    const nk = String(a.nick ?? '').trim()
    if (nk) {
      attByKey[`${stRaw}|${nk}`] = a
      if (stCanon !== stRaw) attByKey[`${stCanon}|${nk}`] = a
    }
  }
  return attByKey
}

export type RealtimeSchedulePersonLike = {
  joinKey: string
  store: string
  employeeCode?: string
  employeeId?: number
  /** schedules.name (DB 원문) */
  scheduleName: string
  /** employees.nick */
  nick: string
  /** 화면 라벨 (nick || schedule name) */
  displayLabel: string
}

/** NBSP·연속 공백 제거 — schedules vs attendance_logs.store_name 비교 안정화 */
function normalizeRealtimeStoreWhitespace(raw: string): string {
  return String(raw || '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

type JoinKeyParts = { storeSeg: string; kind: 'c' | 'id' | 'n'; value: string }

function parseRealtimeJoinKeyParts(full: string): JoinKeyParts | null {
  const m = String(full || '').match(/^(.+)\|(c|id|n):(.+)$/)
  if (!m) return null
  const kind = m[2] as 'c' | 'id' | 'n'
  return {
    storeSeg: normalizeRealtimeStoreWhitespace(m[1]),
    kind,
    value: String(m[3] ?? '').trim(),
  }
}

/** 같은 직원을 가리키는 joinKey 인지(매장 접두 문자열이 한쪽만 다를 때 보정) */
function joinKeySameEmployee(a: JoinKeyParts, b: JoinKeyParts): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'c') {
    return (
      normalizeEmployeeCodeForMatch(a.value) !== '' &&
      normalizeEmployeeCodeForMatch(a.value) === normalizeEmployeeCodeForMatch(b.value)
    )
  }
  if (a.kind === 'id') {
    const na = Number(a.value)
    const nb = Number(b.value)
    return Number.isFinite(na) && Number.isFinite(nb) && Math.floor(na) === Math.floor(nb)
  }
  return (
    normalizeEmployeeNameForGradeMatch(a.value) !== '' &&
    normalizeEmployeeNameForGradeMatch(a.value) === normalizeEmployeeNameForGradeMatch(b.value)
  )
}

function storesCompatibleForRealtimeJoin(
  storeFromAttendance: string,
  storeSegFromJoinKey: string,
  scheduleStore: string
): boolean {
  const att = normalizeRealtimeStoreWhitespace(storeFromAttendance)
  const seg = normalizeRealtimeStoreWhitespace(storeSegFromJoinKey)
  const sch = normalizeRealtimeStoreWhitespace(scheduleStore)
  if (storesMatchForGradeLookup(att, sch)) return true
  if (storesMatchForGradeLookup(seg, sch)) return true
  if (storesMatchForGradeLookup(att, seg)) return true
  if (canonicalStoreSegmentForJoinKey(att) === canonicalStoreSegmentForJoinKey(seg)) return true
  return false
}

/**
 * 스케줄 행 ↔ 출근 요약. 표시는 닉네임·요약은 풀네임처럼 키가 갈라져도 같은 행을 찾는다.
 */
export function findAttendanceForRealtimeScheduleRow<T extends AttendanceSummaryRowLike>(
  attendanceRows: T[],
  lookup: Record<string, T>,
  p: RealtimeSchedulePersonLike
): T | undefined {
  const stRaw = normalizeRealtimeStoreWhitespace(String(p.store ?? ''))
  const stCanon = canonicalStoreSegmentForJoinKey(stRaw)
  const codeNorm = normalizeEmployeeCodeForMatch(String(p.employeeCode ?? ''))
  const pid = p.employeeId != null && Number.isFinite(Number(p.employeeId)) ? Math.floor(Number(p.employeeId)) : 0

  const pick = (k: string) => lookup[k]

  const direct =
    (codeNorm ? pick(`${stRaw}|c:${codeNorm}`) ?? pick(`${stCanon}|c:${codeNorm}`) : undefined) ??
    pick(p.joinKey) ??
    (pid > 0 ? pick(`${stRaw}|id:${pid}`) ?? pick(`${stCanon}|id:${pid}`) : undefined) ??
    pick(`${stRaw}|${p.scheduleName}`) ??
    pick(`${stCanon}|${p.scheduleName}`) ??
    pick(`${stRaw}|${p.displayLabel}`) ??
    pick(`${stCanon}|${p.displayLabel}`) ??
    (p.nick ? pick(`${stRaw}|${p.nick}`) ?? pick(`${stCanon}|${p.nick}`) : undefined)

  if (direct) return direct

  const scheduleParts = parseRealtimeJoinKeyParts(p.joinKey)
  if (scheduleParts) {
    for (const a of attendanceRows) {
      if (!a.joinKey) continue
      const ap = parseRealtimeJoinKeyParts(a.joinKey)
      if (!ap || !joinKeySameEmployee(scheduleParts, ap)) continue
      if (
        storesCompatibleForRealtimeJoin(String(a.store ?? ''), ap.storeSeg, stRaw) ||
        storesCompatibleForRealtimeJoin(String(a.store ?? ''), scheduleParts.storeSeg, stRaw)
      ) {
        return a
      }
    }
  }

  const nameNormSet = new Set<string>()
  for (const s of [p.scheduleName, p.nick, p.displayLabel]) {
    const n = normalizeEmployeeNameForGradeMatch(String(s || ''))
    if (n) nameNormSet.add(n)
  }

  for (const a of attendanceRows) {
    const aStore = normalizeRealtimeStoreWhitespace(String(a.store ?? ''))
    if (!storesMatchForGradeLookup(aStore, stRaw)) continue
    if (codeNorm) {
      const ac = normalizeEmployeeCodeForMatch(String(a.employeeCode ?? ''))
      if (ac && ac === codeNorm) return a
    }
    if (pid > 0 && a.employeeId != null && Math.floor(Number(a.employeeId)) === pid) return a
    if (a.joinKey && p.joinKey && a.joinKey === p.joinKey) return a

    const an = normalizeEmployeeNameForGradeMatch(String(a.name || ''))
    if (an && nameNormSet.has(an)) return a

    const anick = String(a.nick || '').trim().toLowerCase()
    if (anick && p.nick && p.nick.trim().toLowerCase() === anick) return a
  }

  return undefined
}
