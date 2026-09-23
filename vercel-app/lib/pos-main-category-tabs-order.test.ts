import { describe, expect, it } from 'vitest'
import { normalizePosMainCategoryTabs, posMainCategoryTabRank } from '@/lib/pos-promo-constants'

describe('posMainCategoryTabRank / normalizePosMainCategoryTabs', () => {
  it('ranks Promotion → Chicken → Korean → Side → Drinks', () => {
    expect(posMainCategoryTabRank('Promotion')).toBe(0)
    expect(posMainCategoryTabRank('Chicken')).toBe(1)
    expect(posMainCategoryTabRank('Korean')).toBe(2)
    expect(posMainCategoryTabRank('Side')).toBe(3)
    expect(posMainCategoryTabRank('Drinks')).toBe(4)
  })

  it('sorts tabs in preferred guest order', () => {
    expect(normalizePosMainCategoryTabs(['Side', 'Drinks', 'Chicken', 'Korean', 'Promotion'])).toEqual([
      'Promotion',
      'Chicken',
      'Korean',
      'Side',
      'Drinks',
    ])
  })

  it('normalizes legacy Korean Promotion and places it first', () => {
    expect(normalizePosMainCategoryTabs(['Drinks', 'Chicken', '프로모션'])).toEqual([
      'Promotion',
      'Chicken',
      'Drinks',
    ])
  })
})
