import { describe, expect, it } from 'vitest'
import {
  formatQrBillPayAmountEq,
  isQrBillPayAmountStale,
  resolveQrBillPayPendingReuse,
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

describe('resolveQrBillPayPendingReuse', () => {
  it('reuses the same partner txn when balance is unchanged (slow-net retry)', () => {
    expect(
      resolveQrBillPayPendingReuse({
        pendingPartnerTxnId: 'QTB12abc',
        pendingAmount: 399,
        currentBalanceDue: 399,
      })
    ).toEqual({ reuse: true, partnerTxnId: 'QTB12abc' })
  })

  it('does not reuse when amount changed or pending missing', () => {
    expect(
      resolveQrBillPayPendingReuse({
        pendingPartnerTxnId: 'QTB12abc',
        pendingAmount: 50,
        currentBalanceDue: 150,
      }).reuse
    ).toBe(false)
    expect(
      resolveQrBillPayPendingReuse({
        pendingPartnerTxnId: '',
        pendingAmount: 100,
        currentBalanceDue: 100,
      }).reuse
    ).toBe(false)
  })
})

describe('formatQrBillPayAmountEq', () => {
  it('formats amounts for PostgREST eq filters', () => {
    expect(formatQrBillPayAmountEq(50)).toBe('50')
    expect(formatQrBillPayAmountEq(50.1)).toBe('50.1')
  })
})
