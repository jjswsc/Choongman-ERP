import { describe, expect, it } from 'vitest'
import {
  addBomLinesNeed,
  buildPosMenuBomIndexFromRows,
  buildSauceRecipeIndex,
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

describe('배합(sauces) 원재료 전개', () => {
  const sauces = buildSauceRecipeIndex(
    [
      { id: 1, code: 'S026' },
      { id: 2, code: 'S031' },
      { id: 3, code: 'S032' },
      { id: 4, code: 'CS003' },
    ],
    [
      { sauce_id: 1, item_code: 'JD010', quantity: 3000, loss_rate: 0 },
      { sauce_id: 1, item_code: 'WATER', quantity: 3000, loss_rate: 0 },
      { sauce_id: 2, item_code: 'CHILLI', quantity: 100, loss_rate: 0 },
      { sauce_id: 3, item_code: 'PORK', quantity: 1500, loss_rate: 10 },
      { sauce_id: 3, item_code: 'S031', quantity: 500, loss_rate: 0 },
      { sauce_id: 4, item_code: 'IGNORED', quantity: 1, loss_rate: 0 },
    ],
    [{ code: 'JD010' }, { code: 'WATER' }, { code: 'CHILLI' }, { code: 'PORK' }, { code: 'CS003' }]
  )

  it('메뉴 BOM 의 배합 코드를 생산량 비율로 원재료에 배분 (메뉴 로스 포함)', () => {
    const index = buildPosMenuBomIndexFromRows(
      [{ menu_id: 1, item_code: 'S026', quantity: 200, loss_rate: 5, ingredient_type: 'food' }],
      [],
      sauces
    )
    const usage: Record<string, number> = {}
    explodeMenuIngredientsSync(index, '1', null, 2, usage)
    expect(usage.JD010).toBeCloseTo(210)
    expect(usage.WATER).toBeCloseTo(210)
    expect(usage.S026).toBeUndefined()
  })

  it('배합 안의 배합도 재귀로 전개하고 재료 로스율을 적용', () => {
    const index = buildPosMenuBomIndexFromRows(
      [{ menu_id: 1, item_code: 'S032', quantity: 200, loss_rate: 0, ingredient_type: 'food' }],
      [],
      sauces
    )
    const usage: Record<string, number> = {}
    explodeMenuIngredientsSync(index, '1', null, 1, usage)
    expect(usage.PORK).toBeCloseTo(150 * 1.1)
    expect(usage.CHILLI).toBeCloseTo(50)
  })

  it('items 에도 있는 코드는 품목으로 남긴다', () => {
    const index = buildPosMenuBomIndexFromRows(
      [{ menu_id: 1, item_code: 'CS003', quantity: 30, loss_rate: 0, ingredient_type: 'food' }],
      [],
      sauces
    )
    const usage: Record<string, number> = {}
    explodeMenuIngredientsSync(index, '1', null, 1, usage)
    expect(usage).toEqual({ CS003: 30 })
  })
})
