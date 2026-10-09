import 'server-only'

import { addBangkokCalendarDays, getBangkokDateTimeString } from '@/lib/bangkok-time'
import { supabaseSelectFilter, supabaseUpdateByFilter, supabaseUpsert } from '@/lib/supabase-server'
import { pushStoreActionNotice, resolveStoreActionRecipient } from '@/lib/store-action-server'
import {
  DAILY_PLAN_LATE_ALERT_MINUTES,
  computePlanTimeline,
  hmToMin,
  lateMinutes,
  minToHm,
} from '@/lib/daily-plan-timeline'
import {
  closeDailyPlan,
  generateDailyPlansForDate,
  loadTravelMinutesByTemplate,
  normalizePlanItemRow,
  normalizePlanRow,
  planRecipient,
  publishDailyPlansForDate,
  travelMinutesOfPlan,
  type DailyPlanRow,
} from '@/lib/daily-plan-server'

/** 방콕 18시 — 내일 일정표 생성·공개·푸시 */
export const DAILY_PLAN_PUBLISH_HOUR_BANGKOK = 18
/** 방콕 22시 — 오늘 일정표 자동 마감 (22시 이후 퇴근·익일 퇴근 근무는 다음 날 새벽 정리) */
export const DAILY_PLAN_CLOSE_HOUR_BANGKOK = 22
/** 이 시각 이후 지난 날짜의 미마감 일정표 정리 */
export const DAILY_PLAN_CATCHUP_FROM_HOUR_BANGKOK = 5

/** 지연 알림 시간대 (방콕) */
export const DAILY_PLAN_LATE_ALERT_FROM_HOUR = 8
export const DAILY_PLAN_LATE_ALERT_TO_HOUR = 21
/** 하루 누적 지연 알림이 이 건수에 닿으면 배정한 사람에게도 알림 */
export const DAILY_PLAN_LATE_ESCALATE_COUNT = 3

const LAST_RUN_KEY = 'daily_plan_cron_last_run'

type LastRun = { publish?: string; close?: string }

export type DailyPlanCronResult = {
  publish: { ran: boolean; created?: number; skipped?: number; published?: number; skippedReason?: string }
  late: { ran: boolean; plans?: number; items?: number; escalated?: number; skippedReason?: string }
  close: { ran: boolean; closed?: number; deferred?: number; failed?: number; skippedReason?: string }
}

async function readLastRun(): Promise<LastRun> {
  try {
    const rows = (await supabaseSelectFilter('system_settings', `key=eq.${LAST_RUN_KEY}`, {
      select: 'value_json',
      limit: 1,
    })) as { value_json?: LastRun }[]
    return rows?.[0]?.value_json || {}
  } catch {
    return {}
  }
}

async function writeLastRun(patch: LastRun): Promise<void> {
  const cur = await readLastRun()
  await supabaseUpsert(
    'system_settings',
    [{ key: LAST_RUN_KEY, value_json: { ...cur, ...patch }, updated_at: new Date().toISOString() }],
    'key'
  )
}

/** 퇴근이 마감 시각보다 늦거나 자정을 넘기는 근무 */
export function shiftEndsAfterClose(shiftIn: string, shiftOut: string, closeHour: number): boolean {
  const out = String(shiftOut || '').trim()
  if (!/^\d{1,2}:\d{2}/.test(out)) return false
  const [oh, om] = out.split(':').map(Number)
  const inn = String(shiftIn || '').trim()
  if (/^\d{1,2}:\d{2}/.test(inn)) {
    const [ih, im] = inn.split(':').map(Number)
    if (oh * 60 + om <= ih * 60 + im) return true
  }
  return oh * 60 + om > closeHour * 60
}

async function closePlans(plans: DailyPlanRow[]): Promise<{ closed: number; failed: number }> {
  let closed = 0
  let failed = 0
  for (let i = 0; i < plans.length; i += 5) {
    await Promise.all(
      plans.slice(i, i + 5).map(async (p) => {
        try {
          await closeDailyPlan(p, { actor: 'system', auto: true })
          closed += 1
        } catch (e) {
          failed += 1
          console.warn('daily plan auto close:', p.id, e instanceof Error ? e.message : e)
        }
      })
    )
  }
  return { closed, failed }
}

const SYSTEM_ACTORS = new Set(['', 'system', 'self'])

/**
 * 계획 시작 후 1시간이 지나도 시작 안 한 항목 → 본인 푸시(항목당 1회).
 * 하루 누적 3건에 처음 닿으면 배정한 사람(시스템 생성 제외)에게도 알림.
 * late_alerted_at 컬럼이 없으면 건너뜀.
 */
async function runLateAlerts(today: string): Promise<DailyPlanCronResult['late']> {
  const nowMin = hmToMin(getBangkokDateTimeString().slice(11, 16)) ?? 0
  const plans = (
    ((await supabaseSelectFilter('daily_plans', `plan_date=eq.${today}&status=neq.closed`, { limit: 2000 })) ||
      []) as Record<string, unknown>[]
  ).map(normalizePlanRow)
  if (plans.length === 0) return { ran: true, plans: 0, items: 0, escalated: 0 }

  const itemsByPlan = new Map<number, (ReturnType<typeof normalizePlanItemRow> & { alerted: boolean })[]>()
  const ids = plans.map((p) => p.id)
  for (let i = 0; i < ids.length; i += 200) {
    const rows = ((await supabaseSelectFilter('daily_plan_items', `plan_id=in.(${ids.slice(i, i + 200).join(',')})`, {
      select: 'id,plan_id,source,store_name,time_slot,title,est_minutes,status,sort_order,late_alerted_at',
      order: 'sort_order.asc,id.asc',
      limit: 20000,
    })) || []) as Record<string, unknown>[]
    for (const r of rows) {
      const it = { ...normalizePlanItemRow(r), alerted: !!r.late_alerted_at }
      const list = itemsByPlan.get(it.plan_id) || []
      list.push(it)
      itemsByPlan.set(it.plan_id, list)
    }
  }

  const travel = await loadTravelMinutesByTemplate(plans.map((p) => p.template_id))
  let alertedPlans = 0
  let alertedItems = 0
  let escalated = 0
  for (const plan of plans) {
    const items = itemsByPlan.get(plan.id) || []
    const { slots } = computePlanTimeline(
      items.map((i) => ({ id: i.id, source: i.source, storeName: i.store_name, timeSlot: i.time_slot, estMinutes: i.est_minutes })),
      { shiftIn: plan.shift_in, travelMinutes: travelMinutesOfPlan(plan, travel) }
    )
    const fresh = items.filter(
      (i) => !i.alerted && lateMinutes(slots.get(i.id), i.status, nowMin, DAILY_PLAN_LATE_ALERT_MINUTES) > 0
    )
    if (fresh.length === 0) continue
    const first = fresh[0]
    const firstAt = minToHm(slots.get(first.id)?.start ?? nowMin)
    const what = first.source === 'visit' ? `방문 ${first.title}` : first.title
    await pushStoreActionNotice({
      title: `⏰ 일정 지연 ${fresh.length}건 · งานล่าช้า ${fresh.length} รายการครับ`,
      body: `${firstAt} ${what}${fresh.length > 1 ? ` 외 ${fresh.length - 1}건` : ''}\n앱 [일정표]에서 시작하거나 못 함 사유를 남겨 주세요 · กรุณาเริ่มงานหรือระบุเหตุผลในแท็บตารางงานครับ`,
      recipients: [planRecipient(plan)],
    })
    await supabaseUpdateByFilter('daily_plan_items', `id=in.(${fresh.map((i) => i.id).join(',')})`, {
      late_alerted_at: new Date().toISOString(),
    })
    alertedPlans += 1
    alertedItems += fresh.length

    const before = items.filter((i) => i.alerted).length
    const creator = String(plan.created_by || '').trim()
    if (
      before < DAILY_PLAN_LATE_ESCALATE_COUNT &&
      before + fresh.length >= DAILY_PLAN_LATE_ESCALATE_COUNT &&
      !SYSTEM_ACTORS.has(creator.toLowerCase()) &&
      creator.toLowerCase() !== plan.employee_name.trim().toLowerCase()
    ) {
      const to = await resolveStoreActionRecipient({ name: creator, fallbackStore: plan.store_name })
      const n = before + fresh.length
      const sent = await pushStoreActionNotice({
        title: `⚠️ ${plan.employee_name} 일정 지연 ${n}건 · ล่าช้า ${n} รายการครับ`,
        body: `${today} · ${(plan.route_stores || []).join(' → ') || plan.store_name}`,
        recipients: [to],
      })
      if (sent > 0) escalated += 1
    }
  }
  return { ran: true, plans: alertedPlans, items: alertedItems, escalated }
}

/**
 * 매시 cron. 18시: 내일 일정표 생성 + 공개 + 푸시(하루 1회).
 * 22시: 오늘 일정표 자동 마감(늦은 퇴근 근무 제외). 5시 이후: 지난 날짜 미마감 정리.
 */
export async function runDailyPlanCron(today: string, hourBangkok: number): Promise<DailyPlanCronResult> {
  const result: DailyPlanCronResult = { publish: { ran: false }, late: { ran: false }, close: { ran: false } }
  const lastRun = await readLastRun()

  if (hourBangkok !== DAILY_PLAN_PUBLISH_HOUR_BANGKOK) {
    result.publish.skippedReason = 'hour_mismatch'
  } else if (lastRun.publish === today) {
    result.publish.skippedReason = 'already_ran_today'
  } else {
    const tomorrow = addBangkokCalendarDays(today, 1)
    const gen = await generateDailyPlansForDate(tomorrow, 'system')
    const published = await publishDailyPlansForDate(
      tomorrow,
      '📅 내일 일정표 · ตารางงานพรุ่งนี้พร้อมแล้วครับ',
      `${tomorrow} — 앱 [일정표]에서 확인 · ดูได้ที่แท็บตารางงานครับ`
    )
    await writeLastRun({ publish: today })
    result.publish = { ran: true, created: gen.created, skipped: gen.skipped, published }
  }

  if (hourBangkok < DAILY_PLAN_LATE_ALERT_FROM_HOUR || hourBangkok > DAILY_PLAN_LATE_ALERT_TO_HOUR) {
    result.late.skippedReason = 'hour_mismatch'
  } else {
    try {
      result.late = await runLateAlerts(today)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      result.late = { ran: false, skippedReason: /late_alerted_at/.test(msg) ? 'column_missing' : msg.slice(0, 200) }
    }
  }

  const catchUp = hourBangkok >= DAILY_PLAN_CATCHUP_FROM_HOUR_BANGKOK
  const closeToday = hourBangkok >= DAILY_PLAN_CLOSE_HOUR_BANGKOK
  if (!catchUp && !closeToday) {
    result.close.skippedReason = 'hour_mismatch'
    return result
  }

  const pastRows = ((await supabaseSelectFilter(
    'daily_plans',
    `plan_date=lt.${today}&plan_date=gte.${addBangkokCalendarDays(today, -7)}&status=neq.closed`,
    { limit: 2000 }
  )) || []) as Record<string, unknown>[]
  let targets = pastRows.map(normalizePlanRow)
  let deferred = 0
  if (closeToday && lastRun.close !== today) {
    const todayRows = ((await supabaseSelectFilter('daily_plans', `plan_date=eq.${today}&status=neq.closed`, {
      limit: 2000,
    })) || []) as Record<string, unknown>[]
    for (const p of todayRows.map(normalizePlanRow)) {
      if (shiftEndsAfterClose(p.shift_in, p.shift_out, DAILY_PLAN_CLOSE_HOUR_BANGKOK)) deferred += 1
      else targets = [...targets, p]
    }
  }
  if (targets.length === 0 && !(closeToday && lastRun.close !== today)) {
    result.close.skippedReason = 'nothing_to_close'
    return result
  }
  const r = await closePlans(targets)
  if (closeToday && lastRun.close !== today) await writeLastRun({ close: today })
  result.close = { ran: true, closed: r.closed, failed: r.failed, deferred }
  return result
}
