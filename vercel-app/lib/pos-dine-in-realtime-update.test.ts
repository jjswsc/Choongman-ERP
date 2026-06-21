import { describe, expect, it } from 'vitest'
import { inferPosOrderTypeFromRow } from '@/lib/pos-sales-order-type-filter'
import {
  isPosDineInTableNameOnlyUpdate,
  isPosOrderItemsJsonPackagingOnlyUpdate,
  posOrderRealtimePricingFieldsChanged,
} from '@/lib/pos-dine-in-realtime-update'

describe('inferPosOrderTypeFromRow', () => {
  it('infers delivery from Line Man memo when DB order_type is dine_in', () => {
    expect(
      inferPosOrderTypeFromRow({
        order_type: 'dine_in',
        memo: 'lineman_order:lm-5768',
        table_name: 'Line Man #5768',
      })
    ).toBe('delivery')
  })

  it('keeps dine_in for in-store table orders', () => {
    expect(
      inferPosOrderTypeFromRow({
        order_type: 'dine_in',
        table_name: '9',
        memo: '',
      })
    ).toBe('dine_in')
  })
})

describe('isPosDineInTableNameOnlyUpdate', () => {
  const items = JSON.stringify([{ id: 'line-1', name: 'Rice', price: 99, qty: 1 }])

  it('returns true when only table_name changes', () => {
    expect(
      isPosDineInTableNameOnlyUpdate(
        { table_name: '9', items_json: items, subtotal: 99, total: 99 },
        { table_name: '18', items_json: items, subtotal: 99, total: 99 }
      )
    ).toBe(true)
  })

  it('returns false when items_json changes', () => {
    expect(
      isPosDineInTableNameOnlyUpdate(
        { table_name: '9', items_json: items, subtotal: 99, total: 99 },
        {
          table_name: '18',
          items_json: JSON.stringify([{ id: 'line-1', name: 'Rice', price: 99, qty: 2 }]),
          subtotal: 198,
          total: 198,
        }
      )
    ).toBe(false)
  })

  it('returns false when table_name is unchanged', () => {
    expect(
      isPosDineInTableNameOnlyUpdate(
        { table_name: '9', items_json: items, subtotal: 99, total: 99 },
        { table_name: '9', items_json: items, subtotal: 99, total: 99 }
      )
    ).toBe(false)
  })
})

describe('isPosOrderItemsJsonPackagingOnlyUpdate', () => {
  const baseItems = [
    { id: 'line-1', name: 'Chicken', price: 279, qty: 1 },
    { id: 'line-2', name: 'Udon', price: 209, qty: 1 },
  ]

  it('returns true when only servedAt is added (packaging check)', () => {
    const oldJson = JSON.stringify(baseItems)
    const newJson = JSON.stringify([
      { ...baseItems[0], servedAt: '2026-06-21T16:36:44+07:00' },
      baseItems[1],
    ])
    expect(
      isPosOrderItemsJsonPackagingOnlyUpdate(
        { id: 1, items_json: oldJson, discount_amt: 10, total: 1972 },
        { id: 1, items_json: newJson, discount_amt: 10, total: 1972 }
      )
    ).toBe(true)
  })

  it('returns true when Realtime OLD only has PK (replica identity default)', () => {
    const newJson = JSON.stringify(baseItems)
    expect(
      isPosOrderItemsJsonPackagingOnlyUpdate({ id: 1 }, { id: 1, items_json: newJson, discount_amt: 10, total: 1972 })
    ).toBe(true)
  })

  it('returns false when qty increases (add-on order)', () => {
    const oldJson = JSON.stringify(baseItems)
    const newJson = JSON.stringify([...baseItems, { id: 'line-3', name: 'Rice', price: 99, qty: 1 }])
    expect(
      isPosOrderItemsJsonPackagingOnlyUpdate(
        { id: 1, items_json: oldJson, total: 1972 },
        { id: 1, items_json: newJson, total: 2071 }
      )
    ).toBe(false)
  })
})

describe('posOrderRealtimePricingFieldsChanged', () => {
  it('returns false when OLD row lacks pricing fields (Supabase partial OLD)', () => {
    expect(
      posOrderRealtimePricingFieldsChanged({ id: 1 }, { id: 1, discount_amt: 10, total: 1972 })
    ).toBe(false)
  })

  it('returns true when discount_amt actually changes', () => {
    expect(
      posOrderRealtimePricingFieldsChanged(
        { id: 1, discount_amt: 0, total: 1982 },
        { id: 1, discount_amt: 10, total: 1972 }
      )
    ).toBe(true)
  })
})
