import { describe, expect, it } from 'vitest'
import { filterKitchenCartLinesForDineInAdd } from '@/lib/pos-kitchen-dine-in-delta'

describe('filterKitchenCartLinesForDineInAdd', () => {
  it('returns only new item ids when existing rows have no qty info', () => {
    const cart = [
      { id: 'a', name: 'A', price: 100, quantity: 1 },
      { id: 'b', name: 'B', price: 200, quantity: 1 },
    ]
    expect(filterKitchenCartLinesForDineInAdd(cart, [{ id: 'a' }])).toEqual([
      { id: 'b', name: 'B', price: 200, quantity: 1 },
    ])
  })

  it('returns qty delta for an existing line when qty info is present', () => {
    const cart = [{ id: 'a', name: 'A', price: 100, quantity: 3, qty: 3 }]
    expect(
      filterKitchenCartLinesForDineInAdd(cart, [{ id: 'a', quantity: 1, qty: 1 }])
    ).toEqual([{ id: 'a', name: 'A', price: 100, quantity: 2, qty: 2 }])
  })

  it('includes full qty for newly added lines alongside qty deltas', () => {
    const cart = [
      { id: 'a', name: 'A', price: 100, quantity: 2 },
      { id: 'b', name: 'B', price: 200, quantity: 1 },
    ]
    expect(
      filterKitchenCartLinesForDineInAdd(cart, [
        { id: 'a', quantity: 1 },
        { id: 'c', quantity: 1 },
      ])
    ).toEqual([
      { id: 'a', name: 'A', price: 100, quantity: 1, qty: 1 },
      { id: 'b', name: 'B', price: 200, quantity: 1 },
    ])
  })

  it('returns empty when qty did not increase', () => {
    const cart = [{ id: 'a', name: 'A', price: 100, quantity: 1 }]
    expect(filterKitchenCartLinesForDineInAdd(cart, [{ id: 'a', quantity: 1 }])).toEqual([])
  })
})
