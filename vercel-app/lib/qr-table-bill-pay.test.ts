import { describe, expect, it } from 'vitest'
import {
  isQrBillPayAmountStale,
  resolveQrBillPaySettlement,
} from '@/lib/qr-table-bill-pay'

describe('resolveQrBillPaySettlement', () => {
  it('marks paid when bank amount covers the current balance', () => {
    const r = resolveQrBillPaySettlement({
      orderTotal: 50,
      paymentQr: 0,
      paidAmount: 50,
    })
    expect(r.payAmt).toBe(50)
    expect(r.nextPaymentQr).toBe(50)
    expect(r.remainingDue).toBe(0)
    expect(r.markPaid).toBe(true)
  })

  it('does not mark paid when rice was added after water-only QR was issued', () => {
    const r = resolveQrBillPaySettlement({
      orderTotal: 150,
      paymentQr: 0,
      paidAmount: 50,
    })
    expect(r.payAmt).toBe(50)
    expect(r.nextPaymentQr).toBe(50)
    expect(r.remainingDue).toBe(100)
    expect(r.markPaid).toBe(false)
  })

  it('never credits more than the remaining gap', () => {
    const r = resolveQrBillPaySettlement({
      orderTotal: 100,
      paymentQr: 40,
      paidAmount: 999,
    })
    expect(r.payAmt).toBe(60)
    expect(r.nextPaymentQr).toBe(100)
    expect(r.markPaid).toBe(true)
  })

  it('with paidAmount 0 fills remaining gap (balance-zero finalize)', () => {
    const r = resolveQrBillPaySettlement({
      orderTotal: 80,
      paymentCash: 80,
      paymentQr: 0,
      paidAmount: 0,
    })
    expect(r.payAmt).toBe(0)
    expect(r.remainingDue).toBe(0)
    expect(r.markPaid).toBe(true)
  })
})

describe('isQrBillPayAmountStale', () => {
  it('detects when balance grew after QR issue', () => {
    expect(isQrBillPayAmountStale({ issuedQrAmount: 50, currentBalanceDue: 150 })).toBe(true)
    expect(isQrBillPayAmountStale({ issuedQrAmount: 150, currentBalanceDue: 150 })).toBe(false)
    expect(isQrBillPayAmountStale({ issuedQrAmount: 50, currentBalanceDue: 50.01 })).toBe(false)
  })
})
