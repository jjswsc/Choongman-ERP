/** 구 유니크 인덱스가 남아 있으면 선택 그룹이 달라도 INSERT가 거절된다. */
export const POS_PROMO_ITEM_CHOICE_GROUP_INDEX_MESSAGE =
  '같은 메뉴를 다른 선택 그룹에 저장하려면 데이터베이스 인덱스를 먼저 갱신해야 합니다.'

const LEGACY_UNIQUE_INDEX = 'ux_pos_promo_items_promo_menu_option'

/** 같은 프로모·메뉴·옵션·선택 그룹만 수량 합산 대상. 그룹이 다르면 별도 행. */
export function posPromoItemDuplicateFilter(params: {
  promoId: number
  menuId: number
  optionId: number | null
  choiceGroup: string | null
}): string {
  const optionFilter =
    params.optionId == null ? 'option_id=is.null' : `option_id=eq.${params.optionId}`
  const group = String(params.choiceGroup ?? '').trim()
  const groupFilter = group
    ? `choice_group=eq.${encodeURIComponent(group)}`
    : 'choice_group=is.null'
  return `promo_id=eq.${params.promoId}&menu_id=eq.${params.menuId}&${optionFilter}&${groupFilter}`
}

export function isLegacyPosPromoItemUniqueIndexError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return new RegExp(`${LEGACY_UNIQUE_INDEX}(?!_)`).test(msg)
}
