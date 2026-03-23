/**
 * POS 메뉴 대분류·소분류 프리셋
 * 메뉴 관리, 원가 분석 드롭다운에 사용
 */

import { PROMOTION_DEFAULT_SUBCATEGORIES, PROMOTION_MAIN_CATEGORY } from '@/lib/pos-promo-constants'

export type PosMenuCategoriesConfigShape = {
  mainCategories: string[]
  categoriesByMain: Record<string, string[]>
}

/** API/DB 설정에 프로모션 대분류·기본 소분류가 없으면 병합 */
export function mergePromotionIntoCategoriesConfig(cfg: PosMenuCategoriesConfigShape): PosMenuCategoriesConfigShape {
  const main = PROMOTION_MAIN_CATEGORY
  const mains = [...cfg.mainCategories]
  if (!mains.includes(main)) mains.push(main)
  const existingSubs = [...(cfg.categoriesByMain[main] || [])]
  const nextSubs = [...existingSubs]
  for (const d of PROMOTION_DEFAULT_SUBCATEGORIES) {
    if (!nextSubs.includes(d)) nextSubs.push(d)
  }
  return {
    mainCategories: mains,
    categoriesByMain: {
      ...cfg.categoriesByMain,
      [main]: nextSubs.length > 0 ? nextSubs : [...PROMOTION_DEFAULT_SUBCATEGORIES],
    },
  }
}

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

/** 대분류 한·영 매칭 (DB에 "치킨" 저장 시 "Chicken" 선택과 호환) */
const MAIN_CATEGORY_ALIASES: Record<string, string[]> = {
  Chicken: ["치킨"],
  Korean: ["한국"],
  Side: ["사이드", "사이드메뉴"],
  Drinks: ["음료"],
}

/** 치킨 대분류 선택 여부 */
export function isChickenMainSelected(selected: string): boolean {
  return selected === "Chicken" || selected === "치킨"
}

/** 선택한 대분류와 row가 일치하는지 (한·영 동치, 치킨은 코드 c 시작으로도 판별) */
export function mainCategoryMatches(
  selected: string,
  rowMain: string | undefined,
  menuCode?: string
): boolean {
  if (!selected || selected === "all") return true
  const row = String(rowMain ?? "").trim()
  if (selected === row) return true
  const aliases = MAIN_CATEGORY_ALIASES[selected]
  if (aliases?.includes(row)) return true
  const engForSelected = Object.entries(MAIN_CATEGORY_ALIASES).find(([, arr]) => arr.includes(selected))?.[0]
  if (engForSelected && engForSelected === row) return true
  if (isChickenMainSelected(selected) && isChickenMenu(menuCode)) return true
  return false
}

/** 치킨 메뉴 여부 (코드가 c로 시작) */
export function isChickenMenu(code: string | undefined): boolean {
  return String(code ?? "").trim().toLowerCase().startsWith("c")
}

/** 대분류로 preset 조회 (치킨↔Chicken 등 한영 매핑) */
export function getPresetCategoriesForMain(mainCat: string): readonly string[] | null {
  if (mainCat in POS_CATEGORIES_BY_MAIN) {
    return POS_CATEGORIES_BY_MAIN[mainCat as keyof typeof POS_CATEGORIES_BY_MAIN]
  }
  const entry = Object.entries(MAIN_CATEGORY_ALIASES).find(([, aliases]) => aliases.includes(mainCat))
  return entry ? POS_CATEGORIES_BY_MAIN[entry[0] as keyof typeof POS_CATEGORIES_BY_MAIN] : null
}
