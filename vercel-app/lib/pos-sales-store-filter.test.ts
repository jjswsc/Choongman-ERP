import { describe, expect, it } from 'vitest'
import {
  appendStoreCodeFilter,
  parseStoreList,
  resolveStoresFromParams,
} from '@/lib/pos-sales-store-filter'

describe('parseStoreList', () => {
  it('trims and drops empties', () => {
    expect(parseStoreList(' a , , b ')).toEqual(['a', 'b'])
  })
})

describe('resolveStoresFromParams', () => {
  it('prefers stores over pos', () => {
    expect(resolveStoresFromParams('X', 'a,b')).toEqual(['a', 'b'])
  })
  it('uses pos when stores empty', () => {
    expect(resolveStoresFromParams('Shop1', null)).toEqual(['Shop1'])
  })
  it('ignores All pos', () => {
    expect(resolveStoresFromParams('All', null)).toEqual([])
  })
})

describe('appendStoreCodeFilter', () => {
  it('returns base when no stores', () => {
    expect(appendStoreCodeFilter('created_at=gte.x', [])).toBe('created_at=gte.x')
  })
  it('uses ilike for one store', () => {
    expect(appendStoreCodeFilter('x=1', ['ABC'])).toBe('x=1&store_code=ilike.ABC')
  })
  it('uses in clause for multiple stores', () => {
    const out = appendStoreCodeFilter('x=1', ['A', 'B'])
    expect(out).toContain('store_code=')
    expect(decodeURIComponent(out.split('store_code=')[1] ?? '')).toBe('in.(A,B)')
  })
})
