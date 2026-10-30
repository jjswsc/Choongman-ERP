import { describe, expect, it } from 'vitest'
import { canManagePosTillCash, isPosTillCashStoreScoped } from '@/lib/permissions'

describe('canManagePosTillCash', () => {
  it('allows staff and settlement roles so Manager accounts need not be shared', () => {
    expect(canManagePosTillCash('staff')).toBe(true)
    expect(canManagePosTillCash('Staff')).toBe(true)
    expect(canManagePosTillCash('pos_staff')).toBe(true)
    expect(canManagePosTillCash('pos_settlement')).toBe(true)
    expect(canManagePosTillCash('manager')).toBe(true)
    expect(canManagePosTillCash('franchisee')).toBe(true)
    expect(canManagePosTillCash('officer')).toBe(true)
    expect(canManagePosTillCash('accounting')).toBe(true)
    expect(canManagePosTillCash('supervisor')).toBe(true)
  })

  it('scopes store staff but not HQ/accounting/SV', () => {
    expect(isPosTillCashStoreScoped('staff')).toBe(true)
    expect(isPosTillCashStoreScoped('manager')).toBe(true)
    expect(isPosTillCashStoreScoped('officer')).toBe(false)
    expect(isPosTillCashStoreScoped('accounting')).toBe(false)
    expect(isPosTillCashStoreScoped('supervisor')).toBe(false)
  })
})
