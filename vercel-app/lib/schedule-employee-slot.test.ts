import { describe, expect, it } from 'vitest'
import {
  buildScheduleEmployeeRoster,
  resolveScheduleRosterEntry,
  resolveScheduleSavePayloadFromSlot,
  scheduleBreakSlotKey,
  scheduleSlotKeyFromEmployee,
  scheduleSlotKeyFromLoadedRow,
} from './schedule-employee-slot'

describe('schedule-employee-slot', () => {
  const employees = [
    {
      id: 20,
      name: 'Chosita Krutkran',
      nick: 'Bew',
      employee_code: 'M0020',
    },
    {
      id: 21,
      name: 'Somchai',
      nick: 'Oh',
      employee_code: 'M0001',
    },
  ]

  it('직원코드로 슬롯 키를 만든다', () => {
    expect(scheduleSlotKeyFromEmployee({ employeeCode: 'M0020', name: 'Chosita Krutkran' })).toBe('M0020')
    expect(scheduleSlotKeyFromEmployee({ employeeCode: '', name: 'Legacy Only' })).toBe('Legacy Only')
  })

  it('이름 오타 스케줄도 코드로 직원을 찾는다', () => {
    const roster = buildScheduleEmployeeRoster(employees)
    const hit = resolveScheduleRosterEntry('M0020', roster)
    expect(hit?.nick).toBe('Bew')
    expect(hit?.name).toBe('Chosita Krutkran')
  })

  it('조회 행의 employeeCode를 슬롯 키로 쓴다', () => {
    const roster = buildScheduleEmployeeRoster(employees)
    expect(
      scheduleSlotKeyFromLoadedRow(
        { name: 'Choshita Krutkran', employeeCode: 'M0020' },
        roster
      )
    ).toBe('M0020')
  })

  it('저장 시 마스터 이름·코드를 채운다', () => {
    const roster = buildScheduleEmployeeRoster(employees)
    const payload = resolveScheduleSavePayloadFromSlot('M0020', roster)
    expect(payload).toEqual({
      name: 'Chosita Krutkran',
      employeeCode: 'M0020',
      employeeId: 20,
    })
  })

  it('휴식 슬롯 키 접두사', () => {
    expect(scheduleBreakSlotKey('M0020')).toBe('BRK_M0020')
  })
})
