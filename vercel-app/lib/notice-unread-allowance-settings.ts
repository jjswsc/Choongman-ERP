/**
 * 공지 미확인 → 수당 제외 정책 (system_settings)
 * mode: manual = 관리자 확정만 / auto = 급여월·크론·급여계산 시 자동 반영
 * 기본값: auto, 발송 후 3일
 */

import { addBangkokCalendarDays, getBangkokMonthRange } from '@/lib/bangkok-time'
import { bangkokTodayYmd } from '@/lib/bangkok-date'

export const NOTICE_UNREAD_ALLOWANCE_SETTINGS_KEY = 'notice_unread_allowance_policy'

export type NoticeUnreadAllowanceMode = 'manual' | 'auto'

export type NoticeUnreadAllowanceSettings = {
  mode: NoticeUnreadAllowanceMode
  /** 발송 후 N일 이상 미확인만 (0=즉시). 기본 3 */
  minUnreadDays: number
  /** 미확인 건수 하한. 기본 1 */
  minMissed: number
}

export const DEFAULT_NOTICE_UNREAD_ALLOWANCE_SETTINGS: NoticeUnreadAllowanceSettings = {
  mode: 'auto',
  minUnreadDays: 3,
  minMissed: 1,
}

export const NOTICE_UNREAD_REASON = 'notice_unread'
export const NOTICE_UNREAD_WAIVED_REASON = 'notice_unread_waived'
export const NOTICE_UNREAD_AUTO_ACTOR = 'auto'

function clampInt(n: unknown, fallback: number, min: number, max: number): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, Math.floor(v)))
}

export function normalizeNoticeUnreadAllowanceSettings(
  raw: unknown
): NoticeUnreadAllowanceSettings {
  const d = DEFAULT_NOTICE_UNREAD_ALLOWANCE_SETTINGS
  if (raw == null || typeof raw !== 'object') return { ...d }
  const o = raw as Record<string, unknown>
  const modeRaw = String(o.mode || '').trim().toLowerCase()
  const mode: NoticeUnreadAllowanceMode = modeRaw === 'manual' ? 'manual' : 'auto'
  return {
    mode,
    minUnreadDays: clampInt(o.minUnreadDays, d.minUnreadDays, 0, 90),
    minMissed: clampInt(o.minMissed, d.minMissed, 1, 100),
  }
}

function normalizeMonth(raw: string): string {
  const s = String(raw || '').trim()
  if (/^\d{4}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7)
  return ''
}

/** 급여월 조회 구간: 월초 − lookback ~ min(오늘, 월말) */
export function noticeUnreadSyncPeriodForPayrollMonth(
  payrollMonth: string,
  minUnreadDays: number,
  todayYmd: string = bangkokTodayYmd()
): { startYmd: string; endYmd: string; asOfYmd: string } | null {
  const month = normalizeMonth(payrollMonth)
  if (!month) return null
  const { startStr, endStr } = getBangkokMonthRange(month)
  const lookback = Math.max(14, Math.max(0, Math.floor(minUnreadDays || 0)) + 7)
  const startYmd = addBangkokCalendarDays(startStr, -lookback)
  const endYmd = todayYmd < endStr ? todayYmd : endStr
  const asOfYmd = endYmd
  if (startYmd > endYmd) return null
  return { startYmd, endYmd, asOfYmd }
}
