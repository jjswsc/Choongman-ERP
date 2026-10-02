import type { PosMenuUpsertApiBody } from '@/lib/pos-menu-upsert-server'

/** 일괄 업로드가 다시 저장할지 비교하는 기존 메뉴 스냅샷 */
export type PosMenuImportExistingSnapshot = {
  code: string
  name: string
  categoryMain: string
  category: string
  price: number
  priceDelivery: number | null
  image: string
  vatIncluded: boolean
  isActive: boolean
  sortOrder: number
  kitchenPrinter: number | null
  cookingTimeMin: number | null
  isBanban: boolean
  optionSelectionGroups: string[] | null
  storeCodes: string[]
}

function normStr(value: unknown): string {
  return String(value ?? '').trim()
}

function sameNullableNumber(left: number | null, right: number | null): boolean {
  if (left == null && right == null) return true
  if (left == null || right == null) return false
  return Number(left) === Number(right)
}

function finiteOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function storeKey(codes: string[]): string {
  return codes
    .map((code) => normStr(code).toLowerCase())
    .filter(Boolean)
    .sort()
    .join('\n')
}

function groupKey(groups: string[]): string {
  return groups
    .map((group) => normStr(group))
    .filter(Boolean)
    .sort()
    .join('\n')
}

/**
 * 엑셀 행이 이미 저장된 메뉴·노출 매장과 같으면 true.
 * 빈 이미지는 기존 사진을 지우지 않으므로 차이로 보지 않는다.
 */
export function isPosMenuImportRowUnchanged(
  existing: PosMenuImportExistingSnapshot,
  body: PosMenuUpsertApiBody,
  storeCodes: string[]
): boolean {
  if (normStr(existing.code).toLowerCase() !== normStr(body.code).toLowerCase()) return false
  if (normStr(existing.name) !== normStr(body.name)) return false
  if (normStr(existing.categoryMain) !== normStr(body.categoryMain)) return false
  if (normStr(existing.category) !== normStr(body.category)) return false
  if (Number(existing.price) !== Number(body.price ?? 0)) return false
  if (!sameNullableNumber(existing.priceDelivery, finiteOrNull(body.priceDelivery))) return false
  const incomingImage = normStr(body.imageUrl)
  if (incomingImage && incomingImage !== normStr(existing.image)) return false
  if ((body.vatIncluded !== false) !== existing.vatIncluded) return false
  if ((body.isActive !== false) !== existing.isActive) return false
  if (Number(body.sortOrder ?? 0) !== Number(existing.sortOrder ?? 0)) return false
  if (!sameNullableNumber(existing.kitchenPrinter, finiteOrNull(body.kitchenPrinter))) return false
  if (!sameNullableNumber(existing.cookingTimeMin, finiteOrNull(body.cookingTimeMin))) return false
  if ((body.isBanban === true) !== existing.isBanban) return false
  if (Array.isArray(body.optionSelectionGroups)) {
    const prev = existing.optionSelectionGroups || []
    if (groupKey(body.optionSelectionGroups) !== groupKey(prev)) return false
  }
  return storeKey(existing.storeCodes) === storeKey(storeCodes)
}
