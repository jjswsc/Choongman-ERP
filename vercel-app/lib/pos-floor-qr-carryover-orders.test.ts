import { describe, expect, it } from 'vitest'
import {
  collectQrCarryoverOrderIds,
  mergePosOrdersById,
} from '@/lib/pos-floor-qr-carryover-orders'

describe('collectQrCarryoverOrderIds', () => {
  it('returns posOrderIds missing from today snapshot', () => {
    expect(
      collectQrCarryoverOrderIds({
        existingOrderIds: [10, 20],
        sessions: [
          { posOrderId: 20 },
          { posOrderId: 153231 },
          { posOrderId: 153230 },
          { posOrderId: null },
          { posOrderId: 0 },
        ],
      })
    ).toEqual([153231, 153230])
  })

  it('dedupes session ids', () => {
    expect(
      collectQrCarryoverOrderIds({
        existingOrderIds: [],
        sessions: [{ posOrderId: 5 }, { posOrderId: 5 }],
      })
    ).toEqual([5])
  })
})

describe('mergePosOrdersById', () => {
  it('unions by id and prefers extra row', () => {
    const merged = mergePosOrdersById(
      [
        { id: 1, total: 10 },
        { id: 2, total: 20 },
      ],
      [
        { id: 2, total: 99 },
        { id: 3, total: 30 },
      ]
    )
    expect(merged).toEqual([
      { id: 1, total: 10 },
      { id: 2, total: 99 },
      { id: 3, total: 30 },
    ])
  })
})
