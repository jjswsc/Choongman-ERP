import { describe, expect, it } from 'vitest'
import {
  canManageOfficePayroll,
  filterPayrollRowsHidingOffice,
  filterStoresHidingOfficePayroll,
  isEmployeeOfficePayrollManagerFlag,
  isOfficePayrollStoreFilter,
} from './office-payroll-access'

describe('office-payroll-access', () => {
  it('parses DB flag', () => {
    expect(isEmployeeOfficePayrollManagerFlag(true)).toBe(true)
    expect(isEmployeeOfficePayrollManagerFlag('1')).toBe(true)
    expect(isEmployeeOfficePayrollManagerFlag(false)).toBe(false)
  })

  it('director always can manage office payroll', () => {
    expect(canManageOfficePayroll({ role: 'director' })).toBe(true)
    expect(canManageOfficePayroll({ role: 'ceo' })).toBe(true)
  })

  it('accounting without employee flag cannot manage office payroll', () => {
    expect(canManageOfficePayroll({ role: 'accounting' })).toBe(false)
    expect(canManageOfficePayroll({ role: 'accounting', canManageOfficePayroll: true })).toBe(true)
  })

  it('detects office store filter', () => {
    expect(isOfficePayrollStoreFilter('Office')).toBe(true)
    expect(isOfficePayrollStoreFilter('본사')).toBe(true)
    expect(isOfficePayrollStoreFilter('All')).toBe(false)
    expect(isOfficePayrollStoreFilter('CM Tower')).toBe(false)
  })

  it('filters stores and payroll rows', () => {
    const auth = { role: 'officer' }
    expect(filterStoresHidingOfficePayroll(['All', 'Office', 'CM Tower'], auth)).toEqual(['All', 'CM Tower'])
    expect(
      filterPayrollRowsHidingOffice(
        [
          { store: 'Office', name: 'A' },
          { store: 'CM Tower', name: 'B' },
        ],
        auth
      )
    ).toEqual([{ store: 'CM Tower', name: 'B' }])
  })
})
