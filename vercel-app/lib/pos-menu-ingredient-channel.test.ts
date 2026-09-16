import { describe, expect, it } from 'vitest'
import {
  ingredientAppliesToCostChannel,
  ingredientAppliesToOrderChannel,
  lineCostForChannels,
  normalizePosMenuIngredientChannel,
} from '@/lib/pos-menu-ingredient-channel'

describe('normalizePosMenuIngredientChannel', () => {
  it('defaults empty/unknown to both', () => {
    expect(normalizePosMenuIngredientChannel(null)).toBe('both')
    expect(normalizePosMenuIngredientChannel('')).toBe('both')
    expect(normalizePosMenuIngredientChannel('COMMON')).toBe('both')
  })

  it('accepts hall / delivery aliases', () => {
    expect(normalizePosMenuIngredientChannel('hall')).toBe('hall')
    expect(normalizePosMenuIngredientChannel('dine_in')).toBe('hall')
    expect(normalizePosMenuIngredientChannel('delivery')).toBe('delivery')
    expect(normalizePosMenuIngredientChannel('takeout')).toBe('delivery')
  })
})

describe('ingredientAppliesToCostChannel', () => {
  it('food both applies to hall and delivery', () => {
    expect(ingredientAppliesToCostChannel('both', 'food', 'hall')).toBe(true)
    expect(ingredientAppliesToCostChannel('both', 'food', 'delivery')).toBe(true)
  })

  it('packaging both applies to delivery only (legacy hall cost)', () => {
    expect(ingredientAppliesToCostChannel('both', 'packaging', 'hall')).toBe(false)
    expect(ingredientAppliesToCostChannel('both', 'packaging', 'delivery')).toBe(true)
  })

  it('hall-only food skips delivery', () => {
    expect(ingredientAppliesToCostChannel('hall', 'food', 'hall')).toBe(true)
    expect(ingredientAppliesToCostChannel('hall', 'food', 'delivery')).toBe(false)
  })

  it('delivery-only food skips hall', () => {
    expect(ingredientAppliesToCostChannel('delivery', 'food', 'hall')).toBe(false)
    expect(ingredientAppliesToCostChannel('delivery', 'food', 'delivery')).toBe(true)
  })
})

describe('lineCostForChannels', () => {
  it('splits cabbage-style hall food', () => {
    expect(lineCostForChannels(12, 'food', 'hall')).toEqual({ hall: 12, delivery: 0 })
  })

  it('keeps shared food on both', () => {
    expect(lineCostForChannels(80, 'food', 'both')).toEqual({ hall: 80, delivery: 80 })
  })
})

describe('ingredientAppliesToOrderChannel', () => {
  it('hall garnish is not consumed on delivery orders', () => {
    expect(ingredientAppliesToOrderChannel('hall', 'food', true)).toBe(false)
    expect(ingredientAppliesToOrderChannel('hall', 'food', false)).toBe(true)
  })
})
