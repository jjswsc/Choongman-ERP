import { describe, expect, it } from 'vitest'
import {
  readPreservedPosOrderPaymentAmounts,
  reconcilePosOrderPaymentTenderGap,
  shouldPreserveExistingPosOrderPayment,
} from '@/lib/pos-order-payment-reconcile'

describe('pos-order-payment-reconcile', () => {
  it('preserves existing payment on items-only addon update', () => {
    expect(
      shouldPreserveExistingPosOrderPayment({
        body: { paymentCash: 0, paymentCard: 0 },
        currentPaymentSum: 500,
        incomingPaymentSum: 0,
      })
    ).toBe(true)
    expect(
      shouldPreserveExistingPosOrderPayment({
        body: { closeStatus: 'completed', paymentCash: 0 },
        currentPaymentSum: 500,
        incomingPaymentSum: 0,
      })
    ).toBe(false)
    expect(
      shouldPreserveExistingPosOrderPayment({
        body: { paymentCash: 100 },
        currentPaymentSum: 500,
        incomingPaymentSum: 100,
      })
    ).toBe(false)
    expect(
      shouldPreserveExistingPosOrderPayment({
        body: { clearPaymentTender: true, paymentCash: 0, paymentQr: 0 },
        currentPaymentSum: 500,
        incomingPaymentSum: 0,
      })
    ).toBe(false)
  })

  it('reads preserved payment amounts from current row', () => {
    expect(
      readPreservedPosOrderPaymentAmounts({
        payment_cash: 100,
        payment_qr: 200,
        payment_delivery_app: 50,
      })
    ).toEqual({
      paymentCash: 100,
      paymentCard: 0,
      paymentQr: 200,
      paymentOther: 0,
      paymentDeliveryApp: 50,
    })
  })

  it('fills service comp gap into payment_other', () => {
    const out = reconcilePosOrderPaymentTenderGap({
      total: 1460,
      serviceAmt: 229,
      orderType: 'dine_in',
      payment: {
        paymentCash: 0,
        paymentCard: 0,
        paymentQr: 1231,
        paymentOther: 0,
        paymentDeliveryApp: 0,
      },
    })
    expect(out.reconciledGap).toBe(229)
    expect(out.payment.paymentOther).toBe(229)
    expect(out.payment.paymentQr).toBe(1231)
    expect(out.paymentOtherBreakdown).toEqual({ serviceComp: 229 })
  })

  it('fills delivery-only order with zero payment', () => {
    const out = reconcilePosOrderPaymentTenderGap({
      total: 1414,
      orderType: 'delivery',
      deliveryAppCode: 'grab',
      payment: {
        paymentCash: 0,
        paymentCard: 0,
        paymentQr: 0,
        paymentOther: 0,
        paymentDeliveryApp: 0,
      },
    })
    expect(out.reconciledGap).toBe(1414)
    expect(out.payment.paymentDeliveryApp).toBe(1414)
  })

  it('tops up delivery-only partial payment_delivery_app', () => {
    const out = reconcilePosOrderPaymentTenderGap({
      total: 500,
      orderType: 'delivery',
      deliveryAppCode: 'grab',
      payment: {
        paymentCash: 0,
        paymentCard: 0,
        paymentQr: 0,
        paymentOther: 0,
        paymentDeliveryApp: 300,
      },
    })
    expect(out.reconciledGap).toBe(200)
    expect(out.payment.paymentDeliveryApp).toBe(500)
  })
})
