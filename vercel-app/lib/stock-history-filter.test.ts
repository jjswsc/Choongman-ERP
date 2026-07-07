import { describe, expect, it } from 'vitest'
import { collectCategoryOptions, filterStockHistoryRows, filterStockListRows } from './stock-history-filter'

describe('stock-history-filter', () => {
  const rows = [
    { item: 'Chicken A', itemCode: 'C001', category: 'Chicken' },
    { item: 'Sauce B', itemCode: 'S002', category: 'Sauce' },
  ]

  const listRows = [
    { code: 'C001', name: 'Chicken A', category: 'Chicken' },
    { code: 'S002', name: 'Sauce B', category: 'Sauce' },
  ]

  it('filters history by category and search (code or name)', () => {
    expect(filterStockHistoryRows(rows, 'Chicken', '')).toHaveLength(1)
    expect(filterStockHistoryRows(rows, '', 's002')).toHaveLength(1)
    expect(filterStockHistoryRows(rows, 'Sauce', 'sauce')).toHaveLength(1)
  })

  it('filters stock list by category and search', () => {
    expect(filterStockListRows(listRows, 'Chicken', '')).toHaveLength(1)
    expect(filterStockListRows(listRows, '', 's002')).toHaveLength(1)
  })

  it('collects sorted unique categories', () => {
    expect(collectCategoryOptions(rows, ['Drink'])).toEqual(['Chicken', 'Drink', 'Sauce'])
  })
})
