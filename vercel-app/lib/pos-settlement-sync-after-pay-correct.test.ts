import { describe, expect, it } from 'vitest'
import {
  applySettlementBreakdownDelta,
  buildSettlementCashReconcile,
  computePayCorrectSettlementDeltas,
} from '@/lib/pos-settlement-sync-after-pay-correct'

describe('computePayCorrectSettlementDeltas', () => {
  it('card → cash moves amounts correctly', () => {
    const d = computePayCorrectSettlementDeltas(
      {
        paymentCash: 0,
        paymentCard: 458,
        paymentQr: 0,
        paymentOther: 0,
        paymentDeliveryApp: 0,
      },
      {
        paymentCash: 458,
        paymentCard: 0,
        paymentQr: 0,
        paymentOther: 0,
        paymentDeliveryApp: 0,
      }
    )
    expect(d.cashAmt).toBe(458)
    expect(d.cardAmt).toBe(-458)
  })

  it('dine_in delivery stays in dine-in bucket', () => {
    const d = computePayCorrectSettlementDeltas(
      {
        paymentCash: 0,
        paymentCard: 0,
        paymentQr: 0,
        paymentOther: 0,
        paymentDeliveryApp: 100,
        deliveryPaymentChannel: 'grab',
        orderType: 'delivery',
      },
      {
        paymentCash: 0,
        paymentCard: 0,
        paymentQr: 0,
        paymentOther: 0,
        paymentDeliveryApp: 100,
        deliveryPaymentChannel: 'dine_in',
        orderType: 'dine_in',
      }
    )
    expect(d.deliveryAppAmt).toBe(-100)
    expect(d.dineInDeliveryAmt).toBe(100)
  })
})

describe('applySettlementBreakdownDelta', () => {
  it('adds to fallback key', () => {
    expect(applySettlementBreakdownDelta({ Visa: 100 }, 50, 'Other')).toEqual({
      Visa: 100,
      Other: 50,
    })
  })

  it('reduces existing keys when negative', () => {
    expect(applySettlementBreakdownDelta({ Visa: 100, Master: 50 }, -120, 'Other')).toEqual({
      Master: 30,
    })
  })
})

describe('buildSettlementCashReconcile', () => {
  it('flags mismatch above 0.02', () => {
    const r = buildSettlementCashReconcile({ liveCash: 11425, savedCash: 11883, closed: true })
    expect(r.mismatch).toBe(true)
    expect(r.diff).toBe(458)
  })

  it('matches when equal', () => {
    const r = buildSettlementCashReconcile({ liveCash: 11883, savedCash: 11883 })
    expect(r.mismatch).toBe(false)
  })
})
