import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EMPLOYEE_JOB_CATALOG,
  getEmployeeJobOptionLabel,
  mergeMissingCoreEmployeeJobs,
  normalizeEmployeeJobCatalog,
} from '@/lib/employee-job-catalog'
import { resolveAuthRoleFromEmployeeRoleColumn } from '@/lib/permissions'

describe('employee job catalog', () => {
  it('default catalog includes Franchise', () => {
    expect(DEFAULT_EMPLOYEE_JOB_CATALOG).toContain('Franchise')
  })

  it('mergeMissingCoreEmployeeJobs appends Franchise to saved catalog', () => {
    expect(mergeMissingCoreEmployeeJobs(['Service', 'Kitchen'])).toEqual([
      'Service',
      'Kitchen',
      'Franchise',
    ])
  })

  it('normalizeEmployeeJobCatalog keeps custom jobs', () => {
    expect(normalizeEmployeeJobCatalog(['HR', 'Barista'])).toEqual(['HR', 'Barista'])
  })

  it('getEmployeeJobOptionLabel returns English canonical names', () => {
    expect(getEmployeeJobOptionLabel('kitchen')).toBe('Kitchen')
    expect(getEmployeeJobOptionLabel('Franchise')).toBe('Franchise')
    expect(getEmployeeJobOptionLabel('Barista')).toBe('Barista')
    expect(getEmployeeJobOptionLabel('기타')).toBe('Other')
  })
})

describe('resolveAuthRoleFromEmployeeRoleColumn', () => {
  it('Franchisee role wins over Director job (handled at login via role column first)', () => {
    expect(resolveAuthRoleFromEmployeeRoleColumn('Franchisee')).toBe('franchisee')
  })

  it('Staff role returns null so job can elevate to officer', () => {
    expect(resolveAuthRoleFromEmployeeRoleColumn('Staff')).toBe(null)
  })
})
