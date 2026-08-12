import 'server-only'

import {
  addBangkokCalendarDays,
  getBangkokHourOfDay,
  getBangkokIsoWeekday,
  getBangkokMonthRange,
  getBangkokTodayDateString,
} from '@/lib/bangkok-time'
import {
  getAutoNoticeLastRun,
  getAutoNoticeSettings,
  saveAutoNoticeLastRun,
} from '@/lib/auto-notice-settings-server'
import { resolveCustomRuleSendKey, type AutoNoticeCustomRule } from '@/lib/auto-notice-settings'
import { loadEmployedEmployeesForWorkLog } from '@/lib/work-log-store-scope'
import { workLogStoredNameFromEmployeeMaster } from '@/lib/work-log-name'
import { notifyWorkLogMissingDaily } from '@/lib/work-log-notifications'
import {
  getAllManagers,
  sendNoticeToRecipients,
  type NoticeRecipient,
} from '@/lib/send-notice-util'
import { getRecipientsByTargetStoreRole } from '@/lib/firebase-admin'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export type AutoNoticesRunResult = {
  date: string
  hourBangkok: number
  workLog: { ran: boolean; reminded: number; skippedReason?: string }
  stockTake: { ran: boolean; sent: number; skippedReason?: string }
  custom: { ran: number; sent: number; results: Array<{ id: string; sent: number; skippedReason?: string }> }
}

/**
 * 자동 알림 규칙 엔진 — cron(매시)에서 호출.
 * 방콕 시·날짜 조건 + last_run 중복 방지.
 */
export async function runAutoNotices(base: Date = new Date()): Promise<AutoNoticesRunResult> {
  const today = getBangkokTodayDateString(base)
  const hourBangkok = getBangkokHourOfDay(base)
  const isoWeekday = getBangkokIsoWeekday(base)
  const settings = await getAutoNoticeSettings()
  const lastRun = await getAutoNoticeLastRun()
  const result: AutoNoticesRunResult = {
    date: today,
    hourBangkok,
    workLog: { ran: false, reminded: 0 },
    stockTake: { ran: false, sent: 0 },
    custom: { ran: 0, sent: 0, results: [] },
  }

  // —— 업무일지 ——
  const wl = settings.workLog
  if (!wl.enabled) {
    result.workLog.skippedReason = 'disabled'
  } else if (hourBangkok !== wl.hourBangkok) {
    result.workLog.skippedReason = 'hour_mismatch'
  } else if (lastRun.work_log === today) {
    result.workLog.skippedReason = 'already_sent_today'
  } else {
    const reminded = await runWorkLogReminders(today, wl.notifyManager)
    result.workLog = { ran: true, reminded }
    await saveAutoNoticeLastRun({ work_log: today })
  }

  // —— 월말 재고조사 ——
  const st = settings.stockTake
  const { endStr, yearMonth } = getBangkokMonthRange(undefined, base)
  const targetDate = addBangkokCalendarDays(endStr, -st.daysBeforeMonthEnd)
  if (!st.enabled) {
    result.stockTake.skippedReason = 'disabled'
  } else if (hourBangkok !== st.hourBangkok) {
    result.stockTake.skippedReason = 'hour_mismatch'
  } else if (today !== targetDate) {
    result.stockTake.skippedReason = 'not_target_date'
  } else if (lastRun.stock_take === yearMonth) {
    result.stockTake.skippedReason = 'already_sent_this_month'
  } else {
    const managers = await getAllManagers()
    const unique = dedupeRecipients(managers)
    if (unique.length > 0) {
      const body = `${st.body.trim()}\n\n(기준일 후보: ${endStr})`
      await sendNoticeToRecipients({
        title: st.title,
        content: body,
        recipients: unique,
        sender: '시스템(자동 알림)',
        pushGate: 'notice',
      })
    }
    result.stockTake = { ran: true, sent: unique.length }
    await saveAutoNoticeLastRun({ stock_take: yearMonth })
  }

  // —— 자유 반복 공지 ——
  const customPatch: Record<string, string> = {}
  for (const rule of settings.customRules) {
    const sendKey = resolveCustomRuleSendKey({
      rule,
      todayYmd: today,
      hourBangkok,
      isoWeekday,
      monthEndYmd: endStr,
      yearMonth,
    })
    if (!sendKey) {
      result.custom.results.push({
        id: rule.id,
        sent: 0,
        skippedReason: !rule.enabled
          ? 'disabled'
          : hourBangkok !== rule.hourBangkok
            ? 'hour_mismatch'
            : 'not_due',
      })
      continue
    }
    if ((lastRun.custom || {})[rule.id] === sendKey) {
      result.custom.results.push({ id: rule.id, sent: 0, skippedReason: 'already_sent' })
      continue
    }
    const recipients = await resolveCustomAudience(rule)
    if (recipients.length > 0) {
      await sendNoticeToRecipients({
        title: rule.title,
        content: rule.body,
        recipients,
        sender: '시스템(자동 알림)',
        pushGate: 'notice',
      })
    }
    customPatch[rule.id] = sendKey
    result.custom.ran += 1
    result.custom.sent += recipients.length
    result.custom.results.push({ id: rule.id, sent: recipients.length })
  }
  if (Object.keys(customPatch).length > 0) {
    await saveAutoNoticeLastRun({ custom: customPatch })
  }

  return result
}

function dedupeRecipients(list: NoticeRecipient[]): NoticeRecipient[] {
  return list.filter(
    (r, i, arr) => arr.findIndex((x) => x.store === r.store && x.name === r.name) === i
  )
}

async function resolveCustomAudience(rule: AutoNoticeCustomRule): Promise<NoticeRecipient[]> {
  const aud = rule.audience
  if (aud.kind === 'managers') return dedupeRecipients(await getAllManagers())
  if (aud.kind === 'all') {
    return dedupeRecipients(await getRecipientsByTargetStoreRole('전체', '전체'))
  }
  return dedupeRecipients(await getRecipientsByTargetStoreRole(aud.store || '전체', aud.role || '전체'))
}

async function runWorkLogReminders(today: string, notifyManager: boolean): Promise<number> {
  const employees = await loadEmployedEmployeesForWorkLog()
  const loggedEmployeeIds = new Set<number>()
  const loggedNames = new Set<string>()

  const todayRows =
    (await supabaseSelectFilter('work_logs', `log_date=eq.${encodeURIComponent(today)}`, {
      select: 'employee_id,name',
      limit: 10000,
    })) || []

  for (const r of todayRows as { employee_id?: number; name?: string }[]) {
    const eid = r.employee_id != null ? Math.floor(Number(r.employee_id)) : 0
    if (Number.isFinite(eid) && eid > 0) loggedEmployeeIds.add(eid)
    const n = String(r.name || '').trim()
    if (n) loggedNames.add(n)
  }

  let reminded = 0
  for (const e of employees) {
    const id = e.id != null ? Math.floor(Number(e.id)) : 0
    const name = workLogStoredNameFromEmployeeMaster(e.name)
    const store = String(e.store || '').trim()
    if (!store || !name) continue
    const hasLog = (id > 0 && loggedEmployeeIds.has(id)) || loggedNames.has(name)
    if (hasLog) continue

    await notifyWorkLogMissingDaily({
      employeeStore: store,
      employeeName: name,
      logDate: today,
      notifyManager,
    })
    reminded++
  }
  return reminded
}
