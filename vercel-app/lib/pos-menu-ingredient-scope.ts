/** pos_menu_ingredients.option_id: null·0·'' 는 "메뉴 기본 BOM" (레거시 DB 호환) */
export function isBaseMenuIngredientOptionId(raw: unknown): boolean {
  if (raw == null) return true
  if (typeof raw === 'number' && raw === 0) return true
  const s = String(raw).trim()
  return s === '' || s === '0'
}

export function normalizeMenuIngredientOptionKeySeg(raw: unknown): string {
  if (isBaseMenuIngredientOptionId(raw)) return 'null'
  const s = String(raw).trim()
  if (/^\d+$/.test(s)) return String(Number(s))
  return s
}

/** PostgREST filter: menu_id + option scope (기본 vs 옵션 전용) */
export function posMenuIngredientScopeFilter(menuId: number, optionId: number | null): string {
  const mid = encodeURIComponent(String(Math.floor(menuId)))
  if (optionId == null || !Number.isFinite(optionId)) {
    return `menu_id=eq.${mid}&or=(option_id.is.null,option_id.eq.0)`
  }
  return `menu_id=eq.${mid}&option_id=eq.${encodeURIComponent(String(Math.floor(optionId)))}`
}

export function ingredientRowMatchesScope(
  row: { menu_id?: unknown; option_id?: unknown; menuId?: unknown; optionId?: unknown | null },
  menuId: number,
  optionId: number | null
): boolean {
  const mid = Number(row.menu_id ?? row.menuId)
  if (!Number.isFinite(mid) || Math.floor(mid) !== Math.floor(menuId)) return false
  const wantBase = optionId == null || !Number.isFinite(optionId)
  const rowBase = isBaseMenuIngredientOptionId(row.option_id ?? row.optionId)
  if (wantBase) return rowBase
  if (rowBase) return false
  return Math.floor(Number(row.option_id ?? row.optionId)) === Math.floor(Number(optionId))
}

/**
 * menu_code 스냅샷으로 menu_id 복구 — menu_id FK 가 깨진(orphan) 행만.
 * 유효한 menu_id 는 C013 / C013-1 처럼 비슷한 코드가 있어도 재매핑하지 않는다.
 */
export function resolveIngredientMenuIdFromCode(params: {
  menuId: number
  menuCodeOnRow: string
  mappedMenuIdFromCode: number | undefined
  menuExistsForMenuId: boolean
}): { menuId: number; remapped: boolean } {
  const { menuCodeOnRow, mappedMenuIdFromCode, menuExistsForMenuId } = params
  const mid = params.menuId
  const codeKey = String(menuCodeOnRow ?? '').trim()
  if (!codeKey) return { menuId: mid, remapped: false }
  const mappedMid = mappedMenuIdFromCode
  if (!Number.isFinite(mappedMid) || mappedMid! <= 0) return { menuId: mid, remapped: false }
  if (Number.isFinite(mid) && mid > 0 && menuExistsForMenuId) {
    return { menuId: mid, remapped: false }
  }
  return { menuId: mappedMid!, remapped: true }
}
