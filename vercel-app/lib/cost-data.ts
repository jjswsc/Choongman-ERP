// Types
export interface Ingredient {
  code: number
  name: string
  bahtPerUnit: number
  category: "food" | "packaging"
}

export interface RecipeItem {
  ingredientCode: number
  quantity: number // g/unit or unit count
  misePercent?: number // 로스/미세 %, 기본 3
  /** 목록에서 불러온 품목코드. 전역 runtime 맵이 비어도 저장 시 매핑 유지 */
  savedItemCode?: string
}

export interface MenuItem {
  /** POS 메뉴 코드 (메뉴 관리의 코드 = 품번) */
  menuCode: string
  category: string
  categoryMain?: string
  menuName: string
  description: string
  inclVat: number
  /** 가격이 VAT 포함인지 (false면 inclVat이 이미 VAT 제외) */
  vatIncluded?: boolean
  /** 홀 가격 (메뉴 관리 price) */
  priceHall?: number
  /** 배달 가격 (메뉴 관리 price_delivery) */
  priceDelivery?: number | null
  serviceType: "Dine-In" | "Delivery"
  deliveryPercent: number
  misePercent: number
  /** 조리 시간(분) */
  cookingTimeMin?: number | null
}

export const MISE_DEFAULT = 3

/** 초기 상태: 메뉴 미선택 */
export const emptyMenuItem: MenuItem = {
  menuCode: "",
  category: "",
  menuName: "",
  description: "",
  inclVat: 0,
  serviceType: "Dine-In",
  deliveryPercent: 25,
  misePercent: MISE_DEFAULT,
}

export const emptyFoodRecipe: RecipeItem[] = []
export const emptyPackagingRecipe: RecipeItem[] = []

// Runtime ingredients (API 로드 시 사용, itemCode는 저장 시 매핑용)
let runtimeIngredientMap = new Map<number, { name: string; bahtPerUnit: number; category: "food" | "packaging"; itemCode?: string }>()

export function setRuntimeIngredients(items: Array<{ code: number; name: string; bahtPerUnit: number; category: "food" | "packaging"; itemCode?: string }>) {
  runtimeIngredientMap = new Map(items.map((i) => [i.code, { name: i.name, bahtPerUnit: i.bahtPerUnit, category: i.category, itemCode: i.itemCode }]))
}

export function clearRuntimeIngredients() {
  runtimeIngredientMap = new Map()
}

export function getRuntimeIngredients(): Array<{ code: number; name: string; bahtPerUnit: number; category: "food" | "packaging" }> {
  return Array.from(runtimeIngredientMap.entries()).map(([code, v]) => ({ code, name: v.name, bahtPerUnit: v.bahtPerUnit, category: v.category }))
}

// Runtime sauces (소스 원가 탭에서 등록한 소스, 원가 계산기에서 선택 가능)
const SAUCE_CODE_OFFSET = 20000
let runtimeSauceMap = new Map<number, { name: string; bahtPerUnit: number; itemCode: string }>()

export function setRuntimeSauces(sauces: Array<{ code: string; name?: string; cost_per_unit?: number; costPerUnit?: number }>) {
  runtimeSauceMap = new Map(
    sauces.map((s, idx) => {
      const code = SAUCE_CODE_OFFSET + idx + 1
      const itemCode = String(s.code ?? '').trim()
      const cost = Number(s.costPerUnit ?? s.cost_per_unit) ?? 0
      return [code, {
        name: String(s.name ?? s.code ?? ''),
        bahtPerUnit: cost,
        itemCode: itemCode || String(code),
      }]
    })
  )
}

// 품목 관리(API)에서 로드한 재료
const API_ITEMS_CODE_OFFSET = 30000
let runtimeApiItemsMap = new Map<number, {
  name: string
  bahtPerUnit: number
  category: "food" | "packaging"
  itemCode: string
  standardUnits?: { unit: string; totalQuantity: number }[]
  /** 품목 관리 카테고리 필터용 (채소, 조미료 등) */
  categoryRaw?: string
  /** 표준단위별 ฿/단위 계산용 */
  price?: number
  itemTotalQuantity?: number | null
  itemUnit?: string
}>()

function inferIngredientCategory(itemCategory: string): "food" | "packaging" {
  const c = String(itemCategory || "").toLowerCase().trim()
  if (/포장|패킹|packaging|packing|박스|용기|봉지|pack|pouch|box|bag/.test(c)) return "packaging"
  return "food"
}

/** 표준 단위 → 1g 또는 1ea당 원가 환산. 반환값 = 수량 1당 ฿ (food=g, packaging=ea) */
function calcBahtPerUnit(
  price: number,
  totalQuantity: number | null | undefined,
  unit: string,
  isPackaging: boolean
): number {
  const u = String(unit || "").toLowerCase().trim()
  if (totalQuantity != null && totalQuantity > 0 && price >= 0) {
    const costPerStdUnit = price / totalQuantity // 1 표준단위당 ฿
    if (isPackaging) {
      // 포장: 개, ea, 팩, 박스 등 → 1ea당
      return costPerStdUnit
    }
    // 음식: g 기준 환산
    if (u === "g" || u === "ml") return costPerStdUnit
    if (u === "kg") return costPerStdUnit / 1000
    if (u === "l") return costPerStdUnit / 1000 // 1L→1ml당≈1g당
    if (u === "oz") return costPerStdUnit / 28.35 // 1oz≈28.35g
    if (u === "lb") return costPerStdUnit / 453.6
    if (u === "개" || u === "ea" || u === "팩" || u === "pack" || u === "박스") return costPerStdUnit // 개당
    return costPerStdUnit
  }
  return 0
}

export function setRuntimeApiItems(items: Array<{
  code: string
  name?: string
  cost?: number
  price?: number
  totalQuantity?: number | null
  unit?: string
  category?: string
  standardUnits?: { unit: string; totalQuantity: number }[]
}>) {
  type ApiItem = NonNullable<ReturnType<typeof runtimeApiItemsMap.get>>
  const entries: [number, ApiItem][] = []
  let idx = 0
  items.forEach((item) => {
    const itemCode = String(item.code ?? "").trim()
    if (!itemCode) return
    const code = API_ITEMS_CODE_OFFSET + idx + 1
    idx += 1
    const cat = inferIngredientCategory(item.category ?? "")
    const price = Number(item.price ?? item.cost ?? 0)
    const totalQty = item.totalQuantity != null ? Number(item.totalQuantity) : null
    const unit = String(item.unit ?? "").trim()
    let bahtPerUnit: number
    if (totalQty != null && totalQty > 0) {
      bahtPerUnit = calcBahtPerUnit(price, totalQty, unit, cat === "packaging")
    } else {
      bahtPerUnit = Number(item.cost ?? 0) // 기존: cost를 1단위당으로
    }
    const standardUnits = Array.isArray(item.standardUnits)
      ? item.standardUnits.filter((o) => (o.unit || "").trim() && o.totalQuantity > 0)
      : undefined
    entries.push([code, {
      name: String(item.name ?? item.code ?? ""),
      bahtPerUnit,
      category: cat,
      itemCode,
      standardUnits: standardUnits?.length ? standardUnits : undefined,
      categoryRaw: String(item.category ?? "").trim() || undefined,
      price,
      itemTotalQuantity: totalQty,
      itemUnit: unit || undefined,
    }])
  })
  runtimeApiItemsMap = new Map(entries)
}

export function getRuntimeApiItems(): Array<{
  code: number
  name: string
  bahtPerUnit: number
  category: "food" | "packaging"
  standardUnits?: { unit: string; totalQuantity: number }[]
  categoryRaw?: string
}> {
  return Array.from(runtimeApiItemsMap.entries()).map(([code, v]) => ({
    code,
    name: v.name,
    bahtPerUnit: v.bahtPerUnit,
    category: v.category,
    standardUnits: v.standardUnits,
    categoryRaw: v.categoryRaw,
  }))
}

export function getRuntimeSauces(): Array<{ code: number; name: string; bahtPerUnit: number; category: "food" }> {
  return Array.from(runtimeSauceMap.entries()).map(([code, v]) => ({ code, name: v.name, bahtPerUnit: v.bahtPerUnit, category: "food" as const }))
}

/** ingredientCode(number) → item_code(string) for API 저장 */
export function getIngredientItemCode(code: number): string | undefined {
  const runtime = runtimeIngredientMap.get(code)
  if (runtime?.itemCode) return runtime.itemCode
  const sauce = runtimeSauceMap.get(code)
  if (sauce?.itemCode) return sauce.itemCode
  const apiItem = runtimeApiItemsMap.get(code)
  if (apiItem?.itemCode) return apiItem.itemCode
  return undefined
}

/** item_code(string) → ingredientCode(number). API/소스 로드 후 사용 */
export function getIngredientCodeByItemCode(itemCode: string): number | undefined {
  const code = String(itemCode ?? "").trim()
  if (!code) return undefined
  for (const [c, v] of runtimeApiItemsMap) {
    if (v.itemCode === code) return c
  }
  for (const [c, v] of runtimeSauceMap) {
    if (v.itemCode === code) return c
  }
  return undefined
}

// Helper functions
export function getIngredient(code: number): (Ingredient & { standardUnits?: { unit: string; totalQuantity: number }[] }) | { code: number; name: string; bahtPerUnit: number; standardUnits?: { unit: string; totalQuantity: number }[] } | undefined {
  const runtime = runtimeIngredientMap.get(code)
  if (runtime) return { code, ...runtime }
  const sauce = runtimeSauceMap.get(code)
  if (sauce) return { code, ...sauce, category: "food" as const }
  const apiItem = runtimeApiItemsMap.get(code)
  if (apiItem) return { code, ...apiItem }
  return undefined
}

/** API 품목의 표준 단위 목록 (원가 계산기 수량 입력용). food는 항상 g 포함 (품목 관리 1g당 원가 기준). */
export function getIngredientStandardUnits(code: number): { unit: string; totalQuantity: number }[] | undefined {
  const apiItem = runtimeApiItemsMap.get(code)
  const units = apiItem?.standardUnits
  if (!apiItem) return units
  if (apiItem.category === "food") {
    const hasG = units?.some((u) => String(u.unit || "").toLowerCase().trim() === "g")
    if (!hasG) {
      const tq = apiItem.bahtPerUnit > 0 && apiItem.price != null && apiItem.price >= 0
        ? Math.max(1, Math.round(apiItem.price / apiItem.bahtPerUnit))
        : 1
      return [{ unit: "g", totalQuantity: tq }, ...(units ?? [])]
    }
  }
  return units
}

/** 표준단위 key (unit::totalQuantity)에 대한 ฿/단위. API 품목만 지원. g는 항상 bahtPerUnit(1g당 원가) 사용. */
export function getBahtPerStandardUnit(code: number, unitKey: string): number | undefined {
  if (!unitKey || unitKey === "spec") return undefined
  const apiItem = runtimeApiItemsMap.get(code)
  if (!apiItem) return undefined
  const [unit] = unitKey.split("::")
  const u = String(unit || "").toLowerCase().trim()
  if (u === "g" || u === "ml") return apiItem.bahtPerUnit
  if (!apiItem.price || apiItem.price < 0) return undefined
  const tqStr = unitKey.split("::")[1]
  const stdTotalQty = Number(tqStr)
  if (!stdTotalQty || stdTotalQty <= 0) return undefined
  return apiItem.price / stdTotalQty
}

/**
 * 표준단위 key에 대해: 사용자 입력값(표시 단위) → 저장 수량(g 또는 ea)으로 변환하는 계수.
 * storedQuantity = displayValue * factor
 */
export function getQuantityFactorToStore(code: number, unitKey: string): number {
  if (!unitKey || unitKey === "spec") return 1
  const apiItem = runtimeApiItemsMap.get(code)
  const [unit, tqStr] = unitKey.split("::")
  const stdTotalQty = Number(tqStr) || 1
  const u = String(unit || "").toLowerCase().trim()

  if (apiItem?.category === "packaging") {
    return 1
  }

  if (u === "g" || u === "ml") return 1
  if (u === "kg") return 1000
  if (u === "l") return 1000
  if (u === "oz") return 28.35
  if (u === "lb") return 453.6
  if (/개|ea|팩|pack|박스/.test(u)) return 1

  const itemTq = apiItem?.itemTotalQuantity
  const itemUnit = String(apiItem?.itemUnit ?? "").toLowerCase().trim()
  if (itemTq != null && itemTq > 0 && itemUnit) {
    const gramsPerSpec = itemUnit === "kg" ? itemTq * 1000 : itemUnit === "g" || itemUnit === "ml" ? itemTq : itemTq
    const specPerStdUnit = 1 / stdTotalQty
    return gramsPerSpec * specPerStdUnit
  }
  return 1
}

/**
 * 표준단위 key에 대해: 저장 수량 → 사용자 표시값으로 변환하는 계수.
 * displayValue = storedQuantity / factor
 */
export function getQuantityFactorToDisplay(code: number, unitKey: string): number {
  const f = getQuantityFactorToStore(code, unitKey)
  return f > 0 ? f : 1
}

export function calculateItemCost(item: RecipeItem): number {
  const ingredient = getIngredient(item.ingredientCode)
  if (!ingredient) return 0
  const baseCost = ingredient.bahtPerUnit * item.quantity
  const mise = item.misePercent ?? 3
  return Math.round(baseCost * (1 + mise / 100) * 100) / 100
}

export function calculateSubTotal(items: RecipeItem[]): number {
  return items.reduce((sum, item) => sum + calculateItemCost(item), 0)
}

export function calculateExclVat(inclVat: number): number {
  return inclVat / 1.07 // 7% VAT in Thailand
}

export function calculateMargin(exclVat: number, totalCost: number): number {
  return exclVat - totalCost
}

export function calculateMarginPercent(margin: number, exclVat: number): number {
  if (exclVat === 0) return 0
  return (margin / exclVat) * 100
}

export function calculateCostPercent(totalCost: number, exclVat: number): number {
  if (exclVat === 0) return 0
  return (totalCost / exclVat) * 100
}
