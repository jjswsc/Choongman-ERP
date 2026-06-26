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

  it('does not treat promo parent `[April] Set 2` as a compose child line', () => {
    expect(parseGrabSetChildLineName('[April] Set 2')).toBeNull()
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

  it('infers default S size on set chicken child without optc (GF-980 pattern)', () => {
    const catalog = buildGrabPosCatalog(
      [
        { id: 22, name: 'Rice', code: 'C022' },
        { id: 7, name: 'RED HOT CHICKEN', code: 'C007' },
      ],
      [
        { name: 'S - Boneless', optionCode: 'C007-1' },
        { name: 'M - Boneless', optionCode: 'C007-3' },
        { name: 'L - Boneless', optionCode: 'C007-5' },
      ],
      [{ id: '3', name: '[April] Set 3', code: 'SET3', items: [] }]
    )
    const items = mergeGrabSetChildLinesIntoPromoParents(
      [
        {
          id: 'p1',
          name: '[April] Set 3',
          price: 111,
          qty: 1,
          promoId: '3',
          promoItems: [
            { menuId: '22', menuName: 'Rice', optionId: null, quantity: 1 },
            { menuId: '7', menuName: 'RED HOT CHICKEN', optionId: null, quantity: 1 },
          ],
        },
        { id: 'c1', name: '[[April] Set 3] Rice', price: 0, qty: 1, menuId1: '22' },
        { id: 'c2', name: '[[April] Set 3] RED HOT CHICKEN', price: 0, qty: 1, menuId1: '7' },
      ],
      catalog
    )
    const chicken = items[0].promoItems?.find((p) => p.menuName === 'RED HOT CHICKEN')
    expect(chicken?.optionName).toMatch(/s/i)
    expect(chicken?.optionName).toMatch(/boneless/i)
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

  it('GF-282T: same-label set parents each absorb their own child lines (pickled vs kimchi)', () => {
    const catalog = buildGrabPosCatalog(
      [
        { id: 22, name: 'Rice', code: 'C022' },
        { id: 7, name: 'RED HOT CHICKEN', code: 'C007' },
        { id: 20, name: 'GOLDEN FRIED CHICKEN', code: 'C020' },
      ],
      [
        { name: 'S - Boneless', optionCode: 'C007-1' },
        { name: 'S - Boneless', optionCode: 'C020-1' },
      ],
      [
        { id: '3', name: '[111] Set 3', code: 'SET3', items: [] },
        { id: '1', name: '[111] Set 1', code: 'SET1', items: [] },
      ]
    )
    const items = mergeGrabSetChildLinesIntoPromoParents(
      [
        {
          id: 'p-set3-pickled',
          name: '[111] Set 3',
          price: 111,
          qty: 1,
          promoId: '3',
          note: 'mods:Pickled Radish 30 g.',
        },
        {
          id: 'c-set3-pickled-rice',
          name: '[[111] Set 3] Rice',
          price: 0,
          qty: 1,
          menuId1: '22',
        },
        {
          id: 'c-set3-pickled-chicken',
          name: '[[111] Set 3] RED HOT CHICKEN',
          price: 0,
          qty: 1,
          menuId1: '7',
        },
        {
          id: 'p-set3-kimchi',
          name: '[111] Set 3',
          price: 111,
          qty: 1,
          promoId: '3',
          note: 'mods:Kimchi 30 g.',
        },
        {
          id: 'c-set3-kimchi-rice',
          name: '[[111] Set 3] Rice',
          price: 0,
          qty: 1,
          menuId1: '22',
        },
        {
          id: 'c-set3-kimchi-chicken',
          name: '[[111] Set 3] RED HOT CHICKEN',
          price: 0,
          qty: 1,
          menuId1: '7',
        },
        {
          id: 'p-set1-pickled',
          name: '[111] Set 1',
          price: 111,
          qty: 1,
          promoId: '1',
          note: 'mods:Pickled Radish 30 g.',
        },
        {
          id: 'c-set1-pickled-chicken',
          name: '[[111] Set 1] GOLDEN FRIED CHICKEN',
          price: 0,
          qty: 1,
          menuId1: '20',
        },
        {
          id: 'p-set1-kimchi',
          name: '[111] Set 1',
          price: 111,
          qty: 1,
          promoId: '1',
          note: 'mods:Kimchi 30 g.',
        },
        {
          id: 'c-set1-kimchi-chicken',
          name: '[[111] Set 1] GOLDEN FRIED CHICKEN',
          price: 0,
          qty: 1,
          menuId1: '20',
        },
      ],
      catalog
    )
    const set3Pickled = items.find((it) => it.id === 'p-set3-pickled')
    const set3Kimchi = items.find((it) => it.id === 'p-set3-kimchi')
    const set1Pickled = items.find((it) => it.id === 'p-set1-pickled')
    const set1Kimchi = items.find((it) => it.id === 'p-set1-kimchi')

    expect(set3Pickled?.promoItems?.some((p) => p.menuName === 'RED HOT CHICKEN')).toBe(true)
    expect(set3Kimchi?.promoItems?.some((p) => p.menuName === 'RED HOT CHICKEN')).toBe(true)
    expect(set1Pickled?.promoItems?.some((p) => p.menuName === 'GOLDEN FRIED CHICKEN')).toBe(true)
    expect(set1Kimchi?.promoItems?.some((p) => p.menuName === 'GOLDEN FRIED CHICKEN')).toBe(true)
    expect(items.filter((it) => !it.grabSetChild && String(it.name ?? '').includes('Set 3'))).toHaveLength(2)
    expect(items.filter((it) => !it.grabSetChild && String(it.name ?? '').includes('Set 1'))).toHaveLength(2)
  })

  it('GF-078: copies sidedish from set child note onto parent before grabSetChild is dropped', () => {
    const catalog = buildGrabPosCatalog(
      [
        { id: 22, name: 'Rice', code: 'C022' },
        { id: 11, name: 'SOY SAUCE CHICKEN', code: 'C011' },
      ],
      [
        { name: 'S - Boneless', optionCode: 'C011-1' },
        { name: 'Kimchi 30 g.', optionCode: 'C011-5' },
      ],
      [{ id: '2', name: '[111] Set 2', code: 'SET2', items: [] }]
    )
    const items = mergeGrabSetChildLinesIntoPromoParents(
      [
        {
          id: 'p1',
          name: '[111] Set 2',
          price: 159,
          qty: 1,
          promoId: '2',
          note: 'eco:no plastic cutlery requested',
          promoItems: [
            { menuId: '22', menuName: 'Rice', optionId: null, quantity: 1 },
            { menuId: '11', menuName: 'SOY SAUCE CHICKEN', optionId: null, quantity: 1 },
          ],
        },
        {
          id: 'c1',
          name: '[[111] Set 2] SOY SAUCE CHICKEN',
          price: 0,
          qty: 1,
          menuId1: '11',
          note: 'mods:Kimchi 30 g. · optc:C011-5',
        },
      ],
      catalog
    )
    const parent = items.find((it) => it.id === 'p1')
    expect(parent?.note).toMatch(/Kimchi 30 g\./i)
    expect(items.find((it) => it.id === 'c1')?.grabSetChild).toBe(true)
  })
})
