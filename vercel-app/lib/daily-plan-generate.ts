/** 일일 일정표 — 템플릿 선택·항목 생성·요약 (순수 함수, DB 없음) */

export const DAILY_PLAN_ROLES = ["supervisor", "manager", "staff"] as const
export type DailyPlanRole = (typeof DAILY_PLAN_ROLES)[number]

export const DAILY_PLAN_POSITIONS = ["all", "service", "kitchen", "office"] as const

export const ROUTINE_TEMPLATE_STATUSES = ["draft", "pilot", "active", "archived"] as const
export type RoutineTemplateStatus = (typeof ROUTINE_TEMPLATE_STATUSES)[number]

export const DAILY_PLAN_ITEM_SOURCES = ["routine", "hq_task", "action", "carry", "visit"] as const
export type DailyPlanItemSource = (typeof DAILY_PLAN_ITEM_SOURCES)[number]

export const DAILY_PLAN_ITEM_STATUSES = ["todo", "doing", "done", "skipped"] as const
export type DailyPlanItemStatus = (typeof DAILY_PLAN_ITEM_STATUSES)[number]

export const DAILY_PLAN_LINK_TYPES = [
  "none",
  "store_check",
  "store_visit",
  "store_actions",
  "schedule",
  "stock_take",
] as const

export const DAILY_PLAN_CATEGORIES = ["인원", "시설", "교육", "재고·발주", "청결", "당일 과제", "고객", "기타"] as const

/** 하루 기준 근무 분(7시간) — 일정표 총 예상 시간 비교용 */
export const DAILY_PLAN_WORKDAY_MINUTES = 420

export type RoutineTemplateItem = {
  id?: number
  sortOrder: number
  timeSlot: string
  block: string
  category: string
  title: string
  description: string
  estMinutes: number
  weekdays: string
  photoRequired: boolean
  linkType: string
  perStore: boolean
}

export type RoutineTemplate = {
  id: number
  name: string
  roleScope: string
  position: string
  storeName: string
  status: string
  version: number
  note: string
  /** 매장 간 이동 분 */
  travelMinutes: number
  updatedBy: string
  updatedAt: string
  items: RoutineTemplateItem[]
}

export type PlanItemDraft = {
  source: DailyPlanItemSource
  refId: string
  storeName: string
  timeSlot: string
  block: string
  category: string
  title: string
  description: string
  estMinutes: number
  linkType: string
  photoRequired: boolean
  sortOrder: number
}

export type OpenActionLite = {
  id: number
  store: string
  title: string
  status: string
  dueDate: string
  ownerName: string
  ownerUserId: string
  verifierName: string
  verifierUserId: string
}

export type CarryLite = {
  id: number
  source: string
  refId: string
  storeName: string
  title: string
  category: string
  description: string
  estMinutes: number
  linkType: string
}

export type HqTaskInput = {
  title: string
  storeName?: string
  estMinutes?: number
  category?: string
  timeSlot?: string
  description?: string
}

function norm(s: string | null | undefined): string {
  return String(s || "").trim().toLowerCase()
}

export function addDaysYmdUtc(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const t = Date.UTC(y, (m || 1) - 1, d || 1) + days * 86400000
  return new Date(t).toISOString().slice(0, 10)
}

/** ISO 요일 1=월 … 7=일 */
export function isoWeekdayOfYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number)
  const wd = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay()
  return wd === 0 ? 7 : wd
}

export function weekdayMatches(weekdays: string, isoWeekday: number): boolean {
  const w = String(weekdays || "").trim()
  if (!w) return true
  return w.includes(String(isoWeekday))
}

/** 직급·포지션·매장에 가장 구체적으로 맞는 파일럿/운영 템플릿 */
export function pickRoutineTemplate(
  templates: RoutineTemplate[],
  params: { role: DailyPlanRole; position: string; store: string }
): RoutineTemplate | null {
  const pos = norm(params.position) || "all"
  const store = norm(params.store)
  let best: { t: RoutineTemplate; score: number } | null = null
  for (const t of templates) {
    if (t.status !== "pilot" && t.status !== "active") continue
    if (norm(t.roleScope) !== params.role) continue
    const tStore = norm(t.storeName)
    if (tStore && tStore !== store) continue
    const tPos = norm(t.position) || "all"
    if (tPos !== "all" && tPos !== pos) continue
    const score = (tStore ? 4 : 0) + (tPos !== "all" ? 2 : 0) + (t.status === "active" ? 1 : 0)
    if (!best || score > best.score || (score === best.score && t.id > best.t.id)) best = { t, score }
  }
  return best?.t ?? null
}

function matchesPerson(
  userId: string,
  name: string,
  employee: { id: number; name: string; nick?: string }
): boolean {
  if (userId && String(employee.id) === String(userId).trim()) return true
  const n = norm(name)
  if (!n) return false
  return n === norm(employee.name) || (!!employee.nick && n === norm(employee.nick))
}

/** 일정표에 넣을 개선 과제 — 담당 과제(기한초과·오늘·내일), SV는 재확인 대기·담당 매장 기한초과 */
export function selectActionsForPlan(params: {
  actions: OpenActionLite[]
  role: DailyPlanRole
  employee: { id: number; name: string; nick?: string }
  dateYmd: string
  routeStores: string[]
}): { action: OpenActionLite; kind: "owner" | "verify" }[] {
  const tomorrow = addDaysYmdUtc(params.dateYmd, 1)
  const route = new Set(params.routeStores.map(norm))
  const out: { action: OpenActionLite; kind: "owner" | "verify" }[] = []
  const seen = new Set<number>()
  for (const a of params.actions) {
    if (seen.has(a.id)) continue
    const isOwner = matchesPerson(a.ownerUserId, a.ownerName, params.employee)
    const ownerDue =
      isOwner &&
      (a.status === "open" || a.status === "in_progress") &&
      !!a.dueDate &&
      a.dueDate <= tomorrow
    if (ownerDue) {
      out.push({ action: a, kind: "owner" })
      seen.add(a.id)
      continue
    }
    if (params.role === "supervisor") {
      const isVerifier = matchesPerson(a.verifierUserId, a.verifierName, params.employee)
      const inRoute = route.has(norm(a.store))
      const pendingVerify = a.status === "pending_verify" && (isVerifier || inRoute)
      const overdueInRoute = inRoute && !!a.dueDate && a.dueDate < params.dateYmd
      if (pendingVerify || overdueInRoute) {
        out.push({ action: a, kind: "verify" })
        seen.add(a.id)
      }
    }
  }
  return out
}

function draftKey(d: Pick<PlanItemDraft, "source" | "storeName" | "title" | "refId">): string {
  return `${d.source}|${norm(d.storeName)}|${d.refId || norm(d.title)}`
}

export function planItemDraftKey(d: Pick<PlanItemDraft, "source" | "storeName" | "title" | "refId">): string {
  return draftKey(d)
}

/**
 * 일정표 항목 생성.
 * 순서: 템플릿 머리(매장 항목 이전) → 당일 과제(본사·이월·매장 무관 과제) → 매장별(방문 + 매장 항목 + 매장 과제) → 템플릿 꼬리
 */
export function buildDailyPlanItems(params: {
  template: RoutineTemplate | null
  role: DailyPlanRole
  dateYmd: string
  homeStore: string
  routeStores: string[]
  employee: { id: number; name: string; nick?: string }
  actions: OpenActionLite[]
  carry: CarryLite[]
  hqTasks: HqTaskInput[]
}): PlanItemDraft[] {
  const isoWd = isoWeekdayOfYmd(params.dateYmd)
  const tplItems = (params.template?.items || [])
    .filter((i) => weekdayMatches(i.weekdays, isoWd) && String(i.title || "").trim())
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const firstPerStore = tplItems.find((i) => i.perStore)
  const head = tplItems.filter((i) => !i.perStore && (!firstPerStore || i.sortOrder < firstPerStore.sortOrder))
  const tail = tplItems.filter((i) => !i.perStore && firstPerStore && i.sortOrder > firstPerStore.sortOrder)
  const perStoreItems = tplItems.filter((i) => i.perStore)

  const stores =
    params.role === "supervisor" && params.routeStores.length > 0
      ? params.routeStores
      : params.homeStore
        ? [params.homeStore]
        : []
  const storeSet = new Set(stores.map(norm))

  const fromTemplate = (i: RoutineTemplateItem, storeName: string): PlanItemDraft => ({
    source: "routine",
    refId: "",
    storeName,
    timeSlot: i.timeSlot || "",
    block: i.block || "",
    category: i.category || "기타",
    title: i.title,
    description: i.description || "",
    estMinutes: Math.max(0, Math.round(Number(i.estMinutes) || 0)),
    linkType: i.linkType || "none",
    photoRequired: !!i.photoRequired,
    sortOrder: 0,
  })

  const actionDrafts = selectActionsForPlan({
    actions: params.actions,
    role: params.role,
    employee: params.employee,
    dateYmd: params.dateYmd,
    routeStores: params.routeStores,
  }).map(
    ({ action, kind }): PlanItemDraft => ({
      source: "action",
      refId: String(action.id),
      storeName: action.store,
      timeSlot: "",
      block: "",
      category: "당일 과제",
      title: `${kind === "verify" ? "[재확인]" : "[개선]"} ${action.title}`,
      description: action.dueDate ? `due ${action.dueDate}` : "",
      estMinutes: kind === "verify" ? 10 : 20,
      linkType: "store_actions",
      photoRequired: false,
      sortOrder: 0,
    })
  )

  const hqDrafts = params.hqTasks
    .filter((h) => String(h.title || "").trim())
    .map(
      (h): PlanItemDraft => ({
        source: "hq_task",
        refId: "",
        storeName: String(h.storeName || "").trim(),
        timeSlot: String(h.timeSlot || "").trim(),
        block: "",
        category: h.category || "당일 과제",
        title: String(h.title).trim(),
        description: String(h.description || "").trim(),
        estMinutes: Math.max(0, Math.round(Number(h.estMinutes) || 30)),
        linkType: "none",
        photoRequired: false,
        sortOrder: 0,
      })
    )

  const carryDrafts = params.carry.map(
    (c): PlanItemDraft => ({
      source: "carry",
      refId: String(c.id),
      storeName: c.storeName,
      timeSlot: "",
      block: "",
      category: c.category || "당일 과제",
      title: c.title,
      description: c.description || "",
      estMinutes: Math.max(0, Math.round(Number(c.estMinutes) || 0)),
      linkType: c.linkType || "none",
      photoRequired: false,
      sortOrder: 0,
    })
  )

  const generalTasks = [...hqDrafts, ...carryDrafts, ...actionDrafts].filter(
    (d) => !d.storeName || !storeSet.has(norm(d.storeName)) || stores.length <= 1
  )
  const storeTasks = (store: string) =>
    stores.length <= 1
      ? []
      : [...hqDrafts, ...carryDrafts, ...actionDrafts].filter((d) => norm(d.storeName) === norm(store))

  const ordered: PlanItemDraft[] = []
  for (const i of head) ordered.push(fromTemplate(i, params.homeStore))
  ordered.push(...generalTasks)
  for (const store of stores) {
    if (params.role === "supervisor" && params.routeStores.length > 0) {
      ordered.push({
        source: "visit",
        refId: "",
        storeName: store,
        timeSlot: "",
        block: "",
        category: "당일 과제",
        title: store,
        description: "",
        estMinutes: 0,
        linkType: "store_visit",
        photoRequired: false,
        sortOrder: 0,
      })
    }
    for (const i of perStoreItems) ordered.push(fromTemplate(i, store))
    ordered.push(...storeTasks(store))
  }
  for (const i of tail) ordered.push(fromTemplate(i, params.homeStore))

  const seen = new Set<string>()
  const out: PlanItemDraft[] = []
  for (const d of ordered) {
    const k = draftKey(d)
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ ...d, sortOrder: (out.length + 1) * 10 })
  }
  return out
}

export type PlanItemLite = {
  source: string
  status: string
  title: string
  storeName: string
  estMinutes: number
  actualMinutes: number | null
  skipReason: string
}

export type PlanSummary = {
  total: number
  done: number
  skipped: number
  open: number
  estTotal: number
  actualTotal: number
  doneRate: number
}

/** 방문(체류) 항목은 시간 합계에서 제외 */
export function summarizePlanItems(items: PlanItemLite[]): PlanSummary {
  const work = items.filter((i) => i.source !== "visit")
  const done = work.filter((i) => i.status === "done")
  const skipped = work.filter((i) => i.status === "skipped")
  const estTotal = work.reduce((s, i) => s + (Number(i.estMinutes) || 0), 0)
  const actualTotal = done.reduce((s, i) => s + (Number(i.actualMinutes ?? i.estMinutes) || 0), 0)
  return {
    total: work.length,
    done: done.length,
    skipped: skipped.length,
    open: work.length - done.length - skipped.length,
    estTotal,
    actualTotal,
    doneRate: work.length > 0 ? Math.round((done.length / work.length) * 100) : 0,
  }
}

/** 시작~완료 분. 시작 기록이 없으면 예상 분 */
export function computeActualMinutes(startedAt: string | null | undefined, finishedAtMs: number, est: number): number {
  const s = startedAt ? new Date(startedAt).getTime() : NaN
  if (!Number.isFinite(s) || finishedAtMs < s) return Math.max(0, Math.round(est || 0))
  return Math.max(1, Math.round((finishedAtMs - s) / 60000))
}

/** 업무일지 요약 문구 */
export function buildDailyPlanWorkLogContent(params: {
  dateYmd: string
  items: PlanItemLite[]
  auto?: boolean
}): string {
  const s = summarizePlanItems(params.items)
  const lines = [
    `[일일 일정표 ${params.dateYmd}] 완료 ${s.done}/${s.total} (${s.doneRate}%) · 예상 ${s.estTotal}분 / 실제 ${s.actualTotal}분${params.auto ? " · 자동 마감" : ""}`,
  ]
  const pending = params.items.filter((i) => i.source !== "visit" && i.status !== "done")
  if (pending.length > 0) {
    lines.push("미완료:")
    for (const i of pending.slice(0, 20)) {
      const where = i.storeName ? `${i.storeName} · ` : ""
      const why = i.status === "skipped" && i.skipReason ? ` (사유: ${i.skipReason})` : ""
      lines.push(`- ${where}${i.title}${why}`)
    }
  }
  return lines.join("\n")
}

/** 다음 날로 넘길 항목 — 본사 과제·이월 과제 중 미완료(건너뜀 제외) */
export function selectCarryItems<T extends { source: string; status: string }>(items: T[]): T[] {
  return items.filter(
    (i) => (i.source === "hq_task" || i.source === "carry") && (i.status === "todo" || i.status === "doing")
  )
}
