import { describe, expect, it } from 'vitest'
import { purchaseWhtFromGrossInvoice, suggestPurchaseWhtFromNetPayment } from './purchase-payment-wht'

describe('suggestPurchaseWhtFromNetPayment', () => {
  it('reverses 3% WHT on the ex-VAT base from the bank net', () => {
    expect(suggestPurchaseWhtFromNetPayment(101920)).toBe(2940)
    expect(suggestPurchaseWhtFromNetPayment(18720)).toBe(540)
    expect(suggestPurchaseWhtFromNetPayment(72690.8)).toBe(2096.85)
  })

  it('returns 0 when the rate is missing', () => {
    expect(suggestPurchaseWhtFromNetPayment(101920, 0)).toBe(0)
  })
})

describe('purchaseWhtFromGrossInvoice', () => {
  it('uses 3% of the amount before 7% VAT', () => {
    expect(purchaseWhtFromGrossInvoice(104860)).toBe(2940)
    expect(purchaseWhtFromGrossInvoice(19260)).toBe(540)
    expect(purchaseWhtFromGrossInvoice(74787.65)).toBe(2096.85)
  })
})
