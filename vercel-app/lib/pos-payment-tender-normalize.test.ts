import { describe, expect, it } from 'vitest'
import { posOrderPaymentSum } from '@/lib/pos-payment-receipt-from-order'
import { normalizePosPaymentTender } from '@/lib/pos-payment-tender-normalize'

describe('normalizePosPaymentTender', () => {
  it('keeps Thai QR amount in QR bucket', () => {
    const out = normalizePosPaymentTender({
      paymentCard: 100,
      paymentQr: 50,
      paymentQrType: 'THAI_QR',
    })
    expect(out.paymentCard).toBe(100)
    expect(out.paymentQr).toBe(50)
    expect(out.usedCreditCardQr).toBe(false)
  })

  it('moves Credit Card QR amount into card bucket', () => {
    const out = normalizePosPaymentTender({
      paymentCard: 120,
      paymentQr: 80,
      paymentQrType: 'CREDIT_CARD',
    })
    expect(out.paymentCard).toBe(200)
    expect(out.paymentQr).toBe(0)
    expect(out.usedCreditCardQr).toBe(true)
  })

  it('accepts QRCC alias for credit card QR', () => {
    const out = normalizePosPaymentTender({
      paymentCard: 0,
      paymentQr: 30,
      paymentQrType: 'QRCC',
    })
    expect(out.paymentCard).toBe(30)
    expect(out.paymentQr).toBe(0)
    expect(out.usedCreditCardQr).toBe(true)
  })
})

describe('posOrderPaymentSum', () => {
  it('falls back to total for paid-like rows without payment columns (pollMinimal)', () => {
    expect(
      posOrderPaymentSum({
        id: 1,
        status: 'paid',
        total: 420,
      } as Parameters<typeof posOrderPaymentSum>[0])
    ).toBe(420)
  })
})
