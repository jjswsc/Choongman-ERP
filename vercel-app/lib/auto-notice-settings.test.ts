import { describe, expect, it } from 'vitest'
import {
  normalizeAutoNoticeCustomRule,
  resolveCustomRuleSendKey,
  type AutoNoticeCustomRule,
} from './auto-notice-settings'

function rule(partial: Partial<AutoNoticeCustomRule> & Pick<AutoNoticeCustomRule, 'schedule'>): AutoNoticeCustomRule {
  return {
    id: 'c_test',
    enabled: true,
    title: 'T',
    body: 'B',
    hourBangkok: 10,
    audience: { kind: 'managers' },
    ...partial,
  }
}

describe('resolveCustomRuleSendKey', () => {
  it('matches daily at hour', () => {
    const key = resolveCustomRuleSendKey({
      rule: rule({ schedule: { kind: 'daily' } }),
      todayYmd: '2026-08-12',
      hourBangkok: 10,
      isoWeekday: 3,
      monthEndYmd: '2026-08-31',
      yearMonth: '2026-08',
    })
    expect(key).toBe('2026-08-12')
  })

  it('skips daily on hour mismatch', () => {
    const key = resolveCustomRuleSendKey({
      rule: rule({ schedule: { kind: 'daily' } }),
      todayYmd: '2026-08-12',
      hourBangkok: 11,
      isoWeekday: 3,
      monthEndYmd: '2026-08-31',
      yearMonth: '2026-08',
    })
    expect(key).toBeNull()
  })

  it('matches weekly weekday', () => {
    const key = resolveCustomRuleSendKey({
      rule: rule({ schedule: { kind: 'weekly', weekday: 1 } }),
      todayYmd: '2026-08-10',
      hourBangkok: 10,
      isoWeekday: 1,
      monthEndYmd: '2026-08-31',
      yearMonth: '2026-08',
    })
    expect(key).toBe('2026-08-10')
  })

  it('matches before month end', () => {
    const key = resolveCustomRuleSendKey({
      rule: rule({ schedule: { kind: 'before_month_end', daysBefore: 1 } }),
      todayYmd: '2026-08-30',
      hourBangkok: 10,
      isoWeekday: 7,
      monthEndYmd: '2026-08-31',
      yearMonth: '2026-08',
    })
    expect(key).toBe('2026-08')
  })

  it('rejects empty title/body on normalize', () => {
    expect(normalizeAutoNoticeCustomRule({ id: 'x', title: '', body: 'b' })).toBeNull()
  })
})
