import { describe, expect, it } from 'vitest'
import {
  canDeleteExpenseAccrual,
  canEditExpenseAccrualClassification,
  canEditExpenseAccrualPlan,
  canMutateExpenseAccrualRecord,
  isExpenseAccrualDeletableByPaymentState,
} from '@/lib/expense-accrual-approve-policy'

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

describe('canEditExpenseAccrualClassification', () => {
  it('allows classification edits after payment', () => {
    expect(canEditExpenseAccrualClassification({ status: 'paid' })).toBe(true)
    expect(canEditExpenseAccrualClassification({ status: 'done' })).toBe(true)
    expect(canEditExpenseAccrualClassification({ status: 'approved' })).toBe(true)
  })
})

describe('isExpenseAccrualDeletableByPaymentState', () => {
  it('allows planned, rejected, and unpaid approved', () => {
    expect(isExpenseAccrualDeletableByPaymentState({ status: 'planned', paidAmount: 0 })).toBe(true)
    expect(isExpenseAccrualDeletableByPaymentState({ status: 'rejected', paidAmount: 0 })).toBe(true)
    expect(isExpenseAccrualDeletableByPaymentState({ status: 'approved', paidAmount: 0 })).toBe(true)
  })

  it('blocks paid, partial, or linked rows', () => {
    expect(isExpenseAccrualDeletableByPaymentState({ status: 'approved', paidAmount: 50 })).toBe(false)
    expect(isExpenseAccrualDeletableByPaymentState({ status: 'partial', paidAmount: 0 })).toBe(false)
    expect(
      isExpenseAccrualDeletableByPaymentState({ status: 'approved', paidAmount: 0, hasPaymentLink: true })
    ).toBe(false)
  })

  it('allows no-store cleanup rows', () => {
    expect(isExpenseAccrualDeletableByPaymentState({ status: 'paid', isNoStore: true })).toBe(true)
  })
})

describe('canDeleteExpenseAccrual', () => {
  it('lets accounting delete store planned/approved unpaid rows', () => {
    expect(
      canDeleteExpenseAccrual({
        userRole: 'accounting',
        storeName: 'CM Silom',
        status: 'approved',
        paidAmount: 0,
      })
    ).toBe(true)
    expect(
      canDeleteExpenseAccrual({
        userRole: 'accounting',
        storeName: 'CM Silom',
        status: 'planned',
        paidAmount: 0,
      })
    ).toBe(true)
  })

  it('blocks accounting on HQ-named accruals', () => {
    expect(
      canDeleteExpenseAccrual({
        userRole: 'accounting',
        storeName: 'Office',
        status: 'planned',
        paidAmount: 0,
      })
    ).toBe(false)
  })

  it('lets accounting clean no-store rows', () => {
    expect(
      canDeleteExpenseAccrual({
        userRole: 'accounting',
        storeName: '',
        status: 'approved',
        paidAmount: 0,
      })
    ).toBe(true)
  })
})

describe('canMutateExpenseAccrualRecord', () => {
  it('allows office and accounting', () => {
    expect(canMutateExpenseAccrualRecord('officer')).toBe(true)
    expect(canMutateExpenseAccrualRecord('accounting')).toBe(true)
    expect(canMutateExpenseAccrualRecord('manager')).toBe(false)
  })
})
