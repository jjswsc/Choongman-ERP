import { describe, expect, it } from 'vitest'
import { auditOfficePayrollManagers } from './office-payroll-manager-audit'

describe('auditOfficePayrollManagers', () => {
  it('lists flagged active managers and duplicate-name risk', () => {
    const result = auditOfficePayrollManagers([
      {
        id: 1,
        employee_code: 'MO011',
        name: 'Nutthakan Chantongtip',
        store: 'Office',
        role: 'Accounting',
        can_manage_office_payroll: true,
      },
      {
        id: 2,
        employee_code: 'AB001',
        name: 'Nutthakan Chantongtip',
        store: 'CM Tower',
        role: 'Staff',
        can_manage_office_payroll: false,
      },
      {
        id: 3,
        employee_code: 'DR001',
        name: 'Director Kim',
        store: 'Office',
        role: 'Director',
        can_manage_office_payroll: false,
      },
      {
        id: 4,
        employee_code: 'MO099',
        name: 'Old Manager',
        store: 'Office',
        role: 'Officer',
        resign_date: '2020-01-01',
        employment_status: 'resigned',
        can_manage_office_payroll: true,
      },
    ])

    expect(result.summary.totalFlagged).toBe(2)
    expect(result.summary.activeFlagged).toBe(1)
    expect(result.summary.resignedButFlagged).toBe(1)
    expect(result.summary.duplicateNameRisk).toBe(1)
    expect(result.managers.find((m) => m.employeeCode === 'MO011')?.needsSessionRefresh).toBe(true)
    expect(result.managers.find((m) => m.employeeCode === 'MO011')?.risks).toContain(
      'duplicate_name_login_risk'
    )
  })
})
