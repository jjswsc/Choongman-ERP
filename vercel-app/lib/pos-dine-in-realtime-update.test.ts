import { describe, expect, it } from 'vitest'
import { isPosDineInTableNameOnlyUpdate } from '@/lib/pos-dine-in-realtime-update'

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
