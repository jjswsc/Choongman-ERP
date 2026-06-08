import { describe, expect, it } from 'vitest'
import { aggregateDeliveryPaymentChannelSales } from '@/lib/pos-sales-delivery-payment-channel-aggregate'

describe('aggregateDeliveryPaymentChannelSales', () => {
  it('splits payment_delivery_app by delivery_app_code', () => {
    const rows = aggregateDeliveryPaymentChannelSales([
      {
        order_type: 'delivery',
        delivery_app_code: 'grab',
        payment_delivery_app: 100,
        total: 100,
      },
      {
        order_type: 'delivery',
        delivery_app_code: 'lineman',
        payment_delivery_app: 200,
        total: 200,
      },
    ])
    expect(rows.find((r) => r.channelKey === 'grab')?.sales).toBe(100)
    expect(rows.find((r) => r.channelKey === 'lineman')?.sales).toBe(200)
  })

  it('skips dine-in table delivery app payments', () => {
    const rows = aggregateDeliveryPaymentChannelSales([
      {
        order_type: 'dine_in',
        delivery_payment_channel: 'grab',
        payment_delivery_app: 150,
        total: 150,
      },
    ])
    expect(rows).toHaveLength(0)
  })

  it('maps foodpanda and robinhood codes', () => {
    const rows = aggregateDeliveryPaymentChannelSales([
      {
        order_type: 'delivery',
        delivery_app_code: 'foodpanda',
        payment_delivery_app: 50,
        total: 50,
      },
      {
        order_type: 'delivery',
        delivery_app_code: 'robinhood',
        payment_delivery_app: 75,
        total: 75,
      },
    ])
    expect(rows.find((r) => r.channelKey === 'foodpanda')?.sales).toBe(50)
    expect(rows.find((r) => r.channelKey === 'robinhood')?.sales).toBe(75)
  })
})
