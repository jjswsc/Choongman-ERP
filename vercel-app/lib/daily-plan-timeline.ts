/** 일정표 시간 배치·지연 판정·방문 매장 추천 (순수 함수, DB 없음) */

/** 매장 간 이동 기본 분 */
export const DAILY_PLAN_DEFAULT_TRAVEL_MINUTES = 30
/** 근무 시작·고정 시각이 없을 때 하루 시작 */
export const DAILY_PLAN_DEFAULT_DAY_START = "09:00"
/** 화면 지연 표시 — 계획 시작 후 이 분이 지나도 시작 안 함 */
export const DAILY_PLAN_LATE_GRACE_MINUTES = 30
/** 푸시 지연 알림 — 계획 시작 후 이 분이 지나도 시작 안 함 */
export const DAILY_PLAN_LATE_ALERT_MINUTES = 60
/** 방문 매장 자동 추천 수 */
export const DAILY_PLAN_AUTO_ROUTE_MAX = 3

export function hmToMin(hm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hm || "").trim())
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  if (h > 47 || mm > 59) return null
  return h * 60 + mm
}

export function minToHm(min: number): string {
  const v = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`
}

export type TimelineItemInput = {
  id: number
  source: string
  storeName: string
  timeSlot: string
  estMinutes: number
}

export type TimelineSlot = {
  start: number
  end: number
  /** 이동 시간(방문 항목만) */
  travel: number
  /** 고정 시각보다 늦게 밀림 */
  pushed: boolean
}

/** 근무 시작 > 첫 고정 시각 > 09:00 */
export function planDayStart(shiftIn: string, items: Pick<TimelineItemInput, "timeSlot">[]): number {
  const s = hmToMin(shiftIn)
  if (s != null) return s
  for (const i of items) {
    const a = hmToMin(i.timeSlot)
    if (a != null) return a
  }
  return hmToMin(DAILY_PLAN_DEFAULT_DAY_START) as number
}

function storeKey(s: string): string {
  return String(s || "").trim().toLowerCase()
}

/**
 * 항목 순서대로 계획 시각 배치.
 * 고정 시각(time_slot)은 앞당기지 않고 기다림, 방문 항목 앞에는 이동 시간, 방문 항목은 그 매장 연속 항목이 끝날 때까지.
 */
export function computePlanTimeline(
  items: TimelineItemInput[],
  opts: { shiftIn?: string; travelMinutes?: number } = {}
): { slots: Map<number, TimelineSlot>; dayStart: number; dayEnd: number } {
  const travel = Math.max(0, Math.round(Number(opts.travelMinutes ?? DAILY_PLAN_DEFAULT_TRAVEL_MINUTES) || 0))
  const dayStart = planDayStart(opts.shiftIn || "", items)
  const slots = new Map<number, TimelineSlot>()
  let cursor = dayStart
  let openVisit: { id: number; store: string } | null = null

  const closeVisit = () => {
    if (!openVisit) return
    const s = slots.get(openVisit.id)
    if (s) s.end = Math.max(s.start, cursor)
    openVisit = null
  }

  for (const it of items) {
    if (it.source === "visit") {
      closeVisit()
      cursor += travel
      slots.set(it.id, { start: cursor, end: cursor, travel, pushed: false })
      openVisit = { id: it.id, store: storeKey(it.storeName) }
      continue
    }
    if (openVisit && storeKey(it.storeName) !== openVisit.store) closeVisit()
    const anchor = hmToMin(it.timeSlot)
    let pushed = false
    if (anchor != null) {
      if (anchor > cursor) cursor = anchor
      else if (anchor < cursor) pushed = true
    }
    const est = Math.max(0, Math.round(Number(it.estMinutes) || 0))
    slots.set(it.id, { start: cursor, end: cursor + est, travel: 0, pushed })
    cursor += est
  }
  closeVisit()
  return { slots, dayStart, dayEnd: cursor }
}

/** 시작 안 한 항목의 계획 시작 대비 지연 분 (grace 이하면 0) */
export function lateMinutes(slot: TimelineSlot | undefined, status: string, nowMin: number, grace = 0): number {
  if (!slot || status !== "todo") return 0
  const late = Math.round(nowMin - slot.start)
  return late > grace ? late : 0
}

export type VisitSuggestAction = { store: string; status: string; dueDate: string }

export type VisitSuggestion = {
  store: string
  score: number
  overdue: number
  pendingVerify: number
  dueSoon: number
  daysSinceVisit: number | null
}

/**
 * 방문 매장 추천 — 기한초과 ×3 + 재확인 대기 ×2 + 내일까지 마감 ×1 + 미방문 일수(주 단위, 최대 3).
 * 같은 날 다른 사람이 이미 가는 매장은 제외.
 */
export function suggestVisitStores(params: {
  candidates: string[]
  actions: VisitSuggestAction[]
  lastVisitByStore: Map<string, string>
  dateYmd: string
  exclude?: string[]
  max?: number
}): VisitSuggestion[] {
  const max = params.max ?? DAILY_PLAN_AUTO_ROUTE_MAX
  const exclude = new Set((params.exclude || []).map(storeKey))
  const dayMs = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)))
  const dateMs = dayMs(params.dateYmd)
  const tomorrow = new Date(dateMs + 86400000).toISOString().slice(0, 10)
  const lastByKey = new Map<string, string>()
  for (const [s, d] of params.lastVisitByStore) lastByKey.set(storeKey(s), d)

  const seen = new Set<string>()
  const out: VisitSuggestion[] = []
  for (const raw of params.candidates) {
    const store = String(raw || "").trim()
    const key = storeKey(store)
    if (!store || seen.has(key) || exclude.has(key)) continue
    seen.add(key)
    const mine = params.actions.filter((a) => storeKey(a.store) === key)
    const overdue = mine.filter((a) => a.status !== "pending_verify" && a.dueDate && a.dueDate < params.dateYmd).length
    const pendingVerify = mine.filter((a) => a.status === "pending_verify").length
    const dueSoon = mine.filter(
      (a) => a.status !== "pending_verify" && a.dueDate && a.dueDate >= params.dateYmd && a.dueDate <= tomorrow
    ).length
    const last = lastByKey.get(key)
    const daysSinceVisit = last ? Math.max(0, Math.round((dateMs - dayMs(last)) / 86400000)) : null
    const staleness = daysSinceVisit == null ? 3 : Math.min(3, daysSinceVisit / 7)
    const score = overdue * 3 + pendingVerify * 2 + dueSoon + staleness
    out.push({ store, score: Math.round(score * 10) / 10, overdue, pendingVerify, dueSoon, daysSinceVisit })
  }
  return out.sort((a, b) => b.score - a.score || a.store.localeCompare(b.store)).slice(0, Math.max(0, max))
}
