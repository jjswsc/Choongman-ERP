import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTICE_UNREAD_ALLOWANCE_SETTINGS,
  normalizeNoticeUnreadAllowanceSettings,
  noticeUnreadSyncPeriodForPayrollMonth,
} from './notice-unread-allowance-settings'

describe('normalizeNoticeUnreadAllowanceSettings', () => {
  it('defaults to auto / 3 days', () => {
    expect(normalizeNoticeUnreadAllowanceSettings(null)).toEqual(
      DEFAULT_NOTICE_UNREAD_ALLOWANCE_SETTINGS
    )
    expect(normalizeNoticeUnreadAllowanceSettings({})).toMatchObject({
      mode: 'auto',
      minUnreadDays: 3,
      minMissed: 1,
    })
  })

  it('accepts manual mode and clamps days', () => {
    expect(
      normalizeNoticeUnreadAllowanceSettings({
        mode: 'manual',
        minUnreadDays: 99,
        minMissed: 0,
      })
    ).toEqual({ mode: 'manual', minUnreadDays: 90, minMissed: 1 })
  })
})

describe('noticeUnreadSyncPeriodForPayrollMonth', () => {
  it('caps end at today inside current month', () => {
    const p = noticeUnreadSyncPeriodForPayrollMonth('2026-11', 3, '2026-11-19')
    // lookback = max(14, 3+7) = 14 → 2026-11-01 − 14일 = 2026-10-18
    expect(p).toEqual({
      startYmd: '2026-10-18',
      endYmd: '2026-11-19',
      asOfYmd: '2026-11-19',
    })
  })

  it('uses month end for past months', () => {
    const p = noticeUnreadSyncPeriodForPayrollMonth('2026-10', 3, '2026-11-19')
    expect(p?.endYmd).toBe('2026-10-31')
    expect(p?.asOfYmd).toBe('2026-10-31')
  })
})
