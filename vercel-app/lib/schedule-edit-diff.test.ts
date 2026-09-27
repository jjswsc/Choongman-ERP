import { describe, expect, it } from 'vitest'
import { diffScheduleWeek, type ScheduleSlotSnapshot } from '@/lib/schedule-edit-diff'

function slot(partial: Partial<ScheduleSlotSnapshot> & Pick<ScheduleSlotSnapshot, 'date' | 'name'>): ScheduleSlotSnapshot {
  return {
    employeeId: 0,
    employeeCode: '',
    planIn: '09:00',
    planOut: '18:00',
    breakStart: '13:00',
    breakEnd: '14:00',
    area: '[Service]',
    planInPrevDay: false,
    ...partial,
  }
}

describe('diffScheduleWeek', () => {
  it('records only the person and fields that changed', () => {
    const before = [
      slot({ date: '2026-09-24', name: 'Aya', employeeId: 18, employeeCode: 'MF018', breakStart: '14:00', breakEnd: '15:00' }),
      slot({ date: '2026-09-24', name: 'Bow', employeeId: 5, employeeCode: 'MF005' }),
    ]
    const after = [
      slot({ date: '2026-09-24', name: 'Aya', employeeId: 18, employeeCode: 'MF018', breakStart: '16:00', breakEnd: '17:00' }),
      slot({ date: '2026-09-24', name: 'Bow', employeeId: 5, employeeCode: 'MF005' }),
    ]
    const diffs = diffScheduleWeek(before, after)
    expect(diffs.map((d) => d.employeeName)).toEqual(['Aya', 'Aya'])
    expect(diffs.map((d) => d.fieldName)).toEqual(['break_start', 'break_end'])
    expect(diffs[0]).toMatchObject({ beforeValue: '14:00', afterValue: '16:00' })
  })

  it('records an added and a removed shift without touching unchanged rows', () => {
    const before = [slot({ date: '2026-09-24', name: 'Cream', employeeId: 20 })]
    const after = [slot({ date: '2026-09-25', name: 'Tao', employeeId: 3 })]
    const diffs = diffScheduleWeek(before, after)
    expect(diffs).toEqual([
      expect.objectContaining({ employeeName: 'Tao', fieldName: 'shift', beforeValue: '', date: '2026-09-25' }),
      expect.objectContaining({ employeeName: 'Cream', fieldName: 'shift', afterValue: '', date: '2026-09-24' }),
    ])
  })

  it('matches the same person by name when the old row has no employee id', () => {
    const before = [slot({ date: '2026-09-24', name: 'Ms. Aya', planIn: '09:00' })]
    const after = [slot({ date: '2026-09-24', name: 'Aya', employeeId: 18, planIn: '10:00' })]
    const diffs = diffScheduleWeek(before, after)
    expect(diffs).toEqual([
      expect.objectContaining({ fieldName: 'plan_in', beforeValue: '09:00', afterValue: '10:00', employeeId: 18 }),
    ])
  })
})
