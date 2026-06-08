import { describe, expect, it } from 'vitest'
import type { PosMenuOption } from '@/lib/api-client'
import {
  composePosCartOptionBracketFromPickerRows,
  resolvePosCartOptionDisplayName,
} from '@/lib/pos-cart-option-display-name'

describe('resolvePosCartOptionDisplayName', () => {
  it('keeps M - Boneless from option row name (picker label source)', () => {
    const label = resolvePosCartOptionDisplayName(
      { code: 'C005', optionSelectionGroups: ['sidedish'] },
      {
        id: '1',
        menuId: '5',
        name: 'M - Boneless',
        priceModifier: 110,
        sortOrder: 0,
        optionStepValues: { part: 'Boneless' },
      } as PosMenuOption,
      'Office'
    )
    expect(label).toBe('M - Boneless')
  })

  it('adds size prefix when row name is part-only but name infers M', () => {
    const label = resolvePosCartOptionDisplayName(
      { code: 'C005', optionSelectionGroups: ['part', 'sidedish'] },
      {
        id: '1',
        menuId: '5',
        name: 'M - Drumette',
        priceModifier: 110,
        sortOrder: 0,
        optionStepValues: { part: 'Drumette' },
      } as PosMenuOption
    )
    expect(label).toBe('M - Drumette')
  })
})

describe('composePosCartOptionBracketFromPickerRows', () => {
  it('joins picker row labels like the option buttons (M size + side)', () => {
    const partRow: PosMenuOption = {
      id: 'p1',
      menuId: '99',
      name: 'M - Boneless',
      priceModifier: 110,
      priceModifierDelivery: 110,
      priceModifierPackaging: null,
      sortOrder: 0,
      optionType: 'substitution',
      optionStepValues: { part: 'Boneless' },
      sellHall: true,
      sellDelivery: true,
      sellPackaging: true,
    }
    const sideRow: PosMenuOption = {
      id: 's1',
      menuId: '99',
      name: 'Pickled Radish',
      priceModifier: 0,
      priceModifierDelivery: 0,
      priceModifierPackaging: null,
      sortOrder: 1,
      optionType: 'substitution',
      optionStepValues: { sidedish: 'Pickled Radish' },
      sellHall: true,
      sellDelivery: true,
      sellPackaging: true,
    }
    const bracket = composePosCartOptionBracketFromPickerRows(
      { code: 'C005', optionSelectionGroups: ['part', 'sidedish'] },
      [partRow, sideRow],
      'Office'
    )
    expect(bracket).toBe('M - Boneless - Pickled Radish')
  })
})
