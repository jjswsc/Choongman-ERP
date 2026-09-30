/** POS·마케팅 공통: 프로모션 전용 대분류 키 (category_main) */
export const PROMOTION_MAIN_CATEGORY = 'Promotion'

/** 구버전·DB에 남은 한글 대분류 → API/설정 병합 시 Promotion으로 통일 */
export const LEGACY_PROMOTION_MAIN_CATEGORY = '프로모션'

export function normalizePromotionCategoryMain(raw: string | undefined | null): string {
  const s = String(raw ?? '').trim()
  return s === LEGACY_PROMOTION_MAIN_CATEGORY ? PROMOTION_MAIN_CATEGORY : s
}

/**
 * 손님·POS 대분류 탭 선호 순서 (나머지·미매칭은 뒤로 localeCompare).
 * Promotion → Chicken → Korean → Side → Drinks
 */
export function posMainCategoryTabRank(name: string): number {
  const key = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if (
    key === 'promotion' ||
    key === LEGACY_PROMOTION_MAIN_CATEGORY.toLowerCase() ||
    key.includes('promo') ||
    key.includes('โปรโม') ||
    key.includes('โปรโมช') ||
    (key.includes('โปร') && !key.includes('ไก่'))
  ) {
    return 0
  }
  if (key.includes('chicken') || key.includes('치킨') || key.includes('ไก่')) return 1
  if (key.includes('korean') || key.includes('한식') || key.includes('อาหารเกาหลี')) return 2
  if (
    key.includes('side') ||
    key.includes('사이드') ||
    key.includes('ของว่าง') ||
    key.includes('snack') ||
    key.includes('fries')
  ) {
    return 3
  }
  if (
    key.includes('drink') ||
    key.includes('beverage') ||
    key.includes('음료') ||
    key.includes('เครื่องดื่ม')
  ) {
    return 4
  }
  return 100
}

/** 대분류 탭 이름만 모은다. 순서는 바꾸지 않는다. */
export function dedupePosMainCategoryTabs(mains: Iterable<string>): string[] {
  const out = new Set<string>()
  for (const x of mains) {
    const n = normalizePromotionCategoryMain(String(x ?? '').trim())
    if (n) out.add(n)
  }
  return Array.from(out)
}

function orderLabelsBySavedList(
  items: string[],
  saved: readonly string[],
  fallback: (a: string, b: string) => number
): string[] {
  const rank = new Map<string, number>()
  saved.forEach((name, index) => {
    if (!rank.has(name)) rank.set(name, index)
  })
  return items.slice().sort((a, b) => {
    const ia = rank.has(a) ? (rank.get(a) as number) : 1_000_000
    const ib = rank.has(b) ? (rank.get(b) as number) : 1_000_000
    if (ia !== ib) return ia - ib
    return fallback(a, b)
  })
}

/** POS 대분류 탭: 저장된 순서가 있으면 그 순서, 없으면 선호 순서 */
export function orderPosMainCategoryTabs(
  mains: Iterable<string>,
  savedOrder?: readonly string[] | null
): string[] {
  const base = dedupePosMainCategoryTabs(mains)
  const fallback = (a: string, b: string) =>
    posMainCategoryTabRank(a) - posMainCategoryTabRank(b) || a.localeCompare(b)
  const saved = (savedOrder || [])
    .map((name) => normalizePromotionCategoryMain(String(name ?? '').trim()))
    .filter(Boolean)
  if (saved.length === 0) return base.slice().sort(fallback)
  return orderLabelsBySavedList(base, saved, fallback)
}

/** POS 대분류 탭: 레거시 한글과 Promotion 중복 제거 후 선호 순서로 정렬 */
export function normalizePosMainCategoryTabs(mains: Iterable<string>): string[] {
  return orderPosMainCategoryTabs(mains)
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

/** 대분류별 소분류 탭/필터용 목록. savedOrder가 있으면 그 순서, 없으면 기존 기본 정렬 */
export function uniqueSubcategoriesForMainMenu(
  main: string,
  subs: string[],
  savedOrder?: readonly string[] | null
): string[] {
  const nonEmpty = subs.map((s) => String(s ?? '').trim()).filter(Boolean)
  const isPromotion = main === PROMOTION_MAIN_CATEGORY
  let base: string[]
  let fallback: (a: string, b: string) => number
  if (!isPromotion) {
    base = [...new Set(nonEmpty)]
    fallback = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  } else {
    const seen = new Set<string>()
    base = []
    for (const s of nonEmpty) {
      const c = normalizePromotionSubcategory(s)
      if (!seen.has(c)) {
        seen.add(c)
        base.push(c)
      }
    }
    const order = [...PROMOTION_DEFAULT_SUBCATEGORIES] as string[]
    const rank = (x: string) => {
      const i = order.indexOf(x as (typeof PROMOTION_DEFAULT_SUBCATEGORIES)[number])
      return i >= 0 ? i : 999
    }
    fallback = (a, b) => rank(a) - rank(b) || a.localeCompare(b)
  }
  const saved = (savedOrder || [])
    .map((name) => {
      const text = String(name ?? '').trim()
      return text ? (isPromotion ? normalizePromotionSubcategory(text) : text) : ''
    })
    .filter(Boolean)
  if (saved.length === 0) {
    return isPromotion ? base.slice().sort(fallback) : base.slice().sort()
  }
  return orderLabelsBySavedList(base, saved, fallback)
}
