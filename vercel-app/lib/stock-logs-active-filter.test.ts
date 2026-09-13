import { describe, expect, it } from 'vitest'
import { sumStockLogItemQty, withStockLogsActiveFilter } from './stock-logs-active-filter'

describe('stock-logs-active-filter', () => {
  it('appends is_deleted active filter', () => {
    expect(withStockLogsActiveFilter('location=ilike.본사')).toContain('is_deleted.is.false')
  })

  it('sums qty and ignores deleted conceptually at caller', () => {
    expect(
      sumStockLogItemQty([
        { item_code: 'CM027', qty: -22 },
        { item_code: 'CM027', qty: -22 },
        { item_code: 'CM016', qty: 1 },
      ])
    ).toEqual({ CM027: -44, CM016: 1 })
  })
})
