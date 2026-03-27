import { describe, expect, it } from 'vitest'
import {
  consolidatePosOrderLinesAfterMerge,
  posMergeLineIdentityKey,
  posMergeLineIsUnserved,
} from '@/lib/pos-dine-in-table-merge-rules'

describe('posMergeLineIsUnserved', () => {
  it('treats missing servedAt as unserved', () => {
    expect(posMergeLineIsUnserved({ name: 'A', price: 1, qty: 1 })).toBe(true)
  })
  it('treats empty string servedAt as unserved', () => {
    expect(posMergeLineIsUnserved({ name: 'A', price: 1, qty: 1, servedAt: '  ' })).toBe(true)
  })
  it('treats timestamp as served', () => {
    expect(posMergeLineIsUnserved({ name: 'A', price: 1, qty: 1, servedAt: '2025-01-01' })).toBe(false)
  })
})

describe('consolidatePosOrderLinesAfterMerge', () => {
  it('merges two unserved identical lines into one qty', () => {
    const out = consolidatePosOrderLinesAfterMerge([
      { id: 'a', name: 'Pad Thai', price: 100, qty: 1 },
      { id: 'b', name: 'Pad Thai', price: 100, qty: 2 },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('a')
    expect(out[0].qty).toBe(3)
  })

  it('does not merge when first line is served', () => {
    const out = consolidatePosOrderLinesAfterMerge([
      { id: 'a', name: 'Pad Thai', price: 100, qty: 1, servedAt: '2025-01-01T00:00:00Z' },
      { id: 'b', name: 'Pad Thai', price: 100, qty: 1 },
    ])
    expect(out).toHaveLength(2)
  })

  it('merges absorb-order line into earlier identical unserved line', () => {
    const out = consolidatePosOrderLinesAfterMerge([
      { id: 'k1', name: 'A', price: 10, qty: 1 },
      { id: 'm1', name: 'B', price: 20, qty: 1 },
      { id: 'm2', name: 'A', price: 10, qty: 1 },
    ])
    expect(out).toHaveLength(2)
    const aLine = out.find((x) => x.name === 'A')
    expect(aLine?.qty).toBe(2)
    expect(aLine?.id).toBe('k1')
  })

  it('different note stays separate', () => {
    const out = consolidatePosOrderLinesAfterMerge([
      { id: '1', name: 'A', price: 10, qty: 1, note: 'no onion' },
      { id: '2', name: 'A', price: 10, qty: 1, note: 'extra spicy' },
    ])
    expect(out).toHaveLength(2)
  })

  it('identity includes promoId', () => {
    const k1 = posMergeLineIdentityKey({ name: 'A', price: 10, qty: 1, promoId: 'p1' })
    const k2 = posMergeLineIdentityKey({ name: 'A', price: 10, qty: 1, promoId: 'p2' })
    expect(k1).not.toBe(k2)
  })
})
