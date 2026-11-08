import { describe, expect, it } from 'vitest'
import {
  buildDeliveryPackSettlePatch,
  shouldPromoteDeliveryPackReadyToPaid,
} from '@/lib/pos-delivery-pack-settle'
import { isGrabAutoPaidMemo } from '@/lib/grab-order-memo'

describe('shouldPromoteDeliveryPackReadyToPaid', () => {
  it('promotes Grab cooking with delivery_app only', () => {
    expect(
      shouldPromoteDeliveryPackReadyToPaid({
        order_type: 'delivery',
        status: 'cooking',
        payment_delivery_app: 279,
        memo: 'grab_order:ABC|grab_state:ACCEPTED',
      })
    ).toBe(true)
  })

  it('promotes Robinhood-style delivery_app only', () => {
    expect(
      shouldPromoteDeliveryPackReadyToPaid({
        order_type: 'delivery',
        status: 'cooking',
        payment_delivery_app: 199,
        delivery_app_code: 'robinhood',
      })
    ).toBe(true)
  })

  it('promotes API inbound even if payment_delivery_app empty', () => {
    expect(
      shouldPromoteDeliveryPackReadyToPaid({
        order_type: 'delivery',
        status: 'cooking',
        payment_delivery_app: 0,
        memo: 'grab_order:XYZ',
      })
    ).toBe(true)
  })

  it('skips COD with cash', () => {
    expect(
      shouldPromoteDeliveryPackReadyToPaid({
        order_type: 'delivery',
        status: 'cooking',
        payment_cash: 199,
        payment_delivery_app: 0,
      })
    ).toBe(false)
  })

  it('skips dine_in and takeout', () => {
    expect(
      shouldPromoteDeliveryPackReadyToPaid({
        order_type: 'dine_in',
        status: 'cooking',
        payment_delivery_app: 100,
      })
    ).toBe(false)
    expect(
      shouldPromoteDeliveryPackReadyToPaid({
        order_type: 'takeout',
        status: 'cooking',
        payment_delivery_app: 100,
      })
    ).toBe(false)
  })

  it('skips already paid', () => {
    expect(
      shouldPromoteDeliveryPackReadyToPaid({
        order_type: 'delivery',
        status: 'paid',
        payment_delivery_app: 100,
      })
    ).toBe(false)
  })
})

describe('buildDeliveryPackSettlePatch', () => {
  it('sets paid + paid_at and fills delivery_app for empty Grab payment', () => {
    const patch = buildDeliveryPackSettlePatch(
      {
        order_type: 'delivery',
        status: 'cooking',
        total: 350,
        payment_delivery_app: 0,
        memo: 'grab_order:G1|grab_state:ACCEPTED',
      },
      '2026-11-09T01:00:00.000Z'
    )
    expect(patch.status).toBe('paid')
    expect(patch.paid_at).toBe('2026-11-09T01:00:00.000Z')
    expect(patch.payment_delivery_app).toBe(350)
    expect(isGrabAutoPaidMemo(patch.memo)).toBe(true)
  })

  it('keeps existing delivery_app and marks grab_auto_paid', () => {
    const patch = buildDeliveryPackSettlePatch(
      {
        order_type: 'delivery',
        status: 'cooking',
        total: 279,
        payment_delivery_app: 279,
        memo: 'grab_order:G2|grab_state:DRIVER_ARRIVED',
      },
      '2026-11-09T01:00:00.000Z'
    )
    expect(patch.status).toBe('paid')
    expect(patch.payment_delivery_app).toBeUndefined()
    expect(isGrabAutoPaidMemo(patch.memo)).toBe(true)
  })
})
