import { describe, expect, it } from 'vitest'
import {
  buildGrabPromoChoiceModifierGroups,
  buildPromoChoiceModifierId,
  promoChoiceGroupDisplayName,
  promoChoiceModifierDisplayName,
  resolvePromoItemsForGrabOrder,
} from '@/lib/grab-promo-choice-modifier-groups'

describe('grab-promo-choice-modifier-groups', () => {
  const sideItems = [
    {
      menuId: '101',
      optionId: null,
      quantity: 1,
      choiceGroup: 'side',
      choicePickCount: 1,
      menuName: 'Free Kimchi',
    },
    {
      menuId: '102',
      optionId: null,
      quantity: 1,
      choiceGroup: 'side',
      choicePickCount: 1,
      menuName: 'Free Pickled Radish',
    },
  ]

  const fixedChicken = {
    menuId: '50',
    optionId: '9',
    optionCode: 'C010-1',
    quantity: 1,
    choiceGroup: null,
    menuName: 'GOLDEN FRIED CHICKEN',
    optionName: 'S - Boneless',
  }

  it('builds one modifier group per promo choice_group', () => {
    const groups = buildGrabPromoChoiceModifierGroups({
      itemId: 'item-99-set1',
      items: [fixedChicken, ...sideItems],
      sequenceStart: 2,
    })
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBeTruthy()
    expect(groups[0].selectionRangeMin).toBe(1)
    expect(groups[0].selectionRangeMax).toBe(1)
    expect(groups[0].modifiers).toHaveLength(2)
    expect(groups[0].modifiers[0].price).toBe(0)
    expect(groups[0].name).toBe('side')
    expect(promoChoiceGroupDisplayName('side')).toBe('side')
    expect(promoChoiceGroupDisplayName('เมนูเสริม')).toBe('เมนูเสริม')
    expect(promoChoiceModifierDisplayName(sideItems[0])).toBe('Free Kimchi')
  })

  it('resolves promoItems as fixed lines plus selected choice modifier', () => {
    const itemId = 'item-99-set1'
    const modId = buildPromoChoiceModifierId(itemId, sideItems[1], 2)
    const promoItems = resolvePromoItemsForGrabOrder({
      allItems: [fixedChicken, ...sideItems],
      itemId,
      flatModifiers: [{ id: modId, name: 'Free Pickled Radish' }],
    })
    expect(promoItems).toHaveLength(2)
    expect(promoItems[0].menuId).toBe('50')
    expect(promoItems[1].menuName).toBe('Free Pickled Radish')
    expect(promoItems.some((x) => x.menuName === 'Free Kimchi')).toBe(false)
  })

  it('PEPSIMEGA 2: lists exact registered promo lines when ERP choice_group is empty', () => {
    const pepsiMegaItems = [
      {
        menuId: '71',
        optionId: null,
        quantity: 1,
        menuName: 'GUCHUJANG Bar.B.Q FRIED CHICKEN',
      },
      {
        menuId: '52',
        optionId: null,
        quantity: 1,
        menuName: 'Pepsi',
      },
      {
        menuId: '11',
        optionId: '298',
        optionCode: 'C008-3',
        quantity: 1,
        menuName: 'SNOW ONION',
        optionName: 'M - Boneless',
      },
    ]
    const groups = buildGrabPromoChoiceModifierGroups({
      itemId: 'grab:item-352-260485-s02',
      items: pepsiMegaItems,
      sequenceStart: 0,
    })
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('Set includes')
    expect(groups[0].selectionRangeMin).toBe(3)
    expect(groups[0].selectionRangeMax).toBe(3)
    expect(groups[0].modifiers.map((m) => m.name)).toEqual([
      'GUCHUJANG Bar.B.Q FRIED CHICKEN',
      'Pepsi',
      'SNOW ONION (M - Boneless)',
    ])
  })

  it('PEPSI MEGA 1: lists exact registered promo lines (promo 31)', () => {
    const items = [
      { menuId: '11', optionId: null, quantity: 1, menuName: 'SNOW ONION' },
      { menuId: '52', optionId: null, quantity: 1, menuName: 'Pepsi' },
      {
        menuId: '6',
        optionId: '498',
        optionCode: 'C003-3',
        quantity: 1,
        menuName: 'CHEESE TORNADO',
        optionName: 'M - Boneless',
      },
    ]
    const groups = buildGrabPromoChoiceModifierGroups({
      itemId: 'grab:promo-31',
      items,
      sequenceStart: 0,
    })
    expect(groups).toHaveLength(1)
    expect(groups[0].modifiers.map((m) => m.name)).toEqual([
      'SNOW ONION',
      'Pepsi',
      'CHEESE TORNADO (M - Boneless)',
    ])
  })

  it('PEPSI MEGA 3: expands quantity>1 lines for Grab (promo 33)', () => {
    const items = [
      { menuId: '52', optionId: null, quantity: 2, menuName: 'Pepsi' },
      { menuId: '11', optionId: null, quantity: 1, menuName: 'SNOW ONION' },
      { menuId: '6', optionId: null, quantity: 1, menuName: 'CHEESE TORNADO' },
      { menuId: '72', optionId: null, quantity: 1, menuName: 'SOY SAUCE Bar.B.Q FRIED CHICKEN' },
    ]
    const groups = buildGrabPromoChoiceModifierGroups({
      itemId: 'grab:promo-33',
      items,
      sequenceStart: 0,
    })
    expect(groups).toHaveLength(1)
    expect(groups[0].selectionRangeMin).toBe(5)
    expect(groups[0].selectionRangeMax).toBe(5)
    expect(groups[0].modifiers.map((m) => m.name)).toEqual([
      'Pepsi',
      'Pepsi',
      'SNOW ONION',
      'CHEESE TORNADO',
      'SOY SAUCE Bar.B.Q FRIED CHICKEN',
    ])
  })

  describe('สุดซ่า 1–3 (promo 35/30/36) — same as Pepsi: exact ERP lines on Grab', () => {
    it('สุดซ่า 1', () => {
      const items = [
        { menuId: '11', optionId: null, quantity: 1, menuName: 'SNOW ONION' },
        { menuId: '28', optionId: null, quantity: 1, menuName: 'SPICY YANGNYEOM' },
        { menuId: '22', optionId: null, quantity: 1, menuName: 'Rice' },
        { menuId: '52', optionId: null, quantity: 1, menuName: 'Pepsi' },
      ]
      const groups = buildGrabPromoChoiceModifierGroups({
        itemId: 'grab:promo-35',
        items,
        sequenceStart: 0,
      })
      expect(groups).toHaveLength(1)
      expect(groups[0].name).toBe('Set includes')
      expect(groups[0].modifiers.map((m) => m.name)).toEqual([
        'SNOW ONION',
        'SPICY YANGNYEOM',
        'Rice',
        'Pepsi',
      ])
    })

    it('สุดซ่า 2', () => {
      const items = [
        { menuId: '6', optionId: null, quantity: 1, menuName: 'CHEESE TORNADO' },
        { menuId: '71', optionId: null, quantity: 1, menuName: 'GUCHUJANG Bar.B.Q FRIED CHICKEN' },
        { menuId: '52', optionId: null, quantity: 1, menuName: 'Pepsi' },
      ]
      const groups = buildGrabPromoChoiceModifierGroups({
        itemId: 'grab:promo-30',
        items,
        sequenceStart: 0,
      })
      expect(groups).toHaveLength(1)
      expect(groups[0].modifiers.map((m) => m.name)).toEqual([
        'CHEESE TORNADO',
        'GUCHUJANG Bar.B.Q FRIED CHICKEN',
        'Pepsi',
      ])
    })

    it('สุดซ่า 3', () => {
      const items = [
        { menuId: '22', optionId: null, quantity: 2, menuName: 'Rice' },
        { menuId: '52', optionId: null, quantity: 1, menuName: 'Pepsi' },
        {
          menuId: '25',
          optionId: '271',
          optionCode: 'C010-3',
          quantity: 1,
          menuName: 'SOY SAUCE CHICKEN',
          optionName: 'M - Boneless',
        },
      ]
      const groups = buildGrabPromoChoiceModifierGroups({
        itemId: 'grab:promo-36',
        items,
        sequenceStart: 0,
      })
      expect(groups).toHaveLength(1)
      expect(groups[0].selectionRangeMin).toBe(4)
      expect(groups[0].modifiers.map((m) => m.name)).toEqual([
        'Rice',
        'Rice',
        'Pepsi',
        'SOY SAUCE CHICKEN (M - Boneless)',
      ])
    })
  })

  it('[111] set: uses only ERP choice_group rows (Side Dish), no inference', () => {
    const setItems = [
      { menuId: '7', optionId: null, quantity: 1, menuName: 'RED HOT CHICKEN' },
      {
        menuId: '360',
        optionId: null,
        quantity: 1,
        menuName: 'Kimchi 30 g.',
        choiceGroup: 'Side Dish',
        choicePickCount: 1,
      },
      {
        menuId: '361',
        optionId: null,
        quantity: 1,
        menuName: 'Pickled Radish 30 g.',
        choiceGroup: 'Side Dish',
        choicePickCount: 1,
      },
    ]
    const groups = buildGrabPromoChoiceModifierGroups({
      itemId: 'item-111-set3',
      items: setItems,
      sequenceStart: 0,
    })
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('Side Dish')
    expect(groups[0].modifiers).toHaveLength(2)
  })
})
