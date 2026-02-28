/**
 * POS 메뉴 대분류·소분류 프리셋
 * 메뉴 관리, 원가 분석 드롭다운에 사용
 */

export const POS_MAIN_CATEGORIES = ["Chicken", "Korean", "Side", "Drinks"] as const

export type PosMainCategory = (typeof POS_MAIN_CATEGORIES)[number]

/** 대분류별 소분류 목록 */
export const POS_CATEGORIES_BY_MAIN: Record<PosMainCategory, readonly string[]> = {
  Chicken: ["Triple Chicken", "SNOW", "ORIGINAL", "Dosirak", "Bar.B.Q", "Banban", "SPECIALTIES"],
  Korean: ["Tteokbokki", "KOREAN SOUP", "KOREAN FOOD"],
  Side: ["SIDE MENU", "SIDE DISH", "salad"],
  Drinks: ["DRINKS"],
} as const

/** 전체 소분류 (평탄화) */
export const POS_ALL_SUB_CATEGORIES = POS_MAIN_CATEGORIES.flatMap(
  (main) => POS_CATEGORIES_BY_MAIN[main]
)
