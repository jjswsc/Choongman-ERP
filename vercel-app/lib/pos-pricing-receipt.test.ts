import { describe, expect, it } from 'vitest'
import {
  resolveReceiptSubtotalPrintAmount,
  resolveTaxInvoiceSubtotalBeforeVatForPrint,
} from '@/lib/pos-pricing'

describe('resolveTaxInvoiceSubtotalBeforeVatForPrint', () => {
  it('returns total minus VAT for VAT-inclusive totals', () => {
    expect(resolveTaxInvoiceSubtotalBeforeVatForPrint(2690, 175.98)).toBe(2514.02)
  })

  it('returns null when VAT is zero', () => {
    expect(resolveTaxInvoiceSubtotalBeforeVatForPrint(2690, 0)).toBeNull()
  })
})

describe('resolveReceiptSubtotalPrintAmount', () => {
  it('shows exclusive subtotal for VAT-included pricing without discount', () => {
    expect(
      resolveReceiptSubtotalPrintAmount({
        subtotal: 2690,
        discountAmt: 0,
        vatFeeMode: 'included',
        receiptExclusiveSubtotalDisplay: 2514,
        receiptTaxableGrossForDisplay: 2690,
      })
    ).toBe(2514)
  })

  it('keeps item subtotal when delivery fee is shown separately', () => {
    expect(
      resolveReceiptSubtotalPrintAmount({
        subtotal: 2500,
        deliveryFee: 100,
        discountAmt: 0,
        vatFeeMode: 'included',
        receiptExclusiveSubtotalDisplay: 2430,
        receiptTaxableGrossForDisplay: 2600,
      })
    ).toBe(2500)
  })
})
