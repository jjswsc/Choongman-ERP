/** BOM 수량: DB는 음식=g(그램)·포장=ea(개) 기준 저장, 화면은 quantity_unit_key로 표시 단위 복원 */

export type BomIngredientType = 'food' | 'packaging'

export type BomItemMeta = {
  unit?: string
  totalQuantity?: number | null
  category?: string
}

export function parseQuantityUnitKey(unitKey: string | null | undefined): { unit: string; totalQuantity: number } | null {
  if (!unitKey || unitKey === 'spec') return null
  const [unit, tqStr] = String(unitKey).split('::')
  const u = String(unit || '').trim()
  const totalQuantity = Number(tqStr) || 1
  if (!u) return null
  return { unit: u, totalQuantity }
}

export function formatQuantityUnitKey(unit: string, totalQuantity: number): string {
  return `${String(unit).trim()}::${Math.max(1, Number(totalQuantity) || 1)}`
}

export function unitLabelFromKey(unitKey: string | null | undefined, ingredientType: BomIngredientType): string {
  const parsed = parseQuantityUnitKey(unitKey)
  if (parsed) return parsed.unit
  return ingredientType === 'packaging' ? 'ea' : 'g'
}

/** 저장 수량 = 표시값 × factor */
export function getStoreQuantityFactor(
  unitKey: string | null | undefined,
  ingredientType: BomIngredientType,
  itemMeta?: BomItemMeta | null
): number {
  if (!unitKey || unitKey === 'spec') return 1
  const parsed = parseQuantityUnitKey(unitKey)
  if (!parsed) return 1

  if (ingredientType === 'packaging') return 1

  const u = parsed.unit.toLowerCase().trim()
  if (u === 'g' || u === 'ml') return 1
  if (u === 'kg') return 1000
  if (u === 'l') return 1000
  if (u === 'oz') return 28.35
  if (u === 'lb') return 453.6
  if (/^(개|ea|팩|pack|박스)$/.test(u)) return 1

  const itemTq = itemMeta?.totalQuantity != null ? Number(itemMeta.totalQuantity) : null
  const itemUnit = String(itemMeta?.unit ?? '').toLowerCase().trim()
  const stdTotalQty = parsed.totalQuantity || 1
  if (itemTq != null && itemTq > 0 && itemUnit) {
    const gramsPerSpec =
      itemUnit === 'kg' ? itemTq * 1000 : itemUnit === 'g' || itemUnit === 'ml' ? itemTq : itemTq
    const specPerStdUnit = 1 / stdTotalQty
    return gramsPerSpec * specPerStdUnit
  }
  return 1
}

export function bomStoredToDisplay(
  storedQuantity: number,
  unitKey: string | null | undefined,
  ingredientType: BomIngredientType,
  itemMeta?: BomItemMeta | null
): { quantity: number; unit: string } {
  const factor = getStoreQuantityFactor(unitKey, ingredientType, itemMeta)
  const displayUnit = unitLabelFromKey(unitKey, ingredientType)
  const q = factor > 0 ? storedQuantity / factor : storedQuantity
  const rounded =
    Math.abs(q - Math.round(q)) < 1e-6 ? Math.round(q) : Math.round(q * 1000) / 1000
  return { quantity: rounded, unit: displayUnit }
}

/** 저장·조회 시 unit_key 정규화 (null → g::1 / ea::1) */
export function normalizeQuantityUnitKey(
  unitKey: string | null | undefined,
  ingredientType: BomIngredientType
): string {
  const trimmed = String(unitKey ?? '').trim()
  if (trimmed && trimmed !== 'spec') return trimmed
  return ingredientType === 'packaging' ? 'ea::1' : 'g::1'
}

export function roundDisplayQuantity(q: number): number {
  return Math.abs(q - Math.round(q)) < 1e-6 ? Math.round(q) : Math.round(q * 1000) / 1000
}

/** 표준단위 목록에 없는 저장 키를 드롭다운 옵션 중 가장 가까운 값으로 맞춤 */
export function coerceQuantityUnitKeyForStandardUnits(
  unitKey: string,
  standardUnits: { unit: string; totalQuantity: number }[] | undefined | null
): string {
  const key = String(unitKey ?? '').trim()
  if (!key || key === 'spec' || !standardUnits?.length) return key
  const keys = standardUnits.map((o) => formatQuantityUnitKey(o.unit, o.totalQuantity))
  if (keys.includes(key)) return key
  const parsed = parseQuantityUnitKey(key)
  if (parsed) {
    const uLower = parsed.unit.toLowerCase()
    const sameLabel = keys.find((k) => parseQuantityUnitKey(k)?.unit.toLowerCase() === uLower)
    if (sameLabel) return sameLabel
  }
  return keys[0] ?? key
}
