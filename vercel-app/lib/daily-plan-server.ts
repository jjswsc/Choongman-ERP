import 'server-only'

import type { JwtPayload } from '@/lib/jwt-auth'
import {
  hasOfficeStaffScope,
  isFranchiseeRole,
  isManagerRole,
  isOfficeStore,
  isSupervisorRole,
} from '@/lib/permissions'
import { storeOpsStoreInScope, storeOpsStoreNameScopePostgrestFilter } from '@/lib/store-ops-alert-utils'
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
import {
  addDaysYmdUtc,
  buildDailyPlanItems,
  buildDailyPlanWorkLogContent,
  pickRoutineTemplate,
  planItemDraftKey,
  selectCarryItems,
  summarizePlanItems,
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
}

export type PlanEmployee = {
  id: number
  name: string
  nick: string
  store: string
  job: string
  role: string
}

// ─── 권한 ───────────────────────────────────────────

export type DailyPlanScope = {
  /** 본사·회계·오피스·슈퍼바이저 — 전 매장 */
  all: boolean
  office: boolean
  supervisor: boolean
  /** 매니저·가맹점주 — 자기 매장 직원 */
  storeLead: boolean
  stores: string[]
  actorName: string
  actorEmployeeId: number | null
  canEditTemplates: boolean
}

export function resolveDailyPlanScope(auth: JwtPayload): DailyPlanScope {
  const role = String(auth.role || '').toLowerCase()
  const store = String(auth.store || '').trim()
  const office = hasOfficeStaffScope(role, store)
  const supervisor = isSupervisorRole(role)
  const stores = [
    ...new Set(
      (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .concat(store ? [store] : [])
    ),
  ]
  const eid = auth.employeeId != null ? Math.floor(Number(auth.employeeId)) : 0
  return {
    all: office || supervisor,
    office,
    supervisor,
    storeLead: isManagerRole(role) || isFranchiseeRole(role),
    stores,
    actorName: String(auth.name || '').trim(),
    actorEmployeeId: Number.isFinite(eid) && eid > 0 ? eid : null,
    canEditTemplates: office || supervisor,
  }
}

export function dailyPlanScopeFilter(scope: DailyPlanScope): string {
  if (scope.all) return ''
  const f = storeOpsStoreNameScopePostgrestFilter(scope.stores)
  return f || 'store_name=eq.__none__'
}

export function isOwnDailyPlan(scope: DailyPlanScope, plan: Pick<DailyPlanRow, 'employee_id' | 'employee_name'>): boolean {
  if (scope.actorEmployeeId != null && Number(plan.employee_id) === scope.actorEmployeeId) return true
  return !!scope.actorName && String(plan.employee_name || '').trim() === scope.actorName
}

export function canViewDailyPlan(scope: DailyPlanScope, plan: DailyPlanRow): boolean {
  if (scope.all || isOwnDailyPlan(scope, plan)) return true
  return scope.storeLead && storeOpsStoreInScope(plan.store_name, scope.stores, false)
}

/** 본사 → 전 직급, 슈퍼바이저 → 매니저·직원(본인 포함), 매니저 → 자기 매장 직원 */
export function canAssignDailyPlan(scope: DailyPlanScope, target: { role: DailyPlanRole; store: string; employeeId: number }): boolean {
  if (scope.office) return true
  if (scope.supervisor) return target.role !== 'supervisor' || target.employeeId === scope.actorEmployeeId
  if (scope.storeLead) return target.role === 'staff' && storeOpsStoreInScope(target.store, scope.stores, false)
  return false
}

// ─── 직원·직급 ──────────────────────────────────────

type EmployeeDbRow = {
  id?: number
  name?: string
  nick?: string
  store?: string
  job?: string
  role?: string
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
  }
}

export async function loadActivePlanEmployees(): Promise<PlanEmployee[]> {
  const today = getBangkokTodayDateString()
  const rows = ((await supabaseSelect('employees', {
    order: 'id.asc',
    select: 'id,name,nick,store,job,role,resign_date,employment_status',
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
    select: 'id,name,nick,store,job,role',
    limit: 1,
  })) as EmployeeDbRow[]
  return rows?.[0] ? toPlanEmployee(rows[0]) : null
}

/** 슈퍼바이저 > 매니저 > 직원. 본사 소속(슈퍼바이저 제외)은 자동 생성 대상 아님(null) */
export function dailyPlanRoleOf(e: Pick<PlanEmployee, 'role' | 'job' | 'store'>): DailyPlanRole | null {
  if (isSupervisorRole(e.role) || isSupervisorRole(e.job)) return 'supervisor'
  if (isOfficeStore(e.store)) return null
  if (isManagerRole(e.role) || isManagerRole(e.job)) return 'manager'
  return 'staff'
}

// ─── 템플릿 ────────────────────────────────────────

type TemplateDbRow = {
  id?: number
  name?: string
  role_scope?: string
  position?: string
  store_name?: string
  status?: string
  version?: number
  note?: string
  updated_by?: string
  updated_at?: string
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
}

export function mapTemplateItem(r: TemplateItemDbRow): RoutineTemplateItem {
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
  }
}

export async function loadRoutineTemplates(opts: { usableOnly?: boolean } = {}): Promise<RoutineTemplate[]> {
  const filter = opts.usableOnly ? 'status=in.(pilot,active)' : 'id=gt.0'
  const rows = ((await supabaseSelectFilter('routine_templates', filter, {
    order: 'role_scope.asc,id.asc',
    limit: 500,
  })) || []) as TemplateDbRow[]
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
  return rows.map((r) => ({
    id: Number(r.id || 0),
    name: String(r.name || ''),
    roleScope: String(r.role_scope || 'supervisor'),
    position: String(r.position || 'all'),
    storeName: String(r.store_name || ''),
    status: String(r.status || 'draft'),
    version: Number(r.version || 1),
    note: String(r.note || ''),
    updatedBy: String(r.updated_by || ''),
    updatedAt: String(r.updated_at || ''),
    items: byTpl.get(Number(r.id || 0)) || [],
  }))
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

// ─── 업무표 조회 ───────────────────────────────────

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
  }
}

export function normalizePlanItemRow(r: Record<string, unknown>): DailyPlanItemRow {
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

/** 전날 마감된 업무표의 미완료 본사·이월 과제 (employee_id → 목록) */
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
  /** 기존 업무표의 미착수 루틴·방문·과제 항목 재생성 */
  regenerate?: boolean
  /** 항목이 없어도 업무표 생성 (배정 화면) */
  force?: boolean
  /** 호출 측에서 이미 없음을 확인함 */
  knownMissing?: boolean
  ctx?: DailyPlanGenContext
}

/** 업무표 보장 — 없으면 생성, regenerate면 미착수 항목 재생성. 마감된 업무표는 건드리지 않음 */
export async function ensureDailyPlan(p: EnsurePlanParams): Promise<{ plan: DailyPlanRow | null; created: boolean }> {
  const existing = p.knownMissing ? null : await getDailyPlanFor(p.date, p.employee.id)
  if (existing && (existing.status === 'closed' || !p.regenerate)) return { plan: existing, created: false }

  const ctx = p.ctx || (await loadDailyPlanGenContext())
  const routeStores = (p.routeStores ?? existing?.route_stores ?? []).map((s) => String(s || '').trim()).filter(Boolean)
  const homeStore = String(p.store ?? existing?.store_name ?? p.employee.store).trim()
  const position = String(p.position ?? existing?.position ?? 'all').toLowerCase() || 'all'
  const template = pickRoutineTemplate(ctx.templates, { role: p.role, position, store: homeStore })

  let carry: CarryLite[] = []
  if (!existing) {
    carry = ctx.carry ? ctx.carry.get(p.employee.id) || [] : (await loadCarryMap(p.date, [p.employee.id])).get(p.employee.id) || []
  }

  const drafts = buildDailyPlanItems({
    template,
    role: p.role,
    dateYmd: p.date,
    homeStore,
    routeStores,
    employee: { id: p.employee.id, name: p.employee.name, nick: p.employee.nick },
    actions: ctx.actions,
    carry,
    hqTasks: p.hqTasks ?? [],
  })

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
  await supabaseDeleteByFilter(
    'daily_plan_items',
    `plan_id=eq.${existing.id}&status=eq.todo&source=in.(${replaceSources.join(',')})`
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

async function runInBatches<T>(list: T[], size: number, fn: (x: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < list.length; i += size) {
    await Promise.all(list.slice(i, i + size).map(fn))
  }
}

/** 날짜 업무표 일괄 생성 — 슈퍼바이저·매니저 전원 + 그날 근무표가 있는 직원 */
export async function generateDailyPlansForDate(date: string, actor: string): Promise<GeneratePlansResult> {
  const result: GeneratePlansResult = { created: 0, existing: 0, skipped: 0, failed: 0 }
  const [employees, ctx, existingRows, schedules] = await Promise.all([
    loadActivePlanEmployees(),
    loadDailyPlanGenContext(),
    supabaseSelectFilter('daily_plans', `plan_date=eq.${date}`, { select: 'employee_id', limit: 5000 }) as Promise<
      { employee_id?: number }[]
    >,
    supabaseSelectFilter('schedules', `schedule_date=eq.${date}`, {
      select: 'employee_id,name,store_name,plan_in,plan_out,memo',
      limit: 5000,
    }).catch(() => []) as Promise<ScheduleLite[]>,
  ])
  ctx.carry = await loadCarryMap(date)
  const existingIds = new Set((existingRows || []).map((r) => Number(r.employee_id)))
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
    const position = role === 'staff' ? primaryAreaForDisplay(s?.memo, emp.job).toLowerCase() : 'all'
    targets.push({ emp, role, store, position, s })
  }

  await runInBatches(targets, 5, async (t) => {
    if (existingIds.has(t.emp.id)) {
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
        actor,
        knownMissing: true,
        ctx,
      })
      if (r.created) result.created += 1
      else result.skipped += 1
    } catch (e) {
      result.failed += 1
      console.warn('generateDailyPlansForDate:', t.emp.id, e instanceof Error ? e.message : e)
    }
  })
  return result
}

/** 한 사람 업무표를 그 자리에서 보장 (근무표에서 매장·구역·시간 반영). 대상 아님/항목 없음이면 null */
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
  const r = await ensureDailyPlan({
    date,
    employee,
    role,
    store: role === 'staff' ? String(s?.store_name || employee.store).trim() : employee.store,
    position: role === 'staff' ? primaryAreaForDisplay(s?.memo, employee.job).toLowerCase() : 'all',
    shiftIn: String(s?.plan_in || ''),
    shiftOut: String(s?.plan_out || ''),
    actor,
  })
  return r.plan
}

// ─── 공개·푸시 ─────────────────────────────────────

export function planRecipient(plan: Pick<DailyPlanRow, 'employee_store' | 'employee_name'>): StoreActionRecipient | null {
  const store = String(plan.employee_store || '').trim()
  const name = String(plan.employee_name || '').trim()
  return store && name ? { store, name } : null
}

/** 미공개 업무표 공개 + 푸시. 공개된 건수 반환 */
export async function publishDailyPlansForDate(date: string, pushTitle: string, pushBody: string): Promise<number> {
  const rows = ((await supabaseUpdateByFilterReturning(
    'daily_plans',
    `plan_date=eq.${date}&published_at=is.null&status=neq.closed`,
    { published_at: new Date().toISOString() }
  )) || []) as Record<string, unknown>[]
  const plans = rows.map(normalizePlanRow)
  if (plans.length > 0) {
    await pushStoreActionNotice({ title: pushTitle, body: pushBody, recipients: plans.map(planRecipient) })
  }
  return plans.length
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

/** 미완료 본사·이월 과제를 다음 날 업무표(이미 있으면)에 추가 */
async function carryToNextPlan(plan: DailyPlanRow, items: DailyPlanItemRow[]): Promise<number> {
  const carry = selectCarryItems(items)
  if (carry.length === 0) return 0
  const next = await getDailyPlanFor(addDaysYmdUtc(plan.plan_date, 1), plan.employee_id)
  if (!next || next.status === 'closed') return 0
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

/** 항목 변경 후 업무표 상태(planned → in_progress) 갱신 */
export async function touchDailyPlanProgress(planId: number): Promise<void> {
  await supabaseUpdateByFilter('daily_plans', `id=eq.${planId}&status=eq.planned`, {
    status: 'in_progress',
    updated_at: new Date().toISOString(),
  }).catch(() => undefined)
}
