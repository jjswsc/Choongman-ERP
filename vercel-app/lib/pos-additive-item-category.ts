/**
 * 품목(items) 카테고리명. POS에서 판매되는 단위는 메뉴(pos_menus)·옵션(pos_menu_options)이며,
 * 이 카테고리는 “추가형 옵션”에 연결할 품목 마스터(코드·원가 등)를 고르기 위한 용도뿐이다.
 * 매장→본사 발주(getAppData scope=order)와는 무관하므로 발주 목록에서 제외한다.
 */
export const POS_ADDITIVE_OPTION_ITEM_CATEGORY = "POS추가옵션"

export function isPosAdditiveOptionItemCategory(category: string | null | undefined): boolean {
  return String(category ?? "").trim() === POS_ADDITIVE_OPTION_ITEM_CATEGORY
}
