import { describe, expect, it } from 'vitest'
import {
  assertPurchasePaymentViaExpenseOnly,
  isDirectBankPurchasePaymentCategory,
} from '@/lib/bank-purchase-payment-via-expense'

describe('bank-purchase-payment-via-expense', () => {
  it('detects purchase bank categories', () => {
    expect(isDirectBankPurchasePaymentCategory('purchase_payment')).toBe(true)
    expect(isDirectBankPurchasePaymentCategory('purchase_advance')).toBe(true)
    expect(isDirectBankPurchasePaymentCategory('expense')).toBe(false)
  })

  it('blocks direct bank purchase payment', () => {
    const blocked = assertPurchasePaymentViaExpenseOnly('purchase_payment')
    expect(blocked.ok).toBe(false)
    expect(assertPurchasePaymentViaExpenseOnly('transfer').ok).toBe(true)
  })
})
