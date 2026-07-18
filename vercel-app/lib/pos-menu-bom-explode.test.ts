import { describe, expect, it } from 'vitest'
import {
  addBomLinesNeed,
  explodeMenuIngredientsSync,
  type PosMenuBomIndex,
} from '@/lib/pos-menu-bom-explode'

function emptyIndex(partial: Partial<PosMenuBomIndex>): PosMenuBomIndex {
  return {
    byMenuOption: partial.byMenuOption ?? new Map(),
    baseByMenu: partial.baseByMenu ?? new Map(),
    optionsById: partial.optionsById ?? new Map(),
  }
}

describe('explodeMenuIngredientsSync additive', () => {
  it('가산형: 기본 + 소스 + 옵션 전용 BOM', () => {
    const index = emptyIndex({
      baseByMenu: new Map([
        ['10', [{ item_code: 'CHICKEN', quantity: 1, loss_rate: 0, ingredient_type: 'food' }]],
        ['20', [{ item_code: 'SOUP', quantity: 1, loss_rate: 0, ingredient_type: 'food' }]],
      ]),
      byMenuOption: new Map([
        [
          '10|3',
          [{ item_code: 'GARNISH', quantity: 1, loss_rate: 0, ingredient_type: 'food' }],
        ],
      ]),
      optionsById: new Map([
        [
          '3',
          {
            option_type: 'additive',
            item_code: null,
            additive_source_menu_id: 20,
            quantity: 2,
          },
        ],
      ]),
    })
    const usage: Record<string, number> = {}
    explodeMenuIngredientsSync(index, '10', '3', 1, usage)
    expect(usage.CHICKEN).toBe(1)
    expect(usage.SOUP).toBe(2)
    expect(usage.GARNISH).toBe(1)
  })
})

describe('addBomLinesNeed', () => {
  it('applies loss_rate', () => {
    const usage: Record<string, number> = {}
    addBomLinesNeed(
      usage,
      [{ item_code: 'A', quantity: 10, loss_rate: 10, ingredient_type: 'food' }],
      2
    )
    expect(usage.A).toBe(22)
  })
})
