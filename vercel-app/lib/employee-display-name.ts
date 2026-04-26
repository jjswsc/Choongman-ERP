/**
 * 직원 표시명: DB에는 이름(name)과 호칭(name_title) 분리, 화면에서는 조합.
 * @see components/employees/employee-form.tsx EMP_NAME_TITLE_OPTIONS
 */

import { expandStoreVariantsForGrade } from '@/lib/grade-store-key-variants'

export const EMPLOYEE_NAME_TITLE_CANONICAL = ["Mr.", "Mrs.", "Ms.", "Miss"] as const

/** Miss 를 Ms 보다 먼저 두어 "Miss.x" 오인 방지 */
const PREFIX_RE = /^(Mr|Mrs|Miss|Ms)\.?\s+/i
/** "Mr.Kittipat" 처럼 점 뒤 공백 없이 붙은 호칭 */
const PREFIX_GLUED_RE = /^(Mr|Mrs|Miss|Ms)\.([^\s].*)$/i

function canonicalTitleFromPrefix(prefix: string): string {
  const base = prefix.replace(/\.$/, "").toLowerCase()
  if (base === "mr") return "Mr."
  if (base === "mrs") return "Mrs."
  if (base === "ms") return "Ms."
  if (base === "miss") return "Miss"
  return ""
}

/** 이름 문자열 앞의 Mr./Ms. 등만 분리 (본문이 비면 분리하지 않음) */
export function splitEmbeddedNameTitle(rawName: string): { name: string; extractedTitle: string } {
  const s = String(rawName || "")
    .trim()
    .replace(/\s+/g, " ")
  const m = s.match(PREFIX_RE)
  if (m) {
    const extractedTitle = canonicalTitleFromPrefix(m[1])
    const rest = s.slice(m[0].length).trim()
    if (!rest) return { name: s, extractedTitle: "" }
    return { name: rest, extractedTitle }
  }
  const g = s.match(PREFIX_GLUED_RE)
  if (g) {
    const extractedTitle = canonicalTitleFromPrefix(g[1])
    const rest = String(g[2] || "").trim()
    if (rest) return { name: rest, extractedTitle }
  }
  return { name: s, extractedTitle: "" }
}

/**
 * 저장·조회용: 이름에서 알려진 호칭 접두사를 제거하고, 비어 있는 name_title은 추출값으로 채움.
 */
export function normalizeEmployeeNameFields(rawName: string, rawTitle: string): { name: string; nameTitle: string } {
  let name = String(rawName || "")
    .trim()
    .replace(/\s+/g, " ")
  let nameTitle = String(rawTitle || "").trim()

  for (let i = 0; i < 6; i++) {
    const { name: next, extractedTitle } = splitEmbeddedNameTitle(name)
    if (!extractedTitle) break
    if (nameTitle && extractedTitle !== nameTitle) break
    name = next
    if (!nameTitle) nameTitle = extractedTitle
  }

  return { name, nameTitle }
}

/** 화면 표시용: "Mr. Somchai" (호칭 없으면 이름만) */
export function formatEmployeeDisplayName(name: string, nameTitle?: string): string {
  const n = String(name || "")
    .trim()
    .replace(/\s+/g, " ")
  const t = String(nameTitle || "").trim()
  if (!n) return t || ""
  if (!t) return n
  return `${t} ${n}`
}

/** 화면 표시: `formatEmployeeDisplayName` + 닉이 있으면 뒤에 (닉) */
export function formatEmployeeDisplayNameWithNick(
  name: string,
  nameTitle: string | undefined,
  nick: string | undefined
): string {
  const base = formatEmployeeDisplayName(name, nameTitle)
  const n = String(nick || "")
    .trim()
    .replace(/\s+/g, " ")
  if (!n) return base
  if (!base) return n
  return `${base} (${n})`
}

type EmployeeRowForAttendanceDisplay = {
  id?: number
  store?: string
  name?: string
  name_title?: string | null
}

/**
 * 근태 API용: 인사 마스터에서 표시명 맵 (id·매장|이름 변형 키).
 * attendance_logs.name 은 호칭 유무가 들쭉날쭉해도 동일 직원은 "Mr. …" 형태로 맞춤.
 */
export function buildAttendanceDisplayMapsFromEmployees(
  empRows: EmployeeRowForAttendanceDisplay[] | null | undefined
): {
  displayByEmployeeId: Record<number, string>
  displayByStoreAndBareName: Record<string, string>
} {
  const displayByEmployeeId: Record<number, string> = {}
  const displayByStoreAndBareName: Record<string, string> = {}
  for (const e of empRows || []) {
    const store = String(e.store || "")
      .trim()
      .replace(/\s+/g, " ")
    const nm = String(e.name || "")
      .trim()
      .replace(/\s+/g, " ")
    if (!store || !nm) continue
    const eid = e.id != null && Number.isFinite(Number(e.id)) ? Math.floor(Number(e.id)) : 0
    const disp = formatEmployeeDisplayName(nm, String(e.name_title ?? "").trim())
    if (eid > 0) displayByEmployeeId[eid] = disp
    for (const vs of expandStoreVariantsForGrade(store)) {
      const v = String(vs || "")
        .trim()
        .replace(/\s+/g, " ")
      if (!v) continue
      const k1 = `${v}|${nm}`
      const k2 = `${v}|${normalizeEmployeeNameForGradeMatch(nm)}`
      displayByStoreAndBareName[k1] = disp
      if (k2 !== k1) displayByStoreAndBareName[k2] = disp
    }
  }
  return { displayByEmployeeId, displayByStoreAndBareName }
}

/**
 * 근태 그리드 한 행: 로그 store/name/id 로 표시명 결정.
 */
export function resolveEmployeeDisplayNameForAttendanceGrid(
  logStore: string,
  logName: string,
  employeeId: number,
  displayByEmployeeId: Record<number, string>,
  displayByStoreAndBareName: Record<string, string>
): string {
  const st = String(logStore || "")
    .trim()
    .replace(/\s+/g, " ")
  const raw = String(logName || "")
    .trim()
    .replace(/\s+/g, " ")
  if (employeeId > 0) {
    const byId = displayByEmployeeId[employeeId]
    if (byId) return byId
  }
  const split = splitEmbeddedNameTitle(raw)
  const nameCandidates = new Set<string>()
  if (raw) nameCandidates.add(raw)
  const rawNorm = normalizeEmployeeNameForGradeMatch(raw)
  if (rawNorm) nameCandidates.add(rawNorm)
  if (split.name) {
    nameCandidates.add(split.name)
    const sn = normalizeEmployeeNameForGradeMatch(split.name)
    if (sn) nameCandidates.add(sn)
  }
  const storeCandidates = st ? expandStoreVariantsForGrade(st) : []
  for (const vs of storeCandidates) {
    const v = String(vs || "")
      .trim()
      .replace(/\s+/g, " ")
    if (!v) continue
    for (const nc of nameCandidates) {
      const hit = displayByStoreAndBareName[`${v}|${nc}`]
      if (hit) return hit
    }
  }
  return formatEmployeeDisplayName(split.name || raw, split.extractedTitle)
}

/** 평가·등급 매칭 등: 호칭 제거한 이름 (Miss 포함) */
export function normalizeEmployeeNameForGradeMatch(name: string): string {
  const s = String(name || "")
    .trim()
    .replace(/\s+/g, " ")
  const { name: stripped } = splitEmbeddedNameTitle(s)
  return stripped || s
}

export type StaffRowForScheduleMatch = { name: string; nick: string }

/** 스케줄/검색용: 직원코드 비교 (영숫자만, 대문자, 최대 5자 — saveAdminEmployee 와 동일 규칙) */
export function normalizeEmployeeCodeForMatch(raw: string): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5)
}

/**
 * schedules / 휴가 요청 등에 저장된 name 과 직원 목록 매칭.
 * 직원 API는 name을 normalizeEmployeeNameFields 로 정규화하지만, 스케줄 행에는 예전처럼 "Ms. …" 등이 남을 수 있어
 * 정규화·대소문자·닉(슬롯에 닉이 잘못 저장된 경우)까지 시도한다.
 */
export function findStaffForScheduleSlotName(
  staffList: StaffRowForScheduleMatch[],
  bareNameFromSchedule: string
): StaffRowForScheduleMatch | undefined {
  const b = String(bareNameFromSchedule || "")
    .trim()
    .replace(/\s+/g, " ")
  if (!b) return undefined
  const { name: normB } = normalizeEmployeeNameFields(b, "")
  const uniq: string[] = []
  for (const c of [b, normB]) {
    if (c && !uniq.includes(c)) uniq.push(c)
  }
  for (const c of uniq) {
    const hit = staffList.find((x) => x.name === c)
    if (hit) return hit
  }
  const bl = b.toLowerCase()
  const nbl = normB.toLowerCase()
  const nickMatch = staffList.find(
    (x) =>
      x.name.toLowerCase() === bl ||
      x.name.toLowerCase() === nbl ||
      String(x.nick || "")
        .trim()
        .toLowerCase() === bl ||
      String(x.nick || "")
        .trim()
        .toLowerCase() === nbl
  )
  if (nickMatch) return nickMatch
  const blCompact = bl.replace(/\s+/g, " ").trim()
  const nblCompact = nbl.replace(/\s+/g, " ").trim()
  return staffList.find((x) => {
    const xn = x.name.toLowerCase().replace(/\s+/g, " ").trim()
    const xnick = String(x.nick || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
    return xn === blCompact || xn === nblCompact || xnick === blCompact || xnick === nblCompact
  })
}
