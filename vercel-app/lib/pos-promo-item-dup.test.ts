import { describe, expect, it } from 'vitest'
import {
  isLegacyPosPromoItemUniqueIndexError,
  posPromoItemDuplicateFilter,
} from '@/lib/pos-promo-item-dup'

describe('posPromoItemDuplicateFilter', () => {
  it('선택 그룹이 다르면 같은 메뉴도 다른 필터다', () => {
    const main = posPromoItemDuplicateFilter({
      promoId: 12,
      menuId: 34,
      optionId: null,
      choiceGroup: 'main',
    })
    const side = posPromoItemDuplicateFilter({
      promoId: 12,
      menuId: 34,
      optionId: null,
      choiceGroup: 'side',
    })
    expect(main).toContain('choice_group=eq.main')
    expect(side).toContain('choice_group=eq.side')
    expect(main).not.toBe(side)
  })

  it('그룹이 없으면 choice_group is null 로만 합친다', () => {
    expect(
      posPromoItemDuplicateFilter({
        promoId: 1,
        menuId: 2,
        optionId: 9,
        choiceGroup: '  ',
      })
    ).toBe('promo_id=eq.1&menu_id=eq.2&option_id=eq.9&choice_group=is.null')
  })
})

describe('isLegacyPosPromoItemUniqueIndexError', () => {
  it('구 인덱스 이름만 잡고 그룹 포함 인덱스는 통과시킨다', () => {
    expect(
      isLegacyPosPromoItemUniqueIndexError(
        new Error(
          'duplicate key value violates unique constraint "ux_pos_promo_items_promo_menu_option"'
        )
      )
    ).toBe(true)
    expect(
      isLegacyPosPromoItemUniqueIndexError(
        new Error(
          'duplicate key value violates unique constraint "ux_pos_promo_items_promo_menu_option_group"'
        )
      )
    ).toBe(false)
    expect(
      isLegacyPosPromoItemUniqueIndexError(
        new Error(
          'Supabase insert failed: {"message":"duplicate key value violates unique constraint \\"ux_pos_promo_items_promo_menu_option\\""}'
        )
      )
    ).toBe(true)
  })
})
