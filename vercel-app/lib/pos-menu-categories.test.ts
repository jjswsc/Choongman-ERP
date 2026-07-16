import { describe, expect, it } from 'vitest'
import {
  mergePromotionIntoCategoriesConfig,
  resolveConfiguredCategoriesForMain,
  POS_CATEGORIES_BY_MAIN,
} from '@/lib/pos-menu-categories'
import {
  PROMOTION_DEFAULT_SUBCATEGORIES,
  PROMOTION_MAIN_CATEGORY,
} from '@/lib/pos-promo-constants'

describe('mergePromotionIntoCategoriesConfig', () => {
  it('keeps Promotion main and seeds default subs when Promotion key is missing', () => {
    const merged = mergePromotionIntoCategoriesConfig({
      mainCategories: ['Chicken'],
      categoriesByMain: { Chicken: ['ORIGINAL'] },
    })
    expect(merged.mainCategories).toContain(PROMOTION_MAIN_CATEGORY)
    expect(merged.categoriesByMain[PROMOTION_MAIN_CATEGORY]).toEqual([...PROMOTION_DEFAULT_SUBCATEGORIES])
  })

  it('allows empty Promotion subcategory list when key is explicit', () => {
    const merged = mergePromotionIntoCategoriesConfig({
      mainCategories: ['Chicken', PROMOTION_MAIN_CATEGORY],
      categoriesByMain: {
        Chicken: ['ORIGINAL'],
        [PROMOTION_MAIN_CATEGORY]: [],
      },
    })
    expect(merged.categoriesByMain[PROMOTION_MAIN_CATEGORY]).toEqual([])
  })

  it('does not re-add deleted default Promotion subs', () => {
    const merged = mergePromotionIntoCategoriesConfig({
      mainCategories: [PROMOTION_MAIN_CATEGORY],
      categoriesByMain: {
        [PROMOTION_MAIN_CATEGORY]: ['Seasonal'],
      },
    })
    expect(merged.categoriesByMain[PROMOTION_MAIN_CATEGORY]).toEqual(['Seasonal'])
  })

  it('allows emptying all subs under a normal main', () => {
    const merged = mergePromotionIntoCategoriesConfig({
      mainCategories: ['Chicken', PROMOTION_MAIN_CATEGORY],
      categoriesByMain: {
        Chicken: [],
        [PROMOTION_MAIN_CATEGORY]: ['Set'],
      },
    })
    expect(merged.categoriesByMain.Chicken).toEqual([])
  })
})

describe('resolveConfiguredCategoriesForMain', () => {
  it('respects empty configured list instead of falling back to presets', () => {
    expect(
      resolveConfiguredCategoriesForMain('Chicken', {
        Chicken: [],
      })
    ).toEqual([])
  })

  it('falls back to library presets when main key is absent', () => {
    expect(resolveConfiguredCategoriesForMain('Chicken', {})).toEqual([
      ...POS_CATEGORIES_BY_MAIN.Chicken,
    ])
  })
})
