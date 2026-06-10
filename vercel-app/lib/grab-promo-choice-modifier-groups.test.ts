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
    expect(groups[0].name).toBe('เมนูเสริม')
    expect(promoChoiceGroupDisplayName('side')).toBe('เมนูเสริม')
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
})
