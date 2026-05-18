import { describe, expect, it } from 'vitest'
import {
  isBarBqChickenMenu,
  shouldUseFlatBarBqChickenOptionPicker,
} from '@/lib/pos-barbq-option-picker-ui'

describe('pos-barbq-option-picker-ui', () => {
  it('detects Bar.B.Q chicken', () => {
    expect(
      isBarBqChickenMenu({
        code: 'C022',
        category: 'Bar.B.Q',
        categoryMain: 'Chicken',
      })
    ).toBe(true)
  })

  it('forces flat list when part group but M - options exist', () => {
    expect(
      shouldUseFlatBarBqChickenOptionPicker({
        menu: {
          code: 'C023',
          category: 'Bar.B.Q',
          categoryMain: 'Chicken',
          optionSelectionGroups: ['part'],
        },
        options: [
          { id: '1', menuId: '9', name: 'M - Boneless', priceModifier: 90, optionType: 'substitution' },
        ],
      })
    ).toBe(true)
  })

  it('does not force flat when already no groups', () => {
    expect(
      shouldUseFlatBarBqChickenOptionPicker({
        menu: {
          code: 'C020',
          category: 'Bar.B.Q',
          categoryMain: 'Chicken',
          optionSelectionGroups: [],
        },
        options: [
          { id: '1', menuId: '9', name: 'M - Boneless', priceModifier: 90, optionType: 'substitution' },
        ],
      })
    ).toBe(false)
  })
})
