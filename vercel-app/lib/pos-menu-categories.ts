/**
 * POS 메뉴 대분류·소분류 프리셋
 * 메뉴 관리, 원가 분석 드롭다운에 사용
 */

import {
  PROMOTION_DEFAULT_SUBCATEGORIES,
  PROMOTION_MAIN_CATEGORY,
  LEGACY_PROMOTION_MAIN_CATEGORY,
  uniqueSubcategoriesForMainMenu,
} from '@/lib/pos-promo-constants'

export type PosMenuCategoriesConfigShape = {
  mainCategories: string[]
  categoriesByMain: Record<string, string[]>
}

/**
 * API/DB 설정에 프로모션 대분류가 없으면 병합.
 * 소분류는 키가 없을 때만 기본값을 시드하고, 키가 있으면(빈 배열 포함) 사용자 설정을 존중한다.
 * → 대분류(Promotion)는 최소 1개 유지, 하위 카테고리는 전부 삭제 가능.
 */
export function mergePromotionIntoCategoriesConfig(cfg: PosMenuCategoriesConfigShape): PosMenuCategoriesConfigShape {
  const main = PROMOTION_MAIN_CATEGORY

  const mains = [...new Set(cfg.mainCategories.map((m) => (m === LEGACY_PROMOTION_MAIN_CATEGORY ? main : m)))]

  let categoriesByMain = { ...cfg.categoriesByMain }
  const legacySubs = categoriesByMain[LEGACY_PROMOTION_MAIN_CATEGORY]
  if (legacySubs?.length) {
    const cur = categoriesByMain[main] || []
    categoriesByMain[main] = [...new Set([...cur, ...legacySubs])]
  }
  if (LEGACY_PROMOTION_MAIN_CATEGORY in categoriesByMain) {
    const { [LEGACY_PROMOTION_MAIN_CATEGORY]: _, ...rest } = categoriesByMain
    categoriesByMain = rest
  }

  if (!mains.includes(main)) mains.push(main)

  const hasExplicitPromotionSubs = Object.prototype.hasOwnProperty.call(categoriesByMain, main)
  const nextSubs = hasExplicitPromotionSubs
    ? uniqueSubcategoriesForMainMenu(main, [...(categoriesByMain[main] || [])])
    : [...PROMOTION_DEFAULT_SUBCATEGORIES]

  return {
    mainCategories: mains,
    categoriesByMain: {
      ...categoriesByMain,
      [main]: nextSubs,
    },
  }
}

/**
 * 대분류별 소분류 목록.
 * 설정에 해당 대분류 키가 있으면(빈 배열 포함) 설정을 쓰고, 없을 때만 라이브러리 프리셋으로 폴백.
 */
export function resolveConfiguredCategoriesForMain(
  main: string,
  categoriesByMain: Record<string, string[]> | null | undefined
): string[] {
  if (categoriesByMain && Object.prototype.hasOwnProperty.call(categoriesByMain, main)) {
    return [...(categoriesByMain[main] || [])]
  }
  return [...(getPresetCategoriesForMain(main) ?? [])]
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
  Promotion: [LEGACY_PROMOTION_MAIN_CATEGORY],
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
