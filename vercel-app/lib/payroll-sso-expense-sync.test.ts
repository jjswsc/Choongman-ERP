import { describe, expect, it } from 'vitest'
import {
  aggregateSsoRemittanceByStore,
  ssoRemittanceBahtFromEmployeeContribution,
} from './payroll-sso-expense-sync-calc'

describe('ssoRemittanceBahtFromEmployeeContribution', () => {
  it('doubles employee contribution for employer match', () => {
    expect(ssoRemittanceBahtFromEmployeeContribution(850)).toBe(1700)
    expect(ssoRemittanceBahtFromEmployeeContribution(0)).toBe(0)
  })
})

describe('aggregateSsoRemittanceByStore', () => {
  it('sums by store', () => {
    const m = aggregateSsoRemittanceByStore([
      { store: 'A', sso: 100 },
      { store: 'A', sso: 50 },
      { store: 'B', sso: 200 },
    ])
    expect(m.get('A')).toEqual({ totalBaht: 300, employeeCount: 2 })
    expect(m.get('B')).toEqual({ totalBaht: 400, employeeCount: 1 })
  })
})
