import { describe, expect, it } from 'vitest'
import { buildCheckoutPaymentReceiptModalData } from '@/lib/pos-payment-receipt-from-order'

describe('buildCheckoutPaymentReceiptModalData', () => {
  it('includes coupon line discounts in summary discount and total', () => {
    const receipt = buildCheckoutPaymentReceiptModalData({
      orderNo: 'ST01-TEST',
      storeCode: 'ST01',
      orderType: 'dine_in',
      tableName: '2',
      items: [
        { id: '1', name: 'GOLDEN FRIED CHICKEN', price: 219, quantity: 1, lineDiscountAmt: 172.06 },
        { id: '2', name: 'Banban Chicken', price: 259, quantity: 1, lineDiscountAmt: 50.94 },
      ],
      discountAmt: 94,
      couponDiscountAmt: 0,
      appliedCoupons: [
        { code: 'CPN1', name: 'Coupon 1', discountAmt: 172.06, quantity: 1 },
        { code: 'CPN2', name: 'Coupon 2', discountAmt: 50.94, quantity: 1 },
      ],
      paymentSum: 255,
      adjustments: {},
    })

    expect(receipt.discountAmt).toBe(223)
    expect(receipt.total).toBe(255)
    expect(receipt.appliedCoupons).toHaveLength(2)
    expect(receipt.items?.[0]?.lineDiscountAmt).toBe(172.06)
  })
})
