import { describe, it, expect } from 'vitest'
import {
  bomStoredToDisplay,
  coerceQuantityUnitKeyForStandardUnits,
  getStoreQuantityFactor,
  normalizeQuantityUnitKey,
} from './pos-menu-ingredient-quantity-unit'

describe('pos-menu-ingredient-quantity-unit', () => {
  it('legacy food row without unit_key shows grams', () => {
    const d = bomStoredToDisplay(20, null, 'food')
    expect(d.unit).toBe('g')
    expect(d.quantity).toBe(20)
  })

  it('kg input stores as grams and displays kg', () => {
    const factor = getStoreQuantityFactor('kg::1000', 'food')
    expect(factor).toBe(1000)
    const stored = 20 * factor
    const d = bomStoredToDisplay(stored, 'kg::1000', 'food')
    expect(d.unit).toBe('kg')
    expect(d.quantity).toBe(20)
  })

  it('normalize defaults', () => {
    expect(normalizeQuantityUnitKey(null, 'food')).toBe('g::1')
    expect(normalizeQuantityUnitKey('', 'packaging')).toBe('ea::1')
  })

  it('coerce unit key to standard_units option', () => {
    const units = [{ unit: 'kg', totalQuantity: 1000 }, { unit: 'g', totalQuantity: 1 }]
    expect(coerceQuantityUnitKeyForStandardUnits('g::1', units)).toBe('g::1')
    expect(coerceQuantityUnitKeyForStandardUnits('g::500', units)).toBe('g::1')
    expect(coerceQuantityUnitKeyForStandardUnits('ml::1', units)).toBe('kg::1000')
  })
})
