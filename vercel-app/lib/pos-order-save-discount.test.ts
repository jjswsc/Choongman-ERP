import { describe, expect, it } from 'vitest'
import {
  resolveManualDiscountNetForOrderSave,
  resolvePosOrderReceiptPrintTotal,
  sumPosOrderItemsLineDiscountAmt,
} from '@/lib/pos-order-save-discount'

describe('sumPosOrderItemsLineDiscountAmt', () => {
  it('sums camelCase and snake_case line discount fields', () => {
    expect(
      sumPosOrderItemsLineDiscountAmt([
        { lineDiscountAmt: 30 },
        { line_discount_amt: 15 },
      ])
    ).toBe(45)
  })
})

describe('resolveManualDiscountNetForOrderSave', () => {
  it('uses line sum when header discountAmt is zero', () => {
    expect(
      resolveManualDiscountNetForOrderSave({
        discountAmt: 0,
        serviceAmt: 0,
        items: [{ lineDiscountAmt: 30 }],
      })
    ).toBe(30)
  })

  it('does not double-count when header already includes line discount', () => {
    expect(
      resolveManualDiscountNetForOrderSave({
        discountAmt: 30,
        serviceAmt: 0,
        items: [{ lineDiscountAmt: 30 }],
      })
    ).toBe(30)
  })

  it('subtracts serviceAmt from header before comparing to line sum', () => {
    expect(
      resolveManualDiscountNetForOrderSave({
        discountAmt: 50,
        serviceAmt: 20,
        items: [{ lineDiscountAmt: 30 }],
      })
    ).toBe(30)
  })
})

describe('resolvePosOrderReceiptPrintTotal', () => {
  it('prefers computed total when stored gross ignores line discount', () => {
    expect(
      resolvePosOrderReceiptPrintTotal({
        storedTotal: 935,
        pricingFinalTotal: 905,
        effectiveDiscountAmt: 30,
        paymentSum: 905,
      })
    ).toBe(905)
  })

  it('keeps stored total when it matches computed', () => {
    expect(
      resolvePosOrderReceiptPrintTotal({
        storedTotal: 905,
        pricingFinalTotal: 905,
        effectiveDiscountAmt: 30,
        paymentSum: 905,
      })
    ).toBe(905)
  })

  it('uses payment sum match when discount row is zero but payment net is lower', () => {
    expect(
      resolvePosOrderReceiptPrintTotal({
        storedTotal: 935,
        pricingFinalTotal: 905,
        effectiveDiscountAmt: 0,
        paymentSum: 905,
      })
    ).toBe(905)
  })
})
