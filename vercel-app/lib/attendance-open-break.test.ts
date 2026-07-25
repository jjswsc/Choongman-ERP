import { describe, expect, it } from 'vitest'
import { getOpenBreakStartMs, hasUnclosedClockWorkSession } from '@/lib/attendance-utils'

describe('getOpenBreakStartMs', () => {
  it('returns null when there is no open work session', () => {
    expect(
      getOpenBreakStartMs([
        { log_at: '2026-07-25T03:00:00.000Z', log_type: '출근' },
        { log_at: '2026-07-25T04:00:00.000Z', log_type: '휴식시작' },
        { log_at: '2026-07-25T12:00:00.000Z', log_type: '퇴근' },
      ])
    ).toBeNull()
  })

  it('ignores orphan break start from a previous closed shift', () => {
    const logs = [
      { log_at: '2026-07-24T03:00:00.000Z', log_type: '출근' },
      { log_at: '2026-07-24T06:00:00.000Z', log_type: '휴식시작' },
      { log_at: '2026-07-24T12:00:00.000Z', log_type: '퇴근' },
      { log_at: '2026-07-25T03:59:00.000Z', log_type: '출근' },
    ]
    expect(hasUnclosedClockWorkSession(logs)).toBe(true)
    expect(getOpenBreakStartMs(logs)).toBeNull()
  })

  it('detects open break within the current open shift', () => {
    const breakStart = '2026-07-25T06:00:00.000Z'
    const logs = [
      { log_at: '2026-07-25T03:59:00.000Z', log_type: '출근' },
      { log_at: breakStart, log_type: '휴식시작' },
    ]
    expect(getOpenBreakStartMs(logs)).toBe(new Date(breakStart).getTime())
  })

  it('returns null after break end in the current shift', () => {
    expect(
      getOpenBreakStartMs([
        { log_at: '2026-07-25T03:59:00.000Z', log_type: '출근' },
        { log_at: '2026-07-25T06:00:00.000Z', log_type: '휴식시작' },
        { log_at: '2026-07-25T06:30:00.000Z', log_type: '휴식종료' },
      ])
    ).toBeNull()
  })

  it('keeps overnight open break when clock-in is still open', () => {
    const breakStart = '2026-07-24T18:00:00.000Z'
    const logs = [
      { log_at: '2026-07-24T10:00:00.000Z', log_type: '출근' },
      { log_at: breakStart, log_type: '휴식시작' },
    ]
    expect(hasUnclosedClockWorkSession(logs)).toBe(true)
    expect(getOpenBreakStartMs(logs)).toBe(new Date(breakStart).getTime())
  })
})
