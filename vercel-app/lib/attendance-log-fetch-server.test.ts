import { describe, expect, it } from 'vitest'
import { attendanceLogRowMatchesEmployee } from './attendance-log-fetch-server'

describe('attendanceLogRowMatchesEmployee', () => {
  const target = { employeeId: 42, employeeCodeNorm: 'M0020', employeeName: 'Choshita Krutkran' }

  it('employee_id 일치 시 매칭', () => {
    expect(attendanceLogRowMatchesEmployee({ employee_id: 42, log_type: '출근' }, target)).toBe(true)
  })

  it('employee_code 일치 시 employee_id 불일치여도 매칭', () => {
    expect(
      attendanceLogRowMatchesEmployee(
        { employee_id: 99, employee_code: 'M0020', name: 'Chosita Krutkran', log_type: '출근' },
        target
      )
    ).toBe(true)
  })

  it('레거시(employee_id NULL) + 정규화 이름 일치 시 매칭', () => {
    expect(
      attendanceLogRowMatchesEmployee(
        { employee_id: null, name: 'Ms. Choshita Krutkran', log_type: '출근' },
        target
      )
    ).toBe(true)
  })

  it('다른 employee_id + 이름만 비슷하면 제외', () => {
    expect(
      attendanceLogRowMatchesEmployee(
        { employee_id: 99, name: 'Other Person', log_type: '출근' },
        target
      )
    ).toBe(false)
  })
})
