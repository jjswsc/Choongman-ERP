import { describe, expect, it } from 'vitest'
import { breakSpanIsOffPlan, pairBreakPunches } from '@/lib/attendance-break-window'

describe('pairBreakPunches', () => {
  it('pairs a start with the following end', () => {
    expect(
      pairBreakPunches([
        { type: 'end', at: '2026-09-20T08:00:00.000Z' },
        { type: 'start', at: '2026-09-20T07:00:00.000Z' },
      ])
    ).toEqual([{ startIso: '2026-09-20T07:00:00.000Z', endIso: '2026-09-20T08:00:00.000Z' }])
  })

  it('keeps an open start', () => {
    expect(pairBreakPunches([{ type: 'start', at: '2026-09-20T07:00:00.000Z' }])).toEqual([
      { startIso: '2026-09-20T07:00:00.000Z', endIso: '' },
    ])
  })
})

describe('breakSpanIsOffPlan', () => {
  const plan = { scheduleDate: '2026-09-20', planStart: '14:00', planEnd: '15:00' }

  it('allows a start inside the planned window', () => {
    expect(
      breakSpanIsOffPlan({
        ...plan,
        startIso: '2026-09-20T07:10:00.000Z',
        endIso: '2026-09-20T08:20:00.000Z',
      })
    ).toBe(false)
  })

  it('flags a start outside the planned window', () => {
    expect(
      breakSpanIsOffPlan({
        ...plan,
        startIso: '2026-09-20T09:00:00.000Z',
        endIso: '2026-09-20T10:00:00.000Z',
      })
    ).toBe(true)
  })

  it('does not flag when no break was planned', () => {
    expect(
      breakSpanIsOffPlan({
        scheduleDate: '2026-09-20',
        planStart: '',
        planEnd: '',
        startIso: '2026-09-20T09:00:00.000Z',
        endIso: '2026-09-20T10:00:00.000Z',
      })
    ).toBe(false)
  })
})
