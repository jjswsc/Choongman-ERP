import { describe, expect, it } from 'vitest'
import {
  buildKitchenCartLinesFromSnapshotDelta,
  collectDineInSnapshotIncreasedKeys,
  filterKitchenCartLinesForDineInAdd,
  resolveDineInKitchenSnapshotItemKey,
} from '@/lib/pos-kitchen-dine-in-delta'

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

  it('matches existing lines by content when cart id changed (cart-* regen)', () => {
    const cart = [
      { id: 'cart-menu1-newuuid', name: 'Budae Jiggae', price: 299, quantity: 1 },
      { id: 'cart-menu2-newuuid', name: 'Banban Chicken', price: 199, quantity: 1 },
    ]
    expect(
      filterKitchenCartLinesForDineInAdd(cart, [
        { id: 'cart-menu1-olduuid', name: 'Budae Jiggae', price: 299, quantity: 1 },
      ])
    ).toEqual([{ id: 'cart-menu2-newuuid', name: 'Banban Chicken', price: 199, quantity: 1 }])
  })
})

describe('resolveDineInKitchenSnapshotItemKey', () => {
  it('uses content signature for ephemeral cart-* ids', () => {
    const a = resolveDineInKitchenSnapshotItemKey({
      id: 'cart-menu1-aaa',
      name: 'Budae Jiggae',
      price: 299,
      menuId: 'm1',
    })
    const b = resolveDineInKitchenSnapshotItemKey({
      id: 'cart-menu1-bbb',
      name: 'Budae Jiggae',
      price: 299,
      menuId: 'm1',
    })
    expect(a).toBe(b)
    expect(a.startsWith('sig:')).toBe(true)
  })

  it('keeps stable non-cart ids', () => {
    expect(
      resolveDineInKitchenSnapshotItemKey({ id: 'line-persist-1', name: 'Rice', price: 30 })
    ).toBe('line-persist-1')
  })
})

describe('buildKitchenCartLinesFromSnapshotDelta', () => {
  it('returns only increased keys with delta qty', () => {
    const cart = [
      { id: 'x1', name: 'Budae Jiggae', price: 299, quantity: 1, menuId: 'b' },
      { id: 'x2', name: 'Pepsi', price: 35, quantity: 1, menuId: 'p' },
      { id: 'x3', name: 'Banban Chicken', price: 199, quantity: 1, menuId: 'c' },
    ]
    const resolveKey = (line: (typeof cart)[number]) =>
      resolveDineInKitchenSnapshotItemKey({
        id: line.id,
        name: line.name,
        price: line.price,
        menuId: line.menuId,
      })
    const prev = new Map([
      [resolveKey(cart[0]), 1],
      [resolveKey(cart[1]), 1],
    ])
    const next = new Map([
      [resolveKey(cart[0]), 1],
      [resolveKey(cart[1]), 1],
      [resolveKey(cart[2]), 1],
    ])
    expect(buildKitchenCartLinesFromSnapshotDelta(cart, prev, next, resolveKey)).toEqual([
      { id: 'x3', name: 'Banban Chicken', price: 199, quantity: 1, menuId: 'c' },
    ])
  })
})

describe('collectDineInSnapshotIncreasedKeys', () => {
  it('lists keys whose qty increased', () => {
    const prev = new Map([['a', 1]])
    const next = new Map([['a', 1], ['b', 1]])
    expect(collectDineInSnapshotIncreasedKeys(prev, next)).toEqual(new Set(['b']))
  })
})
