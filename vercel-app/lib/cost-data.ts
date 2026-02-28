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
}

export interface MenuItem {
  /** POS 메뉴 코드 (메뉴 관리의 코드 = 품번) */
  menuCode: string
  category: string
  categoryMain?: string
  menuName: string
  description: string
  inclVat: number
  serviceType: "Dine-In" | "Delivery"
  deliveryPercent: number
  misePercent: number
}

// Ingredient database (the "other sheet")
export const ingredientDatabase: Ingredient[] = [
  // Food ingredients
  { code: 3, name: "Frozen Marinade BLK 27-35g /pcs.", bahtPerUnit: 3.75, category: "food" },
  { code: 5, name: "Choongman Batter Mix for Chicken", bahtPerUnit: 0.107, category: "food" },
  { code: 75, name: "Snow Onion Sauce", bahtPerUnit: 0.147, category: "food" },
  { code: 65, name: "Dried Parsley", bahtPerUnit: 1.38, category: "food" },
  { code: 16, name: "Onion", bahtPerUnit: 0.027, category: "food" },
  { code: 79, name: "Pickled Radish", bahtPerUnit: 0.06, category: "food" },
  { code: 135, name: "Oil BL", bahtPerUnit: 0.044, category: "food" },
  { code: 28, name: "Poki Kimchi Nongyee", bahtPerUnit: 0.042, category: "food" },
  { code: 10, name: "Garlic Powder", bahtPerUnit: 0.23, category: "food" },
  { code: 12, name: "Soy Sauce", bahtPerUnit: 0.055, category: "food" },
  { code: 15, name: "Sesame Oil", bahtPerUnit: 0.32, category: "food" },
  { code: 20, name: "Rice Flour", bahtPerUnit: 0.035, category: "food" },
  { code: 22, name: "Corn Starch", bahtPerUnit: 0.048, category: "food" },
  { code: 30, name: "Sugar", bahtPerUnit: 0.025, category: "food" },
  { code: 35, name: "Salt", bahtPerUnit: 0.012, category: "food" },
  { code: 40, name: "Black Pepper", bahtPerUnit: 0.45, category: "food" },
  { code: 45, name: "Chili Flakes", bahtPerUnit: 0.28, category: "food" },
  { code: 50, name: "Spring Onion", bahtPerUnit: 0.035, category: "food" },
  { code: 55, name: "Ginger", bahtPerUnit: 0.065, category: "food" },
  { code: 60, name: "Lettuce", bahtPerUnit: 0.042, category: "food" },

  // Packaging items
  { code: 116, name: "Chopsticks", bahtPerUnit: 0.34, category: "packaging" },
  { code: 235, name: "Spoon Set", bahtPerUnit: 0.55, category: "packaging" },
  { code: 234, name: "Choongman Box (XS)", bahtPerUnit: 4.0, category: "packaging" },
  { code: 109, name: "Take Away Bowl 4 oz", bahtPerUnit: 0.919, category: "packaging" },
  { code: 204, name: "Onion Plastic Packing", bahtPerUnit: 0.748, category: "packaging" },
  { code: 202, name: "Sauce Pouch Salad Sauce", bahtPerUnit: 0.467, category: "packaging" },
  { code: 210, name: "Paper Bag (M)", bahtPerUnit: 2.5, category: "packaging" },
  { code: 215, name: "Sticker Seal", bahtPerUnit: 0.15, category: "packaging" },
  { code: 220, name: "Napkin Pack", bahtPerUnit: 0.18, category: "packaging" },
  { code: 225, name: "Plastic Cup Lid", bahtPerUnit: 0.35, category: "packaging" },
]

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
let runtimeApiItemsMap = new Map<number, { name: string; bahtPerUnit: number; category: "food" | "packaging"; itemCode: string }>()

function inferIngredientCategory(itemCategory: string): "food" | "packaging" {
  const c = String(itemCategory || "").toLowerCase()
  if (/포장|packaging|박스|용기|봉지|pack|pouch|box|bag/.test(c)) return "packaging"
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
}>) {
  const entries: [number, { name: string; bahtPerUnit: number; category: "food" | "packaging"; itemCode: string }][] = []
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
    entries.push([code, {
      name: String(item.name ?? item.code ?? ""),
      bahtPerUnit,
      category: cat,
      itemCode,
    }])
  })
  runtimeApiItemsMap = new Map(entries)
}

export function getRuntimeApiItems(): Array<{ code: number; name: string; bahtPerUnit: number; category: "food" | "packaging" }> {
  return Array.from(runtimeApiItemsMap.entries()).map(([code, v]) => ({
    code,
    name: v.name,
    bahtPerUnit: v.bahtPerUnit,
    category: v.category,
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
  const stat = ingredientDatabase.find((i) => i.code === code)
  return stat ? String(stat.code) : undefined
}

// Helper functions
export function getIngredient(code: number): Ingredient | { code: number; name: string; bahtPerUnit: number } | undefined {
  const runtime = runtimeIngredientMap.get(code)
  if (runtime) return { code, ...runtime }
  const sauce = runtimeSauceMap.get(code)
  if (sauce) return { code, ...sauce, category: "food" as const }
  const apiItem = runtimeApiItemsMap.get(code)
  if (apiItem) return { code, ...apiItem }
  return ingredientDatabase.find((i) => i.code === code)
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
