import { describe, expect, it } from 'vitest'
import {
  canApproveLeaveForStore,
  canApproveLeaveLegacy,
  canEditLeaveApprovers,
  isLeaveGlobalApprover,
  isLeaveStoreApprover,
  leaveStoreInListScope,
  resolveLeaveApprovalListScope,
  storeHasLeaveApprovers,
  type LeaveApproverRow,
} from './leave-approval-access'

const rows: LeaveApproverRow[] = [
  { employeeId: 10, scope: 'all', store: null },
  { employeeId: 20, scope: 'store', store: 'CM Tower' },
  { employeeId: 21, scope: 'store', store: 'CM Tower' },
  { employeeId: 30, scope: 'store', store: 'Office' },
]

describe('leave-approval-access', () => {
  it('canEditLeaveApprovers: director / native office / office store', () => {
    expect(canEditLeaveApprovers({ role: 'director' })).toBe(true)
    expect(canEditLeaveApprovers({ role: 'officer' })).toBe(true)
    expect(canEditLeaveApprovers({ role: 'staff', store: 'Office' })).toBe(true)
    expect(canEditLeaveApprovers({ role: 'manager', store: 'CM Tower' })).toBe(false)
  })

  it('detects global / store approvers', () => {
    expect(isLeaveGlobalApprover(10, rows)).toBe(true)
    expect(isLeaveGlobalApprover(20, rows)).toBe(false)
    expect(storeHasLeaveApprovers('CM Tower', rows)).toBe(true)
    expect(storeHasLeaveApprovers('CM Rama2', rows)).toBe(false)
    expect(isLeaveStoreApprover(20, 'CM Tower', rows)).toBe(true)
    expect(isLeaveStoreApprover(20, 'Office', rows)).toBe(false)
  })

  it('director always can approve', () => {
    expect(canApproveLeaveForStore({ role: 'director', employeeId: 99 }, 'CM Tower', rows)).toBe(
      true
    )
  })

  it('global approver can approve any store', () => {
    expect(
      canApproveLeaveForStore({ role: 'staff', employeeId: 10 }, 'CM Rama2', rows)
    ).toBe(true)
  })

  it('configured store: only listed employees', () => {
    expect(
      canApproveLeaveForStore(
        { role: 'manager', store: 'CM Tower', employeeId: 20, allowedStores: ['CM Tower'] },
        'CM Tower',
        rows
      )
    ).toBe(true)
    expect(
      canApproveLeaveForStore(
        { role: 'manager', store: 'CM Tower', employeeId: 99, allowedStores: ['CM Tower'] },
        'CM Tower',
        rows
      )
    ).toBe(false)
  })

  it('unconfigured store: legacy manager allowedStores', () => {
    expect(
      canApproveLeaveForStore(
        { role: 'manager', store: 'CM Rama2', employeeId: 50, allowedStores: ['CM Rama2'] },
        'CM Rama2',
        rows
      )
    ).toBe(true)
    expect(
      canApproveLeaveForStore(
        { role: 'manager', store: 'CM Tower', employeeId: 50, allowedStores: ['CM Tower'] },
        'CM Rama2',
        rows
      )
    ).toBe(false)
  })

  it('unconfigured store: non-manager (office) can approve', () => {
    expect(canApproveLeaveLegacy({ role: 'officer', store: 'Office' }, 'CM Rama2')).toBe(true)
    expect(
      canApproveLeaveForStore({ role: 'officer', store: 'Office', employeeId: 1 }, 'CM Rama2', rows)
    ).toBe(true)
  })

  it('resolveLeaveApprovalListScope: global → all', () => {
    expect(
      resolveLeaveApprovalListScope({ role: 'staff', employeeId: 10 }, rows, [
        'CM Tower',
        'CM Rama2',
      ])
    ).toEqual({ mode: 'all' })
  })

  it('resolveLeaveApprovalListScope: store approver + unconfigured legacy', () => {
    const scope = resolveLeaveApprovalListScope(
      { role: 'manager', store: 'CM Tower', employeeId: 20, allowedStores: ['CM Tower'] },
      rows,
      ['CM Tower', 'CM Rama2']
    )
    expect(scope.mode).toBe('stores')
    if (scope.mode === 'stores') {
      expect(scope.stores).toContain('CM Tower')
      // CM Tower is configured — manager not on list wouldn't get it; eid 20 is on list
      // CM Rama2 unconfigured — manager's allowedStores does not include it
      expect(scope.stores).not.toContain('CM Rama2')
    }
  })

  it('resolveLeaveApprovalListScope: manager with unconfigured own store', () => {
    const scope = resolveLeaveApprovalListScope(
      { role: 'manager', store: 'CM Rama2', employeeId: 50, allowedStores: ['CM Rama2'] },
      rows,
      ['CM Tower', 'CM Rama2']
    )
    expect(scope.mode).toBe('stores')
    if (scope.mode === 'stores') {
      expect(scope.stores).toContain('CM Rama2')
      expect(scope.stores).not.toContain('CM Tower')
    }
  })

  it('leaveStoreInListScope', () => {
    expect(leaveStoreInListScope('CM Tower', { mode: 'all' })).toBe(true)
    expect(leaveStoreInListScope('CM Tower', { mode: 'none' })).toBe(false)
    expect(leaveStoreInListScope('CM Tower', { mode: 'stores', stores: ['CM Tower'] })).toBe(true)
  })
})
