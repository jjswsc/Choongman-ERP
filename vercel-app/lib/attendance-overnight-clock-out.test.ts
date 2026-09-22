import { describe, expect, it } from 'vitest'
import {
  attendanceOvernightOutFetchEndExclusiveUtcIso,
  isAttendanceOvernightClockOut,
  isAttendanceOvernightClockOutAfterRangeEnd,
  plannedWorkMinutesFromPlans,
} from '@/lib/attendance-utils'

describe('isAttendanceOvernightClockOut — 22:00–08:00 근무', () => {
  it('treats 00:00–08:59 Bangkok as overnight clock-out', () => {
    expect(isAttendanceOvernightClockOut('2026-09-06T00:00:00+07:00')).toBe(true)
    expect(isAttendanceOvernightClockOut('2026-09-06T07:59:00+07:00')).toBe(true)
    expect(isAttendanceOvernightClockOut('2026-09-06T08:00:00+07:00')).toBe(true)
    expect(isAttendanceOvernightClockOut('2026-09-06T08:02:00+07:00')).toBe(true)
    expect(isAttendanceOvernightClockOut('2026-09-06T08:59:00+07:00')).toBe(true)
  })

  it('does not treat 09:00+ or evening clock-out as overnight', () => {
    expect(isAttendanceOvernightClockOut('2026-09-06T09:00:00+07:00')).toBe(false)
    expect(isAttendanceOvernightClockOut('2026-09-05T18:01:00+07:00')).toBe(false)
    expect(isAttendanceOvernightClockOut('2026-09-05T22:00:00+07:00')).toBe(false)
  })
})

describe('attendanceOvernightOutFetchEndExclusiveUtcIso', () => {
  it('includes next-morning 08:02 clock-out that the old 07:00 bound dropped', () => {
    const end = attendanceOvernightOutFetchEndExclusiveUtcIso('2026-09-05')
    const out0802 = new Date('2026-09-06T08:02:00+07:00').getTime()
    const oldBound = new Date('2026-09-06T00:00:00.000Z').getTime() // 07:00 Bangkok
    expect(out0802).toBeGreaterThan(oldBound)
    expect(out0802).toBeLessThan(new Date(end).getTime())
  })

  it('still excludes next-day evening logs', () => {
    const end = attendanceOvernightOutFetchEndExclusiveUtcIso('2026-09-05')
    const evening = new Date('2026-09-06T21:57:00+07:00').getTime()
    expect(evening).toBeGreaterThanOrEqual(new Date(end).getTime())
  })
})

describe('isAttendanceOvernightClockOutAfterRangeEnd', () => {
  it('allows 08:02 clock-out on the day after the query end', () => {
    expect(
      isAttendanceOvernightClockOutAfterRangeEnd(
        '퇴근',
        '2026-09-06T08:02:00+07:00',
        '2026-09-06',
        '2026-09-05'
      )
    ).toBe(true)
  })

  it('rejects next-day clock-in and evening clock-out', () => {
    expect(
      isAttendanceOvernightClockOutAfterRangeEnd(
        '출근',
        '2026-09-06T08:00:00+07:00',
        '2026-09-06',
        '2026-09-05'
      )
    ).toBe(false)
    expect(
      isAttendanceOvernightClockOutAfterRangeEnd(
        '퇴근',
        '2026-09-06T18:00:00+07:00',
        '2026-09-06',
        '2026-09-05'
      )
    ).toBe(false)
  })
})

describe('22:00–08:00 planned vs actual (The Street night shift)', () => {
  it('planned work is 8.5h after 1.5h break, not early-leave 510 when clock-out is next 08:02', () => {
    const planned = plannedWorkMinutesFromPlans('22:00', '08:00', '01:00', '02:30', true)
    expect(planned).toBe(510)

    const inMs = new Date('2026-09-05T21:57:00+07:00').getTime()
    const outMs = new Date('2026-09-06T08:02:00+07:00').getTime()
    const breakMin = 88
    const actual = Math.max(0, Math.floor((outMs - inMs) / 60000) - breakMin)
    const diffMin = actual - planned
    const earlyMin = planned > 0 && diffMin < 0 ? Math.max(0, Math.abs(diffMin)) : 0

    expect(actual).toBeGreaterThan(500)
    expect(earlyMin).toBe(0)
  })

  it('same-calendar 08:02 vs 21:57 (old pairing) looked like 510 min early leave', () => {
    const planned = 510
    const inMs = new Date('2026-09-05T21:57:00+07:00').getTime()
    const outMs = new Date('2026-09-05T08:02:00+07:00').getTime()
    const actual = Math.max(0, Math.floor((outMs - inMs) / 60000))
    const diffMin = actual - planned
    expect(actual).toBe(0)
    expect(diffMin).toBe(-510)
  })
})
