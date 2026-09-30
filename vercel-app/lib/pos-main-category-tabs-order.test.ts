import { describe, expect, it } from 'vitest'
import {
  normalizePosMainCategoryTabs,
  orderPosMainCategoryTabs,
  posMainCategoryTabRank,
  uniqueSubcategoriesForMainMenu,
} from '@/lib/pos-promo-constants'
import { sanitizePosCategoryTabOrder } from '@/lib/pos-category-tab-order'

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

  it('uses a saved main-category order and keeps unknown names after it', () => {
    expect(orderPosMainCategoryTabs(['Promotion', 'Chicken', 'Side Dish', 'Mart'], ['Mart', 'Side Dish', 'Chicken', 'Promotion'])).toEqual([
      'Mart',
      'Side Dish',
      'Chicken',
      'Promotion',
    ])
  })

  it('uses a saved subcategory order', () => {
    expect(uniqueSubcategoriesForMainMenu('Side Dish', ['DRINKS', 'Noodle', 'Rice'], ['Rice', 'DRINKS', 'Noodle'])).toEqual([
      'Rice',
      'DRINKS',
      'Noodle',
    ])
  })

  it('keeps alphabetical subcategories when no order is saved', () => {
    expect(uniqueSubcategoriesForMainMenu('Side Dish', ['Rice', 'DRINKS', 'Noodle'])).toEqual(['DRINKS', 'Noodle', 'Rice'])
  })

  it('drops blank labels from a saved tab order', () => {
    expect(sanitizePosCategoryTabOrder({ mains: [' Promotion ', '', 'Chicken'], subsByMain: { 'Side Dish': ['Rice', 'Rice'] } })).toEqual({
      mains: ['Promotion', 'Chicken'],
      subsByMain: { 'Side Dish': ['Rice'] },
    })
  })
})
