/**
 * POS 메뉴 코드 자동 발급 — 대분류 → 접두사
 * API(getNextPosMenuCode) · 관리자 UI(CODE_AUTO_MAINS) 공통.
 */
export const POS_MENU_CODE_PREFIX_BY_MAIN: Record<string, string> = {
  Chicken: 'C',
  Korean: 'K',
  Side: 'S',
  Drinks: 'D',
  /** 토핑은 치킨(C)과 겹치지 않도록 T */
  Topping: 'T',
  /** Omni 등 Food 대분류 */
  Food: 'F',
}

export const CODE_AUTO_MAINS = Object.keys(POS_MENU_CODE_PREFIX_BY_MAIN) as Array<
  keyof typeof POS_MENU_CODE_PREFIX_BY_MAIN
>

export function posMenuCodePrefixForMain(mainCategory: string): string | null {
  const key = String(mainCategory ?? '').trim()
  if (!key) return null
  return POS_MENU_CODE_PREFIX_BY_MAIN[key] ?? null
}

/** 입력란 placeholder (예: Food → F001) */
export function posMenuCodePlaceholderForMain(mainCategory: string): string {
  const prefix = posMenuCodePrefixForMain(mainCategory)
  if (prefix) return `${prefix}001`
  return 'C001 / F001 / T001'
}
