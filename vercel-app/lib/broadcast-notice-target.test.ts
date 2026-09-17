import { describe, expect, it } from 'vitest'
import {
  employeeIsTargetedForRow,
  employeeReceivesBroadcast,
  findEmployeeContextFromRoster,
  noticeReadRowMatchesEmployee,
} from './broadcast-notice-target'

describe('employeeReceivesBroadcast store matching', () => {
  const emp = { store: 'CM The Street', name: 'Somchai', job: 'Staff', role: 'staff' }

  it('treats 전체 / All / ทั้งหมด as all stores', () => {
    expect(employeeReceivesBroadcast(emp, { target_store: '전체', target_role: '전체' })).toBe(true)
    expect(employeeReceivesBroadcast(emp, { target_store: 'All', target_role: '전체' })).toBe(true)
    expect(employeeReceivesBroadcast(emp, { target_store: 'ทั้งหมด', target_role: '전체' })).toBe(true)
  })

  it('matches The Street login alias against canonical CM The street', () => {
    expect(
      employeeReceivesBroadcast(emp, { target_store: 'CM The street', target_role: '전체' })
    ).toBe(true)
    expect(
      employeeReceivesBroadcast(
        { ...emp, store: 'CM The street' },
        { target_store: 'CM The Street', target_role: '전체' }
      )
    ).toBe(true)
  })

  it('does not match a different store', () => {
    expect(employeeReceivesBroadcast(emp, { target_store: 'CM Silom', target_role: '전체' })).toBe(
      false
    )
  })
})

describe('employeeIsTargetedForRow recipients', () => {
  it('matches store|name when store spelling differs by The Street alias', () => {
    expect(
      employeeIsTargetedForRow('CM The Street', 'Somchai', 'Staff', 'staff', {
        target_recipients: JSON.stringify(['CM The street|Somchai']),
      })
    ).toBe(true)
  })

  it('rejects a different employee on the same notice', () => {
    expect(
      employeeIsTargetedForRow('CM The Street', 'Somchai', 'Staff', 'staff', {
        target_recipients: JSON.stringify(['CM The street|Nok']),
      })
    ).toBe(false)
  })
})

describe('findEmployeeContextFromRoster', () => {
  it('resolves job/role when roster store uses a The Street alias', () => {
    const ctx = findEmployeeContextFromRoster(
      [{ store: 'CM The street', name: 'Somchai', job: 'Cashier', role: 'staff' }],
      'CM The Street',
      'Somchai'
    )
    expect(ctx.myJob).toBe('Cashier')
    expect(ctx.myRole).toBe('staff')
  })
})

describe('noticeReadRowMatchesEmployee', () => {
  it('treats The Street store spelling as the same reader', () => {
    expect(
      noticeReadRowMatchesEmployee('CM The street', 'Somchai', 'CM The Street', 'Somchai')
    ).toBe(true)
  })

  it('does not apply another store’s read to this employee', () => {
    expect(noticeReadRowMatchesEmployee('CM Silom', 'Somchai', 'CM The Street', 'Somchai')).toBe(
      false
    )
  })
})
