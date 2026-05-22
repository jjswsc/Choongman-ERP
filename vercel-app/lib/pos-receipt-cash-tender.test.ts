import { describe, expect, it } from 'vitest'
import { resolveCashTenderReceiptLines } from './pos-receipt-cash-tender'

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
