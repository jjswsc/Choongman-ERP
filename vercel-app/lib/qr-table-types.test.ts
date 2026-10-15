import { describe, expect, it } from 'vitest'
import {
  defaultQrOrderStoreSettings,
  mergeQrHiddenMenuIds,
  normalizeQrHiddenMenuIds,
} from '@/lib/qr-table-types'

describe('normalizeQrHiddenMenuIds', () => {
  it('accepts arrays from PostgREST bigint[] and dedupes/sorts', () => {
    expect(normalizeQrHiddenMenuIds([12, '5', 12, 0, -1, 'x', 3.7])).toEqual([3, 5, 12])
  })

  it('accepts JSON and postgres array literals', () => {
    expect(normalizeQrHiddenMenuIds('[7,2]')).toEqual([2, 7])
    expect(normalizeQrHiddenMenuIds('{9,4}')).toEqual([4, 9])
  })

  it('returns empty for null/blank/garbage', () => {
    expect(normalizeQrHiddenMenuIds(null)).toEqual([])
    expect(normalizeQrHiddenMenuIds(undefined)).toEqual([])
    expect(normalizeQrHiddenMenuIds('')).toEqual([])
    expect(normalizeQrHiddenMenuIds('[bad')).toEqual([])
    expect(normalizeQrHiddenMenuIds({})).toEqual([])
  })

  it('defaults to no hidden menus', () => {
    expect(defaultQrOrderStoreSettings('S1').hiddenMenuIds).toEqual([])
  })
})

describe('mergeQrHiddenMenuIds', () => {
  it('adds hide ids and keeps store-only hidden menus', () => {
    expect(mergeQrHiddenMenuIds([9], [3, 5], [])).toEqual([3, 5, 9])
  })

  it('removes show ids even if already hidden in that store', () => {
    expect(mergeQrHiddenMenuIds([3, 9], [5], [3])).toEqual([5, 9])
  })

  it('show wins when the same id is in both lists', () => {
    expect(mergeQrHiddenMenuIds([], [4], [4])).toEqual([])
  })
})
