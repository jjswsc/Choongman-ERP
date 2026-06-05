import { describe, expect, it } from 'vitest'
import {
  getOrderBarCookElapsedMinutes,
  resolveOrderBarCookElapsedEndAt,
} from '@/lib/pos-order-bar-cook-elapsed'

describe('getOrderBarCookElapsedMinutes', () => {
  it('caps elapsed at elapsedEndAt when payment completes', () => {
    const createdAt = '2026-06-05T03:00:00.000Z'
    const paidAt = '2026-06-05T04:30:00.000Z'
    expect(getOrderBarCookElapsedMinutes(createdAt, paidAt)).toBe(90)
  })

  it('keeps counting when no elapsedEndAt', () => {
    const createdAt = new Date(Date.now() - 5 * 60_000).toISOString()
    const mins = getOrderBarCookElapsedMinutes(createdAt)
    expect(mins).toBeGreaterThanOrEqual(4)
    expect(mins).toBeLessThanOrEqual(6)
  })
})

describe('resolveOrderBarCookElapsedEndAt', () => {
  it('returns paidAt for completed bar rows', () => {
    const end = resolveOrderBarCookElapsedEndAt(
      {
        status: 'paid',
        createdAt: new Date('2026-06-05T03:00:00.000Z'),
        paidAt: '2026-06-05T04:00:00.000Z',
        paymentDeliveryApp: 250,
      },
      'completed'
    )
    expect(end).toBe('2026-06-05T04:00:00.000Z')
  })

  it('does not stop timer for packaged rows', () => {
    const end = resolveOrderBarCookElapsedEndAt(
      {
        status: 'ready',
        createdAt: new Date('2026-06-05T03:00:00.000Z'),
        paidAt: '2026-06-05T04:00:00.000Z',
      },
      'packaged'
    )
    expect(end).toBeUndefined()
  })
})
