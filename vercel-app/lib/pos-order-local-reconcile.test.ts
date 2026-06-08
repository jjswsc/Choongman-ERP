import { describe, expect, it } from 'vitest'
import type { Order } from '@/lib/pos-types'
import { shouldKeepPrevOrderMissingFromFetched } from '@/lib/pos-order-local-reconcile'

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: '42',
    type: 'delivery',
    items: [{ id: '1', name: 'Test', quantity: 1, price: 100 }],
    total: 100,
    status: 'pending',
    createdAt: new Date(),
    ...overrides,
  }
}

describe('shouldKeepPrevOrderMissingFromFetched', () => {
  it('drops server-id orders missing from refetch (cancelled on server)', () => {
    expect(shouldKeepPrevOrderMissingFromFetched(baseOrder({ id: '42', pendingListSync: true }))).toBe(
      false
    )
  })

  it('keeps offline-only orders without server id', () => {
    expect(
      shouldKeepPrevOrderMissingFromFetched(
        baseOrder({ id: 'local-abc', orderNo: 'LOCAL-1', pendingListSync: true })
      )
    ).toBe(true)
  })

  it('drops cancelled status rows', () => {
    expect(shouldKeepPrevOrderMissingFromFetched(baseOrder({ status: 'cancelled' }))).toBe(false)
  })
})
