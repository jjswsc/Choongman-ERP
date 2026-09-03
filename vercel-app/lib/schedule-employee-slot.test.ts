import { describe, expect, it } from 'vitest'
import {
  SCHEDULE_HOUR_DEFAULT_END,
  SCHEDULE_HOUR_MAX,
  buildScheduleEmployeeRoster,
  buildScheduleHalfHourOptions,
  findScheduleSaveDuplicates,
  resolveScheduleRosterEntry,
  resolveScheduleSavePayloadFromSlot,
  scheduleBreakSlotKey,
  scheduleGridEndHourForExclusiveEndMinutes,
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

  it('기본 그리드 06~31는 주간·심야 휴게(24:00+)와 22:00–07:00을 포함한다', () => {
    const opts = buildScheduleHalfHourOptions(6, SCHEDULE_HOUR_DEFAULT_END)
    expect(opts[0]).toBe('06:00')
    expect(opts).toContain('12:00')
    expect(opts).toContain('23:30')
    expect(opts).toContain('24:00')
    expect(opts).toContain('26:00')
    expect(opts).toContain('30:00')
    expect(opts).toContain('30:30')
    expect(opts).toContain('31:00')
    expect(opts[opts.length - 1]).toBe('31:30')
    expect(opts).not.toContain('05:30')
    expect(opts).not.toContain('00:00')
  })

  it('22:00–07:00은 30시 슬롯까지, 22:00–06:00은 29시에서 끝난다', () => {
    const startMin = 22 * 60
    expect(scheduleGridEndHourForExclusiveEndMinutes(startMin + 8 * 60)).toBe(29)
    expect(scheduleGridEndHourForExclusiveEndMinutes(startMin + 9 * 60)).toBe(30)
    expect(scheduleGridEndHourForExclusiveEndMinutes(startMin + 10 * 60)).toBe(31)
    expect(scheduleGridEndHourForExclusiveEndMinutes(startMin + 20 * 60)).toBe(SCHEDULE_HOUR_MAX)
  })

  it('같은 날짜에 코드·이름이 갈라진 동일 직원은 중복으로 잡는다', () => {
    const roster = buildScheduleEmployeeRoster(employees)
    const dups = findScheduleSaveDuplicates(
      [
        { date: '2026-08-31', employeeCode: 'M0020', name: 'Chosita Krutkran' },
        { date: '2026-08-31', name: 'Chosita Krutkran' },
      ],
      roster
    )
    expect(dups).toHaveLength(1)
    expect(dups[0].dedupeId).toBe('M0020')
    expect(dups[0].name).toBe('Bew')
  })

  it('날짜가 다르면 동일 직원이어도 중복이 아니다', () => {
    const roster = buildScheduleEmployeeRoster(employees)
    const dups = findScheduleSaveDuplicates(
      [
        { date: '2026-08-31', employeeCode: 'M0020' },
        { date: '2026-09-01', employeeCode: 'M0020' },
      ],
      roster
    )
    expect(dups).toHaveLength(0)
  })
})
