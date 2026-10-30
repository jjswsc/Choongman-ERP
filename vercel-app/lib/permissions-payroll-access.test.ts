import { describe, expect, it } from 'vitest'
import {
  canAccessAdminPayroll,
  canManagerAccessPath,
  canViewEmployeePayrollFields,
} from '@/lib/permissions'

describe('canAccessAdminPayroll', () => {
  it('allows office, accounting, and supervisor', () => {
    expect(canAccessAdminPayroll('director')).toBe(true)
    expect(canAccessAdminPayroll('officer')).toBe(true)
    expect(canAccessAdminPayroll('accounting')).toBe(true)
    expect(canAccessAdminPayroll('회계')).toBe(true)
    expect(canAccessAdminPayroll('supervisor')).toBe(true)
    expect(canAccessAdminPayroll('Supervisor')).toBe(true)
  })

  it('denies store manager and franchisee on Choongman', () => {
    expect(canAccessAdminPayroll('manager')).toBe(false)
    expect(canAccessAdminPayroll('Manager')).toBe(false)
    expect(canAccessAdminPayroll('franchisee')).toBe(false)
    expect(canAccessAdminPayroll('staff')).toBe(false)
  })

  it('allows Omni manager via Officer equivalence', () => {
    expect(canAccessAdminPayroll('manager', 'omnifoodtech')).toBe(true)
    expect(canViewEmployeePayrollFields('manager', 'omnifoodtech')).toBe(true)
  })

  it('blocks manager path /admin/payroll', () => {
    expect(canManagerAccessPath('/admin/payroll')).toBe(false)
    expect(canManagerAccessPath('/admin/payroll/')).toBe(false)
    expect(canManagerAccessPath('/admin/employees')).toBe(true)
  })
})
