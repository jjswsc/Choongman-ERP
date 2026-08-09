/**
 * POS 완료 주문 × 메뉴 BOM 이론 원가 집계용 lookup.
 * 목록/getMenuCost와 동일: 대체형은 옵션 BOM(없으면 기본), 가산형은 기본+소스/품목(+옵션 전용 BOM).
 */
import { supabaseSelectAllPages } from '@/lib/supabase-server'
import { getItemCostPerUnit } from '@/lib/item-cost-util'

export type PosMenuCostIndexEntry = {
  costHall: number
  costDelivery: number
  foodCost: number
  packagingCost: number
}

type IngRow = {
  menu_id?: number
  option_id?: number | null
  item_code?: string
  quantity?: number
  loss_rate?: number
  ingredient_type?: string
}

type ItemRow = {
  id?: number
  code?: string
  cost?: number
  price?: number
  total_quantity?: number | null
  unit?: string
  purchase_source?: string
  category?: string
}

type OptRow = {
  id?: number
  menu_id?: number
  option_type?: string
  item_code?: string | null
  additive_source_menu_id?: number | null
  quantity?: number
}

type CostParts = { food: number; packaging: number }

function effectiveItemCodeKey(r: ItemRow): string {
  const raw = String(r.code ?? '').trim()
  if (raw) return raw
  const isStore =
    (r.purchase_source ?? 'hq') === 'store' || String(r.category ?? '').trim() === '매장 전용'
  if (isStore && r.id != null) return `_local_${r.id}`
  return ''
}

function itemCodeLookupVariants(raw: string): string[] {
  const t = String(raw ?? '').trim()
  if (!t) return []
  const asciiDigits = t.replace(/[\uFF10-\uFF19]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 48)
  )
  const variants = new Set<string>([t, asciiDigits])
  for (const x of [t, asciiDigits]) {
    variants.add(x.toUpperCase())
    variants.add(x.toLowerCase())
  }
  const digitsOnly = asciiDigits.replace(/\s+/g, '')
  if (/^[0-9]+$/.test(digitsOnly)) variants.add(String(Number(digitsOnly)))
  return [...variants].filter(Boolean)
}

function buildItemLookup(map: Record<string, ItemRow>): Record<string, ItemRow> {
  const lookup: Record<string, ItemRow> = { ...map }
  for (const k of Object.keys(map)) {
    for (const v of itemCodeLookupVariants(k)) {
      if (v && lookup[v] === undefined) lookup[v] = map[k]
    }
  }
  return lookup
}

function resolveItem(rawCode: string, lookup: Record<string, ItemRow>): ItemRow | undefined {
  for (const v of itemCodeLookupVariants(rawCode)) {
    const hit = lookup[v]
    if (hit) return hit
  }
  return undefined
}

export function costIndexKey(menuId: number, optionId: number | null | undefined): string {
  const opt =
    optionId != null && Number.isFinite(Number(optionId)) && Number(optionId) > 0
      ? String(Number(optionId))
      : ''
  return `${Number(menuId)}|${opt}`
}

function emptyParts(): CostParts {
  return { food: 0, packaging: 0 }
}

function addParts(a: CostParts, b: CostParts, mult = 1): CostParts {
  return {
    food: a.food + b.food * mult,
    packaging: a.packaging + b.packaging * mult,
  }
}

function computeIngredientLineCost(ing: IngRow, itemLookup: Record<string, ItemRow>): CostParts {
  const code = String(ing.item_code ?? '').trim()
  if (!code) return emptyParts()
  const item = resolveItem(code, itemLookup)
  const itype = (ing.ingredient_type ?? 'food') === 'packaging' ? 'packaging' : 'food'
  const costPerUnit = item ? getItemCostPerUnit(item, itype === 'packaging') : 0
  const qty = Number(ing.quantity) ?? 1
  const lossRate = Number(ing.loss_rate) ?? 0
  const costTotal = costPerUnit * qty * (1 + lossRate / 100)
  if (itype === 'packaging') return { food: 0, packaging: costTotal }
  return { food: costTotal, packaging: 0 }
}

function toEntry(parts: CostParts): PosMenuCostIndexEntry {
  const food = Math.round(parts.food * 10) / 10
  const packaging = Math.round(parts.packaging * 10) / 10
  return {
    foodCost: food,
    packagingCost: packaging,
    costHall: food,
    costDelivery: Math.round((food + packaging) * 10) / 10,
  }
}

/**
 * 재료 합계 맵 + 옵션 메타로 menuId|optionId 단위 원가 합성.
 * (테스트·실적 인덱스 공통)
 */
export function assemblePosMenuCostIndexEntries(params: {
  /** menuId|optionId → 해당 키 재료만 합산(가산/대체 합성 전) */
  ingredientPartsByKey: Map<string, CostParts>
  options: {
    id: number
    menuId: number
    optionType: string
    itemCode: string | null
    additiveSourceMenuId: number | null
    quantity: number
  }[]
  /** item_code 가산용 — 코드 → 단위 원가(식재) */
  itemFoodCostByCode?: Record<string, number>
}): Map<string, PosMenuCostIndexEntry> {
  const partsByKey = params.ingredientPartsByKey
  const getParts = (menuId: number, optionId: number | null): CostParts =>
    partsByKey.get(costIndexKey(menuId, optionId)) ?? emptyParts()

  const out = new Map<string, PosMenuCostIndexEntry>()

  const menuIds = new Set<number>()
  for (const key of partsByKey.keys()) {
    const mid = Number(key.split('|')[0] ?? 0)
    if (Number.isFinite(mid) && mid > 0) menuIds.add(mid)
  }
  for (const opt of params.options) {
    if (opt.menuId > 0) menuIds.add(opt.menuId)
  }

  for (const mid of menuIds) {
    const base = getParts(mid, null)
    out.set(costIndexKey(mid, null), toEntry(base))
  }

  const resolveAdditiveSourceParts = (srcMenuId: number): CostParts => {
    const nullParts = getParts(srcMenuId, null)
    if (nullParts.food > 0 || nullParts.packaging > 0) return nullParts
    const fromOut = out.get(costIndexKey(srcMenuId, null))
    if (fromOut && (fromOut.foodCost > 0 || fromOut.packagingCost > 0)) {
      return { food: fromOut.foodCost, packaging: fromOut.packagingCost }
    }
    // null BOM 없고 옵션 전용 원가만 1건이면 그 값을 소스 폴백(목록 srcBaseRow 의도와 유사)
    let found: CostParts | null = null
    let hits = 0
    for (const [key, parts] of partsByKey) {
      const [midStr, optStr] = key.split('|')
      if (Number(midStr) !== srcMenuId) continue
      if (!optStr) continue
      if (parts.food > 0 || parts.packaging > 0) {
        found = parts
        hits++
      }
    }
    if (hits === 1 && found) return found
    return emptyParts()
  }

  for (const opt of params.options) {
    const mid = opt.menuId
    const oid = opt.id
    if (!(mid > 0) || !(oid > 0)) continue
    const base = getParts(mid, null)
    const optOwn = getParts(mid, oid)
    const isAdditive = (opt.optionType || 'substitution') === 'additive'

    if (!isAdditive) {
      // 옵션 전용 BOM이 없으면 키를 넣지 않음 → lookup 시 baseFallback=true
      if (optOwn.food > 0 || optOwn.packaging > 0) {
        out.set(costIndexKey(mid, oid), toEntry(optOwn))
      }
      continue
    }

    let merged = addParts(emptyParts(), base)
    const qty = Number(opt.quantity) > 0 ? Number(opt.quantity) : 1
    if (opt.additiveSourceMenuId && opt.additiveSourceMenuId > 0) {
      merged = addParts(merged, resolveAdditiveSourceParts(opt.additiveSourceMenuId), qty)
    } else if (opt.itemCode) {
      const unit = params.itemFoodCostByCode?.[opt.itemCode] ?? 0
      merged = {
        food: merged.food + unit * qty,
        packaging: merged.packaging,
      }
    }
    merged = addParts(merged, optOwn)
    out.set(costIndexKey(mid, oid), toEntry(merged))
  }

  return out
}

/** menuId|optionId → 홀/배달·음식/포장 단위 원가 (재료별 loss_rate + 가산형 합성 포함)
 * 원가분석 목록과 동일: items + sauces(소스 레시피) 단가를 반영한 뒤 × 판매수량에 씀.
 */
export async function buildPosMenuCostIndex(): Promise<Map<string, PosMenuCostIndexEntry>> {
  const [ingRows, itemRows, optRows, sauceRows, sauceIngRows] = await Promise.all([
    supabaseSelectAllPages('pos_menu_ingredients', {
      order: 'menu_id.asc,id.asc',
      select: 'menu_id,option_id,item_code,quantity,loss_rate,ingredient_type',
    }).catch(() => []) as Promise<IngRow[]>,
    supabaseSelectAllPages('items', {
      order: 'code.asc',
      select: 'id,code,cost,price,total_quantity,unit,purchase_source,category',
    }) as Promise<ItemRow[]>,
    supabaseSelectAllPages('pos_menu_options', {
      order: 'id.asc',
      select: 'id,menu_id,option_type,item_code,additive_source_menu_id,quantity',
    }).catch(() => []) as Promise<OptRow[]>,
    supabaseSelectAllPages('sauces', {
      order: 'id.asc',
      select: 'id,code,name,cost_per_unit,unit,overhead_percent',
    }).catch(() => []) as Promise<
      {
        id?: number
        code?: string
        name?: string
        cost_per_unit?: number
        unit?: string
        overhead_percent?: number
      }[]
    >,
    supabaseSelectAllPages('sauce_ingredients', {
      order: 'sauce_id.asc',
      select: 'sauce_id,item_code,quantity,loss_rate',
    }).catch(() => []) as Promise<
      { sauce_id?: number; item_code?: string; quantity?: number; loss_rate?: number }[]
    >,
  ])

  const itemMap: Record<string, ItemRow> = {}
  for (const r of itemRows || []) {
    const k = effectiveItemCodeKey(r)
    if (k) itemMap[k] = r
  }
  let itemLookup = buildItemLookup(itemMap)

  // 원가분석 목록과 동일: 소스(sauce) 단가 계산 후 itemLookup에 주입 (S025·S026 등)
  const sauceCostComputed: Record<string, number> = {}
  const sauceByCode: Record<
    string,
    { id?: number; cost_per_unit?: number; overhead_percent?: number }
  > = {}
  for (const s of sauceRows || []) {
    const c = String(s.code ?? '').trim()
    if (c) sauceByCode[c] = s
  }
  const ingBySauce: Record<number, { item_code?: string; quantity?: number; loss_rate?: number }[]> =
    {}
  for (const si of sauceIngRows || []) {
    const sid = Number(si.sauce_id ?? 0)
    if (!ingBySauce[sid]) ingBySauce[sid] = []
    ingBySauce[sid].push(si)
  }
  const resolveSauceSubCost = (icode: string): number | undefined => {
    const item = resolveItem(icode, itemLookup)
    if (item) return getItemCostPerUnit(item, false)
    if (sauceByCode[icode]) {
      const n =
        sauceCostComputed[icode] ?? Number(sauceByCode[icode].cost_per_unit ?? 0)
      return n > 0 ? n : undefined
    }
    return undefined
  }
  for (let pass = 0; pass < 5; pass++) {
    let changed = false
    for (const s of sauceRows || []) {
      const code = String(s.code ?? '').trim()
      if (!code || Number(s.cost_per_unit ?? 0) > 0) continue
      const ings = ingBySauce[Number(s.id ?? 0)] || []
      let totalCost = 0
      let totalQty = 0
      let ok = true
      for (const ing of ings) {
        const icode = String(ing.item_code ?? '').trim()
        const qty = Number(ing.quantity ?? 1)
        const lossRate = Number(ing.loss_rate ?? 0)
        const subCost = resolveSauceSubCost(icode)
        if (subCost === undefined) {
          ok = false
          break
        }
        totalCost += subCost * qty * (1 + lossRate / 100)
        totalQty += qty
      }
      if (ok && totalQty > 0) {
        const oh = Number(s.overhead_percent ?? 5)
        const cost = (totalCost * (1 + oh / 100)) / totalQty
        if (Math.abs((sauceCostComputed[code] ?? 0) - cost) > 1e-9) {
          sauceCostComputed[code] = cost
          changed = true
        }
      }
    }
    if (!changed) break
  }
  for (const r of sauceRows || []) {
    const code = String(r.code ?? '').trim()
    if (!code || itemMap[code]) continue
    const unitCost =
      Number(r.cost_per_unit ?? 0) > 0
        ? Number(r.cost_per_unit ?? 0)
        : (sauceCostComputed[code] ?? 0)
    // getItemCostPerUnit: price/total_quantity — 이미 g당이면 total_quantity=1
    itemMap[code] = {
      code,
      cost: unitCost,
      price: unitCost,
      total_quantity: 1,
      unit: String(r.unit ?? 'g'),
      purchase_source: 'hq',
    }
  }
  itemLookup = buildItemLookup(itemMap)

  const ingredientPartsByKey = new Map<string, CostParts>()
  for (const ing of ingRows || []) {
    const mid = Number(ing.menu_id ?? 0)
    if (!Number.isFinite(mid) || mid <= 0) continue
    const oid = ing.option_id != null ? Number(ing.option_id) : null
    const key = costIndexKey(mid, oid != null && oid > 0 ? oid : null)
    const line = computeIngredientLineCost(ing, itemLookup)
    const prev = ingredientPartsByKey.get(key) ?? emptyParts()
    ingredientPartsByKey.set(key, addParts(prev, line))
  }

  const itemFoodCostByCode: Record<string, number> = {}
  for (const [code, item] of Object.entries(itemLookup)) {
    itemFoodCostByCode[code] = getItemCostPerUnit(item, false)
  }

  const options = (optRows || [])
    .map((o) => {
      const id = Number(o.id ?? 0)
      const menuId = Number(o.menu_id ?? 0)
      const aid = o.additive_source_menu_id
      return {
        id,
        menuId,
        optionType: String(o.option_type || 'substitution'),
        itemCode: o.item_code ? String(o.item_code).trim() : null,
        additiveSourceMenuId:
          aid != null && Number.isFinite(Number(aid)) && Number(aid) > 0 ? Number(aid) : null,
        quantity: Number(o.quantity) ?? 1,
      }
    })
    .filter((o) => o.id > 0 && o.menuId > 0)

  return assemblePosMenuCostIndexEntries({
    ingredientPartsByKey,
    options,
    itemFoodCostByCode,
  })
}
