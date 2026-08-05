import { describe, expect, it } from 'vitest'
import {
  buildStoreFieldOrIlikeFragment,
  sqlIlikeContains,
  storeFilterSearchTerms,
  storeMatchesIncomeFilter,
} from '@/lib/accounting-store-match'

describe('storeFilterSearchTerms', () => {
  it('splits comma-separated franchise stores', () => {
    expect(
      storeFilterSearchTerms(
        'CM Future Park,CM Ekkamai,CM Silom,CM True Digital,CM Union Mall,CM MBK'
      )
    ).toEqual([
      'CM Future Park',
      'CM Ekkamai',
      'CM Silom',
      'CM True Digital',
      'CM Union Mall',
      'CM MBK',
    ])
  })

  it('returns single store as one term', () => {
    expect(storeFilterSearchTerms('CM Silom')).toEqual(['CM Silom'])
  })
})

describe('buildStoreFieldOrIlikeFragment', () => {
  it('does not put raw commas inside or=() values (PGRST100)', () => {
    const frag = buildStoreFieldOrIlikeFragment(
      'store',
      'CM Future Park,CM Ekkamai,CM Silom,CM True Digital,CM Union Mall,CM MBK'
    )
    expect(frag.startsWith('or=(')).toBe(true)
    // Each or-arm value must be URI-encoded so commas are %2C only if in a name —
    // multi-store must be split into separate arms, not one "%A,B,C%" blob.
    expect(frag).not.toContain(encodeURIComponent(sqlIlikeContains(
      'CM Future Park,CM Ekkamai,CM Silom,CM True Digital,CM Union Mall,CM MBK'
    )))
    expect(frag).toContain('store.ilike.' + encodeURIComponent(sqlIlikeContains('CM Future Park')))
    expect(frag).toContain('store.ilike.' + encodeURIComponent(sqlIlikeContains('CM MBK')))
    expect(frag).toContain('store.ilike.' + encodeURIComponent(sqlIlikeContains('Future Park')))
    const arms = frag.slice('or=('.length, -1).split(',')
    expect(arms.length).toBeGreaterThanOrEqual(12)
    for (const arm of arms) {
      const m = arm.match(/\.ilike\.(.+)$/)
      expect(m).toBeTruthy()
      const decoded = decodeURIComponent(m![1]!)
      expect(decoded.includes(',')).toBe(false)
    }
  })

  it('single store with CM variants uses or=()', () => {
    const frag = buildStoreFieldOrIlikeFragment('store', 'CM Silom')
    expect(frag).toContain('or=(')
    expect(frag).toContain(encodeURIComponent(sqlIlikeContains('CM Silom')))
    expect(frag).toContain(encodeURIComponent(sqlIlikeContains('Silom')))
  })
})

describe('storeMatchesIncomeFilter multi-store', () => {
  it('matches any store in comma-separated filter', () => {
    expect(storeMatchesIncomeFilter('CM Ekkamai', 'CM Future Park,CM Ekkamai,CM Silom')).toBe(true)
    expect(storeMatchesIncomeFilter('CM Other', 'CM Future Park,CM Ekkamai')).toBe(false)
  })
})
