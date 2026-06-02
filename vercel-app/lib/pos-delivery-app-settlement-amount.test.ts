import { describe, expect, it } from 'vitest'
import {
  resolvePosDeliveryAppSettlementGross,
  syncPosPaymentDeliveryAppToNetTotal,
} from '@/lib/pos-delivery-app-settlement-amount'

describe('resolvePosDeliveryAppSettlementGross', () => {
  it('uses net total when payment_delivery_app kept gross after manual Shopee discount', () => {
    expect(
      resolvePosDeliveryAppSettlementGross({
        payment_delivery_app: 129,
        subtotal: 129,
        total: 106,
        discount_amt: 23,
        delivery_app_code: 'shopee',
        order_type: 'delivery',
      })
    ).toBe(106)
  })

  it('infers net from discount when total was not updated', () => {
    expect(
      resolvePosDeliveryAppSettlementGross({
        payment_delivery_app: 129,
        subtotal: 129,
        total: 129,
        discount_amt: 23,
        delivery_app_code: 'shopee',
        order_type: 'delivery',
      })
    ).toBe(106)
  })

  it('sums three Shopee orders like CMMBK 2026-06-01 case', () => {
    const rows = [
      { payment_delivery_app: 129, subtotal: 129, total: 129, discount_amt: 23 },
      { payment_delivery_app: 111, subtotal: 111, total: 111, discount_amt: 23 },
      { payment_delivery_app: 438, subtotal: 438, total: 438, discount_amt: 51 },
    ]
    const gross = rows.reduce(
      (sum, row) =>
        sum +
        resolvePosDeliveryAppSettlementGross({
          ...row,
          delivery_app_code: 'shopee',
          order_type: 'delivery',
        }),
      0
    )
    expect(gross).toBe(581)
  })

  it('includes Shopee webhook rows paid via payment_other only', () => {
    expect(
      resolvePosDeliveryAppSettlementGross({
        payment_delivery_app: 0,
        payment_other: 106,
        total: 106,
        subtotal: 129,
        discount_amt: 23,
        delivery_app_code: 'shopee',
        order_type: 'delivery',
      })
    ).toBe(106)
  })
})

describe('syncPosPaymentDeliveryAppToNetTotal', () => {
  it('forces delivery-only payment to net total', () => {
    expect(
      syncPosPaymentDeliveryAppToNetTotal({
        paymentDeliveryApp: 129,
        paymentCash: 0,
        paymentCard: 0,
        paymentQr: 0,
        paymentOther: 0,
        total: 106,
      })
    ).toBe(106)
  })
})
