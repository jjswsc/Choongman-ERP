import { describe, expect, it } from 'vitest'
import { mapLinesToCustomerDisplayItems } from '@/lib/pos-terminal-customer-display'

describe('mapLinesToCustomerDisplayItems', () => {
  it('maps quantity + price into qty/amount', () => {
    expect(
      mapLinesToCustomerDisplayItems([
        { name: 'Kimchi soup', quantity: 2, price: 129.5 },
      ])
    ).toEqual([{ name: 'Kimchi soup', qty: 2, amount: 259 }])
  })

  it('accepts qty alias and keeps explicit amount', () => {
    expect(
      mapLinesToCustomerDisplayItems([{ name: 'Coke', qty: 1, price: 20, amount: 20 }])
    ).toEqual([{ name: 'Coke', qty: 1, amount: 20 }])
  })

  it('drops blank zero-amount rows', () => {
    expect(
      mapLinesToCustomerDisplayItems([
        { name: '', quantity: 1, price: 0 },
        { name: 'Rice', quantity: 1, price: 15 },
      ])
    ).toEqual([{ name: 'Rice', qty: 1, amount: 15 }])
  })

  it('returns empty for missing lines', () => {
    expect(mapLinesToCustomerDisplayItems(undefined)).toEqual([])
    expect(mapLinesToCustomerDisplayItems([])).toEqual([])
  })
})
