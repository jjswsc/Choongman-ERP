import { describe, expect, it } from 'vitest'
import { buildBankWithdrawPlPeriodOrFilter } from '@/lib/accounting-reports'

describe('buildBankWithdrawPlPeriodOrFilter', () => {
  it('ORs trans_date and expense_date month bounds', () => {
    expect(buildBankWithdrawPlPeriodOrFilter('2026-06-01', '2026-06-30')).toBe(
      'or=(and(trans_date.gte.2026-06-01,trans_date.lte.2026-06-30),and(expense_date.gte.2026-06-01,expense_date.lte.2026-06-30))'
    )
  })
})
