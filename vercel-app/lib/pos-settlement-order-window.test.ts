import { describe, expect, it } from 'vitest'
import {
  buildPosSettlementOrdersDateFilters,
  mergeSettlementOrderRowsById,
} from '@/lib/pos-settlement-order-window'

describe('buildPosSettlementOrdersDateFilters', () => {
  it('uses created_at open-day window (cash = sale day)', () => {
    const start = '2026-10-23T22:00:00.000Z'
    const end = '2026-10-24T22:00:00.000Z'
    const { paidAtFilter, nullPaidCreatedFallbackFilter } = buildPosSettlementOrdersDateFilters(
      start,
      end,
      'CM MBK'
    )
    expect(paidAtFilter).toContain('created_at=gte.')
    expect(paidAtFilter).toContain('created_at=lt.')
    expect(paidAtFilter).not.toContain('paid_at=')
    expect(paidAtFilter).toContain('store_code=ilike.')
    expect(nullPaidCreatedFallbackFilter).toContain('id=eq.-1')
    expect(decodeURIComponent(paidAtFilter)).toContain(start)
    expect(decodeURIComponent(paidAtFilter)).toContain(end)
  })
})

describe('mergeSettlementOrderRowsById', () => {
  it('dedupes by id and keeps primary over fallback', () => {
    const merged = mergeSettlementOrderRowsById(
      [
        { id: 1, total: 100 },
        { id: 2, total: 200 },
      ],
      [
        { id: 2, total: 999 },
        { id: 3, total: 300 },
      ]
    )
    expect(merged).toEqual([
      { id: 1, total: 100 },
      { id: 2, total: 200 },
      { id: 3, total: 300 },
    ])
  })

  it('concats when rows have no id', () => {
    const merged = mergeSettlementOrderRowsById([{ total: 1 }], [{ total: 2 }])
    expect(merged).toEqual([{ total: 1 }, { total: 2 }])
  })
})
