import { getStoreQuantityFactor } from '@/lib/pos-menu-ingredient-quantity-unit'

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
  /** 원가 계산기 입력 단위 (예 g::1, ml::1, kg::1000). DB quantity_unit_key와 동기 */
  quantityUnitKey?: string
  /** API breakdown에서 불러온 행 원가 — 목록·서버 합계와 동일하게 유지 */
  savedLineCost?: number
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

/** 원가 계산기·DB 미설정 시 배달앱 수수료 기본값(%) */
export const DELIVERY_APP_FEE_PERCENT_DEFAULT = 20

/** 플랫폼 정산(익일 NET) 앱별 기본 % — DB 미설정 시 */
export const DELIVERY_PLATFORM_SETTLEMENT_FEE_PCT: Record<"grab" | "lineman" | "shopee", number> = {
  grab: 20,
  lineman: 18,
  shopee: 13,
}

export function defaultPlatformSettlementFeePct(appCode: string | null | undefined): number {
  const c = String(appCode ?? "")
    .trim()
    .toLowerCase()
  if (c === "grab") return DELIVERY_PLATFORM_SETTLEMENT_FEE_PCT.grab
  if (c === "lineman") return DELIVERY_PLATFORM_SETTLEMENT_FEE_PCT.lineman
  if (c === "shopee") return DELIVERY_PLATFORM_SETTLEMENT_FEE_PCT.shopee
  return DELIVERY_APP_FEE_PERCENT_DEFAULT
}

export function normalizeDeliveryAppFeePercent(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return DELIVERY_APP_FEE_PERCENT_DEFAULT
  return Math.max(0, Math.min(100, Math.round(n * 100) / 100))
}

export function resolveDeliveryAppFeePercent(stored: unknown): number {
  if (stored === null || stored === undefined || stored === "") {
    return DELIVERY_APP_FEE_PERCENT_DEFAULT
  }
  return normalizeDeliveryAppFeePercent(stored)
}

/** 초기 상태: 메뉴 미선택 */
export const emptyMenuItem: MenuItem = {
  menuCode: "",
  category: "",
  menuName: "",
  description: "",
  inclVat: 0,
  serviceType: "Dine-In",
  deliveryPercent: DELIVERY_APP_FEE_PERCENT_DEFAULT,
  misePercent: MISE_DEFAULT,
}

export const emptyFoodRecipe: RecipeItem[] = []
export const emptyPackagingRecipe: RecipeItem[] = []

// Runtime ingredients (API 로드 시 사용, itemCode는 저장 시 매핑용)
let runtimeIngredientMap = new Map<number, { name: string; bahtPerUnit: number; category: "food" | "packaging"; itemCode?: string }>()

export function setRuntimeIngredients(items: Array<{ code: number; name: string; bahtPerUnit: number; category: "food" | "packaging"; itemCode?: string }>) {
  runtimeIngredientMap = new Map(items.map((i) => [i.code, { name: i.name, bahtPerUnit: i.bahtPerUnit, category: i.category, itemCode: i.itemCode }]))
}

/** setRuntimeIngredients 대신 기존 품목·배합 맵을 유지하며 breakdown 폴백만 추가 */
export function mergeRuntimeIngredients(items: Array<{ code: number; name: string; bahtPerUnit: number; category: "food" | "packaging"; itemCode?: string }>) {
  for (const i of items) {
    const prev = runtimeIngredientMap.get(i.code)
    const ic = String(i.itemCode ?? "").trim()
    const name =
      i.name && i.name !== ic
        ? i.name
        : prev?.name && prev.name !== ic
          ? prev.name
          : i.name
    const bahtPerUnit =
      i.bahtPerUnit > 0 ? i.bahtPerUnit : prev && prev.bahtPerUnit > 0 ? prev.bahtPerUnit : i.bahtPerUnit
    runtimeIngredientMap.set(i.code, {
      name,
      bahtPerUnit,
      category: i.category,
      itemCode: i.itemCode ?? prev?.itemCode,
    })
  }
}

export function clearRuntimeIngredients() {
  runtimeIngredientMap = new Map()
}

const RUNTIME_BREAKDOWN_FALLBACK_OFFSET = 10000

/**
 * breakdown 행 → runtime code. API 품목·배합 맵에 없을 때 이름·단가 폴백 등록.
 * (getSauces/getAdminItems 완료 전에 BOM을 그려도 S002 등이 코드 문자열로만 보이지 않게)
 */
export function seedRuntimeFromBreakdownRow(params: {
  itemCode: string
  itemName?: string
  costPerUnit?: number
  ingredientType?: "food" | "packaging"
  fallbackIndex?: number
}): number {
  const itemCode = String(params.itemCode ?? "").trim()
  if (!itemCode) return RUNTIME_BREAKDOWN_FALLBACK_OFFSET + (params.fallbackIndex ?? 0)

  const existing = getIngredientCodeByItemCode(itemCode)
  if (existing != null) return existing

  const cat = params.ingredientType === "packaging" ? "packaging" : "food"
  const name = String(params.itemName ?? itemCode).trim() || itemCode
  const bahtPerUnit = Number(params.costPerUnit) || 0

  if (/^S\d+/i.test(itemCode)) {
    return registerRuntimeSauceIfAbsent({
      itemCode,
      name,
      bahtPerUnit,
      usageKind: "for_sale",
    })
  }

  const codeNum = /^\d+$/.test(itemCode) ? parseInt(itemCode, 10) : NaN
  const code = !isNaN(codeNum) ? codeNum : RUNTIME_BREAKDOWN_FALLBACK_OFFSET + (params.fallbackIndex ?? 0)
  mergeRuntimeIngredients([{ code, name, bahtPerUnit, category: cat, itemCode }])
  return code
}

/** breakdown/API 불일치 시 이름·단가 보강 (품목·배합 공통) */
export function enrichRuntimeFromBreakdown(params: {
  itemCode: string
  itemName?: string
  costPerUnit?: number
  ingredientType?: "food" | "packaging"
}): void {
  const itemCode = String(params.itemCode ?? "").trim()
  if (!itemCode) return
  const name = String(params.itemName ?? "").trim()
  const bahtPerUnit = Number(params.costPerUnit) || 0
  if (/^S\d+/i.test(itemCode)) {
    const sauceCode = getIngredientCodeByItemCode(itemCode)
    if (sauceCode == null || !runtimeSauceMap.has(sauceCode)) {
      registerRuntimeSauceIfAbsent({
        itemCode,
        name: name || itemCode,
        bahtPerUnit,
        usageKind: "for_sale",
      })
      return
    }
  }
  const resolved = getIngredientCodeByItemCode(itemCode)
  if (resolved != null && runtimeSauceMap.has(resolved)) {
    const usageKind = runtimeSauceMap.get(resolved)?.usageKind ?? "for_sale"
    registerRuntimeSauceIfAbsent({
      itemCode,
      name: name || itemCode,
      bahtPerUnit,
      usageKind,
    })
    return
  }
  const cat = params.ingredientType === "packaging" ? "packaging" : "food"
  const code = resolved ?? seedRuntimeFromBreakdownRow({
    itemCode,
    itemName: name,
    costPerUnit: bahtPerUnit,
    ingredientType: cat,
  })
  mergeRuntimeIngredients([
    {
      code,
      name: name || itemCode,
      bahtPerUnit,
      category: cat,
      itemCode,
    },
  ])
}

/** savedItemCode 기준으로 ingredientCode 재매핑 (런타임 API 로드 후) */
export function reResolveRecipeItems(items: RecipeItem[]): RecipeItem[] {
  return items.map((item) => {
    const ic = String(item.savedItemCode ?? getIngredientItemCode(item.ingredientCode) ?? "").trim()
    if (!ic) return item
    const resolved = getIngredientCodeByItemCode(ic)
    if (resolved != null && resolved !== item.ingredientCode) {
      return { ...item, ingredientCode: resolved }
    }
    return item
  })
}

export function getRuntimeIngredients(): Array<{ code: number; name: string; bahtPerUnit: number; category: "food" | "packaging" }> {
  return Array.from(runtimeIngredientMap.entries()).map(([code, v]) => ({ code, name: v.name, bahtPerUnit: v.bahtPerUnit, category: v.category }))
}

// Runtime sauces (배합 원가 탭에서 등록한 항목; 원가 계산기에서 선택 가능)
const SAUCE_CODE_OFFSET = 20000
type RuntimeSauceEntry = { name: string; bahtPerUnit: number; itemCode: string; usageKind?: 'for_sale' | 'store_use' }
let runtimeSauceMap = new Map<number, RuntimeSauceEntry>()

export type RuntimeSauceInput = {
  code: string
  name?: string
  cost_per_unit?: number
  costPerUnit?: number
  /** for_sale: 계산기·배합 레시피에서 배합으로 선택 가능. store_use: 계산기 배합 목록에서 제외 */
  usageKind?: 'for_sale' | 'store_use'
  /** PostgREST/캐시 등에서 snake_case로 올 때 대비 */
  usage_kind?: string
}

function runtimeSauceUsageKind(s: RuntimeSauceInput): 'for_sale' | 'store_use' {
  const raw = String(s.usageKind ?? s.usage_kind ?? 'for_sale').trim().toLowerCase()
  return raw === 'store_use' ? 'store_use' : 'for_sale'
}

/**
 * mode calculator: 매장용 배합도 맵에는 포함(BOM 조회·원가 계산). 선택 UI에서는 ingredientPickerHideSauceUsageKinds로 숨김.
 * full: 배합 원가 탭 레시피 편집용 전체
 */
export function setRuntimeSauces(sauces: RuntimeSauceInput[], opts?: { mode?: 'full' | 'calculator' }) {
  const list = sauces
  runtimeSauceMap = new Map(
    list.map((s, idx) => {
      const code = SAUCE_CODE_OFFSET + idx + 1
      const itemCode = String(s.code ?? '').trim()
      const cost = Number(s.costPerUnit ?? s.cost_per_unit) ?? 0
      return [code, {
        name: String(s.name ?? s.code ?? ''),
        bahtPerUnit: cost,
        itemCode: itemCode || String(code),
        usageKind: runtimeSauceUsageKind(s),
      }]
    })
  )
}

function nextFreeSauceNumericCode(): number {
  let max = SAUCE_CODE_OFFSET
  for (const c of runtimeSauceMap.keys()) {
    if (c >= SAUCE_CODE_OFFSET && c > max) max = c
  }
  return max + 1
}

/** 이미 같은 itemCode가 맵에 있으면 기존 code, 없으면 추가 후 code (원가 계산기·매장용 배합 다이얼로그용) */
export function registerRuntimeSauceIfAbsent(entry: {
  itemCode: string
  name: string
  bahtPerUnit: number
  usageKind: 'for_sale' | 'store_use'
}): number {
  const ic = String(entry.itemCode ?? '').trim()
  if (!ic) {
    const code = nextFreeSauceNumericCode()
    runtimeSauceMap.set(code, {
      name: String(entry.name ?? ''),
      bahtPerUnit: Number(entry.bahtPerUnit) || 0,
      itemCode: String(code),
      usageKind: entry.usageKind,
    })
    return code
  }
  for (const key of itemCodeLookupKeys(ic)) {
    for (const [c, v] of runtimeSauceMap) {
      if (v.itemCode === key) {
        const nextName =
          entry.name && entry.name !== ic && (v.name === key || v.name === ic || !String(v.name ?? "").trim())
            ? entry.name
            : v.name
        const nextBaht =
          Number(entry.bahtPerUnit) > 0 && v.bahtPerUnit <= 0 ? Number(entry.bahtPerUnit) : v.bahtPerUnit
        if (nextName !== v.name || nextBaht !== v.bahtPerUnit) {
          runtimeSauceMap.set(c, { ...v, name: nextName, bahtPerUnit: nextBaht })
        }
        return c
      }
    }
  }
  const code = nextFreeSauceNumericCode()
  runtimeSauceMap.set(code, {
    name: String(entry.name ?? ic),
    bahtPerUnit: Number(entry.bahtPerUnit) || 0,
    itemCode: ic,
    usageKind: entry.usageKind,
  })
  return code
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

export function getRuntimeSauces(): Array<{
  code: number
  name: string
  bahtPerUnit: number
  category: "food"
  usageKind?: 'for_sale' | 'store_use'
}> {
  return Array.from(runtimeSauceMap.entries()).map(([code, v]) => ({
    code,
    name: v.name,
    bahtPerUnit: v.bahtPerUnit,
    category: "food" as const,
    usageKind: v.usageKind,
  }))
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

function itemCodeLookupKeys(raw: string): string[] {
  const t = String(raw ?? "").trim()
  if (!t) return []
  const asciiDigits = t.replace(/[\uFF10-\uFF19]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 48)
  )
  const variants = new Set<string>([t, asciiDigits, t.toUpperCase(), t.toLowerCase(), asciiDigits.toUpperCase(), asciiDigits.toLowerCase()])
  return [...variants].filter(Boolean)
}

/** item_code(string) → ingredientCode(number). API/소스 로드 후 사용 */
export function getIngredientCodeByItemCode(itemCode: string): number | undefined {
  const keys = itemCodeLookupKeys(itemCode)
  if (!keys.length) return undefined
  for (const key of keys) {
    for (const [c, v] of runtimeApiItemsMap) {
      if (v.itemCode === key) return c
    }
    for (const [c, v] of runtimeSauceMap) {
      if (v.itemCode === key) return c
    }
  }
  const codeLower = keys[0]!.toLowerCase()
  for (const [c, v] of runtimeApiItemsMap) {
    if (String(v.name ?? "").trim().toLowerCase() === codeLower) return c
  }
  for (const [c, v] of runtimeSauceMap) {
    if (String(v.name ?? "").trim().toLowerCase() === codeLower) return c
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

/** 동일 unit+용량이 품목 데이터에 중복돼 있으면 Select key 충돌·중복 옵션 방지 */
function dedupeStandardUnitRows(arr: { unit: string; totalQuantity: number }[]): { unit: string; totalQuantity: number }[] {
  const seen = new Set<string>()
  const out: { unit: string; totalQuantity: number }[] = []
  for (const o of arr) {
    const u = String(o.unit ?? "").trim()
    const tq = Number(o.totalQuantity)
    if (!u || !Number.isFinite(tq) || tq <= 0) continue
    const k = `${u.toLowerCase()}::${tq}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ unit: u, totalQuantity: tq })
  }
  return out
}

/** API 품목의 표준 단위 목록 (원가 계산기 수량 입력용). food는 항상 g 포함 (품목 관리 1g당 원가 기준). */
export function getIngredientStandardUnits(code: number): { unit: string; totalQuantity: number }[] | undefined {
  const apiItem = runtimeApiItemsMap.get(code)
  const units = apiItem?.standardUnits
  if (!apiItem) return undefined
  let raw: { unit: string; totalQuantity: number }[]
  if (apiItem.category === "food") {
    const hasG = units?.some((u) => String(u.unit || "").toLowerCase().trim() === "g")
    if (!hasG) {
      const tq = apiItem.bahtPerUnit > 0 && apiItem.price != null && apiItem.price >= 0
        ? Math.max(1, Math.round(apiItem.price / apiItem.bahtPerUnit))
        : 1
      raw = [{ unit: "g", totalQuantity: tq }, ...(units ?? [])]
    } else {
      raw = [...(units ?? [])]
    }
  } else {
    raw = [...(units ?? [])]
    const hasEa = raw.some((u) => /^ea$/i.test(String(u.unit || "").trim()))
    if (!hasEa) {
      const tq =
        apiItem.itemTotalQuantity != null && apiItem.itemTotalQuantity > 0
          ? apiItem.itemTotalQuantity
          : 1
      raw = [{ unit: "ea", totalQuantity: tq }, ...raw]
    }
    if (!raw.length) {
      raw = [{ unit: "ea", totalQuantity: 1 }]
    }
  }
  const d = dedupeStandardUnitRows(raw)
  return d.length ? d : undefined
}

/** 표준단위 드롭다운 기본값. packaging은 ea, food는 g 우선 */
export function pickDefaultStandardUnitKey(code: number): string {
  const units = getIngredientStandardUnits(code)
  if (!units?.length) return "spec"
  const apiItem = runtimeApiItemsMap.get(code)
  if (apiItem?.category === "packaging") {
    const ea = units.find((u) => /^ea$/i.test(String(u.unit || "").trim()))
    if (ea) return `${ea.unit}::${ea.totalQuantity}`
  }
  if (apiItem?.category === "food") {
    const g = units.find((u) => String(u.unit || "").toLowerCase().trim() === "g")
    if (g) return `${g.unit}::${g.totalQuantity}`
  }
  const first = units[0]
  return `${first.unit}::${first.totalQuantity}`
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
  const apiItem = runtimeApiItemsMap.get(code)
  const ingredientType = apiItem?.category === "packaging" ? "packaging" : "food"
  return getStoreQuantityFactor(unitKey, ingredientType, {
    unit: apiItem?.itemUnit,
    totalQuantity: apiItem?.itemTotalQuantity,
    category: apiItem?.categoryRaw,
  })
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
  const saved = item.savedLineCost
  if (saved != null && Number.isFinite(saved)) {
    return Math.round(saved * 10) / 10
  }
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
