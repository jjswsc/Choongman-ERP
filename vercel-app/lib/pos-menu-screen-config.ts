export interface PosMenuScreenConfig {
  storeCode: string | null
  mainCategoryFontSize: number
  categoryFontSize: number
  menuTileFontSize: number
  menuTileCols: number
  menuListFontSize: number
  menuListPageSize: number
  kioskGroupFontSize: number
}

export const DEFAULT_POS_MENU_SCREEN_CONFIG: PosMenuScreenConfig = {
  storeCode: null,
  mainCategoryFontSize: 14,
  categoryFontSize: 13,
  menuTileFontSize: 13,
  menuTileCols: 4,
  menuListFontSize: 12,
  menuListPageSize: 14,
  kioskGroupFontSize: 13,
}

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function normalizePosMenuScreenConfig(
  input: Partial<PosMenuScreenConfig> | null | undefined,
  storeCode?: string | null
): PosMenuScreenConfig {
  const base = DEFAULT_POS_MENU_SCREEN_CONFIG
  const source = input || {}
  return {
    storeCode: (storeCode ?? source.storeCode ?? base.storeCode) || null,
    mainCategoryFontSize: clampInt(source.mainCategoryFontSize, 10, 22, base.mainCategoryFontSize),
    categoryFontSize: clampInt(source.categoryFontSize, 10, 20, base.categoryFontSize),
    menuTileFontSize: clampInt(source.menuTileFontSize, 10, 22, base.menuTileFontSize),
    menuTileCols: clampInt(source.menuTileCols, 2, 7, base.menuTileCols),
    menuListFontSize: clampInt(source.menuListFontSize, 10, 20, base.menuListFontSize),
    menuListPageSize: clampInt(source.menuListPageSize, 6, 40, base.menuListPageSize),
    kioskGroupFontSize: clampInt(source.kioskGroupFontSize, 10, 20, base.kioskGroupFontSize),
  }
}
