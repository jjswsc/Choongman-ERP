/**
 * POS 메뉴 대분류·소분류 프리셋
 * 메뉴 관리, 원가 분석 드롭다운에 사용
 */

export const POS_MAIN_CATEGORIES = ["치킨", "한식", "사이드", "음료"] as const

export type PosMainCategory = (typeof POS_MAIN_CATEGORIES)[number]

/** 대분류별 소분류 목록 */
export const POS_CATEGORIES_BY_MAIN: Record<PosMainCategory, readonly string[]> = {
  치킨: ["Triple Chicken", "SNOW", "ORIGINAL", "Dosirak", "Bar.B.Q", "Banban", "SPECIALTIES"],
  한식: ["Tteokbokki", "KOREAN SOUP", "KOREAN FOOD"],
  사이드: ["SIDE MENU", "SIDE DISH", "salad"],
  음료: ["DRINKS"],
} as const

/** 전체 소분류 (평탄화) */
export const POS_ALL_SUB_CATEGORIES = POS_MAIN_CATEGORIES.flatMap(
  (main) => POS_CATEGORIES_BY_MAIN[main]
)
