import { describe, expect, it } from 'vitest'
import { assertPurchasePaymentViaExpenseOnly } from '@/lib/bank-purchase-payment-via-expense'

describe('bank-purchase-payment-via-expense shim', () => {
  it('allows bank category save (link required at posting time)', () => {
    expect(assertPurchasePaymentViaExpenseOnly('purchase_payment').ok).toBe(true)
    expect(assertPurchasePaymentViaExpenseOnly('expense').ok).toBe(true)
  })
})
