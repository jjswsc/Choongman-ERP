import { describe, expect, it } from 'vitest'
import {
  formatQrOrderPromoDetail,
  formatQrPromoSelectionSummary,
  qrPromoNeedsGuestChoice,
  resolveQrSetOrderSnapshot,
  type QrGuestPromoLine,
} from './qr-table-promo'

const fixedSet: QrGuestPromoLine[] = [
  {
    menuId: 11,
    menuName: 'Soy Garlic Chicken',
    optionId: 3,
    optionName: 'S Boneless',
    optionCode: 'C1-S',
    quantity: 1,
    choiceGroup: null,
    choicePickCount: null,
  },
  {
    menuId: 22,
    menuName: 'Rice',
    optionId: null,
    optionName: '',
    optionCode: '',
    quantity: 1,
    choiceGroup: null,
    choicePickCount: null,
  },
]

const choiceSet: QrGuestPromoLine[] = [
  ...fixedSet,
  {
    menuId: 31,
    menuName: 'Coke',
    optionId: null,
    optionName: '',
    optionCode: '',
    quantity: 1,
    choiceGroup: 'drink',
    choicePickCount: 1,
  },
  {
    menuId: 32,
    menuName: 'Aquafina',
    optionId: 9,
    optionName: '500ml',
    optionCode: 'W-500',
    quantity: 1,
    choiceGroup: 'drink',
    choicePickCount: 1,
  },
]

describe('resolveQrSetOrderSnapshot', () => {
  it('snapshots every fixed line when the set has no choice group', () => {
    const resolved = resolveQrSetOrderSnapshot({
      promoId: '88',
      promoCode: 'SEOUL-2',
      lines: fixedSet,
    })
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    expect(resolved.promoCode).toBe('SEOUL-2')
    expect(resolved.promoItems.map((row) => row.menuName)).toEqual(['Soy Garlic Chicken', 'Rice'])
    expect(resolved.promoItems[0]?.optionName).toBe('S Boneless')
  })

  it('requires a guest pick when the set has a choice group', () => {
    expect(qrPromoNeedsGuestChoice(choiceSet)).toBe(true)
    expect(qrPromoNeedsGuestChoice(fixedSet)).toBe(false)
    const missing = resolveQrSetOrderSnapshot({ promoId: '88', lines: choiceSet })
    expect(missing).toEqual({ ok: false, error: 'promo_choice_required' })
  })

  it('keeps fixed lines and only the chosen drink', () => {
    const resolved = resolveQrSetOrderSnapshot({
      promoId: '88',
      lines: choiceSet,
      picks: [{ menuId: 32, optionId: 9, quantity: 1 }],
    })
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    expect(resolved.promoItems.map((row) => row.menuName)).toEqual([
      'Soy Garlic Chicken',
      'Rice',
      'Aquafina',
    ])
    expect(resolved.promoItems[2]?.optionName).toBe('500ml')
    expect(formatQrPromoSelectionSummary(choiceSet, [{ menuId: 32, optionId: 9 }])).toBe(
      'Soy Garlic Chicken (S Boneless) · Rice · Aquafina (500ml)'
    )
  })

  it('formats saved promoItems for the guest order list', () => {
    expect(
      formatQrOrderPromoDetail([
        { menuName: 'Rice', quantity: 1 },
        { menuName: 'Aquafina', optionName: '500ml', quantity: 1 },
      ])
    ).toBe('Rice · Aquafina (500ml)')
  })
})
