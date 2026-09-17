import { describe, expect, it } from 'vitest'
import {
  buildEmployeeListCsvRows,
  employeeListAgeYears,
  employeeListGradeCell,
  employeeListSalaryCell,
} from '@/lib/employee-list-csv'

const t = (k: string) =>
  (
    ({
      emp_label_store: 'Store',
      emp_grade: 'Grade',
      emp_label_name: 'Name',
      emp_label_nickname: 'Nickname',
      emp_label_employee_code: 'Employee code',
      emp_label_job: 'Job',
      emp_label_nation: 'Nationality',
      emp_col_age: 'Age',
      emp_label_role: 'Role',
      emp_label_join_date: 'Join date',
      emp_col_salary: 'Salary',
      emp_sal_monthly: 'Monthly',
    }) as Record<string, string>
  )[k] || k

describe('employeeListAgeYears', () => {
  it('uses calendar year difference like the employee table', () => {
    expect(employeeListAgeYears('1990-01-15', 2026)).toBe('36')
    expect(employeeListAgeYears('', 2026)).toBe('')
  })
})

describe('employeeListGradeCell', () => {
  it('shows staff grade only', () => {
    expect(employeeListGradeCell({ finalGrade: 'B', role: 'Staff' })).toBe('B')
  })

  it('joins manager eval grade when present', () => {
    expect(
      employeeListGradeCell({ finalGrade: 'B', managerGrade: 'A', role: 'Manager' })
    ).toBe('B / A')
  })
})

describe('employeeListSalaryCell', () => {
  it('combines amount and type', () => {
    expect(employeeListSalaryCell({ salAmt: 15000, salType: 'Monthly' }, t)).toBe('15000 Monthly')
  })
})

describe('buildEmployeeListCsvRows', () => {
  it('matches on-screen list columns without manage actions', () => {
    const { headers, data } = buildEmployeeListCsvRows(
      [
        {
          store: '1001',
          name: 'Parin Promvihan',
          nameTitle: 'Mr.',
          nick: 'Ki',
          employeeCode: 'ST101',
          job: 'Service',
          nation: '',
          birth: '2000-01-01',
          role: 'Staff',
          join: '2026-01-10',
          salAmt: 15000,
          salType: 'Monthly',
          finalGrade: '',
        },
      ],
      t,
      { asOfYear: 2026 }
    )
    expect(headers).toEqual([
      'Store',
      'Grade',
      'Name',
      'Nickname',
      'Employee code',
      'Job',
      'Nationality',
      'Age',
      'Role',
      'Join date',
      'Salary',
    ])
    expect(data[0]).toEqual([
      '1001',
      '',
      'Mr. Parin Promvihan',
      'Ki',
      'ST101',
      'Service',
      '',
      '26',
      'Staff',
      '2026-01-10',
      '15000 Monthly',
    ])
  })
})
