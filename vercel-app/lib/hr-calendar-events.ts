import type { AdminEmployeeItem } from "@/lib/api-client"

export type HrCalendarEventKind = "birthday" | "hire" | "anniversary" | "resign"

export interface HrCalendarEvent {
  id: string
  date: string
  kind: HrCalendarEventKind
  /** 표시용 닉네임(없으면 이름) */
  nick: string
  store: string
  /** 본명 — 툴팁에만 사용(닉과 다를 때) */
  legalName?: string
  /** 입사 후 경과 연수 (1 = 첫돌) */
  anniversaryYears?: number
}

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const t = String(s || "").trim().slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return { y, m: mo, d }
}

function ymdInYear(sourceYmd: string, viewYear: number): { m: number; d: number } | null {
  const p = parseYmd(sourceYmd)
  if (!p) return null
  let ann = new Date(viewYear, p.m - 1, p.d)
  if (ann.getMonth() !== p.m - 1) {
    ann = new Date(viewYear, p.m, 0)
  }
  return { m: ann.getMonth() + 1, d: ann.getDate() }
}

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

function isActiveEmployee(resign: string): boolean {
  return !String(resign || "").trim()
}

/**
 * 직원 목록에서 월별 인사 캘린더 이벤트 생성 (권한 필터링된 list 기준).
 */
export function buildHrCalendarEvents(
  employees: AdminEmployeeItem[],
  opts: { viewYear: number; viewMonth: number; storeFilter: string }
): HrCalendarEvent[] {
  const { viewYear, viewMonth, storeFilter } = opts
  const sf = String(storeFilter || "").trim()
  const list = sf
    ? employees.filter((e) => String(e.store || "").trim() === sf)
    : employees

  const out: HrCalendarEvent[] = []
  let seq = 0
  const push = (e: Omit<HrCalendarEvent, "id">) => {
    seq += 1
    out.push({ ...e, id: `${e.date}-${e.kind}-${seq}` })
  }

  for (const emp of list) {
    const nickRaw = String(emp.nick || "").trim()
    const nameRaw = String(emp.name || "").trim()
    const nick = nickRaw || nameRaw || "—"
    const legalName = nameRaw && nickRaw && nameRaw !== nickRaw ? nameRaw : undefined
    const store = String(emp.store || "").trim() || "—"

    const resign = String(emp.resign || "").trim()
    const resignParts = resign ? parseYmd(resign) : null
    if (resignParts && resignParts.y === viewYear && resignParts.m === viewMonth) {
      const d = resignParts.d
      push({
        date: `${viewYear}-${pad2(viewMonth)}-${pad2(d)}`,
        kind: "resign",
        nick,
        store,
        legalName,
      })
    }

    if (!isActiveEmployee(resign)) {
      continue
    }

    const birth = String(emp.birth || "").trim()
    if (birth) {
      const md = ymdInYear(birth, viewYear)
      if (md && md.m === viewMonth) {
        push({
          date: `${viewYear}-${pad2(viewMonth)}-${pad2(md.d)}`,
          kind: "birthday",
          nick,
          store,
          legalName,
        })
      }
    }

    const join = String(emp.join || "").trim()
    const jp = join ? parseYmd(join) : null
    if (!jp) continue

    const md = ymdInYear(join, viewYear)
    if (!md || md.m !== viewMonth) continue

    const d = md.d
    const dateStr = `${viewYear}-${pad2(viewMonth)}-${pad2(d)}`

    if (viewYear === jp.y) {
      push({
        date: dateStr,
        kind: "hire",
        nick,
        store,
        legalName,
      })
      continue
    }

    if (viewYear > jp.y) {
      const n = viewYear - jp.y
      if (n >= 1) {
        push({
          date: dateStr,
          kind: "anniversary",
          nick,
          store,
          legalName,
          anniversaryYears: n,
        })
      }
    }
  }

  out.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    const kindOrder: Record<HrCalendarEventKind, number> = {
      hire: 0,
      anniversary: 1,
      birthday: 2,
      resign: 3,
    }
    const ko = kindOrder[a.kind] - kindOrder[b.kind]
    if (ko !== 0) return ko
    return `${a.store} ${a.nick}`.localeCompare(`${b.store} ${b.nick}`)
  })

  return out
}

export function uniqueStoresFromEmployees(employees: AdminEmployeeItem[]): string[] {
  const s = new Set<string>()
  for (const e of employees) {
    const st = String(e.store || "").trim()
    if (st) s.add(st)
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b))
}
