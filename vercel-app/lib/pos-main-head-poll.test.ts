import { describe, expect, it } from 'vitest'
import { detectMainPosHeadPollChanges } from '@/lib/pos-main-head-poll'

describe('detectMainPosHeadPollChanges', () => {
  it('seeds without signaling on first pass', () => {
    const updatedAtByOrderId = new Map<number, string>()
    const r = detectMainPosHeadPollChanges({
      heads: [
        { id: 10, orderType: 'dine_in', status: 'pending', updatedAt: '2026-08-04T10:00:00+07:00' },
      ],
      lastSeenOrderId: 5,
      updatedAtByOrderId,
      seedOnly: true,
    })
    expect(r.hasNewOrder).toBe(false)
    expect(r.hasUpdatedOpenOrder).toBe(false)
    expect(updatedAtByOrderId.get(10)).toBe('2026-08-04T10:00:00+07:00')
  })

  it('flags new id and dine-in updated_at change', () => {
    const updatedAtByOrderId = new Map<number, string>([[10, '2026-08-04T10:00:00+07:00']])
    const r = detectMainPosHeadPollChanges({
      heads: [
        { id: 12, orderType: 'dine_in', status: 'pending', updatedAt: '2026-08-04T10:01:00+07:00' },
        { id: 10, orderType: 'dine_in', status: 'pending', updatedAt: '2026-08-04T10:05:00+07:00' },
      ],
      lastSeenOrderId: 10,
      updatedAtByOrderId,
      seedOnly: false,
    })
    expect(r.hasNewOrder).toBe(true)
    expect(r.hasUpdatedOpenOrder).toBe(true)
    expect(updatedAtByOrderId.get(10)).toBe('2026-08-04T10:05:00+07:00')
  })

  it('ignores paid dine-in for updated_at signal', () => {
    const updatedAtByOrderId = new Map<number, string>([[10, 'a']])
    const r = detectMainPosHeadPollChanges({
      heads: [
        {
          id: 10,
          orderType: 'dine_in',
          status: 'pending',
          updatedAt: 'b',
          paymentCash: 100,
        },
      ],
      lastSeenOrderId: 99,
      updatedAtByOrderId,
      seedOnly: false,
    })
    expect(r.hasUpdatedOpenOrder).toBe(false)
  })
})
