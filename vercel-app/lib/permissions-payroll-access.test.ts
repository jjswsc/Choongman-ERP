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
    expect(canAccessAdminPayroll('manager', 'choongman')).toBe(false)
    expect(canAccessAdminPayroll('Manager', 'choongman')).toBe(false)
    expect(canAccessAdminPayroll('franchisee', 'choongman')).toBe(false)
    expect(canAccessAdminPayroll('staff', 'choongman')).toBe(false)
  })

  it('allows Omni franchisee always', () => {
    expect(canAccessAdminPayroll('franchisee', 'omnifoodtech')).toBe(true)
    expect(canViewEmployeePayrollFields('franchisee', 'omnifoodtech')).toBe(true)
  })

  it('allows Omni manager only when store payroll flag is on', () => {
    expect(canAccessAdminPayroll('manager', 'omnifoodtech')).toBe(false)
    expect(canAccessAdminPayroll('manager', 'omnifoodtech', { canViewStorePayroll: false })).toBe(
      false
    )
    expect(canAccessAdminPayroll('manager', 'omnifoodtech', { canViewStorePayroll: true })).toBe(
      true
    )
    expect(
      canViewEmployeePayrollFields('manager', 'omnifoodtech', { canViewStorePayroll: true })
    ).toBe(true)
  })

  it('does not treat Omni manager as automatic Officer for payroll', () => {
    expect(canAccessAdminPayroll('manager', 'omnifoodtech')).toBe(false)
  })
})

describe('canManagerAccessPath payroll', () => {
  it('blocks manager path /admin/payroll on Choongman', () => {
    expect(canManagerAccessPath('/admin/payroll', 'choongman', { role: 'manager' })).toBe(false)
    expect(canManagerAccessPath('/admin/payroll/', 'choongman', { role: 'franchisee' })).toBe(
      false
    )
    expect(canManagerAccessPath('/admin/employees')).toBe(true)
  })

  it('allows Omni franchisee payroll path', () => {
    expect(
      canManagerAccessPath('/admin/payroll', 'omnifoodtech', { role: 'franchisee' })
    ).toBe(true)
  })

  it('allows Omni manager payroll path only with flag', () => {
    expect(canManagerAccessPath('/admin/payroll', 'omnifoodtech', { role: 'manager' })).toBe(
      false
    )
    expect(
      canManagerAccessPath('/admin/payroll', 'omnifoodtech', {
        role: 'manager',
        canViewStorePayroll: true,
      })
    ).toBe(true)
  })
})
