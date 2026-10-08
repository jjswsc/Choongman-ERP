/**
 * 직급별 일일 업무표 API
 */
import { apiFetch } from "../api/fetch"
import { apiFetchWithOffline } from "../api/fetch-offline"

export type DailyPlan = {
  id: number
  plan_date: string
  employee_id: number
  employee_name: string
  employee_store: string
  role_scope: string
  position: string
  store_name: string
  route_stores: string[] | null
  shift_in: string
  shift_out: string
  template_id: number | null
  status: string
  briefing_note: string
  published_at: string | null
  closed_at: string | null
  est_total: number
  actual_total: number
  work_log_id: string
}

export type DailyPlanItem = {
  id: number
  plan_id: number
  source: string
  ref_id: string
  store_name: string
  time_slot: string
  block: string
  category: string
  title: string
  description: string
  est_minutes: number
  link_type: string
  photo_required: boolean
  status: string
  started_at: string | null
  finished_at: string | null
  actual_minutes: number | null
  skip_reason: string
  photo_urls: string[] | null
  note: string
  sort_order: number
}

export type DailyPlanSummary = {
  total: number
  done: number
  skipped: number
  open: number
  estTotal: number
  actualTotal: number
  doneRate: number
}

export type DailyPlanBundle = { plan: DailyPlan; items: DailyPlanItem[]; summary: DailyPlanSummary }

export type MyDailyPlanResponse = {
  success?: boolean
  message?: string
  date?: string
  today: DailyPlanBundle | null
  tomorrow: DailyPlanBundle | null
  notReady?: boolean
}

export async function getMyDailyPlan(params: { date?: string; planId?: number } = {}) {
  const q = new URLSearchParams()
  if (params.date) q.set("date", params.date)
  if (params.planId) q.set("planId", String(params.planId))
  const res = await apiFetchWithOffline(`/api/getMyDailyPlan?${q}`)
  return (await res.json()) as MyDailyPlanResponse
}

export type DailyPlanItemAction = "start" | "done" | "skip" | "reopen" | "note" | "photo" | "add" | "remove"

export async function updateDailyPlanItem(data: {
  action: DailyPlanItemAction
  itemId?: number
  planId?: number
  note?: string
  skipReason?: string
  photoUrl?: string
  actualMinutes?: number
  title?: string
  estMinutes?: number
  storeName?: string
  category?: string
  timeSlot?: string
}) {
  const res = await apiFetch("/api/updateDailyPlanItem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  return (await res.json()) as { success?: boolean; message?: string; messageKey?: string; item?: DailyPlanItem | null }
}

export type CloseDailyPlanResult = {
  planId: number
  done: number
  total: number
  estTotal: number
  actualTotal: number
  workLogId: string
  carried: number
}

export async function closeDailyPlan(planId: number) {
  const res = await apiFetch("/api/closeDailyPlan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId }),
  })
  return (await res.json()) as { success?: boolean; message?: string; messageKey?: string; result?: CloseDailyPlanResult }
}

export type DailyPlanBoardRow = DailyPlan & {
  total: number
  done: number
  skipped: number
  estMinutes: number
  actualMinutes: number
  late: number
  doingTitle: string
  nextTitle: string
  visitsDone: number
  visitsTotal: number
  hqTasks: { id: number; title: string; store: string; estMinutes: number; status: string }[]
  isMine: boolean
}

export type DailyPlanCandidate = {
  id: number
  name: string
  nick: string
  store: string
  job: string
  planRole: string
}

export type DailyPlanBoardResponse = {
  success?: boolean
  message?: string
  date: string
  today: string
  nowHm: string
  plans: DailyPlanBoardRow[]
  candidates: DailyPlanCandidate[]
  canEditTemplates?: boolean
  canAssignAll?: boolean
  notReady?: boolean
}

export async function getDailyPlanBoard(date: string, opts: { candidates?: boolean } = {}) {
  const q = new URLSearchParams({ date })
  if (opts.candidates) q.set("candidates", "1")
  const res = await apiFetchWithOffline(`/api/getDailyPlanBoard?${q}`)
  return (await res.json()) as DailyPlanBoardResponse
}

export type DailyPlanAssignmentTask = {
  title: string
  store?: string
  estMinutes?: number
  category?: string
  timeSlot?: string
}

export async function saveDailyPlanAssignment(data: {
  date: string
  employeeId: number
  routeStores?: string[]
  tasks?: DailyPlanAssignmentTask[]
  briefing?: string
  publish?: boolean
}) {
  const res = await apiFetch("/api/saveDailyPlanAssignment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  return (await res.json()) as { success?: boolean; message?: string; messageKey?: string; planId?: number; pushed?: number }
}

export async function generateDailyPlans(date: string) {
  const res = await apiFetch("/api/generateDailyPlans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date }),
  })
  return (await res.json()) as {
    success?: boolean
    message?: string
    result?: { created: number; existing: number; skipped: number; failed: number }
  }
}

export type RoutineTemplateItemDto = {
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

export type RoutineTemplateDto = {
  id: number
  name: string
  roleScope: string
  position: string
  storeName: string
  status: string
  version: number
  note: string
  updatedBy: string
  updatedAt: string
  items: RoutineTemplateItemDto[]
}

export async function getRoutineTemplates() {
  const res = await apiFetchWithOffline("/api/getRoutineTemplates")
  return (await res.json()) as { success?: boolean; list: RoutineTemplateDto[]; canEdit?: boolean; notReady?: boolean }
}

export async function saveRoutineTemplate(data: Partial<RoutineTemplateDto> & { deleteTemplate?: boolean }) {
  const res = await apiFetch("/api/saveRoutineTemplate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  return (await res.json()) as { success?: boolean; message?: string; id?: number }
}

export type DailyPlanTimeRow = {
  roleScope: string
  category: string
  title: string
  count: number
  done: number
  skipped: number
  estSum: number
  actualSum: number
  avgEst: number
  avgActual: number
  overrun: number
}

export async function getDailyPlanTimeSummary(start: string, end: string) {
  const q = new URLSearchParams({ start, end })
  const res = await apiFetchWithOffline(`/api/getDailyPlanTimeSummary?${q}`)
  return (await res.json()) as { success?: boolean; start: string; end: string; list: DailyPlanTimeRow[]; notReady?: boolean }
}
