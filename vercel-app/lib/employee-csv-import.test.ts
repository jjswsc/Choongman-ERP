import { describe, expect, it } from 'vitest'
import { parseEmployeeCsv, parseEmployeeCsvDate, planEmployeeCsvMerge } from '@/lib/employee-csv-import'
import { pickNextEmployeeCode } from '@/lib/employee-code'

const LIST_CSV = [
  'Store,Grade,Name,Nickname,Employee code,Job,Nationality,Age,Role,Join Date,Salary',
  '1001,,Mr. Bangk Flood,,ST008,Service,,,Staff,,15000 Monthly',
  '1001,,Mr. Omni IO,,ST006,Kitchen,,,Staff,2026-01-10,15000 Monthly',
].join('\n')

describe('parseEmployeeCsv', () => {
  it('reads the on-screen export headers, including Employee code and combined salary', () => {
    const { rows, error } = parseEmployeeCsv(LIST_CSV)
    expect(error).toBeNull()
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      store: '1001',
      name: 'Bangk Flood',
      nameTitle: 'Mr.',
      employeeCode: 'ST008',
      employeeCodeInvalid: false,
      job: 'Service',
      role: 'Staff',
      salAmt: 15000,
      salType: 'Monthly',
      birth: null,
      joinDate: null,
      password: null,
    })
    expect(rows[1].joinDate).toBe('2026-01-10')
    expect(rows[1].employeeCode).toBe('ST006')
  })

  it('reads a short Employee header', () => {
    const { rows, error } = parseEmployeeCsv('Store,Name,Employee\n1001,Mr. Bangk Flood,ST008\n')
    expect(error).toBeNull()
    expect(rows[0].employeeCode).toBe('ST008')
    expect(rows[0].name).toBe('Bangk Flood')
  })

  it('still reads database column names', () => {
    const { rows, error } = parseEmployeeCsv('store,name,employee_code,password\n1001,Somchai,ST001,1234\n')
    expect(error).toBeNull()
    expect(rows[0]).toMatchObject({
      name: 'Somchai',
      employeeCode: 'ST001',
      password: '1234',
    })
  })

  it('flags a code that is not 2 letters + 3 digits', () => {
    const { rows } = parseEmployeeCsv('Store,Name,Employee code\n1001,admin,admin\n')
    expect(rows[0].employeeCode).toBe('')
    expect(rows[0].employeeCodeInvalid).toBe(true)
  })
})

describe('parseEmployeeCsvDate', () => {
  it('accepts the ISO date written by CSV export', () => {
    expect(parseEmployeeCsvDate('2026-01-10')).toBe('2026-01-10')
    expect(parseEmployeeCsvDate('1/15/2026')).toBe('2026-01-15')
  })
})

describe('planEmployeeCsvMerge', () => {
  it('fills a missing employee code and does not touch PIN or people absent from the file', () => {
    const { rows } = parseEmployeeCsv(LIST_CSV)
    const plan = planEmployeeCsvMerge(rows, [
      {
        id: 10,
        store: '1001',
        name: 'Bangk Flood',
        nameTitle: 'Mr.',
        employeeCode: '',
        role: 'Staff',
        deleted: false,
      },
      {
        id: 11,
        store: '1001',
        name: 'Kept Person',
        nameTitle: '',
        employeeCode: 'ST001',
        role: 'Staff',
        deleted: false,
      },
    ])
    expect(plan.inserts.map((r) => r.name)).toEqual(['Omni IO'])
    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0].id).toBe(10)
    expect(plan.updates[0].patch.employee_code).toBe('ST008')
    expect(plan.updates[0].patch).not.toHaveProperty('password')
    expect(plan.updates[0].patch).not.toHaveProperty('birth')
    expect(plan.inserts[0].employee_code).toBe('ST006')
    expect(plan.inserts[0].password).toBe('')
  })

  it('does not replace an existing code or password when the file repeats the person', () => {
    const { rows } = parseEmployeeCsv(
      'Store,Name,Employee code,Job,Role\n1001,Mr. Bangk Flood,ST008,Service,Staff\n'
    )
    const plan = planEmployeeCsvMerge(rows, [
      {
        id: 10,
        store: '1001',
        name: 'Bangk Flood',
        nameTitle: 'Mr.',
        employeeCode: 'ST008',
        role: 'Staff',
        deleted: false,
      },
    ])
    expect(plan.inserts).toHaveLength(0)
    expect(plan.updates[0].patch.employee_code).toBe('ST008')
    expect(plan.updates[0].patch).not.toHaveProperty('password')
  })
})

describe('pickNextEmployeeCode', () => {
  it('continues the store prefix already in use', () => {
    expect(
      pickNextEmployeeCode('1001', [
        { store: '1001', employee_code: 'ST006' },
        { store: '1001', employee_code: 'ST008' },
      ])
    ).toBe('ST001')
  })
})
