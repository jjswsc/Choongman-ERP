import { describe, expect, it } from 'vitest'
import { aggregateOrderPaymentsToSettlementBuckets } from '@/lib/pos-settlement-auto-breakdown'

describe('aggregateOrderPaymentsToSettlementBuckets', () => {
  const qrKeys = ['PromptPay', 'WeChat', 'Other']
  const otherKeys = ['Gift Voucher', 'Online Banking', 'Other']
  const catalog = [
    { id: '10', name: 'WeChat', category: 'qr' as const },
    { id: '20', name: 'Gift Voucher', category: 'other' as const },
    { id: '21', name: 'Online Banking', category: 'other' as const },
  ]

  it('puts payment_qr into PromptPay bucket', () => {
    const { autoQrFromOrders, autoOtherFromOrders } = aggregateOrderPaymentsToSettlementBuckets(
      [{ payment_qr: 500, payment_other: 0 }],
      qrKeys,
      otherKeys,
      catalog
    )
    expect(autoQrFromOrders.PromptPay).toBe(500)
    expect(Object.keys(autoOtherFromOrders).length).toBe(0)
  })

  it('routes admin other-category lines to other breakdown', () => {
    const { autoQrFromOrders, autoOtherFromOrders } = aggregateOrderPaymentsToSettlementBuckets(
      [
        {
          payment_other: 1156,
          payment_other_breakdown: { admin: { '20': 1156 } },
        },
      ],
      qrKeys,
      otherKeys,
      catalog
    )
    expect(autoQrFromOrders.PromptPay).toBeUndefined()
    expect(autoOtherFromOrders['Gift Voucher']).toBe(1156)
  })

  it('routes admin qr-category lines to qr breakdown', () => {
    const { autoQrFromOrders, autoOtherFromOrders } = aggregateOrderPaymentsToSettlementBuckets(
      [
        {
          payment_other: 300,
          payment_other_breakdown: { admin: { '10': 300 } },
        },
      ],
      qrKeys,
      otherKeys,
      catalog
    )
    expect(autoQrFromOrders.WeChat).toBe(300)
    expect(Object.keys(autoOtherFromOrders).length).toBe(0)
  })

  it('routes legacy weChat to qr when listed in qrKeys', () => {
    const { autoQrFromOrders } = aggregateOrderPaymentsToSettlementBuckets(
      [
        {
          payment_other: 200,
          payment_other_breakdown: { weChat: 200 },
        },
      ],
      qrKeys,
      otherKeys,
      catalog
    )
    expect(autoQrFromOrders.WeChat).toBe(200)
  })

  it('routes legacy misc to other Other key', () => {
    const { autoOtherFromOrders } = aggregateOrderPaymentsToSettlementBuckets(
      [
        {
          payment_other: 99,
          payment_other_breakdown: { misc: 99 },
        },
      ],
      qrKeys,
      otherKeys,
      catalog
    )
    expect(autoOtherFromOrders.Other).toBe(99)
  })
})
