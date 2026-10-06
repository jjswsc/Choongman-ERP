import { describe, expect, it } from 'vitest'
import { bankExpenseInPlPeriod, buildBankWithdrawPlPeriodOrFilter } from '@/lib/accounting-reports'

describe('buildBankWithdrawPlPeriodOrFilter', () => {
  it('ORs trans_date and expense_date month bounds', () => {
    expect(buildBankWithdrawPlPeriodOrFilter('2026-06-01', '2026-06-30')).toBe(
      'or=(and(trans_date.gte.2026-06-01,trans_date.lte.2026-06-30),and(expense_date.gte.2026-06-01,expense_date.lte.2026-06-30))'
    )
  })
})

describe('bankExpenseInPlPeriod', () => {
  it('uses recognition date when set, even if the withdrawal is another month', () => {
    expect(bankExpenseInPlPeriod('2026-09-02', '2026-08-17', '2026-08-01', '2026-08-31')).toBe(true)
    expect(bankExpenseInPlPeriod('2026-09-02', '2026-08-17', '2026-09-01', '2026-09-30')).toBe(false)
  })

  it('uses withdrawal date when recognition date is empty', () => {
    expect(bankExpenseInPlPeriod('2026-08-02', null, '2026-08-01', '2026-08-31')).toBe(true)
    expect(bankExpenseInPlPeriod('2026-08-02', null, '2026-09-01', '2026-09-30')).toBe(false)
  })
})
