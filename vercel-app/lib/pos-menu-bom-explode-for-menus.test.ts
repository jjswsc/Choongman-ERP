import { beforeEach, describe, expect, it, vi } from 'vitest'

const selectFilter = vi.fn()
vi.mock('@/lib/supabase-server', () => ({
  supabaseSelectFilter: (...args: unknown[]) => selectFilter(...args),
  supabaseSelectAllPages: vi.fn(),
}))

import {
  buildPosMenuBomIndexForMenus,
  collectCartMenuRefsForBom,
  explodeCartItemsToUsage,
} from '@/lib/pos-menu-bom-explode'

describe('collectCartMenuRefsForBom', () => {
  it('취소 줄 제외, 프로모·반반·일반 줄의 숫자 id만 수집', () => {
    expect(
      collectCartMenuRefsForBom([
        { id: '10-3', qty: 1 },
        { id: '11', qty: 2, cancelledAt: '2026-10-14T10:00:00' },
        { promoId: 'p1', qty: 1, promoItems: [{ menuId: '12', optionId: '4', quantity: 1 }] },
        { menuId1: '13', optionId1: '', menuId2: '14', optionId2: '5', qty: 1 },
        { id: 'abc-x', qty: 1 },
      ])
    ).toEqual({ menuIds: ['10', '12', '13', '14'], optionIds: ['3', '4', '5'] })
  })
})

describe('buildPosMenuBomIndexForMenus', () => {
  beforeEach(() => selectFilter.mockReset())

  it('옵션·BOM을 in.() 2회로 로드하고 가산형 소스 메뉴도 포함', async () => {
    selectFilter.mockImplementation(async (table: string) => {
      if (table === 'pos_menu_options') {
        return [
          { id: 3, option_type: 'substitution', item_code: null, additive_source_menu_id: null, quantity: 1 },
          { id: 4, option_type: 'additive', item_code: null, additive_source_menu_id: 20, quantity: 2 },
        ]
      }
      return [
        { menu_id: 10, option_id: null, item_code: 'RICE', quantity: 1, loss_rate: 0 },
        { menu_id: 12, option_id: null, item_code: 'CHICKEN', quantity: 1, loss_rate: 0 },
        { menu_id: 20, option_id: null, item_code: 'SOUP', quantity: 1, loss_rate: 0 },
      ]
    })
    const index = await buildPosMenuBomIndexForMenus(['10', '12'], ['3', '4'])
    expect(selectFilter).toHaveBeenCalledTimes(2)
    expect(selectFilter.mock.calls[0][1]).toBe('id=in.(3,4)')
    expect(selectFilter.mock.calls[1][1]).toBe('menu_id=in.(10,12,20)')

    const usage = explodeCartItemsToUsage(index, [
      /** 대체형 옵션 전용 BOM 없음 → 기본 BOM */
      { id: '10-3', qty: 2 },
      { id: '12-4', qty: 1 },
    ])
    expect(usage).toEqual({ RICE: 2, CHICKEN: 1, SOUP: 2 })
  })

  it('메뉴가 없으면 조회하지 않는다', async () => {
    const index = await buildPosMenuBomIndexForMenus([], [])
    expect(selectFilter).not.toHaveBeenCalled()
    expect(index.baseByMenu.size).toBe(0)
  })
})
