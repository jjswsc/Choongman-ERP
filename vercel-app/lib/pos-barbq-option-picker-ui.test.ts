import { describe, expect, it } from 'vitest'
import {
  getBarBqAncillarySelectionGroups,
  isBarBqChickenMenu,
  pickBarBqSizePhaseOptions,
  shouldUseBarBqTwoPhaseOptionPicker,
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

  it('forces flat list when part group but M - options exist (legacy)', () => {
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

  it('uses two-phase when only sidedish group and M options exist', () => {
    expect(
      shouldUseFlatBarBqChickenOptionPicker({
        menu: {
          code: 'C020',
          category: 'Bar.B.Q',
          categoryMain: 'Chicken',
          optionSelectionGroups: ['sidedish'],
        },
        options: [
          { id: '1', menuId: '9', name: 'M - Boneless', priceModifier: 90, optionType: 'substitution' },
        ],
      })
    ).toBe(false)
    expect(
      shouldUseBarBqTwoPhaseOptionPicker({
        menu: {
          code: 'C020',
          category: 'Bar.B.Q',
          categoryMain: 'Chicken',
          optionSelectionGroups: ['sidedish'],
        },
        options: [
          { id: '1', menuId: '9', name: 'M - Boneless', priceModifier: 90, optionType: 'substitution' },
        ],
        ancillaryGroups: getBarBqAncillarySelectionGroups(['sidedish']),
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

  it('keeps M list source on size phase in two-phase mode', () => {
    const raw = [
      { id: 'm', menuId: '9', name: 'M - Boneless', priceModifier: 90, optionType: 'substitution' },
      { id: 's', menuId: '9', name: 'Kimchi', priceModifier: 0, optionType: 'substitution' },
    ]
    const filtered = [
      { id: 's', menuId: '9', name: 'Kimchi', priceModifier: 0, optionType: 'substitution' },
    ]
    const out = pickBarBqSizePhaseOptions({
      useBarBqTwoPhase: true,
      phase: 'size',
      optionsRaw: raw,
      optionsFiltered: filtered,
    })
    expect(out.map((x) => x.id)).toEqual(['m', 's'])
  })

  it('uses filtered source outside BBQ size phase', () => {
    const raw = [{ id: 'm', menuId: '9', name: 'M - Boneless', priceModifier: 90, optionType: 'substitution' }]
    const filtered = [{ id: 's', menuId: '9', name: 'Kimchi', priceModifier: 0, optionType: 'substitution' }]
    const out = pickBarBqSizePhaseOptions({
      useBarBqTwoPhase: true,
      phase: 'ancillary',
      optionsRaw: raw,
      optionsFiltered: filtered,
    })
    expect(out.map((x) => x.id)).toEqual(['s'])
  })
})
