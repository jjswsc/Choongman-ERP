import 'server-only'

import { addBangkokCalendarDays } from '@/lib/bangkok-time'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import {
  closeDailyPlan,
  generateDailyPlansForDate,
  normalizePlanRow,
  publishDailyPlansForDate,
  type DailyPlanRow,
} from '@/lib/daily-plan-server'

/** 방콕 18시 — 내일 업무표 생성·공개·푸시 */
export const DAILY_PLAN_PUBLISH_HOUR_BANGKOK = 18
/** 방콕 22시 — 오늘 업무표 자동 마감 (22시 이후 퇴근·익일 퇴근 근무는 다음 날 새벽 정리) */
export const DAILY_PLAN_CLOSE_HOUR_BANGKOK = 22
/** 이 시각 이후 지난 날짜의 미마감 업무표 정리 */
export const DAILY_PLAN_CATCHUP_FROM_HOUR_BANGKOK = 5

const LAST_RUN_KEY = 'daily_plan_cron_last_run'

type LastRun = { publish?: string; close?: string }

export type DailyPlanCronResult = {
  publish: { ran: boolean; created?: number; skipped?: number; published?: number; skippedReason?: string }
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

/**
 * 매시 cron. 18시: 내일 업무표 생성 + 공개 + 푸시(하루 1회).
 * 22시: 오늘 업무표 자동 마감(늦은 퇴근 근무 제외). 5시 이후: 지난 날짜 미마감 정리.
 */
export async function runDailyPlanCron(today: string, hourBangkok: number): Promise<DailyPlanCronResult> {
  const result: DailyPlanCronResult = { publish: { ran: false }, close: { ran: false } }
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
      '📋 내일 업무표 · ตารางงานพรุ่งนี้พร้อมแล้วครับ',
      `${tomorrow} — 앱 [업무표]에서 확인 · ดูได้ที่แท็บตารางงานครับ`
    )
    await writeLastRun({ publish: today })
    result.publish = { ran: true, created: gen.created, skipped: gen.skipped, published }
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
