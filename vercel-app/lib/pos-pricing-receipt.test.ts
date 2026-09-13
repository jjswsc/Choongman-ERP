import { describe, expect, it } from 'vitest'
import {
  computePosPricing,
  isPosPaymentTotalRoundingGap,
  resolveReceiptSubtotalPrintAmount,
  resolveReceiptVatPrintAmount,
  resolveTaxInvoiceReceiptVatBreakdown,
  resolveTaxInvoiceSubtotalBeforeVatForPrint,
  roundSplitPaymentDuesToWholeBaht,
  splitThaiVatInclusiveGrossForReceipt,
} from '@/lib/pos-pricing'

describe('resolveReceiptVatPrintAmount', () => {
  it('uses vatFeeAmt when receiptVatDisplayAmt is coerced zero', () => {
    expect(
      resolveReceiptVatPrintAmount({
        vatFeeAmt: 7.7,
        receiptVatDisplayAmt: 0,
      })
    ).toBe(7.7)
  })

  it('prefers positive receiptVatDisplayAmt for included VAT', () => {
    expect(
      resolveReceiptVatPrintAmount({
        vatFeeAmt: 7,
        receiptVatDisplayAmt: 6.54,
      })
    ).toBe(6.54)
  })
})

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

describe('isPosPaymentTotalRoundingGap', () => {
  it('detects 310.30 → 310 as rounding, not a 0.30 discount', () => {
    expect(isPosPaymentTotalRoundingGap(310.3, 310)).toBe(true)
    expect(isPosPaymentTotalRoundingGap(117.7, 118)).toBe(true)
    expect(isPosPaymentTotalRoundingGap(117.7, 117)).toBe(true)
  })

  it('does not treat a real platform discount as rounding', () => {
    expect(isPosPaymentTotalRoundingGap(159, 129)).toBe(false)
    expect(isPosPaymentTotalRoundingGap(100, 77)).toBe(false)
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

  it('floor mode rounds down to whole baht', () => {
    const pricing = computePosPricing({
      subtotal: 100,
      adjustments: {
        vatRate: 7,
        vatMode: 'separate',
        serviceRate: 10,
        serviceMode: 'separate',
        feeStackMode: 'sequential',
        feeStackOrder: ['service', 'vat', 'other'],
        paymentTotalRoundingMode: 'floor',
      },
    })
    // 100+10+7.7 = 117.7 → floor 117
    expect(pricing.finalTotal).toBe(117)
  })

  it('none mode keeps decimals', () => {
    const pricing = computePosPricing({
      subtotal: 100,
      adjustments: {
        vatRate: 7,
        vatMode: 'separate',
        serviceRate: 10,
        serviceMode: 'separate',
        feeStackMode: 'sequential',
        feeStackOrder: ['service', 'vat', 'other'],
        paymentTotalRoundingMode: 'none',
      },
    })
    expect(pricing.finalTotal).toBe(117.7)
  })

  it('round mode matches Math.round (default)', () => {
    const pricing = computePosPricing({
      subtotal: 100,
      adjustments: {
        vatRate: 7,
        vatMode: 'separate',
        serviceRate: 10,
        serviceMode: 'separate',
        feeStackMode: 'sequential',
        feeStackOrder: ['service', 'vat', 'other'],
        paymentTotalRoundingMode: 'round',
      },
    })
    expect(pricing.finalTotal).toBe(118)
  })
})

describe('roundSplitPaymentDuesToWholeBaht', () => {
  it('rounds split member bills to whole baht and last person absorbs remainder', () => {
    // 209−10.25=198.75, 169−16.75=152.25 → 199 + 152 = 351
    expect(roundSplitPaymentDuesToWholeBaht([198.75, 152.25], 'round', 351)).toEqual([199, 152])
  })

  it('keeps the parent total when both shares are .50', () => {
    expect(roundSplitPaymentDuesToWholeBaht([100.5, 100.5], 'round', 201)).toEqual([101, 100])
  })

  it('skips zero-due guests so the paying guest gets the rounded total', () => {
    expect(roundSplitPaymentDuesToWholeBaht([0, 198.75, 0], 'round', 199)).toEqual([0, 199, 0])
  })

  it('floors non-last shares when store mode is floor', () => {
    expect(roundSplitPaymentDuesToWholeBaht([198.75, 152.25], 'floor', 351)).toEqual([198, 153])
  })

  it('still makes person dues whole baht when parent total is already whole and mode is none', () => {
    expect(roundSplitPaymentDuesToWholeBaht([198.75, 152.25], 'none', 351)).toEqual([199, 152])
  })

  it('keeps satang when parent total is not whole baht and mode is none', () => {
    expect(roundSplitPaymentDuesToWholeBaht([100.4, 100.4], 'none', 200.8)).toEqual([100.4, 100.4])
  })
})

describe('computePosPricing fee stack order', () => {
  it('parallel keeps independent base for VAT and service (legacy)', () => {
    const pricing = computePosPricing({
      subtotal: 1000,
      adjustments: {
        vatRate: 7,
        vatMode: 'separate',
        serviceRate: 10,
        serviceMode: 'separate',
        feeStackMode: 'parallel',
        roundPaymentTotalToWholeBaht: false,
      },
    })
    expect(pricing.serviceFeeAmt).toBe(100)
    expect(pricing.vatFeeAmt).toBe(70)
    expect(pricing.finalTotal).toBe(1170)
  })

  it('sequential service→vat stacks VAT on base+service', () => {
    const pricing = computePosPricing({
      subtotal: 1000,
      adjustments: {
        vatRate: 7,
        vatMode: 'separate',
        serviceRate: 10,
        serviceMode: 'separate',
        feeStackMode: 'sequential',
        feeStackOrder: ['service', 'vat', 'other'],
        roundPaymentTotalToWholeBaht: false,
      },
    })
    expect(pricing.serviceFeeAmt).toBe(100)
    expect(pricing.vatFeeAmt).toBe(77)
    expect(pricing.finalTotal).toBe(1177)
  })

  it('sequential vat→service stacks service on base+VAT', () => {
    const pricing = computePosPricing({
      subtotal: 1000,
      adjustments: {
        vatRate: 7,
        vatMode: 'separate',
        serviceRate: 10,
        serviceMode: 'separate',
        feeStackMode: 'sequential',
        feeStackOrder: ['vat', 'service', 'other'],
        roundPaymentTotalToWholeBaht: false,
      },
    })
    expect(pricing.vatFeeAmt).toBe(70)
    expect(pricing.serviceFeeAmt).toBe(107)
    expect(pricing.finalTotal).toBe(1177)
  })
})
