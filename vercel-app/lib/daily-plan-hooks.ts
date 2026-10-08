import 'server-only'

import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { computeActualMinutes } from '@/lib/daily-plan-generate'
import {
  normalizePlanItemRow,
  normalizePlanRow,
  touchDailyPlanProgress,
  type DailyPlanItemRow,
  type DailyPlanRow,
} from '@/lib/daily-plan-server'

/**
 * 다른 화면의 실제 기록 → 업무표 항목 자동 완료.
 * 업무표 테이블 미배포·실패 시에도 원래 요청은 성공해야 하므로 모든 훅은 예외를 삼킨다.
 */

async function findPlansForPerson(
  date: string,
  person: { name?: string; employeeId?: number | null }
): Promise<DailyPlanRow[]> {
  const eid = Number(person.employeeId || 0)
  if (eid > 0) {
    const rows = (await supabaseSelectFilter('daily_plans', `plan_date=eq.${date}&employee_id=eq.${eid}&status=neq.closed`, {
      limit: 1,
    })) as Record<string, unknown>[]
    if (rows?.[0]) return [normalizePlanRow(rows[0])]
  }
  const name = String(person.name || '').trim()
  if (!name) return []
  const byName = (await supabaseSelectFilter(
    'daily_plans',
    `plan_date=eq.${date}&employee_name=eq.${encodeURIComponent(name)}&status=neq.closed`,
    { limit: 3 }
  )) as Record<string, unknown>[]
  if (byName?.length) return byName.map(normalizePlanRow)
  const emps = (await supabaseSelectFilter('employees', `nick=eq.${encodeURIComponent(name)}`, {
    select: 'id',
    limit: 3,
  })) as { id?: number }[]
  const ids = (emps || []).map((e) => Number(e.id)).filter((n) => n > 0)
  if (ids.length === 0) return []
  const byNick = (await supabaseSelectFilter(
    'daily_plans',
    `plan_date=eq.${date}&employee_id=in.(${ids.join(',')})&status=neq.closed`,
    { limit: 3 }
  )) as Record<string, unknown>[]
  return (byNick || []).map(normalizePlanRow)
}

async function markItemDone(item: DailyPlanItemRow, actualMinutes?: number | null): Promise<void> {
  const now = Date.now()
  const actual =
    actualMinutes != null && actualMinutes > 0
      ? Math.round(actualMinutes)
      : computeActualMinutes(item.started_at, now, item.est_minutes)
  await supabaseUpdateByFilter('daily_plan_items', `id=eq.${item.id}&status=in.(todo,doing)`, {
    status: 'done',
    finished_at: new Date(now).toISOString(),
    actual_minutes: actual,
    ...(item.started_at ? {} : { started_at: new Date(now - actual * 60000).toISOString() }),
    updated_at: new Date(now).toISOString(),
  })
}

/** 방문 시작 → 해당 매장 방문 항목 진행 중(계획에 없던 매장이면 항목 추가), 방문 종료 → 완료 + 체류 분 */
export async function syncDailyPlanOnStoreVisit(params: {
  userName: string
  employeeId?: number | null
  store: string
  kind: 'start' | 'end'
  durationMin?: number | null
  date?: string
}): Promise<void> {
  try {
    const date = params.date || getBangkokTodayDateString()
    const plans = await findPlansForPerson(date, { name: params.userName, employeeId: params.employeeId })
    for (const plan of plans) {
      const rows = (await supabaseSelectFilter('daily_plan_items', `plan_id=eq.${plan.id}&source=eq.visit`, {
        limit: 50,
      })) as Record<string, unknown>[]
      const visits = (rows || []).map(normalizePlanItemRow)
      const target =
        visits.find((v) => storesMatchForGradeLookup(v.store_name, params.store) && v.status !== 'done') ||
        visits.find((v) => storesMatchForGradeLookup(v.store_name, params.store))
      const nowIso = new Date().toISOString()
      if (params.kind === 'start') {
        if (target) {
          if (target.status === 'todo') {
            await supabaseUpdateByFilter('daily_plan_items', `id=eq.${target.id}`, {
              status: 'doing',
              started_at: nowIso,
              updated_at: nowIso,
            })
          }
        } else if (plan.role_scope === 'supervisor') {
          await supabaseInsert('daily_plan_items', {
            plan_id: plan.id,
            source: 'visit',
            store_name: params.store,
            category: '당일 과제',
            title: params.store,
            est_minutes: 0,
            link_type: 'store_visit',
            status: 'doing',
            started_at: nowIso,
            note: 'unplanned',
            sort_order: 9000,
            created_at: nowIso,
            updated_at: nowIso,
          })
        }
      } else if (target && target.status !== 'done') {
        await markItemDone(target, params.durationMin ?? null)
      }
      await touchDailyPlanProgress(plan.id)
    }
  } catch (e) {
    console.warn('syncDailyPlanOnStoreVisit:', e instanceof Error ? e.message : e)
  }
}

/** 매장 점검 저장 → 그날 해당 매장 점검 항목 완료 (점검자 본인 업무표 우선, 없으면 해당 매장 점검 항목 전체) */
export async function syncDailyPlanOnStoreCheck(params: { store: string; date: string; inspector?: string }): Promise<void> {
  try {
    const store = String(params.store || '').trim()
    if (!store || !/^\d{4}-\d{2}-\d{2}$/.test(params.date)) return
    const plans = ((await supabaseSelectFilter('daily_plans', `plan_date=eq.${params.date}&status=neq.closed`, {
      select: 'id,employee_name',
      limit: 2000,
    })) || []) as { id?: number; employee_name?: string }[]
    if (plans.length === 0) return
    const planIds = plans.map((p) => Number(p.id))
    const items: DailyPlanItemRow[] = []
    for (let i = 0; i < planIds.length; i += 200) {
      const chunk = planIds.slice(i, i + 200)
      const rows = (await supabaseSelectFilter(
        'daily_plan_items',
        `plan_id=in.(${chunk.join(',')})&link_type=eq.store_check&status=in.(todo,doing)`,
        { limit: 2000 }
      )) as Record<string, unknown>[]
      items.push(...(rows || []).map(normalizePlanItemRow).filter((it) => storesMatchForGradeLookup(it.store_name, store)))
    }
    if (items.length === 0) return
    const inspector = String(params.inspector || '').trim().toLowerCase()
    const inspectorPlanIds = new Set(
      plans.filter((p) => inspector && String(p.employee_name || '').trim().toLowerCase() === inspector).map((p) => Number(p.id))
    )
    const targets = inspectorPlanIds.size > 0 ? items.filter((it) => inspectorPlanIds.has(it.plan_id)) : items
    for (const it of targets.length > 0 ? targets : items) {
      await markItemDone(it)
      await touchDailyPlanProgress(it.plan_id)
    }
  } catch (e) {
    console.warn('syncDailyPlanOnStoreCheck:', e instanceof Error ? e.message : e)
  }
}

/** 개선 과제 재확인 요청·완료·반려 → 처리한 사람의 오늘 업무표에서 그 과제 항목 완료 */
export async function syncDailyPlanOnStoreAction(params: {
  actionId: number
  actorName: string
  actorEmployeeId?: number | null
}): Promise<void> {
  try {
    if (!params.actionId) return
    const date = getBangkokTodayDateString()
    const plans = await findPlansForPerson(date, { name: params.actorName, employeeId: params.actorEmployeeId })
    for (const plan of plans) {
      const rows = (await supabaseSelectFilter(
        'daily_plan_items',
        `plan_id=eq.${plan.id}&source=eq.action&ref_id=eq.${params.actionId}&status=in.(todo,doing)`,
        { limit: 5 }
      )) as Record<string, unknown>[]
      for (const r of rows || []) await markItemDone(normalizePlanItemRow(r))
      if (rows?.length) await touchDailyPlanProgress(plan.id)
    }
  } catch (e) {
    console.warn('syncDailyPlanOnStoreAction:', e instanceof Error ? e.message : e)
  }
}
