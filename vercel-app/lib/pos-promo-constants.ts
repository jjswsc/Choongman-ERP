/** POS·마케팅 공통: 프로모션 전용 대분류 키 (category_main) */
export const PROMOTION_MAIN_CATEGORY = 'Promotion'

/** 구버전·DB에 남은 한글 대분류 → API/설정 병합 시 Promotion으로 통일 */
export const LEGACY_PROMOTION_MAIN_CATEGORY = '프로모션'

export function normalizePromotionCategoryMain(raw: string | undefined | null): string {
  const s = String(raw ?? '').trim()
  return s === LEGACY_PROMOTION_MAIN_CATEGORY ? PROMOTION_MAIN_CATEGORY : s
}

/** POS 대분류 탭: 레거시 한글과 Promotion 중복 제거 후 정렬 */
export function normalizePosMainCategoryTabs(mains: Iterable<string>): string[] {
  const out = new Set<string>()
  for (const x of mains) {
    const n = normalizePromotionCategoryMain(String(x ?? '').trim())
    if (n) out.add(n)
  }
  return Array.from(out).sort()
}

/** 카테고리 설정에 없을 때 쓰는 기본 소분류 (영문 표기) */
export const PROMOTION_DEFAULT_SUBCATEGORIES = ['Set', 'Seasonal', 'Delivery only'] as const

const LEGACY_PROMOTION_SUB_TO_CANONICAL: Record<string, (typeof PROMOTION_DEFAULT_SUBCATEGORIES)[number]> = {
  세트: 'Set',
  시즌: 'Seasonal',
  배달전용: 'Delivery only',
  Set: 'Set',
  Seasonal: 'Seasonal',
  'Delivery only': 'Delivery only',
}

/** DB·레거시 한글 소분류 → 표준 영문 키 */
export function normalizePromotionSubcategory(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim()
  return (LEGACY_PROMOTION_SUB_TO_CANONICAL[s] as string | undefined) ?? s
}

export function promotionSubcategoriesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizePromotionSubcategory(a) === normalizePromotionSubcategory(b)
}

/** 대분류별 소분류 탭/필터용 목록 (Promotion은 한글·영문 중복 제거 후 표준 영문으로 통일) */
export function uniqueSubcategoriesForMainMenu(main: string, subs: string[]): string[] {
  const nonEmpty = subs.map((s) => String(s ?? '').trim()).filter(Boolean)
  if (main !== PROMOTION_MAIN_CATEGORY) {
    return [...new Set(nonEmpty)].sort()
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of nonEmpty) {
    const c = normalizePromotionSubcategory(s)
    if (!seen.has(c)) {
      seen.add(c)
      out.push(c)
    }
  }
  const order = [...PROMOTION_DEFAULT_SUBCATEGORIES] as string[]
  const rank = (x: string) => {
    const i = order.indexOf(x)
    return i >= 0 ? i : 999
  }
  return out.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}
