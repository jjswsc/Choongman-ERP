import { describe, expect, it } from 'vitest'
import {
  receiptPaymentFieldsFromSnapshot,
  resolveCashTenderReceiptLines,
} from './pos-receipt-cash-tender'

describe('resolveCashTenderReceiptLines', () => {
  it('falls back to exact cash when tendered missing', () => {
    expect(resolveCashTenderReceiptLines({ paymentCash: 40 })).toEqual({
      charge: 40,
      paidCash: 40,
      change: 0,
    })
  })

  it('returns charge, paid, change', () => {
    expect(resolveCashTenderReceiptLines({ paymentCash: 40, paymentCashTendered: 50 })).toEqual({
      charge: 40,
      paidCash: 50,
      change: 10,
    })
  })

  it('returns zero change for exact tender', () => {
    expect(resolveCashTenderReceiptLines({ paymentCash: 40, paymentCashTendered: 40 })).toEqual({
      charge: 40,
      paidCash: 40,
      change: 0,
    })
  })

  it('returns null when tendered is short', () => {
    expect(resolveCashTenderReceiptLines({ paymentCash: 40, paymentCashTendered: 30 })).toBeNull()
  })
})

describe('receiptPaymentFieldsFromSnapshot (split per-guest)', () => {
  it('passes paymentCashTendered for dutch receipt lines', () => {
    const fields = receiptPaymentFieldsFromSnapshot({
      paymentCash: 1206,
      paymentCard: 0,
      paymentQr: 0,
      paymentOther: 0,
      paymentCashTendered: 1500,
    })
    expect(fields.paymentCash).toBe(1206)
    expect(fields.paymentCashTendered).toBe(1500)
    expect(resolveCashTenderReceiptLines(fields as { paymentCash?: number; paymentCashTendered?: number })).toEqual({
      charge: 1206,
      paidCash: 1500,
      change: 294,
    })
  })
})
