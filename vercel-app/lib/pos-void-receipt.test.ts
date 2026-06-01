import { describe, expect, it } from 'vitest'
import {
  negatePosReceiptMoney,
  receiptModalDataForVoidReceipt,
  voidReceiptModalData,
} from '@/lib/pos-void-receipt'
import type { PosOrder } from '@/lib/api-client'
import type { ReceiptModalData } from '@/components/pos/pos-receipt-modal'

describe('pos-void-receipt', () => {
  it('negatePosReceiptMoney returns negative abs', () => {
    expect(negatePosReceiptMoney(88)).toBe(-88)
    expect(negatePosReceiptMoney(-12)).toBe(-12)
    expect(negatePosReceiptMoney(0)).toBe(0)
  })

  it('voidReceiptModalData negates split receipt rows', () => {
    const base = {
      orderNo: 'T-1',
      storeCode: 'S1',
      orderType: 'dine_in',
      subtotal: 50,
      discountAmt: 0,
      total: 50,
      paymentCash: 50,
      items: [{ id: '1', name: 'A', price: 50, qty: 1 }],
    } satisfies ReceiptModalData
    const data = voidReceiptModalData(base)
    expect(data.voidReceiptMode).toBe(true)
    expect(data.total).toBe(-50)
    expect(data.paymentCash).toBe(-50)
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
