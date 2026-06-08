import { describe, expect, it } from 'vitest'
import {
  aggregateCreditFromSettlements,
  aggregateDeliveryFromSettlements,
} from '@/lib/pos-sales-settlement-breakdown-aggregate'

describe('pos-sales-settlement-breakdown-aggregate', () => {
  it('sums card_breakdown lines from settlement (Visa/Master)', () => {
    const bucket = aggregateCreditFromSettlements([
      {
        store_code: 'S1',
        settle_date: '2026-06-01',
        card_amt: 1500,
        card_breakdown: { Visa: 1000, Master: 500 },
      },
    ])
    expect(bucket.visa).toBe(1000)
    expect(bucket.master_card).toBe(500)
  })

  it('uses card_amt as card_other when breakdown empty', () => {
    const bucket = aggregateCreditFromSettlements([
      {
        card_amt: 800,
        card_breakdown: {},
      },
    ])
    expect(bucket.card_other).toBe(800)
  })

  it('sums delivery_app_breakdown from settlement', () => {
    const bucket = aggregateDeliveryFromSettlements([
      {
        delivery_app_amt: 430996,
        delivery_app_breakdown: { Grab: 200000, 'Line Man': 230996 },
      },
    ])
    expect(bucket.grab).toBe(200000)
    expect(bucket.lineman).toBe(230996)
  })
})
