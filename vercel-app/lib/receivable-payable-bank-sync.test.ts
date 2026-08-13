import { describe, expect, it } from 'vitest'
import {
  pickPayablePaymentKeeperId,
  payablePaymentIdsToDeleteForBankDedupe,
  payablePatchFromBankPurchasePayment,
} from './receivable-payable'

describe('pickPayablePaymentKeeperId', () => {
  it('prefers expense_accrual linked row over legacy duplicate', () => {
    expect(
      pickPayablePaymentKeeperId([
        { id: 10, expense_accrual_id: null },
        { id: 12, expense_accrual_id: 99 },
        { id: 11, expense_accrual_id: null },
      ])
    ).toBe(12)
  })

  it('keeps newest id when no accrual link', () => {
    expect(
      pickPayablePaymentKeeperId([
        { id: 5, expense_accrual_id: null },
        { id: 8, expense_accrual_id: null },
      ])
    ).toBe(8)
  })

  it('returns null for empty input', () => {
    expect(pickPayablePaymentKeeperId([])).toBeNull()
  })

  it('prefers higher id among accrual-linked duplicates', () => {
    expect(
      pickPayablePaymentKeeperId([
        { id: 100, expense_accrual_id: 50 },
        { id: 101, expense_accrual_id: 50 },
      ])
    ).toBe(101)
  })
})

describe('payablePaymentIdsToDeleteForBankDedupe', () => {
  it('keeps two payment plans on the same bank transfer', () => {
    expect(
      payablePaymentIdsToDeleteForBankDedupe([
        { id: 5442, expense_accrual_id: 2487 },
        { id: 5441, expense_accrual_id: 2488 },
      ])
    ).toEqual([])
  })

  it('drops duplicate payments for the same plan', () => {
    expect(
      payablePaymentIdsToDeleteForBankDedupe([
        { id: 10, expense_accrual_id: 50 },
        { id: 11, expense_accrual_id: 50 },
      ])
    ).toEqual([10])
  })

  it('drops legacy bank-only payment when a plan is already linked', () => {
    expect(
      payablePaymentIdsToDeleteForBankDedupe([
        { id: 10, expense_accrual_id: null },
        { id: 12, expense_accrual_id: 99 },
      ])
    ).toEqual([10])
  })
})

describe('payablePatchFromBankPurchasePayment', () => {
  it('overwrites amount when a single payment is linked', () => {
    expect(
      payablePatchFromBankPurchasePayment({
        vendorCode: 'MEA',
        transDate: '2026-08-13',
        memo: 'electric',
        amountAbs: 10000,
        linkedPaymentCount: 1,
      }).amount
    ).toBe(-10000)
  })

  it('does not overwrite amounts when two invoices share one transfer', () => {
    expect(
      payablePatchFromBankPurchasePayment({
        vendorCode: 'MEA',
        transDate: '2026-08-13',
        memo: 'electric',
        amountAbs: 10000,
        linkedPaymentCount: 2,
      }).amount
    ).toBeUndefined()
  })
})
