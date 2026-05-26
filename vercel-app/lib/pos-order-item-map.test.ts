import { describe, expect, it } from 'vitest'

import {
  cartLinesToPosOrderItems,
  mergeDineInAddonCartPosItemsWithExisting,
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
