import { describe, expect, it } from 'vitest'

import {
  cartLinesToPosOrderItems,
  isDineInAddonOnlyIncomingCart,
  mergeDineInAddonCartPosItemsWithExisting,
  mergeDineInPaymentCartWithServerItems,
  normalizeCartLineIdForSave,
} from '@/lib/pos-order-item-map'

describe('normalizeCartLineIdForSave', () => {
  it('strips cart-existing prefix and keeps original ids', () => {
    expect(normalizeCartLineIdForSave('cart-existing-2-line-abc')).toBe('line-abc')
    expect(normalizeCartLineIdForSave('line-abc')).toBe('line-abc')
  })
})

describe('cartLinesToPosOrderItems', () => {
  it('stores existing cart lines with their original order item ids', () => {
    expect(
      cartLinesToPosOrderItems([
        {
          id: 'cart-existing-0-old-line',
          name: 'Kimchi Soup',
          price: 30,
          quantity: 1,
        },
      ])
    ).toEqual([
      {
        id: 'old-line',
        name: 'Kimchi Soup',
        price: 30,
        qty: 1,
        quantity: 1,
      },
    ])
  })
})

describe('isDineInAddonOnlyIncomingCart', () => {
  it('is true when every incoming line id is new relative to existing order', () => {
    const existing = [{ id: 'line-a', name: 'Rice', price: 50, qty: 1, quantity: 1 }]
    const incoming = [{ id: 'cart-new-soup', name: 'Soup', price: 99, qty: 1, quantity: 1 }]
    expect(isDineInAddonOnlyIncomingCart(existing, incoming)).toBe(true)
  })

  it('is false when incoming references an existing order line id', () => {
    const existing = [{ id: 'line-a', name: 'Rice', price: 50, qty: 1, quantity: 1 }]
    const incoming = [
      { id: 'cart-existing-0-line-a', name: 'Rice', price: 50, qty: 2, quantity: 2 },
    ]
    expect(isDineInAddonOnlyIncomingCart(existing, incoming)).toBe(false)
  })
})

describe('mergeDineInAddonCartPosItemsWithExisting', () => {
  it('does not duplicate old lines when cart contains existing rows plus one new row', () => {
    const existing = [
      { id: 'line-a', name: 'Cheese Tteokbokki', price: 229, qty: 1, quantity: 1 },
      { id: 'line-b', name: 'Kimchi Soup', price: 30, qty: 1, quantity: 1 },
      { id: 'line-c', name: 'Cheese Cream Kimchi Rice', price: 249, qty: 1, quantity: 1 },
    ]

    const fromCart = [
      { id: 'cart-existing-0-line-a', name: 'Cheese Tteokbokki', price: 229, qty: 1, quantity: 1 },
      { id: 'cart-existing-1-line-b', name: 'Kimchi Soup', price: 30, qty: 1, quantity: 1 },
      { id: 'cart-existing-2-line-c', name: 'Cheese Cream Kimchi Rice', price: 249, qty: 1, quantity: 1 },
      { id: 'line-pepsi', name: 'Pepsi', price: 30, qty: 1, quantity: 1 },
    ]

    expect(mergeDineInAddonCartPosItemsWithExisting(existing, fromCart)).toMatchObject([
      { id: 'line-a', name: 'Cheese Tteokbokki', price: 229, qty: 1, quantity: 1 },
      { id: 'line-b', name: 'Kimchi Soup', price: 30, qty: 1, quantity: 1 },
      { id: 'line-c', name: 'Cheese Cream Kimchi Rice', price: 249, qty: 1, quantity: 1 },
      { id: 'line-pepsi', name: 'Pepsi', price: 30, qty: 1, quantity: 1 },
    ])
  })
})

describe('mergeDineInPaymentCartWithServerItems', () => {
  it('keeps server-only add-on lines when payment cart is a stale subset (MBK 7UP case)', () => {
    const server = [
      { id: 'line-a', name: 'Main', price: 249, qty: 1, quantity: 1 },
      { id: 'line-b', name: 'Side', price: 219, qty: 1, quantity: 1 },
      { id: 'line-7up', name: '7UP No Sugar', price: 30, qty: 1, quantity: 1 },
    ]
    const staleCart = [
      { id: 'line-a', name: 'Main', price: 249, qty: 1, quantity: 1 },
      { id: 'line-b', name: 'Side', price: 219, qty: 1, quantity: 1 },
    ]
    expect(mergeDineInPaymentCartWithServerItems(server, staleCart)).toMatchObject([
      { id: 'line-a', price: 249, qty: 1 },
      { id: 'line-b', price: 219, qty: 1 },
      { id: 'line-7up', name: '7UP No Sugar', price: 30, qty: 1 },
    ])
  })

  it('uses cart as full snapshot when cart includes every server line', () => {
    const server = [
      { id: 'line-a', name: 'Main', price: 249, qty: 1, quantity: 1 },
      { id: 'line-b', name: 'Side', price: 219, qty: 2, quantity: 2 },
    ]
    const cart = [
      { id: 'line-a', name: 'Main', price: 249, qty: 1, quantity: 1 },
      { id: 'line-b', name: 'Side', price: 219, qty: 3, quantity: 3 },
    ]
    expect(mergeDineInPaymentCartWithServerItems(server, cart)).toMatchObject([
      { id: 'line-a', qty: 1 },
      { id: 'line-b', qty: 3 },
    ])
  })
})
