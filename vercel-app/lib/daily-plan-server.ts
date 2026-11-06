import 'server-only'

import {
  isManagerRole,
  isOfficeStore,
  isSupervisorRole,
} from '@/lib/permissions'
import {
  canAssignDailyPlan,
  canDismissDailyPlan,
  canEditRoutineTemplate,
  canListDailyPlanCandidate,
  canViewDailyPlan,
  canViewRoutineTemplate,
  dailyPlanScopeFilter,
  isOwnDailyPlan,
  resolveDailyPlanScope,
  type DailyPlanScope,
} from '@/lib/daily-plan-scope'

export type { DailyPlanScope }
export type { DailyPlanRole } from '@/lib/daily-plan-generate'
export {
  canAssignDailyPlan,
  canDismissDailyPlan,
  canEditRoutineTemplate,
  canListDailyPlanCandidate,
  canViewDailyPlan,
  canViewRoutineTemplate,
  dailyPlanScopeFilter,
  isOwnDailyPlan,
  resolveDailyPlanScope,
}

import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseInsertMany,
  supabaseSelect,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
  supabaseUpdateByFilterReturning,
} from '@/lib/supabase-server'
import { primaryAreaForDisplay } from '@/lib/schedule-area'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { resolveWorkLogEmployeeById } from '@/lib/work-log-name-server'
import { workLogStoredNameFromEmployeeMaster } from '@/lib/work-log-name'
import { writeWorkLogAudit } from '@/lib/work-log-audit'
import { pushStoreActionNotice, type StoreActionRecipient } from '@/lib/store-action-server'
import { parseExtraStoresColumn } from '@/lib/extra-stores-column'
import { DAILY_PLAN_DEFAULT_TRAVEL_MINUTES, suggestVisitStores } from '@/lib/daily-plan-timeline'
import {
  addDaysYmdUtc,
  buildDailyPlanItems,
  buildDailyPlanWorkLogContent,
  DAILY_PLAN_ROLES,
  managerDailyPlanPosition,
  collectAssignedRoutineItems,
  mergeRoutineTemplatesForPlan,
  pickRoutineTemplatesForPlan,
  withAssignedRoutineItems,
  planItemDraftKey,
  dailyPlanDismissBlock,
  selectCarryItems,
  summarizePlanItems,
  type DailyPlanCancelReason,
  type DailyPlanDismissItem,
  type CarryLite,
  type DailyPlanRole,
  type HqTaskInput,
  type OpenActionLite,
  type PlanItemDraft,
  type PlanItemLite,
  type RoutineTemplate,
  type RoutineTemplateItem,
} from '@/lib/daily-plan-generate'

export type DailyPlanRow = {
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
  created_by: string
  created_at: string
  updated_at: string
  cancel_reason: string
  suppress_auto: boolean
  cancelled_at: string | null
  cancelled_by: string
}

export type DailyPlanItemRow = {
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
  delegated_to_employee_id: number | null
  delegated_to_name: string
  delegated_from_item_id: number | null
  delegated_by_name: string
}

export type PlanEmployee = {
  id: number
  name: string
  nick: string
  store: string
  job: string
  role: string
  /** 슈퍼바이저 담당 매장 등 추가 매장 */
  extraStores: string[]
}

// ─── 직원·직급 ──────────────────────────────────────

type EmployeeDbRow = {
  id?: number
  name?: string
  nick?: string
  store?: string
  job?: string
  role?: string
  extra_stores?: unknown
  resign_date?: string | null
  employment_status?: string | null
}

function toPlanEmployee(e: EmployeeDbRow): PlanEmployee {
  return {
    id: Number(e.id || 0),
    name: String(e.name || '').trim(),
    nick: String(e.nick || '').trim(),
    store: String(e.store || '').trim(),
    job: String(e.job || '').trim(),
    role: String(e.role || '').trim(),
    extraStores: parseExtraStoresColumn(e.extra_stores),
  }
}

const EMPLOYEE_SELECT = 'id,name,nick,store,job,role,extra_stores'

export async function loadActivePlanEmployees(): Promise<PlanEmployee[]> {
  const today = getBangkokTodayDateString()
  const rows = ((await supabaseSelect('employees', {
    order: 'id.asc',
    select: `${EMPLOYEE_SELECT},resign_date,employment_status`,
    limit: 5000,
  })) || []) as EmployeeDbRow[]
  return rows
    .filter((e) => {
      if (!String(e.name || '').trim() || !Number(e.id)) return false
      const resign = String(e.resign_date || '').trim().slice(0, 10)
      if (resign && resign < today) return false
      return !/퇴사|resign|terminated/i.test(String(e.employment_status || ''))
    })
    .map(toPlanEmployee)
}

export async function loadPlanEmployeeById(id: number): Promise<PlanEmployee | null> {
  if (!Number.isFinite(id) || id <= 0) return null
  const rows = (await supabaseSelectFilter('employees', `id=eq.${id}`, {
    select: EMPLOYEE_SELECT,
    limit: 1,
  })) as EmployeeDbRow[]
  return rows?.[0] ? toPlanEmployee(rows[0]) : null
}

/** 직원 id 우선, 없으면 이름·닉네임 (같은 매장 우선) */
export async function findPlanEmployee(params: {
  userId?: string | number | null
  name?: string | null
  store?: string | null
}): Promise<PlanEmployee | null> {
  const id = Number(params.userId || 0)
  if (id > 0) {
    const e = await loadPlanEmployeeById(id)
    if (e) return e
  }
  const name = String(params.name || '').trim()
  if (!name) return null
  const enc = encodeURIComponent(name)
  const rows = ((await supabaseSelectFilter('employees', `or=(name.eq.${enc},nick.eq.${enc})`, {
    select: EMPLOYEE_SELECT,
    limit: 10,
  })) || []) as EmployeeDbRow[]
  const store = String(params.store || '').trim().toLowerCase()
  const hit = rows.find((r) => String(r.store || '').trim().toLowerCase() === store) || rows[0]
  return hit ? toPlanEmployee(hit) : null
}

/** 슈퍼바이저 > 매니저 > 직원. 본사 소속(슈퍼바이저 제외)은 자동 생성 대상 아님(null) */
export function dailyPlanRoleOf(e: Pick<PlanEmployee, 'role' | 'job' | 'store'>): DailyPlanRole | null {
  if (isSupervisorRole(e.role) || isSupervisorRole(e.job)) return 'supervisor'
  if (isOfficeStore(e.store)) return null
  if (isManagerRole(e.role) || isManagerRole(e.job)) return 'manager'
  return 'staff'
}

/** staff=근무표 memo+job, manager=job(Service/Kitchen) 없으면 all, supervisor=all */
export function dailyPlanPositionOf(
  role: DailyPlanRole,
  emp: Pick<PlanEmployee, 'job'>,
  scheduleMemo?: string | null
): string {
  if (role === 'staff') return primaryAreaForDisplay(scheduleMemo, emp.job).toLowerCase()
  if (role === 'manager') return managerDailyPlanPosition(emp.job)
  return 'all'
}

// ─── 템플릿 ────────────────────────────────────────

type TemplateDbRow = {
  id?: number
  name?: string
  role_scope?: string
  position?: string
  store_name?: string
  employee_id?: number | null
  status?: string
  version?: number
  note?: string
  travel_minutes?: number | null
  updated_by?: string
  updated_at?: string
}

function travelOf(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && v != null ? Math.max(0, Math.min(240, Math.round(n))) : DAILY_PLAN_DEFAULT_TRAVEL_MINUTES
}

type TemplateItemDbRow = {
  id?: number
  template_id?: number
  sort_order?: number
  time_slot?: string
  block?: string
  category?: string
  title?: string
  description?: string
  est_minutes?: number
  weekdays?: string
  photo_required?: boolean
  link_type?: string
  per_store?: boolean
  employee_id?: number | null
}

export function mapTemplateItem(r: TemplateItemDbRow): RoutineTemplateItem {
  const eid = Number(r.employee_id || 0)
  return {
    id: Number(r.id || 0) || undefined,
    sortOrder: Number(r.sort_order || 0),
    timeSlot: String(r.time_slot || ''),
    block: String(r.block || ''),
    category: String(r.category || '기타'),
    title: String(r.title || ''),
    description: String(r.description || ''),
    estMinutes: Number(r.est_minutes ?? 15),
    weekdays: String(r.weekdays ?? '1234567'),
    photoRequired: !!r.photo_required,
    linkType: String(r.link_type || 'none'),
    perStore: !!r.per_store,
    employeeId: Number.isFinite(eid) && eid > 0 ? eid : 0,
  }
}

function mapRoutineTemplateRow(r: TemplateDbRow, items: RoutineTemplateItem[]): RoutineTemplate {
  const eid = Number(r.employee_id || 0)
  return {
    id: Number(r.id || 0),
    name: String(r.name || ''),
    roleScope: String(r.role_scope || 'supervisor'),
    position: String(r.position || 'all'),
    storeName: String(r.store_name || ''),
    employeeId: Number.isFinite(eid) && eid > 0 ? eid : 0,
    status: String(r.status || 'draft'),
    version: Number(r.version || 1),
    note: String(r.note || ''),
    travelMinutes: travelOf(r.travel_minutes),
    updatedBy: String(r.updated_by || ''),
    updatedAt: String(r.updated_at || ''),
    items,
  }
}

export async function loadRoutineTemplates(opts: { usableOnly?: boolean } = {}): Promise<RoutineTemplate[]> {
  const filter = opts.usableOnly ? 'status=in.(pilot,active)' : 'id=gt.0'
  let rows: TemplateDbRow[]
  try {
    rows = ((await supabaseSelectFilter('routine_templates', filter, {
      order: 'role_scope.asc,id.asc',
      limit: 500,
    })) || []) as TemplateDbRow[]
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!/employee_id/.test(msg)) throw e
    rows = ((await supabaseSelectFilter('routine_templates', filter, {
      select: 'id,name,role_scope,position,store_name,status,version,note,travel_minutes,updated_by,updated_at',
      order: 'role_scope.asc,id.asc',
      limit: 500,
    })) || []) as TemplateDbRow[]
  }
  if (rows.length === 0) return []
  const ids = rows.map((r) => Number(r.id)).filter((n) => n > 0)
  const items = ((await supabaseSelectFilter('routine_template_items', `template_id=in.(${ids.join(',')})`, {
    order: 'template_id.asc,sort_order.asc,id.asc',
    limit: 5000,
  })) || []) as TemplateItemDbRow[]
  const byTpl = new Map<number, RoutineTemplateItem[]>()
  for (const it of items) {
    const tid = Number(it.template_id || 0)
    const list = byTpl.get(tid) || []
    list.push(mapTemplateItem(it))
    byTpl.set(tid, list)
  }
  return rows.map((r) => mapRoutineTemplateRow(r, byTpl.get(Number(r.id || 0)) || []))
}

/** 템플릿별 매장 간 이동 분 (컬럼 미배포면 기본값) */
export async function loadTravelMinutesByTemplate(templateIds: (number | null)[]): Promise<Map<number, number>> {
  const ids = [...new Set(templateIds.filter((x): x is number => !!x && x > 0))]
  const out = new Map<number, number>()
  if (ids.length === 0) return out
  try {
    const rows = ((await supabaseSelectFilter('routine_templates', `id=in.(${ids.join(',')})`, {
      limit: ids.length,
    })) || []) as TemplateDbRow[]
    for (const r of rows) out.set(Number(r.id), travelOf(r.travel_minutes))
  } catch {
    /* 템플릿 조회 실패 시 기본값 */
  }
  return out
}

export function travelMinutesOfPlan(plan: Pick<DailyPlanRow, 'template_id'>, map: Map<number, number>): number {
  return (plan.template_id && map.get(plan.template_id)) ?? DAILY_PLAN_DEFAULT_TRAVEL_MINUTES
}

// ─── 매장 방문 기록 ────────────────────────────────

export type LastVisit = { date: string; name: string }

/** 매장별 마지막 방문 시작 (since 이후) */
export async function loadLastVisitByStore(sinceYmd: string): Promise<Map<string, LastVisit>> {
  const out = new Map<string, LastVisit>()
  try {
    const rows = ((await supabaseSelectFilter(
      'store_visits',
      `visit_date=gte.${sinceYmd}&visit_type=in.(${encodeURIComponent('방문시작')},${encodeURIComponent('강제 방문시작')})`,
      { select: 'visit_date,name,store_name', order: 'visit_date.desc', limit: 20000 }
    )) || []) as { visit_date?: string; name?: string; store_name?: string }[]
    for (const r of rows) {
      const store = String(r.store_name || '').trim()
      const date = String(r.visit_date || '').slice(0, 10)
      if (!store || !date) continue
      const cur = out.get(store)
      if (!cur || date > cur.date) out.set(store, { date, name: String(r.name || '').trim() })
    }
  } catch (e) {
    console.warn('loadLastVisitByStore:', e instanceof Error ? e.message : e)
  }
  return out
}

/** 슈퍼바이저 담당 매장 — 대표 매장 + 추가 매장 중 본사 제외 */
export function supervisorCandidateStores(emp: PlanEmployee): string[] {
  return [...new Set([emp.store, ...emp.extraStores].map((s) => String(s || '').trim()))].filter(
    (s) => s && !isOfficeStore(s)
  )
}

// ─── 개선 과제 ─────────────────────────────────────

export async function loadOpenActionsLite(): Promise<OpenActionLite[]> {
  try {
    const rows = ((await supabaseSelectFilter('store_action_items', 'status=in.(open,in_progress,pending_verify)', {
      select: 'id,store_name,title,status,due_date,owner_name,owner_user_id,verifier_name,verifier_user_id',
      order: 'due_date.asc.nullslast,id.asc',
      limit: 5000,
    })) || []) as Record<string, unknown>[]
    return rows.map((d) => ({
      id: Number(d.id || 0),
      store: String(d.store_name || ''),
      title: String(d.title || ''),
      status: String(d.status || 'open'),
      dueDate: d.due_date ? String(d.due_date).slice(0, 10) : '',
      ownerName: String(d.owner_name || ''),
      ownerUserId: String(d.owner_user_id || ''),
      verifierName: String(d.verifier_name || ''),
      verifierUserId: String(d.verifier_user_id || ''),
    }))
  } catch (e) {
    console.warn('loadOpenActionsLite:', e instanceof Error ? e.message : e)
    return []
  }
}

// ─── 일정표 조회 ───────────────────────────────────

export function normalizePlanRow(r: Record<string, unknown>): DailyPlanRow {
  const route = Array.isArray(r.route_stores) ? (r.route_stores as unknown[]).map((s) => String(s || '').trim()).filter(Boolean) : []
  return {
    id: Number(r.id || 0),
    plan_date: String(r.plan_date || '').slice(0, 10),
    employee_id: Number(r.employee_id || 0),
    employee_name: String(r.employee_name || ''),
    employee_store: String(r.employee_store || ''),
    role_scope: String(r.role_scope || 'staff'),
    position: String(r.position || 'all'),
    store_name: String(r.store_name || ''),
    route_stores: route,
    shift_in: String(r.shift_in || ''),
    shift_out: String(r.shift_out || ''),
    template_id: r.template_id != null ? Number(r.template_id) : null,
    status: String(r.status || 'planned'),
    briefing_note: String(r.briefing_note || ''),
    published_at: r.published_at ? String(r.published_at) : null,
    closed_at: r.closed_at ? String(r.closed_at) : null,
    est_total: Number(r.est_total || 0),
    actual_total: Number(r.actual_total || 0),
    work_log_id: String(r.work_log_id || ''),
    created_by: String(r.created_by || ''),
    created_at: String(r.created_at || ''),
    updated_at: String(r.updated_at || ''),
    cancel_reason: String(r.cancel_reason || ''),
    suppress_auto: !!r.suppress_auto,
    cancelled_at: r.cancelled_at ? String(r.cancelled_at) : null,
    cancelled_by: String(r.cancelled_by || ''),
  }
}

export function normalizePlanItemRow(r: Record<string, unknown>): DailyPlanItemRow {
  const toId = (v: unknown) => {
    const n = Number(v || 0)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  return {
    id: Number(r.id || 0),
    plan_id: Number(r.plan_id || 0),
    source: String(r.source || 'routine'),
    ref_id: String(r.ref_id || ''),
    store_name: String(r.store_name || ''),
    time_slot: String(r.time_slot || ''),
    block: String(r.block || ''),
    category: String(r.category || '기타'),
    title: String(r.title || ''),
    description: String(r.description || ''),
    est_minutes: Number(r.est_minutes || 0),
    link_type: String(r.link_type || 'none'),
    photo_required: !!r.photo_required,
    status: String(r.status || 'todo'),
    started_at: r.started_at ? String(r.started_at) : null,
    finished_at: r.finished_at ? String(r.finished_at) : null,
    actual_minutes: r.actual_minutes != null ? Number(r.actual_minutes) : null,
    skip_reason: String(r.skip_reason || ''),
    photo_urls: Array.isArray(r.photo_urls) ? (r.photo_urls as unknown[]).map(String) : [],
    note: String(r.note || ''),
    sort_order: Number(r.sort_order || 0),
    delegated_to_employee_id: toId(r.delegated_to_employee_id),
    delegated_to_name: String(r.delegated_to_name || ''),
    delegated_from_item_id: toId(r.delegated_from_item_id),
    delegated_by_name: String(r.delegated_by_name || ''),
  }
}

export async function getDailyPlanById(id: number): Promise<DailyPlanRow | null> {
  if (!Number.isFinite(id) || id <= 0) return null
  const rows = (await supabaseSelectFilter('daily_plans', `id=eq.${id}`, { limit: 1 })) as Record<string, unknown>[]
  return rows?.[0] ? normalizePlanRow(rows[0]) : null
}

export async function getDailyPlanFor(date: string, employeeId: number): Promise<DailyPlanRow | null> {
  const rows = (await supabaseSelectFilter(
    'daily_plans',
    `plan_date=eq.${date}&employee_id=eq.${employeeId}`,
    { limit: 1 }
  )) as Record<string, unknown>[]
  return rows?.[0] ? normalizePlanRow(rows[0]) : null
}

export async function getDailyPlanItems(planId: number): Promise<DailyPlanItemRow[]> {
  const rows = (await supabaseSelectFilter('daily_plan_items', `plan_id=eq.${planId}`, {
    order: 'sort_order.asc,id.asc',
    limit: 500,
  })) as Record<string, unknown>[]
  return (rows || []).map(normalizePlanItemRow)
}

async function delegatedCopySourceIds(sourceIds: number[]): Promise<Set<number>> {
  const set = new Set<number>()
  for (let i = 0; i < sourceIds.length; i += 100) {
    const chunk = sourceIds.slice(i, i + 100)
    const rows = ((await supabaseSelectFilter(
      'daily_plan_items',
      `delegated_from_item_id=in.(${chunk.join(',')})`,
      { select: 'delegated_from_item_id', limit: 500 }
    )) || []) as { delegated_from_item_id?: number }[]
    for (const r of rows) {
      const id = Number(r.delegated_from_item_id || 0)
      if (id > 0) set.add(id)
    }
  }
  return set
}

async function targetPlanForDelegatedCopy(date: string, employeeId: number, actor: string): Promise<DailyPlanRow | null> {
  const existing = await getDailyPlanFor(date, employeeId)
  if (existing) return existing.status === 'closed' ? null : existing
  const emp = await loadPlanEmployeeById(employeeId)
  if (!emp) return null
  const role = dailyPlanRoleOf(emp) || 'staff'
  const { plan } = await ensureDailyPlan({
    date,
    employee: emp,
    role,
    store: emp.store,
    actor: actor || 'delegate',
    force: true,
  })
  if (!plan || plan.status === 'closed') return null
  return plan
}

/**
 * 위임 원본은 「위임됨」인데 직원 일정 사본이 없으면 다시 만든다.
 * 일정표 재생성 때 미착수 사본이 지워진 경우(직원 2건·위임 3건)를 연 화면에서 복구한다.
 * 복구된 사본 수를 반환한다.
 */
export async function repairMissingDelegatedCopies(
  plan: DailyPlanRow,
  knownItems?: DailyPlanItemRow[]
): Promise<number> {
  if (plan.status === 'closed') return 0
  const mine = knownItems || (await getDailyPlanItems(plan.id))
  const pending: { src: DailyPlanItemRow; srcPlan: DailyPlanRow }[] = []
  const seen = new Set<number>()
  const push = (src: DailyPlanItemRow, srcPlan: DailyPlanRow) => {
    if (seen.has(src.id)) return
    if (src.status !== 'delegated' && src.status !== 'awaiting_verify') return
    if (!(Number(src.delegated_to_employee_id) > 0)) return
    seen.add(src.id)
    pending.push({ src, srcPlan })
  }
  for (const it of mine) push(it, plan)

  const inbound = ((await supabaseSelectFilter(
    'daily_plan_items',
    `delegated_to_employee_id=eq.${plan.employee_id}&status=in.(delegated,awaiting_verify)`,
    { limit: 100, order: 'id.desc' }
  )) || []) as Record<string, unknown>[]
  const inboundItems = inbound.map(normalizePlanItemRow).filter((it) => !seen.has(it.id))
  if (inboundItems.length > 0) {
    const planIds = [...new Set(inboundItems.map((it) => it.plan_id))].filter((id) => id > 0)
    const planRows = planIds.length
      ? (((await supabaseSelectFilter('daily_plans', `id=in.(${planIds.join(',')})`, { limit: 100 })) ||
          []) as Record<string, unknown>[])
      : []
    const byId = new Map(planRows.map((r) => [normalizePlanRow(r).id, normalizePlanRow(r)]))
    for (const src of inboundItems) {
      const srcPlan = byId.get(src.plan_id)
      if (!srcPlan || srcPlan.plan_date !== plan.plan_date || srcPlan.id === plan.id) continue
      push(src, srcPlan)
    }
  }
  if (pending.length === 0) return 0

  const have = await delegatedCopySourceIds(pending.map((p) => p.src.id))
  const missing = pending.filter((p) => !have.has(p.src.id))
  if (missing.length === 0) return 0

  const nowIso = new Date().toISOString()
  let created = 0
  for (const { src, srcPlan } of missing) {
    const targetId = Number(src.delegated_to_employee_id)
    const targetPlan =
      targetId === plan.employee_id
        ? plan
        : await targetPlanForDelegatedCopy(srcPlan.plan_date, targetId, src.delegated_by_name || srcPlan.employee_name)
    if (!targetPlan || targetPlan.status === 'closed') continue
    const again = await delegatedCopySourceIds([src.id])
    if (again.has(src.id)) continue
    const last = ((await supabaseSelectFilter('daily_plan_items', `plan_id=eq.${targetPlan.id}`, {
      select: 'sort_order',
      order: 'sort_order.desc',
      limit: 1,
    })) || []) as { sort_order?: number }[]
    const finished = src.status === 'awaiting_verify'
    await supabaseInsert('daily_plan_items', {
      plan_id: targetPlan.id,
      source: src.source || 'routine',
      ref_id: src.ref_id || '',
      store_name: src.store_name || targetPlan.store_name || '',
      time_slot: src.time_slot || '',
      block: src.block || '',
      category: src.category || '기타',
      title: String(src.title || '').slice(0, 300),
      description: String(src.description || '').slice(0, 2000),
      est_minutes: src.est_minutes,
      link_type: src.link_type || 'none',
      photo_required: src.photo_required,
      status: finished ? 'done' : 'todo',
      note: src.note || '',
      sort_order: Number(last?.[0]?.sort_order || 0) + 10,
      delegated_from_item_id: src.id,
      delegated_by_name: String(src.delegated_by_name || srcPlan.employee_name || '').slice(0, 120),
      ...(finished
        ? {
            finished_at: src.finished_at || nowIso,
            actual_minutes: src.actual_minutes ?? src.est_minutes,
          }
        : {}),
      created_at: nowIso,
      updated_at: nowIso,
    })
    await touchDailyPlanProgress(targetPlan.id)
    created += 1
  }
  return created
}

export function planItemLite(i: DailyPlanItemRow): PlanItemLite {
  return {
    source: i.source,
    status: i.status,
    title: i.title,
    storeName: i.store_name,
    estMinutes: i.est_minutes,
    actualMinutes: i.actual_minutes,
    skipReason: i.skip_reason,
  }
}

function itemRowKey(i: DailyPlanItemRow): string {
  return planItemDraftKey({ source: i.source as PlanItemDraft['source'], storeName: i.store_name, title: i.title, refId: i.ref_id })
}

function draftToRow(planId: number, d: PlanItemDraft): Record<string, unknown> {
  return {
    plan_id: planId,
    source: d.source,
    ref_id: d.refId,
    store_name: d.storeName,
    time_slot: d.timeSlot,
    block: d.block,
    category: d.category,
    title: d.title.slice(0, 300),
    description: d.description.slice(0, 2000),
    est_minutes: d.estMinutes,
    link_type: d.linkType,
    photo_required: d.photoRequired,
    status: 'todo',
    sort_order: d.sortOrder,
  }
}

function carryFromItem(i: DailyPlanItemRow): CarryLite {
  return {
    id: i.source === 'carry' && i.ref_id ? Number(i.ref_id) || i.id : i.id,
    source: i.source,
    refId: i.ref_id,
    storeName: i.store_name,
    title: i.title,
    category: i.category,
    description: i.description,
    estMinutes: i.est_minutes,
    linkType: i.link_type,
  }
}

/** 전날 마감된 일정표의 미완료 본사·이월 과제 (employee_id → 목록) */
async function loadCarryMap(date: string, employeeIds?: number[]): Promise<Map<number, CarryLite[]>> {
  const out = new Map<number, CarryLite[]>()
  const prev = addDaysYmdUtc(date, -1)
  let filter = `plan_date=eq.${prev}&status=eq.closed`
  if (employeeIds && employeeIds.length > 0) filter += `&employee_id=in.(${employeeIds.join(',')})`
  const plans = ((await supabaseSelectFilter('daily_plans', filter, {
    select: 'id,employee_id',
    limit: 5000,
  })) || []) as { id?: number; employee_id?: number }[]
  if (plans.length === 0) return out
  const planToEmp = new Map(plans.map((p) => [Number(p.id), Number(p.employee_id)]))
  const ids = [...planToEmp.keys()]
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const rows = ((await supabaseSelectFilter(
      'daily_plan_items',
      `plan_id=in.(${chunk.join(',')})&source=in.(hq_task,carry)&status=in.(todo,doing)`,
      { order: 'sort_order.asc', limit: 5000 }
    )) || []) as Record<string, unknown>[]
    for (const r of rows) {
      const it = normalizePlanItemRow(r)
      const emp = planToEmp.get(it.plan_id)
      if (!emp) continue
      const list = out.get(emp) || []
      list.push(carryFromItem(it))
      out.set(emp, list)
    }
  }
  return out
}

// ─── 생성 ──────────────────────────────────────────

export type DailyPlanGenContext = {
  templates: RoutineTemplate[]
  actions: OpenActionLite[]
  carry?: Map<number, CarryLite[]>
}

export async function loadDailyPlanGenContext(): Promise<DailyPlanGenContext> {
  const [templates, actions] = await Promise.all([loadRoutineTemplates({ usableOnly: true }), loadOpenActionsLite()])
  return { templates, actions }
}

export type EnsurePlanParams = {
  date: string
  employee: PlanEmployee
  role: DailyPlanRole
  position?: string
  store?: string
  shiftIn?: string
  shiftOut?: string
  /** undefined = 기존 값 유지 */
  routeStores?: string[]
  /** undefined = 기존 본사 과제 유지, 배열 = 미착수 본사 과제 교체 */
  hqTasks?: HqTaskInput[]
  briefing?: string
  actor: string
  /** 기존 일정표의 미착수 루틴·방문·과제 항목 재생성 */
  regenerate?: boolean
  /** 항목이 없어도 일정표 생성 (배정 화면) */
  force?: boolean
  /** 호출 측에서 이미 없음을 확인함 */
  knownMissing?: boolean
  /** 배정 화면에서 취소된 날을 다시 저장할 때 취소 기록을 풀고 재생성 */
  reviveCancelled?: boolean
  ctx?: DailyPlanGenContext
}

/** 개선 과제 화면에서 직접 넣은 항목 — 재생성 때 지우지 않음 */
export const MANUAL_BLOCK = 'manual'

/** 일정표 보장 — 없으면 생성, regenerate면 미착수 항목 재생성. 마감된 일정표는 건드리지 않음 */
export async function ensureDailyPlan(p: EnsurePlanParams): Promise<{ plan: DailyPlanRow | null; created: boolean }> {
  const existing = p.knownMissing ? null : await getDailyPlanFor(p.date, p.employee.id)
  if (existing?.status === 'closed') return { plan: existing, created: false }
  if (existing?.status === 'cancelled' && !p.reviveCancelled) return { plan: existing, created: false }

  const ctx = p.ctx || (await loadDailyPlanGenContext())
  const routeStores = (p.routeStores ?? existing?.route_stores ?? []).map((s) => String(s || '').trim()).filter(Boolean)
  const homeStore = String(p.store ?? existing?.store_name ?? p.employee.store).trim()
  const position = String(p.position ?? existing?.position ?? 'all').toLowerCase() || 'all'
  const picked = pickRoutineTemplatesForPlan(ctx.templates, {
    role: p.role,
    position,
    store: homeStore,
    employeeId: p.employee.id,
  })
  const template = mergeRoutineTemplatesForPlan(picked)
  const assignedFromOther = collectAssignedRoutineItems(ctx.templates, {
    employeeId: p.employee.id,
    store: homeStore,
    excludeTemplateIds: picked.map((t) => t.id),
  })
  const templateForItems = withAssignedRoutineItems(template, assignedFromOther, p.role)

  let carry: CarryLite[] = []
  if (!existing) {
    carry = ctx.carry ? ctx.carry.get(p.employee.id) || [] : (await loadCarryMap(p.date, [p.employee.id])).get(p.employee.id) || []
  }

  const drafts = buildDailyPlanItems({
    template: templateForItems,
    role: p.role,
    dateYmd: p.date,
    homeStore,
    routeStores,
    employee: { id: p.employee.id, name: p.employee.name, nick: p.employee.nick },
    actions: ctx.actions,
    carry,
    hqTasks: p.hqTasks ?? [],
  })

  /** 템플릿 미매칭으로 생긴 빈 껍데기(template_id 없음) → 이제 루틴이 있으면 자동 재생성 */
  const healEmptyShell =
    !!existing &&
    !p.regenerate &&
    !existing.template_id &&
    drafts.some((d) => d.source === 'routine')

  if (existing && !p.regenerate && !healEmptyShell) return { plan: existing, created: false }

  const now = new Date().toISOString()

  if (!existing) {
    if (drafts.length === 0 && !p.force) return { plan: null, created: false }
    const summary = summarizePlanItems(drafts.map((d) => ({ ...d, status: 'todo', actualMinutes: null, skipReason: '' })))
    let inserted: DailyPlanRow | null = null
    try {
      const res = (await supabaseInsert('daily_plans', {
        plan_date: p.date,
        employee_id: p.employee.id,
        employee_name: p.employee.name,
        employee_store: p.employee.store,
        role_scope: p.role,
        position,
        store_name: homeStore,
        route_stores: routeStores,
        shift_in: p.shiftIn || '',
        shift_out: p.shiftOut || '',
        template_id: template?.id ?? null,
        status: 'planned',
        briefing_note: String(p.briefing || '').slice(0, 2000),
        est_total: summary.estTotal,
        created_by: p.actor,
        created_at: now,
        updated_at: now,
      })) as Record<string, unknown>[] | Record<string, unknown>
      const first = Array.isArray(res) ? res[0] : res
      inserted = first ? normalizePlanRow(first) : null
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/duplicate|23505/i.test(msg)) {
        return { plan: await getDailyPlanFor(p.date, p.employee.id), created: false }
      }
      throw e
    }
    if (!inserted) return { plan: null, created: false }
    if (drafts.length > 0) {
      await supabaseInsertMany('daily_plan_items', drafts.map((d) => draftToRow(inserted!.id, d)))
    }
    return { plan: inserted, created: true }
  }

  const replaceSources = ['routine', 'visit', 'action', ...(p.hqTasks ? ['hq_task'] : [])]
  const replaceStatuses = p.reviveCancelled ? 'todo,cancelled' : 'todo'
  // 위임받은 사본(delegated_from)은 미착수여도 유지. 지우면 위임자 화면은 「위임됨」인데 직원 일정에서는 사라진다.
  await supabaseDeleteByFilter(
    'daily_plan_items',
    `plan_id=eq.${existing.id}&status=in.(${replaceStatuses})&source=in.(${replaceSources.join(',')})&block=neq.${MANUAL_BLOCK}&delegated_from_item_id=is.null`
  )
  const kept = await getDailyPlanItems(existing.id)
  const keptKeys = new Set(kept.map(itemRowKey))
  const fresh = drafts.filter((d) => !keptKeys.has(planItemDraftKey(d)))
  if (fresh.length > 0) {
    await supabaseInsertMany('daily_plan_items', fresh.map((d) => draftToRow(existing.id, d)))
  }
  const all = [...kept.map(planItemLite), ...fresh.map((d) => ({ ...d, status: 'todo', actualMinutes: null, skipReason: '' }))]
  const patch: Record<string, unknown> = {
    route_stores: routeStores,
    store_name: homeStore,
    position,
    template_id: template?.id ?? null,
    est_total: summarizePlanItems(all).estTotal,
    updated_at: now,
  }
  if (p.briefing !== undefined) patch.briefing_note = String(p.briefing || '').slice(0, 2000)
  if (p.shiftIn !== undefined) patch.shift_in = p.shiftIn
  if (p.shiftOut !== undefined) patch.shift_out = p.shiftOut
  if (p.reviveCancelled && existing.status === 'cancelled') {
    patch.status = 'planned'
    patch.cancel_reason = ''
    patch.suppress_auto = false
    patch.cancelled_at = null
    patch.cancelled_by = ''
  }
  await supabaseUpdateByFilter('daily_plans', `id=eq.${existing.id}`, patch)
  return { plan: { ...existing, ...(patch as Partial<DailyPlanRow>) }, created: false }
}

type ScheduleLite = {
  employee_id?: number | null
  name?: string
  store_name?: string
  plan_in?: string
  plan_out?: string
  memo?: string
}

export type GeneratePlansResult = { created: number; existing: number; skipped: number; failed: number }

function routeOf(v: unknown): string[] {
  return Array.isArray(v) ? v.map((s) => String(s || '').trim()).filter(Boolean) : []
}

/** 방문 매장이 정해지지 않은 슈퍼바이저 — 담당 매장 중 과제·미방문 기준 자동 동선 (다른 사람과 겹치지 않게) */
export async function suggestRoutesForSupervisors(
  date: string,
  supervisors: PlanEmployee[],
  actions: OpenActionLite[],
  takenStores: string[]
): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>()
  const withStores = supervisors.filter((e) => supervisorCandidateStores(e).length > 0)
  if (withStores.length === 0) return out
  const last = await loadLastVisitByStore(addDaysYmdUtc(date, -60))
  const lastVisitByStore = new Map([...last].map(([s, v]) => [s, v.date]))
  const taken = [...takenStores]
  for (const emp of withStores) {
    const picks = suggestVisitStores({
      candidates: supervisorCandidateStores(emp),
      actions,
      lastVisitByStore,
      dateYmd: date,
      exclude: taken,
    }).map((p) => p.store)
    if (picks.length === 0) continue
    taken.push(...picks)
    out.set(emp.id, picks)
  }
  return out
}

async function runInBatches<T>(list: T[], size: number, fn: (x: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < list.length; i += size) {
    await Promise.all(list.slice(i, i + size).map(fn))
  }
}

/** 날짜 일정표 일괄 생성 — 슈퍼바이저·매니저 전원 + 그날 근무표가 있는 직원 */
export async function generateDailyPlansForDate(date: string, actor: string): Promise<GeneratePlansResult> {
  const result: GeneratePlansResult = { created: 0, existing: 0, skipped: 0, failed: 0 }
  const [employees, ctx, existingRows, schedules] = await Promise.all([
    loadActivePlanEmployees(),
    loadDailyPlanGenContext(),
    supabaseSelectFilter('daily_plans', `plan_date=eq.${date}`, {
      select: 'employee_id,route_stores,template_id',
      limit: 5000,
    }) as Promise<{ employee_id?: number; route_stores?: unknown; template_id?: number | null }[]>,
    supabaseSelectFilter('schedules', `schedule_date=eq.${date}`, {
      select: 'employee_id,name,store_name,plan_in,plan_out,memo',
      limit: 5000,
    }).catch(() => []) as Promise<ScheduleLite[]>,
  ])
  ctx.carry = await loadCarryMap(date)
  const existingByEmp = new Map(
    (existingRows || []).map((r) => [Number(r.employee_id), r] as const)
  )
  const byId = new Map(employees.map((e) => [e.id, e]))
  const byName = new Map<string, PlanEmployee>()
  for (const e of employees) {
    byName.set(`${e.store.toLowerCase()}|${e.name.toLowerCase()}`, e)
    if (e.nick) byName.set(`${e.store.toLowerCase()}|${e.nick.toLowerCase()}`, e)
  }
  const scheduleOf = new Map<number, ScheduleLite>()
  for (const s of schedules || []) {
    const emp =
      (s.employee_id ? byId.get(Number(s.employee_id)) : undefined) ||
      byName.get(`${String(s.store_name || '').trim().toLowerCase()}|${String(s.name || '').trim().toLowerCase()}`)
    if (emp && !scheduleOf.has(emp.id)) scheduleOf.set(emp.id, s)
  }

  type Target = { emp: PlanEmployee; role: DailyPlanRole; store: string; position: string; s?: ScheduleLite }
  const targets: Target[] = []
  for (const emp of employees) {
    const role = dailyPlanRoleOf(emp)
    if (!role) continue
    const s = scheduleOf.get(emp.id)
    if (role === 'staff' && !s) continue
    const store = role === 'staff' ? String(s?.store_name || emp.store).trim() : emp.store
    const position = dailyPlanPositionOf(role, emp, s?.memo)
    targets.push({ emp, role, store, position, s })
  }

  const autoRoutes = await suggestRoutesForSupervisors(
    date,
    targets
      .filter((t) => t.role === 'supervisor' && !existingByEmp.has(t.emp.id))
      .map((t) => t.emp),
    ctx.actions,
    (existingRows || []).flatMap((r) => routeOf(r.route_stores))
  )

  await runInBatches(targets, 5, async (t) => {
    const existingRow = existingByEmp.get(t.emp.id)
    const shellWithoutTemplate = !!existingRow && (existingRow.template_id == null || existingRow.template_id === 0)
    if (existingRow && !shellWithoutTemplate) {
      result.existing += 1
      return
    }
    try {
      const r = await ensureDailyPlan({
        date,
        employee: t.emp,
        role: t.role,
        store: t.store,
        position: t.position,
        shiftIn: String(t.s?.plan_in || ''),
        shiftOut: String(t.s?.plan_out || ''),
        routeStores: autoRoutes.get(t.emp.id),
        actor,
        knownMissing: !existingRow,
        regenerate: shellWithoutTemplate,
        force: shellWithoutTemplate,
        ctx,
      })
      if (r.created) result.created += 1
      else if (shellWithoutTemplate && r.plan) result.created += 1
      else result.skipped += 1
    } catch (e) {
      result.failed += 1
      console.warn('generateDailyPlansForDate:', t.emp.id, e instanceof Error ? e.message : e)
    }
  })
  return result
}

/** 한 사람 일정표를 그 자리에서 보장 (근무표에서 매장·구역·시간 반영). 대상 아님/항목 없음이면 null */
export async function ensureDailyPlanOnDemand(
  date: string,
  employee: PlanEmployee,
  actor: string
): Promise<DailyPlanRow | null> {
  const role = dailyPlanRoleOf(employee)
  if (!role) return null
  let s: ScheduleLite | undefined
  try {
    const rows = (await supabaseSelectFilter(
      'schedules',
      `schedule_date=eq.${date}&employee_id=eq.${employee.id}`,
      { select: 'employee_id,name,store_name,plan_in,plan_out,memo', limit: 1 }
    )) as ScheduleLite[]
    s = rows?.[0]
  } catch {
    s = undefined
  }
  if (role === 'staff' && !s) return null
  let routeStores: string[] | undefined
  if (role === 'supervisor' && supervisorCandidateStores(employee).length > 0) {
    const [actions, others] = await Promise.all([
      loadOpenActionsLite(),
      supabaseSelectFilter('daily_plans', `plan_date=eq.${date}`, { select: 'route_stores', limit: 5000 }).catch(
        () => []
      ) as Promise<{ route_stores?: unknown }[]>,
    ])
    const routes = await suggestRoutesForSupervisors(
      date,
      [employee],
      actions,
      (others || []).flatMap((r) => routeOf(r.route_stores))
    )
    routeStores = routes.get(employee.id)
  }
  const r = await ensureDailyPlan({
    date,
    employee,
    role,
    routeStores,
    store: role === 'staff' ? String(s?.store_name || employee.store).trim() : employee.store,
    position: dailyPlanPositionOf(role, employee, s?.memo),
    shiftIn: String(s?.plan_in || ''),
    shiftOut: String(s?.plan_out || ''),
    actor,
  })
  return r.plan
}

// ─── 개선 과제 → 일정 추가 ─────────────────────────

export type ActionForPlan = { id: number; store: string; title: string; dueDate: string }

/** 같은 매장 항목 뒤, 없으면 마지막 고정 시각 항목(마감 보고 등) 앞 */
function sortOrderNear(items: DailyPlanItemRow[], store: string): number {
  const key = store.trim().toLowerCase()
  const same = items.filter((i) => key && i.store_name.trim().toLowerCase() === key)
  if (same.length > 0) return same[same.length - 1].sort_order + 1
  const last = items[items.length - 1]
  if (last && last.time_slot) return last.sort_order - 1
  return (last?.sort_order || 0) + 10
}

/** 일정에 개선 과제 항목 추가(이미 있으면 그대로). 재생성 때 지워지지 않도록 manual 구간 */
export async function addActionItemToPlan(
  plan: DailyPlanRow,
  action: ActionForPlan,
  kind: 'owner' | 'verify'
): Promise<{ added: boolean; itemId: number | null }> {
  if (plan.status === 'closed' || plan.status === 'cancelled') return { added: false, itemId: null }
  const items = await getDailyPlanItems(plan.id)
  const found = items.find((i) => i.source === 'action' && i.ref_id === String(action.id))
  if (found) return { added: false, itemId: found.id }
  const draft: PlanItemDraft = {
    source: 'action',
    refId: String(action.id),
    storeName: action.store,
    timeSlot: '',
    block: MANUAL_BLOCK,
    category: '당일 과제',
    title: `${kind === 'verify' ? '[재확인]' : '[개선]'} ${action.title}`,
    description: action.dueDate ? `due ${action.dueDate}` : '',
    estMinutes: kind === 'verify' ? 10 : 20,
    linkType: 'store_actions',
    photoRequired: false,
    sortOrder: sortOrderNear(items, action.store),
  }
  const res = (await supabaseInsert('daily_plan_items', draftToRow(plan.id, draft))) as
    | Record<string, unknown>[]
    | Record<string, unknown>
  const row = Array.isArray(res) ? res[0] : res
  const est = summarizePlanItems([
    ...items.map(planItemLite),
    { ...draft, status: 'todo', actualMinutes: null, skipReason: '' },
  ]).estTotal
  await supabaseUpdateByFilter('daily_plans', `id=eq.${plan.id}`, { est_total: est, updated_at: new Date().toISOString() })
  return { added: true, itemId: row?.id != null ? Number(row.id) : null }
}

/** 슈퍼바이저 일정에 방문 매장 추가 — 없으면 일정 생성, 있으면 미착수 항목 재생성 */
export async function addVisitStoreToPlan(params: {
  date: string
  employee: PlanEmployee
  store: string
  actor: string
}): Promise<{ plan: DailyPlanRow | null; added: boolean; closed?: boolean }> {
  const store = params.store.trim()
  const existing = await getDailyPlanFor(params.date, params.employee.id)
  if (existing?.status === 'closed') return { plan: existing, added: false, closed: true }
  const route = existing?.route_stores || []
  if (route.some((s) => s.trim().toLowerCase() === store.toLowerCase())) return { plan: existing, added: false }
  const r = await ensureDailyPlan({
    date: params.date,
    employee: params.employee,
    role: 'supervisor',
    routeStores: [...route, store],
    actor: params.actor,
    regenerate: true,
    force: true,
  })
  return { plan: r.plan, added: true }
}

// ─── 공개·푸시 ─────────────────────────────────────

export function planRecipient(plan: Pick<DailyPlanRow, 'employee_store' | 'employee_name'>): StoreActionRecipient | null {
  const store = String(plan.employee_store || '').trim()
  const name = String(plan.employee_name || '').trim()
  return store && name ? { store, name } : null
}

/** 미공개 일정표 공개 + 푸시. 공개된 건수 반환 */
export async function publishDailyPlansForDate(date: string, pushTitle: string, pushBody: string): Promise<number> {
  const rows = ((await supabaseUpdateByFilterReturning(
    'daily_plans',
    `plan_date=eq.${date}&published_at=is.null&status=neq.closed&status=neq.cancelled`,
    { published_at: new Date().toISOString() }
  )) || []) as Record<string, unknown>[]
  const plans = rows.map(normalizePlanRow)
  if (plans.length > 0) {
    await pushStoreActionNotice({ title: pushTitle, body: pushBody, recipients: plans.map(planRecipient) })
  }
  return plans.length
}

/**
 * 선택한 일정표 id만 공개 + 푸시.
 * 권한·마감·이미 공개된 건은 건너뜀. { published, skipped }
 */
export async function publishDailyPlansByIds(
  planIds: number[],
  scope: DailyPlanScope,
  pushTitle: string,
  pushBody: string
): Promise<{ published: number; skipped: number }> {
  const ids = [...new Set(planIds.map((n) => Math.floor(Number(n))).filter((n) => Number.isFinite(n) && n > 0))].slice(
    0,
    200
  )
  if (ids.length === 0) return { published: 0, skipped: 0 }

  const rows = ((await supabaseSelectFilter('daily_plans', `id=in.(${ids.join(',')})`, {
    limit: ids.length,
  })) || []) as Record<string, unknown>[]
  const plans = rows.map(normalizePlanRow)
  const allowed: DailyPlanRow[] = []
  let skipped = 0
  for (const plan of plans) {
    if (plan.published_at || plan.status === 'closed' || plan.status === 'cancelled') {
      skipped += 1
      continue
    }
    if (!canViewDailyPlan(scope, plan)) {
      skipped += 1
      continue
    }
    const role = (DAILY_PLAN_ROLES.includes(plan.role_scope as DailyPlanRole)
      ? plan.role_scope
      : dailyPlanRoleOf({
          role: plan.role_scope,
          job: '',
          store: plan.employee_store,
        }) || 'staff') as DailyPlanRole
    if (
      !canAssignDailyPlan(scope, {
        role,
        store: plan.employee_store || plan.store_name,
        employeeId: plan.employee_id,
      })
    ) {
      skipped += 1
      continue
    }
    allowed.push(plan)
  }
  if (allowed.length === 0) return { published: 0, skipped: skipped + (ids.length - plans.length) }

  const now = new Date().toISOString()
  const updated = ((await supabaseUpdateByFilterReturning(
    'daily_plans',
    `id=in.(${allowed.map((p) => p.id).join(',')})&published_at=is.null&status=neq.closed&status=neq.cancelled`,
    { published_at: now, updated_at: now }
  )) || []) as Record<string, unknown>[]
  const publishedPlans = updated.map(normalizePlanRow)
  if (publishedPlans.length > 0) {
    await pushStoreActionNotice({
      title: pushTitle,
      body: pushBody,
      recipients: publishedPlans.map(planRecipient),
    })
  }
  skipped += allowed.length - publishedPlans.length + (ids.length - plans.length)
  return { published: publishedPlans.length, skipped }
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 주간 보기: 빈 칸은 생성, 미공개는 공개.
 * targets = { employeeId, date }[] (오늘 이후만).
 */
export async function ensureAndPublishDailyPlanTargets(
  targets: { employeeId: number; date: string }[],
  scope: DailyPlanScope,
  opts: { publish?: boolean; actor?: string } = {}
): Promise<{ created: number; published: number; skipped: number; failed: number }> {
  const today = getBangkokTodayDateString()
  const publish = opts.publish !== false
  const actor = String(opts.actor || scope.actorName || '').trim() || 'system'
  const uniq = new Map<string, { employeeId: number; date: string }>()
  for (const t of targets) {
    const employeeId = Math.floor(Number(t.employeeId) || 0)
    const date = String(t.date || '').trim()
    if (!(employeeId > 0) || !YMD_RE.test(date) || date < today) continue
    uniq.set(`${employeeId}|${date}`, { employeeId, date })
  }
  const list = [...uniq.values()].slice(0, 120)
  let created = 0
  let skipped = 0
  let failed = 0
  const toPublish: number[] = []

  for (const t of list) {
    try {
      const emp = await loadPlanEmployeeById(t.employeeId)
      if (!emp) {
        skipped += 1
        continue
      }
      const role = dailyPlanRoleOf(emp)
      if (!role) {
        skipped += 1
        continue
      }
      if (!canAssignDailyPlan(scope, { role, store: emp.store, employeeId: emp.id })) {
        skipped += 1
        continue
      }
      const before = await getDailyPlanFor(t.date, emp.id)
      if (before?.status === 'closed' || before?.status === 'cancelled') {
        skipped += 1
        continue
      }
      const plan =
        before ||
        (await ensureDailyPlanOnDemand(t.date, emp, actor)) ||
        (
          await ensureDailyPlan({
            date: t.date,
            employee: emp,
            role,
            actor,
            force: true,
            knownMissing: true,
          })
        ).plan
      if (!plan) {
        failed += 1
        continue
      }
      if (!before) created += 1
      if (publish && !plan.published_at && plan.status !== 'closed' && plan.status !== 'cancelled') {
        toPublish.push(plan.id)
      } else if (!publish || plan.published_at) {
        /* already published or save-only */
      }
    } catch (e) {
      failed += 1
      console.warn('ensureAndPublishDailyPlanTargets:', t.employeeId, t.date, e instanceof Error ? e.message : e)
    }
  }

  let published = 0
  if (publish && toPublish.length > 0) {
    const r = await publishDailyPlansByIds(
      toPublish,
      scope,
      '📅 일정표 배정 · มีตารางงานใหม่ครับ',
      `공개 ${toPublish.length}건 · เผยแพร่ตารางงานครับ`.slice(0, 180)
    )
    published = r.published
    skipped += r.skipped
  }
  return { created, published, skipped, failed }
}

// ─── 마감 ──────────────────────────────────────────

async function writeDailyPlanWorkLog(plan: DailyPlanRow, items: DailyPlanItemRow[], auto: boolean, actor: string): Promise<string> {
  const lite = items.map(planItemLite)
  const s = summarizePlanItems(lite)
  const content = buildDailyPlanWorkLogContent({ dateYmd: plan.plan_date, items: lite, auto })
  const emp = await resolveWorkLogEmployeeById(plan.employee_id).catch(() => null)
  const name = workLogStoredNameFromEmployeeMaster(emp?.name || plan.employee_name)
  const store = String(emp?.store || plan.employee_store || '').trim()
  const status = s.total > 0 && s.done === s.total ? 'Finish' : 'Carry Over'
  const patch = {
    log_date: plan.plan_date,
    dept: String(emp?.job || plan.role_scope),
    name,
    content,
    progress: s.doneRate,
    status,
    priority: '',
    ...(store ? { store } : {}),
    employee_id: plan.employee_id,
  }
  if (plan.work_log_id) {
    await supabaseUpdateByFilter('work_logs', `id=eq.${encodeURIComponent(plan.work_log_id)}`, patch)
    return plan.work_log_id
  }
  const id = `${plan.plan_date}_${name}_${Date.now()}_${Math.floor(Math.random() * 100)}`
  await supabaseInsert('work_logs', { id, ...patch, manager_check: '대기', manager_comment: '' })
  await writeWorkLogAudit({
    actionType: 'insert',
    logDate: plan.plan_date,
    employeeId: plan.employee_id,
    employeeName: name,
    employeeStore: store || null,
    changeReason: auto ? 'daily_plan_auto_close' : 'daily_plan_close',
    afterRow: { workLogId: id, planId: plan.id, done: s.done, total: s.total },
    actor: { name: actor || null, role: null, store: null, employeeId: null },
  }).catch(() => undefined)
  return id
}

/** 미완료 본사·이월 과제를 다음 날 일정표(이미 있으면)에 추가 */
async function carryToNextPlan(plan: DailyPlanRow, items: DailyPlanItemRow[]): Promise<number> {
  const carry = selectCarryItems(items)
  if (carry.length === 0) return 0
  const next = await getDailyPlanFor(addDaysYmdUtc(plan.plan_date, 1), plan.employee_id)
  if (!next || next.status === 'closed' || next.status === 'cancelled') return 0
  const nextItems = await getDailyPlanItems(next.id)
  const keys = new Set(nextItems.map(itemRowKey))
  const maxSort = nextItems.reduce((m, i) => Math.max(m, i.sort_order), 0)
  const drafts: PlanItemDraft[] = []
  for (const c of carry.map(carryFromItem)) {
    const d: PlanItemDraft = {
      source: 'carry',
      refId: String(c.id),
      storeName: c.storeName,
      timeSlot: '',
      block: '',
      category: c.category,
      title: c.title,
      description: c.description,
      estMinutes: c.estMinutes,
      linkType: c.linkType,
      photoRequired: false,
      sortOrder: maxSort + (drafts.length + 1) * 10,
    }
    if (keys.has(planItemDraftKey(d))) continue
    keys.add(planItemDraftKey(d))
    drafts.push(d)
  }
  if (drafts.length === 0) return 0
  await supabaseInsertMany('daily_plan_items', drafts.map((d) => draftToRow(next.id, d)))
  const est = summarizePlanItems([...nextItems.map(planItemLite), ...drafts.map((d) => ({ ...d, status: 'todo', actualMinutes: null, skipReason: '' }))]).estTotal
  await supabaseUpdateByFilter('daily_plans', `id=eq.${next.id}`, { est_total: est, updated_at: new Date().toISOString() })
  return drafts.length
}

export type ClosePlanResult = {
  planId: number
  done: number
  total: number
  estTotal: number
  actualTotal: number
  workLogId: string
  carried: number
}

export async function closeDailyPlan(plan: DailyPlanRow, opts: { actor: string; auto?: boolean }): Promise<ClosePlanResult> {
  const items = await getDailyPlanItems(plan.id)
  const s = summarizePlanItems(items.map(planItemLite))
  let workLogId = plan.work_log_id
  try {
    workLogId = await writeDailyPlanWorkLog(plan, items, !!opts.auto, opts.actor)
  } catch (e) {
    console.warn('daily plan work log write failed:', e instanceof Error ? e.message : e)
  }
  const now = new Date().toISOString()
  await supabaseUpdateByFilter('daily_plans', `id=eq.${plan.id}`, {
    status: 'closed',
    closed_at: now,
    est_total: s.estTotal,
    actual_total: s.actualTotal,
    work_log_id: workLogId || '',
    updated_at: now,
  })
  let carried = 0
  try {
    carried = await carryToNextPlan(plan, items)
  } catch (e) {
    console.warn('daily plan carry failed:', e instanceof Error ? e.message : e)
  }
  return {
    planId: plan.id,
    done: s.done,
    total: s.total,
    estTotal: s.estTotal,
    actualTotal: s.actualTotal,
    workLogId: workLogId || '',
    carried,
  }
}

function isDailyPlanCancelSchemaError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /cancel_reason|suppress_auto|cancelled_at|cancelled_by|PGRST204|42703/i.test(msg)
}

export { isDailyPlanCancelSchemaError }

function planAsTarget(plan: DailyPlanRow): { role: DailyPlanRole; store: string; employeeId: number } {
  const role = (DAILY_PLAN_ROLES as readonly string[]).includes(plan.role_scope)
    ? (plan.role_scope as DailyPlanRole)
    : 'staff'
  return { role, store: String(plan.employee_store || plan.store_name || '').trim(), employeeId: plan.employee_id }
}

function dismissItemOf(i: DailyPlanItemRow): DailyPlanDismissItem {
  return {
    status: i.status,
    source: i.source,
    startedAt: i.started_at,
    delegatedToEmployeeId: i.delegated_to_employee_id,
    delegatedFromItemId: i.delegated_from_item_id,
  }
}

export type DismissDailyPlansResult = {
  deleted: number
  cancelled: number
  skipped: number
  failed: number
  schemaMissing: boolean
  skippedList: { employeeId: number; date: string; reason: string }[]
}

/**
 * 주간 칸 삭제.
 * 미공개·미착수는 행 삭제(suppress 면 취소 흔적을 남겨 18:00 재생성을 막음).
 * 공개된 칸은 취소로 남기고 직원에게 알림. 마감·진행 중은 건너뜀.
 */
export async function dismissDailyPlanTargets(
  targets: { employeeId: number; date: string }[],
  scope: DailyPlanScope,
  opts: { reason: DailyPlanCancelReason; suppressAuto: boolean; actor?: string }
): Promise<DismissDailyPlansResult> {
  const today = getBangkokTodayDateString()
  const actor = String(opts.actor || scope.actorName || '').trim() || 'system'
  const uniq = new Map<string, { employeeId: number; date: string }>()
  for (const t of targets) {
    const employeeId = Math.floor(Number(t.employeeId) || 0)
    const date = String(t.date || '').trim()
    if (!(employeeId > 0) || !YMD_RE.test(date)) continue
    uniq.set(`${employeeId}|${date}`, { employeeId, date })
  }
  const result: DismissDailyPlansResult = {
    deleted: 0,
    cancelled: 0,
    skipped: 0,
    failed: 0,
    schemaMissing: false,
    skippedList: [],
  }
  const skip = (employeeId: number, date: string, reason: string) => {
    result.skipped += 1
    if (result.skippedList.length < 30) result.skippedList.push({ employeeId, date, reason })
  }
  const now = new Date().toISOString()

  for (const t of [...uniq.values()].slice(0, 120)) {
    try {
      if (t.date < today) {
        skip(t.employeeId, t.date, 'past')
        continue
      }
      const plan = await getDailyPlanFor(t.date, t.employeeId)
      if (!plan) {
        skip(t.employeeId, t.date, 'missing')
        continue
      }
      if (!canDismissDailyPlan(scope, planAsTarget(plan))) {
        skip(t.employeeId, t.date, 'forbidden')
        continue
      }
      const items = await getDailyPlanItems(plan.id)
      const block = dailyPlanDismissBlock(plan.status, items.map(dismissItemOf))
      if (block) {
        skip(t.employeeId, t.date, block)
        continue
      }
      if (!plan.published_at && !opts.suppressAuto) {
        await supabaseDeleteByFilter('daily_plans', `id=eq.${plan.id}`)
        result.deleted += 1
        continue
      }
      await supabaseUpdateByFilter('daily_plans', `id=eq.${plan.id}`, {
        status: 'cancelled',
        cancel_reason: opts.reason,
        suppress_auto: true,
        cancelled_at: now,
        cancelled_by: actor.slice(0, 120),
        est_total: 0,
        updated_at: now,
      })
      if (!plan.published_at) {
        await supabaseDeleteByFilter('daily_plan_items', `plan_id=eq.${plan.id}`)
      } else {
        await supabaseUpdateByFilter('daily_plan_items', `plan_id=eq.${plan.id}&status=eq.todo`, {
          status: 'cancelled',
          skip_reason: opts.reason,
          updated_at: now,
        })
      }
      result.cancelled += 1
      if (plan.published_at) {
        const recipient = planRecipient(plan)
        if (recipient) {
          void pushStoreActionNotice({
            title: '🗑️ ตารางงานถูกยกเลิก · 일정 취소',
            body: `${plan.plan_date} ${plan.employee_name}`.slice(0, 180),
            recipients: [recipient],
          }).catch(() => {})
        }
      }
    } catch (e) {
      if (isDailyPlanCancelSchemaError(e)) {
        result.schemaMissing = true
        result.failed += 1
        return result
      }
      result.failed += 1
      console.warn('dismissDailyPlanTargets:', t.employeeId, t.date, e instanceof Error ? e.message : e)
    }
  }
  return result
}

export type MoveDailyPlanResult =
  | { ok: true; planId: number }
  | { ok: false; messageKey: string; message: string; status: number }

/** 시작 전 하루 일정을 다른 사람 또는 다른 날로 옮긴다. 원래 칸은 선택 시 재생성 금지 흔적을 남긴다. */
export async function moveDailyPlan(
  params: {
    fromEmployeeId: number
    fromDate: string
    toEmployeeId: number
    toDate: string
    suppressAuto: boolean
  },
  scope: DailyPlanScope
): Promise<MoveDailyPlanResult> {
  const today = getBangkokTodayDateString()
  const fromDate = String(params.fromDate || '').trim()
  const toDate = String(params.toDate || '').trim()
  const fromEmployeeId = Math.floor(Number(params.fromEmployeeId) || 0)
  const toEmployeeId = Math.floor(Number(params.toEmployeeId) || 0)
  if (!YMD_RE.test(fromDate) || !YMD_RE.test(toDate) || fromDate < today || toDate < today) {
    return { ok: false, messageKey: 'dp_err_date_range', message: '오늘부터 7일 이내만 옮길 수 있습니다.', status: 400 }
  }
  const maxDate = addDaysYmdUtc(today, 7)
  if (toDate > maxDate) {
    return { ok: false, messageKey: 'dp_err_date_range', message: '오늘부터 7일 이내만 옮길 수 있습니다.', status: 400 }
  }
  if (fromEmployeeId === toEmployeeId && fromDate === toDate) {
    return { ok: false, messageKey: 'dp_err_move_same', message: '같은 사람·같은 날짜입니다.', status: 400 }
  }
  const source = await getDailyPlanFor(fromDate, fromEmployeeId)
  if (!source) return { ok: false, messageKey: 'dp_no_plan', message: '일정표가 없습니다.', status: 404 }
  if (!canDismissDailyPlan(scope, planAsTarget(source))) {
    return { ok: false, messageKey: 'dp_err_cancel_forbidden', message: '권한이 없습니다.', status: 403 }
  }
  const items = await getDailyPlanItems(source.id)
  const block = dailyPlanDismissBlock(source.status, items.map(dismissItemOf))
  if (block === 'in_progress') {
    return { ok: false, messageKey: 'dp_err_move_locked', message: '이미 시작한 일정은 옮길 수 없습니다.', status: 409 }
  }
  if (block) {
    return { ok: false, messageKey: 'dp_err_cancel_locked', message: '마감되었거나 취소된 일정은 옮길 수 없습니다.', status: 409 }
  }
  const emp = await loadPlanEmployeeById(toEmployeeId)
  if (!emp) return { ok: false, messageKey: 'dp_msg_employee_not_found', message: '직원을 찾을 수 없습니다.', status: 404 }
  const role = dailyPlanRoleOf(emp)
  if (!role) return { ok: false, messageKey: 'dp_err_no_role', message: '이 직급은 일정표를 쓰지 않습니다.', status: 400 }
  if (!canAssignDailyPlan(scope, { role, store: emp.store, employeeId: emp.id })) {
    return { ok: false, messageKey: 'dp_err_cancel_forbidden', message: '권한이 없습니다.', status: 403 }
  }
  const target = await getDailyPlanFor(toDate, emp.id)
  if (target) {
    return { ok: false, messageKey: 'dp_err_move_target', message: '옮길 곳에 이미 일정이 있습니다.', status: 409 }
  }
  const now = new Date().toISOString()
  const actor = String(scope.actorName || '').trim() || 'system'
  try {
    await supabaseUpdateByFilter('daily_plans', `id=eq.${source.id}`, {
      plan_date: toDate,
      employee_id: emp.id,
      employee_name: emp.name,
      employee_store: emp.store,
      role_scope: role,
      position: dailyPlanPositionOf(role, emp),
      store_name: role === 'supervisor' ? source.store_name : emp.store,
      route_stores: role === 'supervisor' ? source.route_stores || [] : [],
      updated_at: now,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/duplicate|23505/i.test(msg)) {
      return { ok: false, messageKey: 'dp_err_move_target', message: '옮길 곳에 이미 일정이 있습니다.', status: 409 }
    }
    throw e
  }
  if (params.suppressAuto) {
    try {
      await supabaseInsert('daily_plans', {
        plan_date: fromDate,
        employee_id: fromEmployeeId,
        employee_name: source.employee_name,
        employee_store: source.employee_store,
        role_scope: source.role_scope,
        position: source.position,
        store_name: source.store_name,
        route_stores: source.route_stores || [],
        status: 'cancelled',
        cancel_reason: 'moved',
        suppress_auto: true,
        cancelled_at: now,
        cancelled_by: actor.slice(0, 120),
        created_by: actor.slice(0, 120),
        created_at: now,
        updated_at: now,
      })
    } catch (e) {
      if (isDailyPlanCancelSchemaError(e)) {
        return {
          ok: false,
          messageKey: 'dp_err_cancel_schema',
          message: '일정은 옮겼지만 재생성 금지 컬럼이 없습니다. SQL을 먼저 실행하세요.',
          status: 503,
        }
      }
      const msg = e instanceof Error ? e.message : String(e)
      if (/duplicate|23505/i.test(msg)) {
        return { ok: true, planId: source.id }
      }
      throw e
    }
  }
  if (source.published_at) {
    const moved = await getDailyPlanById(source.id)
    const nextRecipient = moved ? planRecipient(moved) : null
    const prevRecipient = planRecipient(source)
    if (nextRecipient) {
      void pushStoreActionNotice({
        title: '📅 ตารางงานย้ายมา · 일정이 옮겨졌습니다',
        body: `${toDate} ${emp.name}`.slice(0, 180),
        recipients: [nextRecipient],
      }).catch(() => {})
    }
    if (prevRecipient && (prevRecipient.store !== nextRecipient?.store || prevRecipient.name !== nextRecipient?.name)) {
      void pushStoreActionNotice({
        title: '📅 ตารางงานถูกย้าย · 일정이 옮겨졌습니다',
        body: `${fromDate} → ${toDate}`.slice(0, 180),
        recipients: [prevRecipient],
      }).catch(() => {})
    }
  }
  return { ok: true, planId: source.id }
}

/** 항목이 전부 취소되면 하루 일정도 취소로 남겨 자동 재생성을 막는다. 컬럼이 없으면 항목 취소만 유지 */
export async function cancelPlanIfNoActiveItems(planId: number, reason: string, actor: string): Promise<void> {
  const plan = await getDailyPlanById(planId)
  if (!plan || plan.status === 'closed' || plan.status === 'cancelled') return
  const items = await getDailyPlanItems(planId)
  if (items.length === 0 || items.some((i) => i.status !== 'cancelled')) return
  const now = new Date().toISOString()
  try {
    await supabaseUpdateByFilter('daily_plans', `id=eq.${plan.id}`, {
      status: 'cancelled',
      cancel_reason: reason.slice(0, 40),
      suppress_auto: true,
      cancelled_at: now,
      cancelled_by: actor.slice(0, 120),
      est_total: 0,
      updated_at: now,
    })
  } catch (e) {
    if (!isDailyPlanCancelSchemaError(e)) throw e
  }
}

/** 항목 변경 후 일정표 상태(planned → in_progress) 갱신 */
export async function touchDailyPlanProgress(planId: number): Promise<void> {
  await supabaseUpdateByFilter('daily_plans', `id=eq.${planId}&status=eq.planned`, {
    status: 'in_progress',
    updated_at: new Date().toISOString(),
  }).catch(() => undefined)
}
