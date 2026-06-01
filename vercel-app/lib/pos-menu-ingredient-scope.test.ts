import { describe, expect, it } from 'vitest'
import {
  ingredientRowMatchesScope,
  isBaseMenuIngredientOptionId,
  normalizeMenuIngredientOptionKeySeg,
  resolveIngredientMenuIdFromCode,
} from '@/lib/pos-menu-ingredient-scope'

describe('pos-menu-ingredient-scope', () => {
  it('treats null/0/empty option_id as base BOM bucket', () => {
    expect(isBaseMenuIngredientOptionId(null)).toBe(true)
    expect(isBaseMenuIngredientOptionId(0)).toBe(true)
    expect(isBaseMenuIngredientOptionId('0')).toBe(true)
    expect(isBaseMenuIngredientOptionId(5)).toBe(false)
    expect(normalizeMenuIngredientOptionKeySeg(5)).toBe('5')
    expect(normalizeMenuIngredientOptionKeySeg(null)).toBe('null')
  })

  it('matches ingredient rows only within menuId + option scope', () => {
    const baseRow = { menu_id: 100, option_id: null }
    const optRow = { menu_id: 100, option_id: 5 }
    const otherMenu = { menu_id: 200, option_id: null }

    expect(ingredientRowMatchesScope(baseRow, 100, null)).toBe(true)
    expect(ingredientRowMatchesScope(optRow, 100, null)).toBe(false)
    expect(ingredientRowMatchesScope(optRow, 100, 5)).toBe(true)
    expect(ingredientRowMatchesScope(baseRow, 100, 5)).toBe(false)
    expect(ingredientRowMatchesScope(otherMenu, 100, null)).toBe(false)
  })

  it('does not remap menu_id by menu_code when menu_id is valid (C013 vs C013-1)', () => {
    const resolved = resolveIngredientMenuIdFromCode({
      menuId: 100,
      menuCodeOnRow: 'C013-1',
      mappedMenuIdFromCode: 200,
      menuExistsForMenuId: true,
    })
    expect(resolved.menuId).toBe(100)
    expect(resolved.remapped).toBe(false)
  })

  it('remaps by menu_code only when menu_id is orphan', () => {
    const resolved = resolveIngredientMenuIdFromCode({
      menuId: NaN,
      menuCodeOnRow: 'C013',
      mappedMenuIdFromCode: 100,
      menuExistsForMenuId: false,
    })
    expect(resolved.menuId).toBe(100)
    expect(resolved.remapped).toBe(true)
  })
})
