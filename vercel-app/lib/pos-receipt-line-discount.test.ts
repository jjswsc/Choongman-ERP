import { describe, expect, it } from 'vitest'
import {
  allocatePosReceiptDiscountByItem,
  coercePosReceiptLineDiscountAmt,
  resolvePosReceiptLineDiscountAlloc,
  sumPosReceiptLineDiscountAmt,
} from '@/lib/pos-receipt-line-discount'

describe('pos-receipt-line-discount', () => {
  it('coerces line_discount_amt from snake_case rows', () => {
    expect(coercePosReceiptLineDiscountAmt({ line_discount_amt: 15 })).toBe(15)
  })

  it('allocates order discount across lines by gross share', () => {
    const alloc = allocatePosReceiptDiscountByItem(
      [
        { price: 111, qty: 1 },
        { price: 111, qty: 1 },
      ],
      30
    )
    expect(alloc.reduce((s, v) => s + v, 0)).toBeCloseTo(30, 2)
  })

  it('prefers saved per-line discounts', () => {
    const items = [
      { price: 111, qty: 1, lineDiscountAmt: 15 },
      { price: 111, qty: 1, lineDiscountAmt: 15 },
    ]
    expect(sumPosReceiptLineDiscountAmt(items)).toBe(30)
    expect(resolvePosReceiptLineDiscountAlloc(items, 0)).toEqual([15, 15])
  })
})
