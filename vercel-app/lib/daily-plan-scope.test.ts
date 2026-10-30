import { describe, expect, it } from 'vitest'
import type { JwtPayload } from '@/lib/jwt-auth'
import {
  canAssignDailyPlan,
  canListDailyPlanCandidate,
  canViewDailyPlan,
  resolveDailyPlanScope,
} from '@/lib/daily-plan-scope'

function auth(partial: Partial<JwtPayload> & Pick<JwtPayload, 'store' | 'name' | 'role'>): JwtPayload {
  return partial
}

describe('resolveDailyPlanScope — store manager', () => {
  it('Silom Manager does not get office/all scope', () => {
    const scope = resolveDailyPlanScope(
      auth({
        store: 'CM Silom',
        name: 'Pimpakarn',
        role: 'manager',
        employeeId: 101,
        allowedStores: ['CM Silom', 'CM Office', 'CM Seacon Srinakarin'],
      })
    )
    expect(scope.storeLead).toBe(true)
    expect(scope.office).toBe(false)
    expect(scope.supervisor).toBe(false)
    expect(scope.all).toBe(false)
    expect(scope.stores).toEqual(['CM Silom'])
  })

  it('Manager at CM Office keeps office scope', () => {
    const scope = resolveDailyPlanScope(
      auth({ store: 'CM Office', name: 'HQ Mgr', role: 'manager', employeeId: 1 })
    )
    expect(scope.office).toBe(true)
    expect(scope.all).toBe(true)
  })
})

describe('canListDailyPlanCandidate — Silom Manager', () => {
  const scope = resolveDailyPlanScope(
    auth({ store: 'CM Silom', name: 'Pimpakarn', role: 'manager', employeeId: 101 })
  )

  it('hides Office supervisors and other-store staff', () => {
    expect(
      canListDailyPlanCandidate(scope, { role: 'supervisor', store: 'CM Office', employeeId: 1 })
    ).toBe(false)
    expect(
      canListDailyPlanCandidate(scope, {
        role: 'staff',
        store: 'CM Seacon Srinakarin',
        employeeId: 2,
      })
    ).toBe(false)
  })

  it('shows Silom staff and self', () => {
    expect(
      canListDailyPlanCandidate(scope, { role: 'staff', store: 'CM Silom', employeeId: 50 })
    ).toBe(true)
    expect(
      canListDailyPlanCandidate(scope, { role: 'manager', store: 'CM Silom', employeeId: 101 })
    ).toBe(true)
  })

  it('does not list other Silom managers for assign (only staff + self)', () => {
    expect(
      canAssignDailyPlan(scope, { role: 'manager', store: 'CM Silom', employeeId: 102 })
    ).toBe(false)
  })
})

describe('canViewDailyPlan — Silom Manager', () => {
  const scope = resolveDailyPlanScope(
    auth({ store: 'CM Silom', name: 'Pimpakarn', role: 'manager', employeeId: 101 })
  )

  it('blocks Office and other-store plans', () => {
    expect(
      canViewDailyPlan(scope, {
        employee_id: 1,
        employee_name: 'SV',
        employee_store: 'CM Office',
        store_name: 'CM Office',
      })
    ).toBe(false)
    expect(
      canViewDailyPlan(scope, {
        employee_id: 2,
        employee_name: 'Staff',
        employee_store: 'CM Seacon Srinakarin',
        store_name: 'CM Seacon Srinakarin',
      })
    ).toBe(false)
  })

  it('allows Silom staff plan and own plan', () => {
    expect(
      canViewDailyPlan(scope, {
        employee_id: 50,
        employee_name: 'Staff',
        employee_store: 'CM Silom',
        store_name: 'CM Silom',
      })
    ).toBe(true)
    expect(
      canViewDailyPlan(scope, {
        employee_id: 101,
        employee_name: 'Pimpakarn',
        employee_store: 'CM Silom',
        store_name: 'CM Silom',
      })
    ).toBe(true)
  })
})
