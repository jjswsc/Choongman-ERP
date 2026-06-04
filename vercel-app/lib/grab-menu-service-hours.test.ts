import { describe, expect, it } from 'vitest'
import {
  GRAB_VALID_OPEN_PERIOD_TYPES,
  grabSectionServiceHours,
  serviceHoursFromRanges,
} from '@/lib/grab-menu-from-pos'

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

/**
 * 회귀 방지: Grab serviceHours.openPeriodType 는 OpenPeriod/OpenAllDay/CloseAllDay 만 허용.
 * 과거 'SpecificTimes' 무효값이 들어가 메뉴 전체 게시가 거부되고 카테고리가 통째로 사라진 적이 있다(2026-06).
 */
describe('serviceHoursFromRanges — openPeriodType validity', () => {
  it('empty ranges -> OpenAllDay for every day', () => {
    const sh = serviceHoursFromRanges([]) as Record<string, { openPeriodType: string }>
    for (const day of DAYS) {
      expect(sh[day].openPeriodType).toBe('OpenAllDay')
    }
  })

  it('time-limited ranges -> OpenPeriod (NOT the invalid "SpecificTimes")', () => {
    const sh = serviceHoursFromRanges([{ start: '08:00', end: '11:00' }]) as Record<
      string,
      { openPeriodType: string; periods?: Array<{ startTime: string; endTime: string }> }
    >
    for (const day of DAYS) {
      expect(sh[day].openPeriodType).toBe('OpenPeriod')
      expect(sh[day].openPeriodType).not.toBe('SpecificTimes')
      expect(Array.isArray(sh[day].periods)).toBe(true)
    }
  })

  it('full-day range (00:00-23:59) -> OpenAllDay, not a hidden OpenPeriod', () => {
    const sh = serviceHoursFromRanges([{ start: '00:00', end: '23:59' }]) as Record<
      string,
      { openPeriodType: string }
    >
    for (const day of DAYS) {
      expect(sh[day].openPeriodType).toBe('OpenAllDay')
    }
  })

  it('Promotion section always OpenAllDay even with limited sell ranges', () => {
    const sh = grabSectionServiceHours('Promotion', [{ start: '11:00', end: '22:00' }]) as Record<
      string,
      { openPeriodType: string }
    >
    for (const day of DAYS) {
      expect(sh[day].openPeriodType).toBe('OpenAllDay')
    }
  })

  it('legacy Korean promotion main category maps to OpenAllDay', () => {
    const sh = grabSectionServiceHours('프로모션', [{ start: '08:00', end: '21:00' }]) as Record<
      string,
      { openPeriodType: string }
    >
    expect(sh.mon.openPeriodType).toBe('OpenAllDay')
  })

  it('non-promotion section keeps OpenPeriod for limited ranges', () => {
    const sh = grabSectionServiceHours('Regular', [{ start: '11:00', end: '22:00' }]) as Record<
      string,
      { openPeriodType: string }
    >
    expect(sh.mon.openPeriodType).toBe('OpenPeriod')
  })

  it('always emits a Grab-allowed openPeriodType', () => {
    for (const ranges of [[], [{ start: '09:00', end: '17:00' }]]) {
      const sh = serviceHoursFromRanges(ranges) as Record<string, { openPeriodType: string }>
      for (const day of DAYS) {
        expect(GRAB_VALID_OPEN_PERIOD_TYPES).toContain(
          sh[day].openPeriodType as (typeof GRAB_VALID_OPEN_PERIOD_TYPES)[number]
        )
      }
    }
  })
})
