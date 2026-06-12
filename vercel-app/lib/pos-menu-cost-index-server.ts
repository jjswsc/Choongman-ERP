/**
 * POS 완료 주문 × 메뉴 BOM 이론 원가 집계용 경량 lookup.
 * 원가 분석 API 전체 옵션·프로모 합성은 생략하고 menuId(+optionId) 기준 기본 BOM을 사용한다.
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
  const digitsOnly = asciiDigits.replace(/\s/g, '')
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

function costKey(menuId: number, optionId: number | null | undefined): string {
  const opt =
    optionId != null && Number.isFinite(Number(optionId)) && Number(optionId) > 0
      ? String(Number(optionId))
      : ''
  return `${Number(menuId)}|${opt}`
}

function computeIngredientLineCost(ing: IngRow, itemLookup: Record<string, ItemRow>): {
  food: number
  packaging: number
} {
  const code = String(ing.item_code ?? '').trim()
  if (!code) return { food: 0, packaging: 0 }
  const item = resolveItem(code, itemLookup)
  const itype = (ing.ingredient_type ?? 'food') === 'packaging' ? 'packaging' : 'food'
  const costPerUnit = item ? getItemCostPerUnit(item, itype === 'packaging') : 0
  const qty = Number(ing.quantity) ?? 1
  const lossRate = Number(ing.loss_rate) ?? 0
  const costTotal = costPerUnit * qty * (1 + lossRate / 100)
  if (itype === 'packaging') return { food: 0, packaging: costTotal }
  return { food: costTotal, packaging: 0 }
}

/** menuId|optionId → 홀/배달·음식/포장 단위 원가 (미즈 3% 미포함 — 호출측에서 가산) */
export async function buildPosMenuCostIndex(): Promise<Map<string, PosMenuCostIndexEntry>> {
  const [ingRows, itemRows] = await Promise.all([
    supabaseSelectAllPages('pos_menu_ingredients', {
      order: 'menu_id.asc,id.asc',
      select: 'menu_id,option_id,item_code,quantity,loss_rate,ingredient_type',
    }).catch(() => []) as Promise<IngRow[]>,
    supabaseSelectAllPages('items', {
      order: 'code.asc',
      select: 'id,code,cost,price,total_quantity,unit,purchase_source,category',
    }) as Promise<ItemRow[]>,
  ])

  const itemMap: Record<string, ItemRow> = {}
  for (const r of itemRows || []) {
    const k = effectiveItemCodeKey(r)
    if (k) itemMap[k] = r
  }
  const itemLookup = buildItemLookup(itemMap)

  const byKey = new Map<string, { food: number; packaging: number }>()
  for (const ing of ingRows || []) {
    const mid = Number(ing.menu_id ?? 0)
    if (!Number.isFinite(mid) || mid <= 0) continue
    const oid = ing.option_id != null ? Number(ing.option_id) : null
    const key = costKey(mid, oid)
    const line = computeIngredientLineCost(ing, itemLookup)
    const prev = byKey.get(key) ?? { food: 0, packaging: 0 }
    prev.food += line.food
    prev.packaging += line.packaging
    byKey.set(key, prev)
  }

  const out = new Map<string, PosMenuCostIndexEntry>()
  for (const [key, v] of byKey) {
    const food = Math.round(v.food * 10) / 10
    const packaging = Math.round(v.packaging * 10) / 10
    out.set(key, {
      foodCost: food,
      packagingCost: packaging,
      costHall: food,
      costDelivery: Math.round((food + packaging) * 10) / 10,
    })
  }
  return out
}
