import { describe, expect, it } from 'vitest'
import {
  computePosPricing,
  resolveReceiptSubtotalPrintAmount,
  resolveTaxInvoiceReceiptVatBreakdown,
  resolveTaxInvoiceSubtotalBeforeVatForPrint,
  splitThaiVatInclusiveGrossForReceipt,
} from '@/lib/pos-pricing'

describe('resolveTaxInvoiceSubtotalBeforeVatForPrint', () => {
  it('returns total minus VAT for VAT-inclusive totals', () => {
    expect(resolveTaxInvoiceSubtotalBeforeVatForPrint(2690, 175.98)).toBe(2514.02)
  })

  it('returns null when VAT is zero', () => {
    expect(resolveTaxInvoiceSubtotalBeforeVatForPrint(2690, 0)).toBeNull()
  })
})

describe('resolveTaxInvoiceReceiptVatBreakdown', () => {
  it('uses existing VAT when present on receipt data', () => {
    expect(
      resolveTaxInvoiceReceiptVatBreakdown({
        total: 2690,
        vatFeeAmt: 175.98,
      })
    ).toEqual({ subtotalBeforeVat: 2514.02, vat: 175.98 })
  })

  it('derives 7% VAT from inclusive total when receipt has no VAT line', () => {
    expect(
      resolveTaxInvoiceReceiptVatBreakdown({
        total: 2590,
      })
    ).toEqual({ subtotalBeforeVat: 2420.56, vat: 169.44 })
  })
})

describe('splitThaiVatInclusiveGrossForReceipt', () => {
  it('splits gross into exclusive and VAT at 7%', () => {
    expect(splitThaiVatInclusiveGrossForReceipt(2590)).toEqual({
      exclusive: 2420.56,
      vat: 169.44,
    })
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

describe('computePosPricing payment total rounding', () => {
  it('rounds fractional final total to whole baht (KTC 10% collab case)', () => {
    const pricing = computePosPricing({
      subtotal: 1071,
      discountAmt: 101.01,
      adjustments: { vatRate: 7, vatMode: 'included' },
    })
    expect(pricing.baseTotal).toBe(969.99)
    expect(pricing.finalTotal).toBe(970)
    expect(pricing.receiptVatDisplayAmt).toBe(63)
    expect(pricing.receiptExclusiveSubtotalDisplay).toBe(907)
  })

  it('keeps whole baht total unchanged', () => {
    const pricing = computePosPricing({
      subtotal: 1071,
      discountAmt: 101,
      adjustments: { vatRate: 7, vatMode: 'included' },
    })
    expect(pricing.finalTotal).toBe(970)
  })

  it('skips rounding when roundPaymentTotalToWholeBaht is false', () => {
    const pricing = computePosPricing({
      subtotal: 1071,
      discountAmt: 101.01,
      adjustments: { vatRate: 7, vatMode: 'included', roundPaymentTotalToWholeBaht: false },
    })
    expect(pricing.finalTotal).toBe(969.99)
  })
})
