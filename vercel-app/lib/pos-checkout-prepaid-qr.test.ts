import { describe, expect, it } from 'vitest'
import { mergeCheckoutPrepaidQr, resolveCheckoutPrepaidQrAmt } from '@/lib/pos-checkout-prepaid-qr'

describe('resolveCheckoutPrepaidQrAmt', () => {
  it('손님 QR 부분 입금(398/518)은 카운터에서 차감', () => {
    expect(resolveCheckoutPrepaidQrAmt({ total: 518, paymentQr: 398, status: 'ready' })).toBe(398)
  })

  it('입금 없음·전액 이상·마감 주문은 차감하지 않음', () => {
    expect(resolveCheckoutPrepaidQrAmt({ total: 518, paymentQr: 0, status: 'ready' })).toBe(0)
    expect(resolveCheckoutPrepaidQrAmt({ total: 518, paymentQr: 518, status: 'ready' })).toBe(0)
    expect(resolveCheckoutPrepaidQrAmt({ total: 518, paymentQr: 600, status: 'pending' })).toBe(0)
    expect(resolveCheckoutPrepaidQrAmt({ total: 518, paymentQr: 398, status: 'paid' })).toBe(0)
    expect(resolveCheckoutPrepaidQrAmt({ total: 518, paymentQr: 398, status: 'completed' })).toBe(0)
  })
})

describe('mergeCheckoutPrepaidQr', () => {
  it('카운터 현금 120 + 기존 QR 398 → payment_qr 398 유지', () => {
    const merged = mergeCheckoutPrepaidQr({ paymentCash: 120, paymentQr: 0 }, 398)
    expect(merged).toEqual({ paymentCash: 120, paymentQr: 398 })
  })

  it('카운터 QR 120 + 기존 QR 398 → payment_qr 518', () => {
    expect(mergeCheckoutPrepaidQr({ paymentQr: 120 }, 398).paymentQr).toBe(518)
  })

  it('차감액 없으면 원본 그대로', () => {
    const pay = { paymentCash: 518, paymentQr: 0 }
    expect(mergeCheckoutPrepaidQr(pay, 0)).toBe(pay)
    expect(mergeCheckoutPrepaidQr(pay, undefined)).toBe(pay)
  })
})
