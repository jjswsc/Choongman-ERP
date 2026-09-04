import { describe, expect, it } from 'vitest'
import {
  aggregateOpenTableTotalsFromRows,
  rowCountsTowardOpenTable,
} from '@/lib/pos-open-table-totals'

describe('rowCountsTowardOpenTable', () => {
  it('counts dine-in unpaid seats with a table name', () => {
    expect(
      rowCountsTowardOpenTable({
        order_type: 'dine_in',
        table_name: 'A1',
        status: 'cooking',
        total: 100,
      })
    ).toBe(true)
    expect(
      rowCountsTowardOpenTable({
        order_type: 'dine_in',
        table_name: 'A1',
        status: 'ready',
        total: 80,
      })
    ).toBe(true)
  })

  it('skips paid, delivery, empty table, and unfulfilled advance', () => {
    expect(
      rowCountsTowardOpenTable({
        order_type: 'dine_in',
        table_name: 'A1',
        status: 'paid',
        total: 100,
      })
    ).toBe(false)
    expect(
      rowCountsTowardOpenTable({
        order_type: 'delivery',
        table_name: 'Grab',
        status: 'cooking',
        total: 100,
      })
    ).toBe(false)
    expect(
      rowCountsTowardOpenTable({
        order_type: 'dine_in',
        table_name: '  ',
        status: 'cooking',
        total: 100,
      })
    ).toBe(false)
    expect(
      rowCountsTowardOpenTable({
        order_type: 'dine_in',
        table_name: 'A1',
        status: 'pending',
        total: 50,
        is_advance: true,
      })
    ).toBe(false)
  })
})

describe('aggregateOpenTableTotalsFromRows', () => {
  it('splits unpaid vs expected addend (ready already in confirmed)', () => {
    const { total, byStore } = aggregateOpenTableTotalsFromRows(
      [
        { store_code: 'Silom', order_type: 'dine_in', table_name: '1', status: 'cooking', total: 200 },
        { store_code: 'Silom', order_type: 'dine_in', table_name: '2', status: 'ready', total: 50 },
        { store_code: 'Asoke', order_type: 'dine_in', table_name: '3', status: 'pending', total: 30 },
      ],
      ['Silom', 'Asoke']
    )
    expect(byStore.Silom).toEqual({ tableTotal: 250, expectedAddend: 200 })
    expect(byStore.Asoke).toEqual({ tableTotal: 30, expectedAddend: 30 })
    expect(total).toEqual({ tableTotal: 280, expectedAddend: 230 })
  })
})
