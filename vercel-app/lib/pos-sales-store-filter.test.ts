import { describe, expect, it } from 'vitest'
import {
  appendStoreCodeFilter,
  parseStoreList,
  resolveBankRowStoreName,
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
  it('expands CM variants and uses in clause for one logical store', () => {
    const out = appendStoreCodeFilter('x=1', ['ABC'])
    expect(out).toContain('store_code=')
    expect(decodeURIComponent(out.split('store_code=')[1] ?? '')).toBe('in.(ABC,CM ABC)')
  })
  it('uses in clause for multiple stores', () => {
    const out = appendStoreCodeFilter('x=1', ['A', 'B'])
    expect(out).toContain('store_code=')
    const decoded = decodeURIComponent(out.split('store_code=')[1] ?? '')
    expect(decoded).toBe('in.(A,CM A,B,CM B)')
  })
})

describe('resolveBankRowStoreName', () => {
  it('does not assign empty rows to a selected store without a memo mention', () => {
    expect(
      resolveBankRowStoreName({
        storeName: '',
        memo: '이체입금 | X3812 GRABFOOD',
        storeCodes: ['CM Ekkamai'],
      })
    ).toBe('')
  })

  it('prefers store_name, then store, then unique memo mention', () => {
    expect(
      resolveBankRowStoreName({
        storeName: 'CM Ekkamai',
        store: 'CM Union Mall',
        memo: 'GRABFOOD UNION MALL',
        storeCodes: ['CM Ekkamai'],
      })
    ).toBe('CM Ekkamai')
    expect(
      resolveBankRowStoreName({
        storeName: '',
        store: 'CM Future Park',
        memo: 'GRABFOOD',
        storeCodes: ['CM Ekkamai'],
      })
    ).toBe('CM Future Park')
    expect(
      resolveBankRowStoreName({
        storeName: '',
        store: 'CM Office',
        memo: 'GRABFOOD EKKAMAI',
        storeCodes: ['CM Ekkamai', 'CM Union Mall'],
      })
    ).toBe('CM Ekkamai')
  })
})
