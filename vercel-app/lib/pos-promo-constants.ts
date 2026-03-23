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

/** 카테고리 설정에 없을 때 쓰는 기본 소분류 */
export const PROMOTION_DEFAULT_SUBCATEGORIES = ['세트', '시즌', '배달전용'] as const
