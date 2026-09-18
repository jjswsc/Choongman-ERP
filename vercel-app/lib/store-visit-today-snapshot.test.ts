import { describe, expect, it } from 'vitest'
import { attendanceBusinessDateStrBangkok } from '@/lib/attendance-utils'
import { visitSegmentVisibleOnBusinessDay } from '@/lib/store-visit-today-snapshot'

describe('visitSegmentVisibleOnBusinessDay', () => {
  it('08시 이후 오늘 화면에도 아침 07:13 진행 중 방문이 남는다', () => {
    const startMs = new Date('2026-09-18T07:13:00+07:00').getTime()
    const nowMs = new Date('2026-09-18T09:35:00+07:00').getTime()
    expect(attendanceBusinessDateStrBangkok(nowMs)).toBe('2026-09-18')
    expect(attendanceBusinessDateStrBangkok(startMs)).toBe('2026-09-17')
    expect(visitSegmentVisibleOnBusinessDay(startMs, null, true, '2026-09-18', nowMs)).toBe(true)
  })

  it('아침 07시에 시작해 08시 전에 끝난 방문도 달력 오늘 현황에 남는다', () => {
    const startMs = new Date('2026-09-18T07:13:00+07:00').getTime()
    const endMs = new Date('2026-09-18T07:50:00+07:00').getTime()
    const nowMs = new Date('2026-09-18T09:35:00+07:00').getTime()
    expect(visitSegmentVisibleOnBusinessDay(startMs, endMs, false, '2026-09-18', nowMs)).toBe(true)
  })

  it('전날 저녁에 시작해 다음날 오전까지 이어진 방문도 지금 방문 중에 남는다', () => {
    const startMs = new Date('2026-09-17T22:00:00+07:00').getTime()
    const nowMs = new Date('2026-09-18T09:35:00+07:00').getTime()
    expect(visitSegmentVisibleOnBusinessDay(startMs, null, true, '2026-09-18', nowMs)).toBe(true)
  })

  it('전날 오전에 끝난 방문은 오늘 화면에 안 나온다', () => {
    const startMs = new Date('2026-09-17T10:00:00+07:00').getTime()
    const endMs = new Date('2026-09-17T11:30:00+07:00').getTime()
    const nowMs = new Date('2026-09-18T09:35:00+07:00').getTime()
    expect(visitSegmentVisibleOnBusinessDay(startMs, endMs, false, '2026-09-18', nowMs)).toBe(false)
  })
})
