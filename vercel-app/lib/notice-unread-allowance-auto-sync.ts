import 'server-only'

import { bangkokYmdRangeToIsoBounds } from '@/lib/bangkok-date'
import { NOTICE_LIST_COLS } from '@/lib/postgrest-narrow-select'
import {
  aggregateNoticeReadStats,
  type EmpRow,
  type NoticeForAggregation,
} from '@/lib/notice-read-aggregation'
import {
  NOTICE_UNREAD_AUTO_ACTOR,
  NOTICE_UNREAD_REASON,
  NOTICE_UNREAD_WAIVED_REASON,
  noticeUnreadSyncPeriodForPayrollMonth,
  type NoticeUnreadAllowanceSettings,
} from '@/lib/notice-unread-allowance-settings'
import { getNoticeUnreadAllowanceSettings } from '@/lib/notice-unread-allowance-settings-server'
import {
  supabaseDeleteByFilter,
  supabaseSelect,
  supabaseSelectFilter,
  supabaseUpsert,
} from '@/lib/supabase-server'

const NOTICE_LIMIT = 1200
const IN_CHUNK = 60

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

function empKey(store: string, name: string) {
  return `${String(store).trim()}|${String(name).trim()}`
}

function normalizeMonth(raw: string): string {
  const s = String(raw || '').trim()
  if (/^\d{4}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7)
  return ''
}

async function resolveEmployeeId(store: string, name: string): Promise<number | null> {
  try {
    const rows = (await supabaseSelectFilter(
      'employees',
      `store=eq.${encodeURIComponent(store)}&name=eq.${encodeURIComponent(name)}`,
      { limit: 1, select: 'id' }
    )) as { id?: number }[]
    const id = Number(rows?.[0]?.id)
    return id > 0 ? id : null
  } catch {
    return null
  }
}

export type NoticeUnreadAutoSyncResult = {
  payrollMonth: string
  skipped: boolean
  reason?: string
  applied: number
  removed: number
  candidateCount: number
  truncated: boolean
}

/**
 * mode=auto 일 때 급여월 기준으로 미확인(유예일 초과) 직원을 payroll_allowance_exclusions 에 반영.
 * - waived(해제) 행은 건너뜀
 * - created_by=auto 이고 더 이상 후보가 아니면 삭제(확인 후 자동 해제)
 */
export async function syncNoticeUnreadAllowanceExclusionsForMonth(
  payrollMonth: string,
  opts?: { force?: boolean; settings?: NoticeUnreadAllowanceSettings }
): Promise<NoticeUnreadAutoSyncResult> {
  const month = normalizeMonth(payrollMonth)
  if (!month) {
    return {
      payrollMonth: '',
      skipped: true,
      reason: 'invalid_month',
      applied: 0,
      removed: 0,
      candidateCount: 0,
      truncated: false,
    }
  }

  const settings = opts?.settings ?? (await getNoticeUnreadAllowanceSettings())
  if (settings.mode !== 'auto' && !opts?.force) {
    return {
      payrollMonth: month,
      skipped: true,
      reason: 'manual_mode',
      applied: 0,
      removed: 0,
      candidateCount: 0,
      truncated: false,
    }
  }

  const period = noticeUnreadSyncPeriodForPayrollMonth(month, settings.minUnreadDays)
  if (!period) {
    return {
      payrollMonth: month,
      skipped: true,
      reason: 'empty_period',
      applied: 0,
      removed: 0,
      candidateCount: 0,
      truncated: false,
    }
  }

  const { gteIso, lteIso } = bangkokYmdRangeToIsoBounds(period.startYmd, period.endYmd)
  const noticeRows = (await supabaseSelectFilter(
    'notices',
    `id=gte.0&created_at=gte.${gteIso}&created_at=lte.${lteIso}`,
    {
      order: 'created_at.desc',
      limit: NOTICE_LIMIT,
      select: NOTICE_LIST_COLS,
    }
  )) as NoticeForAggregation[]

  const truncated = (noticeRows || []).length >= NOTICE_LIMIT
  const notices = noticeRows || []

  const empListRaw = (await supabaseSelect('employees', {
    order: 'id.asc',
    select: 'store,name,job,role,resign_date',
  })) as { store?: string; name?: string; job?: string; role?: string; resign_date?: string }[]

  const employees: EmpRow[] = (empListRaw || [])
    .map((e) => ({
      store: String(e.store || '').trim(),
      name: String(e.name || '').trim(),
      job: String(e.job || e.role || '').trim(),
      role: String(e.role || '').trim(),
      resignDate: String(e.resign_date || '').trim(),
    }))
    .filter((e) => e.name)

  const noticeIds = notices.map((n) => n.id)
  const readRows: { notice_id: number; store?: string; name?: string; status?: string }[] = []
  for (const part of chunk(noticeIds, IN_CHUNK)) {
    if (part.length === 0) continue
    const rows = (await supabaseSelectFilter(
      'notice_reads',
      `notice_id=in.(${part.join(',')})`,
      { limit: 50000, select: 'notice_id,store,name,status' }
    )) as { notice_id: number; store?: string; name?: string; status?: string }[]
    readRows.push(...(rows || []))
  }

  const agg = aggregateNoticeReadStats(notices, employees, readRows, {
    searchType: 'notice',
    minUnreadDays: settings.minUnreadDays,
    asOfYmd: period.asOfYmd,
  })

  const candidates: { store: string; name: string; missed: number }[] = []
  for (const a of agg.values()) {
    const missed = a.targeted - a.confirmed
    if (missed < settings.minMissed) continue
    candidates.push({ store: a.store, name: a.name, missed })
  }
  const candidateKeys = new Set(candidates.map((c) => empKey(c.store, c.name)))

  const existing = (await supabaseSelectFilter(
    'payroll_allowance_exclusions',
    `payroll_month=eq.${encodeURIComponent(month)}`,
    {
      limit: 5000,
      select: 'store,name,reason,created_by',
    }
  )) as { store?: string; name?: string; reason?: string; created_by?: string }[]

  const waived = new Set<string>()
  const autoActive = new Set<string>()
  const manualActive = new Set<string>()
  for (const r of existing || []) {
    const store = String(r.store || '').trim()
    const name = String(r.name || '').trim()
    if (!store || !name) continue
    const k = empKey(store, name)
    const reason = String(r.reason || '').trim() || NOTICE_UNREAD_REASON
    if (reason === NOTICE_UNREAD_WAIVED_REASON) {
      waived.add(k)
      continue
    }
    if (reason !== NOTICE_UNREAD_REASON) continue
    if (String(r.created_by || '').trim() === NOTICE_UNREAD_AUTO_ACTOR) autoActive.add(k)
    else manualActive.add(k)
  }

  const nowIso = new Date().toISOString()
  const upsertRows: Record<string, unknown>[] = []
  for (const c of candidates) {
    const k = empKey(c.store, c.name)
    if (waived.has(k)) continue
    /** 관리자 수동 확정은 덮어쓰지 않음 */
    if (manualActive.has(k)) continue
    const employeeId = await resolveEmployeeId(c.store, c.name)
    upsertRows.push({
      payroll_month: month,
      employee_id: employeeId,
      store: c.store,
      name: c.name,
      reason: NOTICE_UNREAD_REASON,
      notice_ids: [],
      missed_count: c.missed,
      period_start: period.startYmd,
      period_end: period.endYmd,
      created_by: NOTICE_UNREAD_AUTO_ACTOR,
      updated_at: nowIso,
    })
  }

  if (upsertRows.length > 0) {
    await supabaseUpsert('payroll_allowance_exclusions', upsertRows, 'payroll_month,store,name')
  }

  let removed = 0
  for (const k of autoActive) {
    if (candidateKeys.has(k)) continue
    const [store, name] = k.split('|')
    if (!store || !name) continue
    await supabaseDeleteByFilter(
      'payroll_allowance_exclusions',
      `payroll_month=eq.${encodeURIComponent(month)}&store=eq.${encodeURIComponent(store)}&name=eq.${encodeURIComponent(name)}&created_by=eq.${encodeURIComponent(NOTICE_UNREAD_AUTO_ACTOR)}&reason=eq.${encodeURIComponent(NOTICE_UNREAD_REASON)}`
    )
    removed += 1
  }

  return {
    payrollMonth: month,
    skipped: false,
    applied: upsertRows.length,
    removed,
    candidateCount: candidates.length,
    truncated,
  }
}
