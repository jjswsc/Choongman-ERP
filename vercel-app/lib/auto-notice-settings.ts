import { addBangkokCalendarDays } from '@/lib/bangkok-time'

/**
 * 공지「자동 알림」규칙 — system_settings 키·기본값·정규화 (클라이언트/서버 공용)
 */

export const AUTO_NOTICE_WORK_LOG_KEY = 'auto_notice_work_log'
export const AUTO_NOTICE_STOCK_TAKE_KEY = 'auto_notice_stock_take'
export const AUTO_NOTICE_CUSTOM_RULES_KEY = 'auto_notice_custom_rules'
export const AUTO_NOTICE_LAST_RUN_KEY = 'auto_notice_last_run'

export const AUTO_NOTICE_CUSTOM_RULES_MAX = 40

export type AutoNoticeStockTakeTarget = 'managers'

export type AutoNoticeWorkLogSettings = {
  enabled: boolean
  /** 방콕 벽시계 시 (0–23) */
  hourBangkok: number
  notifyManager: boolean
}

export type AutoNoticeStockTakeSettings = {
  enabled: boolean
  /** 월말 N일 전 (1 = 말일 하루 전) */
  daysBeforeMonthEnd: number
  hourBangkok: number
  title: string
  body: string
  target: AutoNoticeStockTakeTarget
}

/** 자유 반복 공지 스케줄 */
export type AutoNoticeCustomSchedule =
  | { kind: 'daily' }
  | { kind: 'weekly'; weekday: number } // ISO 1=Mon … 7=Sun
  | { kind: 'monthly'; dayOfMonth: number } // 1–28 (말일 이슈 완화)
  | { kind: 'before_month_end'; daysBefore: number }

export type AutoNoticeCustomAudience =
  | { kind: 'managers' }
  | { kind: 'all' }
  | { kind: 'store_role'; store: string; role: string }

export type AutoNoticeCustomRule = {
  id: string
  enabled: boolean
  title: string
  body: string
  hourBangkok: number
  schedule: AutoNoticeCustomSchedule
  audience: AutoNoticeCustomAudience
}

export type AutoNoticeLastRun = {
  /** YYYY-MM-DD — 당일 업무일지 리마인더 중복 방지 */
  work_log: string
  /** YYYY-MM — 당월 재고조사 알림 중복 방지 */
  stock_take: string
  /** 규칙 id → 발송 키(YYYY-MM-DD 또는 YYYY-MM) */
  custom: Record<string, string>
}

export type AutoNoticeSettingsPayload = {
  workLog: AutoNoticeWorkLogSettings
  stockTake: AutoNoticeStockTakeSettings
  customRules: AutoNoticeCustomRule[]
  lastRun: AutoNoticeLastRun
}

export const DEFAULT_AUTO_NOTICE_WORK_LOG: AutoNoticeWorkLogSettings = {
  enabled: true,
  hourBangkok: 10,
  notifyManager: true,
}

export const DEFAULT_AUTO_NOTICE_STOCK_TAKE: AutoNoticeStockTakeSettings = {
  enabled: false,
  daysBeforeMonthEnd: 2,
  hourBangkok: 10,
  title: '[재고조사] 월말 실사 안내',
  body:
    '월말 실사 기간입니다. 재고 화면에서 기준일을 해당 월 말일로 맞춘 뒤 조정을 진행해 주세요. 이미 실사한 매장에는 보내지 않습니다.',
  target: 'managers',
}

export const DEFAULT_AUTO_NOTICE_LAST_RUN: AutoNoticeLastRun = {
  work_log: '',
  stock_take: '',
  custom: {},
}

function clampHour(n: unknown, fallback: number): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(23, Math.max(0, Math.floor(v)))
}

function clampDaysBefore(n: unknown, fallback: number): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(14, Math.max(1, Math.floor(v)))
}

function clampWeekday(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return 1
  const i = Math.floor(v)
  if (i < 1 || i > 7) return 1
  return i
}

function clampDayOfMonth(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return 1
  return Math.min(28, Math.max(1, Math.floor(v)))
}

export function newAutoNoticeCustomRuleId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeAutoNoticeWorkLog(raw: unknown): AutoNoticeWorkLogSettings {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return {
    enabled: o.enabled === false ? false : true,
    hourBangkok: clampHour(o.hourBangkok, DEFAULT_AUTO_NOTICE_WORK_LOG.hourBangkok),
    notifyManager: o.notifyManager === false ? false : true,
  }
}

export function normalizeAutoNoticeStockTake(raw: unknown): AutoNoticeStockTakeSettings {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const title = String(o.title ?? '').trim()
  const body = String(o.body ?? '').trim()
  return {
    enabled: o.enabled === false ? false : true,
    daysBeforeMonthEnd: clampDaysBefore(
      o.daysBeforeMonthEnd,
      DEFAULT_AUTO_NOTICE_STOCK_TAKE.daysBeforeMonthEnd
    ),
    hourBangkok: clampHour(o.hourBangkok, DEFAULT_AUTO_NOTICE_STOCK_TAKE.hourBangkok),
    title: title || DEFAULT_AUTO_NOTICE_STOCK_TAKE.title,
    body: body || DEFAULT_AUTO_NOTICE_STOCK_TAKE.body,
    target: 'managers',
  }
}

export function normalizeAutoNoticeCustomSchedule(raw: unknown): AutoNoticeCustomSchedule {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const kind = String(o.kind || '').trim()
  if (kind === 'weekly') return { kind: 'weekly', weekday: clampWeekday(o.weekday) }
  if (kind === 'monthly') return { kind: 'monthly', dayOfMonth: clampDayOfMonth(o.dayOfMonth) }
  if (kind === 'before_month_end') {
    return { kind: 'before_month_end', daysBefore: clampDaysBefore(o.daysBefore, 1) }
  }
  return { kind: 'daily' }
}

export function normalizeAutoNoticeCustomAudience(raw: unknown): AutoNoticeCustomAudience {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const kind = String(o.kind || '').trim()
  if (kind === 'all') return { kind: 'all' }
  if (kind === 'store_role') {
    const store = String(o.store ?? '전체').trim() || '전체'
    const role = String(o.role ?? '전체').trim() || '전체'
    return { kind: 'store_role', store, role }
  }
  return { kind: 'managers' }
}

export function normalizeAutoNoticeCustomRule(raw: unknown, fallbackId?: string): AutoNoticeCustomRule | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const title = String(o.title ?? '').trim()
  const body = String(o.body ?? '').trim()
  if (!title || !body) return null
  const idRaw = String(o.id ?? '').trim()
  const id = idRaw || fallbackId || newAutoNoticeCustomRuleId()
  return {
    id,
    enabled: o.enabled === false ? false : true,
    title: title.slice(0, 200),
    body: body.slice(0, 4000),
    hourBangkok: clampHour(o.hourBangkok, 10),
    schedule: normalizeAutoNoticeCustomSchedule(o.schedule),
    audience: normalizeAutoNoticeCustomAudience(o.audience),
  }
}

export function normalizeAutoNoticeCustomRules(raw: unknown): AutoNoticeCustomRule[] {
  if (!Array.isArray(raw)) return []
  const out: AutoNoticeCustomRule[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (out.length >= AUTO_NOTICE_CUSTOM_RULES_MAX) break
    const rule = normalizeAutoNoticeCustomRule(item)
    if (!rule) continue
    if (seen.has(rule.id)) continue
    seen.add(rule.id)
    out.push(rule)
  }
  return out
}

export function normalizeAutoNoticeLastRun(raw: unknown): AutoNoticeLastRun {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const workLog = String(o.work_log ?? '').trim()
  const stockTake = String(o.stock_take ?? '').trim()
  const customRaw =
    o.custom && typeof o.custom === 'object' && !Array.isArray(o.custom)
      ? (o.custom as Record<string, unknown>)
      : {}
  const custom: Record<string, string> = {}
  for (const [k, v] of Object.entries(customRaw)) {
    const key = String(k || '').trim()
    const val = String(v ?? '').trim()
    if (!key || !val) continue
    if (/^\d{4}-\d{2}-\d{2}$/.test(val) || /^\d{4}-\d{2}$/.test(val)) custom[key] = val
  }
  return {
    work_log: /^\d{4}-\d{2}-\d{2}$/.test(workLog) ? workLog : '',
    stock_take:
      /^\d{4}-\d{2}-\d{2}$/.test(stockTake) || /^\d{4}-\d{2}$/.test(stockTake) ? stockTake : '',
    custom,
  }
}

/**
 * 규칙이 지금 발송 대상이면 중복 방지 키(YYYY-MM-DD 또는 YYYY-MM)를 반환, 아니면 null.
 */
export function resolveCustomRuleSendKey(params: {
  rule: AutoNoticeCustomRule
  todayYmd: string
  hourBangkok: number
  isoWeekday: number
  monthEndYmd: string
  yearMonth: string
}): string | null {
  const { rule, todayYmd, hourBangkok, isoWeekday, monthEndYmd, yearMonth } = params
  if (!rule.enabled) return null
  if (hourBangkok !== rule.hourBangkok) return null

  const sch = rule.schedule
  if (sch.kind === 'daily') return todayYmd
  if (sch.kind === 'weekly') {
    if (isoWeekday !== sch.weekday) return null
    return todayYmd
  }
  if (sch.kind === 'monthly') {
    const day = Number(todayYmd.slice(8, 10))
    if (day !== sch.dayOfMonth) return null
    return yearMonth
  }
  if (sch.kind === 'before_month_end') {
    const targetYmd = addBangkokCalendarDays(monthEndYmd, -sch.daysBefore)
    if (todayYmd !== targetYmd) return null
    return yearMonth
  }
  return null
}
