import { describe, expect, it } from 'vitest'
import {
  aggregatePosTodaySalesFromRows,
  groupPosTodaySalesByCanonicalStore,
  groupPosTodaySalesByStoreCodes,
  matchRequestedStoreCodeForTodaySales,
  sumPosTodaySalesSummaries,
} from '@/lib/pos-today-sales-aggregate'
describe('sumPosTodaySalesSummaries', () => {
  it('adds completed/pending totals across stores', () => {
    expect(
      sumPosTodaySalesSummaries([
        { completedCount: 2, completedTotal: 100, completedCash: 40, pendingCount: 1 },
        { completedCount: 3, completedTotal: 250, completedCash: 10, pendingCount: 4 },
      ])
    ).toEqual({
      completedCount: 5,
      completedTotal: 350,
      completedCash: 50,
      pendingCount: 5,
    })
  })

  it('returns zeros for an empty list', () => {
    expect(sumPosTodaySalesSummaries([])).toEqual({
      completedCount: 0,
      completedTotal: 0,
      completedCash: 0,
      pendingCount: 0,
    })
  })
})

describe('aggregatePosTodaySalesFromRows', () => {
  it('splits completed vs pending and sums cash', () => {
    expect(
      aggregatePosTodaySalesFromRows([
        { status: 'paid', total: 100, payment_cash: 40 },
        { status: 'ready', total: 50, payment_cash: 0 },
        { status: 'cooking', total: 30, payment_cash: 0 },
        { status: 'cancelled', total: 99, payment_cash: 99 },
        { status: 'ready', total: 80, payment_cash: 0, is_advance: true },
        { status: 'pending', total: 70, payment_cash: 0, is_advance: true },
        { status: 'completed', total: 200, payment_cash: 150, is_advance: true },
      ])
    ).toEqual({
      completedCount: 3,
      completedTotal: 350,
      completedCash: 190,
      pendingCount: 3,
    })
  })
})

describe('matchRequestedStoreCodeForTodaySales', () => {
  it('prefers exact store code over CM-prefix alias', () => {
    expect(
      matchRequestedStoreCodeForTodaySales('CM Asoke', ['Asoke', 'CM Asoke'])
    ).toBe('CM Asoke')
    expect(matchRequestedStoreCodeForTodaySales('Asoke', ['Asoke', 'CM Asoke'])).toBe('Asoke')
  })

  it('maps CM prefix to the requested alias', () => {
    expect(matchRequestedStoreCodeForTodaySales('CM Asoke', ['Asoke'])).toBe('Asoke')
  })
})

describe('groupPosTodaySalesByStoreCodes', () => {
  it('does not double-count the same order across alias store ids', () => {
    const grouped = groupPosTodaySalesByStoreCodes(
      [{ store_code: 'CM Asoke', status: 'paid', total: 200, payment_cash: 200 }],
      ['Asoke', 'CM Asoke']
    )
    expect(grouped['CM Asoke']?.completedTotal).toBe(200)
    expect(grouped['Asoke']?.completedTotal).toBe(0)
  })

  it('fills zero summaries for stores with no rows', () => {
    const grouped = groupPosTodaySalesByStoreCodes([], ['Silom'])
    expect(grouped.Silom).toEqual({
      completedCount: 0,
      completedTotal: 0,
      completedCash: 0,
      pendingCount: 0,
    })
  })
})

describe('groupPosTodaySalesByCanonicalStore', () => {
  it('merges CM prefix variants into one canonical key', () => {
    const grouped = groupPosTodaySalesByCanonicalStore([
      { store_code: 'Asoke', status: 'paid', total: 10, payment_cash: 10 },
      { store_code: 'CM Asoke', status: 'paid', total: 20, payment_cash: 0 },
    ])
    const keys = Object.keys(grouped)
    expect(keys).toHaveLength(1)
    expect(grouped[keys[0]!]?.completedTotal).toBe(30)
  })
})
