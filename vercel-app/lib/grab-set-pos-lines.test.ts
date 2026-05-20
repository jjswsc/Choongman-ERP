import { describe, expect, it } from 'vitest'
import { buildGrabPosCatalog } from '@/lib/grab-pos-order-enrich'
import { mergeGrabSetChildLinesIntoPromoParents, parseGrabSetChildLineName } from '@/lib/grab-set-pos-lines'

describe('parseGrabSetChildLineName', () => {
  it('parses [[April] Set 1] Rice', () => {
    expect(parseGrabSetChildLineName('[[April] Set 1] Rice')).toEqual({
      promoLabel: 'April Set 1',
      childName: 'Rice',
    })
  })
})

describe('mergeGrabSetChildLinesIntoPromoParents', () => {
  it('merges child lines into parent promoItems', () => {
    const catalog = buildGrabPosCatalog(
      [
        { id: 10, name: 'Rice', code: 'C100' },
        { id: 20, name: 'GOLDEN FRIED CHICKEN', code: 'C200' },
      ],
      [{ name: 'Size S', optionCode: 'C100-1' }],
      [
        {
          id: '5',
          name: '[[April] Set 1]',
          code: 'SET1',
          items: [],
        },
      ]
    )
    const items = mergeGrabSetChildLinesIntoPromoParents(
      [
        { id: 'p1', name: 'Set 1', price: 111, qty: 1, promoId: '5' },
        {
          id: 'c1',
          name: '[[April] Set 1] Rice',
          price: 0,
          qty: 1,
          menuId1: '10',
          note: 'optc:C100-1',
        },
        { id: 'c2', name: '[[April] Set 1] GOLDEN FRIED CHICKEN', price: 0, qty: 1, menuId1: '20' },
      ],
      catalog
    )
    expect(items[0].promoItems?.length).toBe(2)
    expect(items[0].promoItems?.[0]?.menuName).toBe('Rice')
    expect(items[0].promoItems?.[0]?.optionName).toMatch(/size s/i)
    expect(items[1].grabSetChild).toBe(true)
    expect(items[2].grabSetChild).toBe(true)
  })

  it('does not mark child row as hidden when parent line does not exist', () => {
    const catalog = buildGrabPosCatalog(
      [{ id: 10, name: 'Rice', code: 'C100' }],
      [{ name: 'Size S', optionCode: 'C100-1' }],
      [{ id: '5', name: '[[April] Set 1]', code: 'SET1', items: [] }]
    )
    const items = mergeGrabSetChildLinesIntoPromoParents(
      [
        {
          id: 'c1',
          name: '[[April] Set 1] Rice',
          price: 111,
          qty: 1,
          menuId1: '10',
          optionCode1: 'C100-1',
        },
      ],
      catalog
    )
    expect(items[0].grabSetChild).toBeUndefined()
    expect(items[0].name).toBe('Rice')
  })

  it('does not fuzzy-match parent promo by partial label', () => {
    const catalog = buildGrabPosCatalog(
      [{ id: 10, name: 'Rice', code: 'C100' }],
      [{ name: 'Size S', optionCode: 'C100-1' }],
      [{ id: '5', name: 'April Set 1', code: 'SET1', items: [] }]
    )
    const items = mergeGrabSetChildLinesIntoPromoParents(
      [
        { id: 'p1', name: 'SET1', price: 111, qty: 1, promoId: '5', promoCode: 'SET1' },
        { id: 'c1', name: '[[April] Rice', price: 0, qty: 1, menuId1: '10' },
      ],
      catalog
    )
    expect(items[1].grabSetChild).toBeUndefined()
    expect(items[1].name).toBe('Rice')
  })
})
