import { describe, expect, it } from 'vitest'
import {
  buildGrabAutoSettlePaymentPatch,
  canApplyGrabStatusTransition,
  mapGrabStateToPosStatus,
} from '@/lib/grab-order-state-transition'

describe('mapGrabStateToPosStatus', () => {
  it('settles when food has left the store', () => {
    expect(mapGrabStateToPosStatus('COLLECTED')).toBe('paid')
    expect(mapGrabStateToPosStatus('DELIVERED')).toBe('paid')
  })

  it('keeps in-progress states unmapped', () => {
    expect(mapGrabStateToPosStatus('ACCEPTED')).toBeNull()
    expect(mapGrabStateToPosStatus('DRIVER_ALLOCATED')).toBeNull()
    expect(mapGrabStateToPosStatus('DRIVER_ARRIVED')).toBeNull()
  })

  it('maps cancel / refund', () => {
    expect(mapGrabStateToPosStatus('CANCELLED')).toBe('cancelled')
    expect(mapGrabStateToPosStatus('FAILED')).toBe('cancelled')
    expect(mapGrabStateToPosStatus('REFUNDED')).toBe('refunded')
  })
})

describe('canApplyGrabStatusTransition', () => {
  it('auto-settles unsettled delivery orders', () => {
    for (const prev of ['pending', 'cooking', 'preparing', 'ready']) {
      expect(canApplyGrabStatusTransition(prev, 'paid')).toBe(true)
    }
  })

  it('never re-settles or revives closed orders', () => {
    for (const prev of ['paid', 'completed', 'cancelled', 'refunded', '']) {
      expect(canApplyGrabStatusTransition(prev, 'paid')).toBe(false)
    }
  })

  it('keeps staff-paid orders when Grab cancels', () => {
    expect(canApplyGrabStatusTransition('paid', 'cancelled')).toBe(false)
    expect(canApplyGrabStatusTransition('completed', 'cancelled')).toBe(false)
  })

  it('follows Grab cancel for webhook auto-paid orders', () => {
    expect(canApplyGrabStatusTransition('paid', 'cancelled', { autoPaid: true })).toBe(true)
    expect(canApplyGrabStatusTransition('paid', 'refunded', { autoPaid: true })).toBe(true)
  })

  it('cancels unsettled orders', () => {
    expect(canApplyGrabStatusTransition('cooking', 'cancelled')).toBe(true)
    expect(canApplyGrabStatusTransition('cancelled', 'cancelled')).toBe(false)
  })
})

describe('buildGrabAutoSettlePaymentPatch', () => {
  const now = '2026-10-10T17:00:00.000Z'

  it('keeps existing delivery app payment and stamps paid_at', () => {
    expect(
      buildGrabAutoSettlePaymentPatch({ total: 279, payment_delivery_app: 279, paid_at: null }, now)
    ).toEqual({ paid_at: now })
  })

  it('fills delivery app payment when nothing was recorded', () => {
    expect(buildGrabAutoSettlePaymentPatch({ total: 279 }, now)).toEqual({
      payment_delivery_app: 279,
      delivery_payment_channel: 'grab',
      paid_at: now,
    })
  })

  it('does not overwrite cash orders or existing paid_at', () => {
    expect(
      buildGrabAutoSettlePaymentPatch(
        { total: 169, payment_cash: 169, paid_at: '2026-10-10T16:00:00.000Z' },
        now
      )
    ).toEqual({})
  })
})
