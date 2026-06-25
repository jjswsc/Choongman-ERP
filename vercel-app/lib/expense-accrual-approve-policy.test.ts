import { describe, expect, it } from 'vitest'
import { canEditExpenseAccrualPlan } from '@/lib/expense-accrual-approve-policy'

describe('canEditExpenseAccrualPlan', () => {
  it('allows planned, approved, and rejected when unpaid', () => {
    expect(canEditExpenseAccrualPlan({ status: 'planned', paidAmount: 0 })).toBe(true)
    expect(canEditExpenseAccrualPlan({ status: 'approved', paidAmount: 0 })).toBe(true)
    expect(canEditExpenseAccrualPlan({ status: 'rejected', paidAmount: 0 })).toBe(true)
  })

  it('blocks paid or partially paid rows', () => {
    expect(canEditExpenseAccrualPlan({ status: 'approved', paidAmount: 100 })).toBe(false)
    expect(canEditExpenseAccrualPlan({ status: 'paid', paidAmount: 0 })).toBe(false)
    expect(canEditExpenseAccrualPlan({ status: 'done', paidAmount: 0 })).toBe(false)
  })
})
