import { describe, expect, it } from 'vitest'
import {
  canDeleteExpenseAccrual,
  canEditExpenseAccrualClassification,
  canEditExpenseAccrualPlan,
  canMutateExpenseAccrualRecord,
  isExpenseAccrualDeletableByPaymentState,
  shouldLockExpenseAccrualAmounts,
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
    expect(canEditExpenseAccrualClassification({ status: 'partial' })).toBe(true)
  })

  it('trims status before matching', () => {
    expect(canEditExpenseAccrualClassification({ status: ' paid ' })).toBe(true)
    expect(shouldLockExpenseAccrualAmounts({ status: ' paid ', paidAmount: 0 })).toBe(true)
  })
})

describe('shouldLockExpenseAccrualAmounts', () => {
  it('keeps planned/approved unpaid unlocked', () => {
    expect(shouldLockExpenseAccrualAmounts({ status: 'planned', paidAmount: 0 })).toBe(false)
    expect(shouldLockExpenseAccrualAmounts({ status: 'approved', paidAmount: 0 })).toBe(false)
  })

  it('locks paid, linked, or partially paid rows', () => {
    expect(shouldLockExpenseAccrualAmounts({ status: 'paid', paidAmount: 0 })).toBe(true)
    expect(shouldLockExpenseAccrualAmounts({ status: 'approved', paidAmount: 100 })).toBe(true)
    expect(
      shouldLockExpenseAccrualAmounts({ status: 'approved', paidAmount: 0, hasPaymentLink: true })
    ).toBe(true)
    expect(shouldLockExpenseAccrualAmounts({ status: 'partial', paidAmount: 0 })).toBe(true)
  })
})

describe('isExpenseAccrualDeletableByPaymentState', () => {
  it('allows planned, rejected, and unpaid approved', () => {
    expect(isExpenseAccrualDeletableByPaymentState({ status: 'planned', paidAmount: 0 })).toBe(true)
    expect(isExpenseAccrualDeletableByPaymentState({ status: 'rejected', paidAmount: 0 })).toBe(true)
    expect(isExpenseAccrualDeletableByPaymentState({ status: 'approved', paidAmount: 0 })).toBe(true)
  })

  it('allows paid/done/partial when there is no payment amount or bank/petty link', () => {
    expect(isExpenseAccrualDeletableByPaymentState({ status: 'done', paidAmount: 0 })).toBe(true)
    expect(isExpenseAccrualDeletableByPaymentState({ status: 'paid', paidAmount: 0 })).toBe(true)
    expect(isExpenseAccrualDeletableByPaymentState({ status: 'partial', paidAmount: 0 })).toBe(true)
  })

  it('blocks rows with payment amount or bank/petty link', () => {
    expect(isExpenseAccrualDeletableByPaymentState({ status: 'approved', paidAmount: 50 })).toBe(false)
    expect(isExpenseAccrualDeletableByPaymentState({ status: 'done', paidAmount: 50 })).toBe(false)
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

  it('blocks accounting on HQ-named accruals without office payroll flag', () => {
    expect(
      canDeleteExpenseAccrual({
        userRole: 'accounting',
        storeName: 'Office',
        status: 'planned',
        paidAmount: 0,
      })
    ).toBe(false)
    expect(
      canDeleteExpenseAccrual({
        userRole: 'accounting',
        storeName: 'CM Office',
        status: 'approved',
        paidAmount: 0,
      })
    ).toBe(false)
  })

  it('lets accounting with office payroll delete HQ-named unpaid accruals', () => {
    expect(
      canDeleteExpenseAccrual({
        userRole: 'accounting',
        storeName: 'Office',
        status: 'planned',
        paidAmount: 0,
        canManageOfficePayroll: true,
      })
    ).toBe(true)
    expect(
      canDeleteExpenseAccrual({
        userRole: 'accounting',
        storeName: 'CM Office',
        status: 'approved',
        paidAmount: 0,
        canManageOfficePayroll: true,
      })
    ).toBe(true)
  })

  it('still blocks office-payroll accounting on paid or linked HQ rows', () => {
    expect(
      canDeleteExpenseAccrual({
        userRole: 'accounting',
        storeName: 'CM Office',
        status: 'approved',
        paidAmount: 18125.13,
        canManageOfficePayroll: true,
      })
    ).toBe(false)
    expect(
      canDeleteExpenseAccrual({
        userRole: 'accounting',
        storeName: 'CM Office',
        status: 'approved',
        paidAmount: 0,
        hasPaymentLink: true,
        canManageOfficePayroll: true,
      })
    ).toBe(false)
  })

  it('does not let officer with office payroll delete HQ-named accruals', () => {
    expect(
      canDeleteExpenseAccrual({
        userRole: 'officer',
        storeName: 'CM Office',
        status: 'approved',
        paidAmount: 0,
        canManageOfficePayroll: true,
      })
    ).toBe(false)
  })

  it('lets director delete HQ-named accruals', () => {
    expect(
      canDeleteExpenseAccrual({
        userRole: 'director',
        storeName: 'CM Office',
        status: 'approved',
        paidAmount: 0,
      })
    ).toBe(true)
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
