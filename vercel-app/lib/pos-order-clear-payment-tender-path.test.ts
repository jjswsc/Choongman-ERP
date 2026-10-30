import { describe, expect, it } from 'vitest'
import { shouldUseClearPaymentTenderOnlyPath } from '@/lib/pos-order-clear-payment-tender-path'

describe('shouldUseClearPaymentTenderOnlyPath', () => {
  it('clearPaymentTender + items 없음 → true', () => {
    expect(shouldUseClearPaymentTenderOnlyPath({ clearPaymentTender: true, id: 1 })).toBe(true)
  })

  it('clearPaymentTender + items 빈 배열 → true', () => {
    expect(shouldUseClearPaymentTenderOnlyPath({ clearPaymentTender: true, items: [] })).toBe(true)
  })

  it('clearPaymentTender + items 있음 → false (전체 update 경로)', () => {
    expect(
      shouldUseClearPaymentTenderOnlyPath({
        clearPaymentTender: true,
        items: [{ id: '1', name: 'x', price: 1, qty: 1 }],
      })
    ).toBe(false)
  })

  it('clear 플래그 없으면 false', () => {
    expect(shouldUseClearPaymentTenderOnlyPath({ paymentQr: 0 })).toBe(false)
  })

  it('snake_case clear_payment_tender 도 인식', () => {
    expect(shouldUseClearPaymentTenderOnlyPath({ clear_payment_tender: true })).toBe(true)
  })
})
