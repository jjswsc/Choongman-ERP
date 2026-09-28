import { describe, expect, it } from 'vitest'
import {
  applyCrmDatePreset,
  crmCutoffDateFromDays,
  crmDaysFromCutoffDate,
  isCrmCutoffOrderValid,
  matchCrmDatePreset,
  resolveCrmDormantCutoff,
  resolveCrmRecentCutoff,
} from '@/lib/crm-dashboard-dates'

const TODAY = '2026-09-28'

describe('crm dashboard cutoff dates', () => {
  it('maps default day windows to Bangkok calendar dates', () => {
    expect(crmCutoffDateFromDays(30, TODAY)).toBe('2026-08-29')
    expect(crmCutoffDateFromDays(90, TODAY)).toBe('2026-06-30')
  })

  it('round-trips a cutoff date into days', () => {
    expect(crmDaysFromCutoffDate('2026-08-29', TODAY)).toBe(30)
    expect(crmDaysFromCutoffDate('2026-06-30', TODAY)).toBe(90)
  })

  it('clamps recent and dormant cutoffs back onto allowed dates', () => {
    expect(resolveCrmRecentCutoff('2026-09-27', TODAY)).toEqual({
      days: 7,
      date: '2026-09-21',
    })
    expect(resolveCrmDormantCutoff('2020-01-01', TODAY)).toEqual({
      days: 720,
      date: crmCutoffDateFromDays(720, TODAY),
    })
  })

  it('falls back when the date is empty', () => {
    expect(resolveCrmRecentCutoff('', TODAY)).toEqual({
      days: 30,
      date: '2026-08-29',
    })
    expect(resolveCrmDormantCutoff('not-a-date', TODAY)).toEqual({
      days: 90,
      date: '2026-06-30',
    })
  })

  it('requires recent cutoff after dormant cutoff', () => {
    expect(isCrmCutoffOrderValid('2026-08-29', '2026-06-30')).toBe(true)
    expect(isCrmCutoffOrderValid('2026-06-30', '2026-08-29')).toBe(false)
    expect(isCrmCutoffOrderValid('2026-06-30', '2026-06-30')).toBe(false)
  })

  it('applies day presets and this-month recent cutoff', () => {
    expect(applyCrmDatePreset('d7_30', TODAY)).toEqual({
      recent: { days: 7, date: '2026-09-21' },
      dormant: { days: 30, date: '2026-08-29' },
    })
    expect(applyCrmDatePreset('d30_90', TODAY)).toEqual({
      recent: { days: 30, date: '2026-08-29' },
      dormant: { days: 90, date: '2026-06-30' },
    })
    expect(applyCrmDatePreset('thisMonth', TODAY).recent).toEqual({
      days: 27,
      date: '2026-09-01',
    })
    expect(applyCrmDatePreset('thisMonth', TODAY).dormant.days).toBe(90)
  })

  it('matches applied presets by day counts', () => {
    expect(matchCrmDatePreset(30, 90, TODAY)).toBe('d30_90')
    expect(matchCrmDatePreset(7, 30, TODAY)).toBe('d7_30')
    expect(matchCrmDatePreset(27, 90, TODAY)).toBe('thisMonth')
    expect(matchCrmDatePreset(15, 90, TODAY)).toBeNull()
  })
})
