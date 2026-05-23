import { describe, expect, it } from 'vitest'
import { negatePosReceiptMoney, receiptModalDataForVoidReceipt } from '@/lib/pos-void-receipt'
import type { PosOrder } from '@/lib/api-client'

describe('pos-void-receipt', () => {
  it('negatePosReceiptMoney returns negative abs', () => {
    expect(negatePosReceiptMoney(88)).toBe(-88)
    expect(negatePosReceiptMoney(-12)).toBe(-12)
    expect(negatePosReceiptMoney(0)).toBe(0)
  })

  it('receiptModalDataForVoidReceipt negates payment receipt totals', () => {
    const order = {
      orderNo: 'T-1',
      storeCode: 'S1',
      orderType: 'dine_in',
      subtotal: 100,
      discountAmt: 0,
      total: 88,
      paymentQr: 88,
      items: [{ id: '1', name: 'Chicken', price: 100, qty: 1 }],
    } as PosOrder
    const data = receiptModalDataForVoidReceipt(order)
    expect(data.voidReceiptMode).toBe(true)
    expect(data.total).toBe(-88)
    expect(data.paymentQr).toBe(-88)
    expect(data.items[0]?.price).toBe(-100)
  })
})
