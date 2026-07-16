/**
 * POS 메뉴 원가 API 공통 — 품목·배합 코드 lookup (getPosMenuCostAnalysis / getMenuCost 동일 규칙)
 */
import { supabaseSelectAllPages, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { getItemCostPerUnit } from '@/lib/item-cost-util'
import {
  buildInventoryTenantFilter,
  isInventoryTenantQueryBlocked,
  type InventoryTenantScope,
} from '@/lib/inventory-tenant-scope'

export type PosCostItemRow = {
  id?: number
  code?: string
  name?: string
  cost?: number
  price?: number
  total_quantity?: number
  unit?: string
  purchase_source?: string
  category?: string
}

export type PosCostItemMapEntry = {
  name: string
  cost: number
  unit: string
  purchaseSource: 'hq' | 'store'
  raw: PosCostItemRow
}

/** 품목 관리 getItems와 동일: code 없으면 매장 전용 등만 `_local_${id}` 키로 노출 */
export function effectiveItemCodeKey(r: PosCostItemRow): string {
  const raw = String(r.code ?? '').trim()
  if (raw) return raw
  const isStore =
    (r.purchase_source ?? 'hq') === 'store' || String(r.category ?? '').trim() === '매장 전용'
  if (isStore && r.id != null) return `_local_${r.id}`
  return ''
}

export function itemCodeLookupVariants(raw: string): string[] {
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
  if (/^[0-9]+$/.test(digitsOnly)) {
    variants.add(String(Number(digitsOnly)))
  }
  return [...variants].filter(Boolean)
}

export function buildPosCostItemLookup(map: Record<string, PosCostItemMapEntry>): Record<string, PosCostItemMapEntry> {
  const lookup: Record<string, PosCostItemMapEntry> = { ...map }
  for (const k of Object.keys(map)) {
    const entry = map[k]
    for (const v of itemCodeLookupVariants(k)) {
      if (v && lookup[v] === undefined) lookup[v] = entry
    }
  }
  return lookup
}

export function resolvePosCostItemInfo(
  rawCode: string,
  lookup: Record<string, PosCostItemMapEntry>
): PosCostItemMapEntry | undefined {
  for (const v of itemCodeLookupVariants(rawCode)) {
    const hit = lookup[v]
    if (hit) return hit
  }
  return undefined
}

type SauceRow = {
  id?: number
  code?: string
  name?: string
  cost_per_unit?: number
  unit?: string
  overhead_percent?: number
}

type SauceIngRow = {
  sauce_id?: number
  item_code?: string
  quantity?: number
  loss_rate?: number
}

/** items + sauces(배합) → BOM item_code 해석용 lookup */
export async function loadPosCostItemLookup(
  scope: InventoryTenantScope = { enforce: false, tenantId: '' }
): Promise<Record<string, PosCostItemMapEntry>> {
  const itemFilter = buildInventoryTenantFilter(scope)
  const itemRows = isInventoryTenantQueryBlocked(scope)
    ? []
    : ((itemFilter
        ? await supabaseSelectFilterAllPages('items', itemFilter, {
            order: 'code.asc',
            select: 'id,code,name,cost,price,total_quantity,unit,purchase_source,category',
          })
        : await supabaseSelectAllPages('items', {
            order: 'code.asc',
            select: 'id,code,name,cost,price,total_quantity,unit,purchase_source,category',
          })) as PosCostItemRow[])

  const sauceRows = scope.enforce
    ? []
    : (((await supabaseSelectAllPages('sauces', {
        order: 'id.asc',
        select: 'id,code,name,cost_per_unit,unit,overhead_percent',
      }).catch(() => [])) as SauceRow[]) || [])

  const sauceIngRows = scope.enforce
    ? []
    : (((await supabaseSelectAllPages('sauce_ingredients', {
        order: 'sauce_id.asc',
        select: 'sauce_id,item_code,quantity,loss_rate',
      }).catch(() => [])) as SauceIngRow[]) || [])

  const itemMap: Record<string, PosCostItemMapEntry> = {}
  for (const r of itemRows || []) {
    const code = effectiveItemCodeKey(r)
    if (!code) continue
    const isPkg = /포장|packaging|박스|용기|봉지/.test(String(r.category ?? ''))
    itemMap[code] = {
      name: String(r.name ?? ''),
      cost: getItemCostPerUnit(r, isPkg),
      unit: String(r.unit ?? 'g'),
      purchaseSource: (r.purchase_source ?? 'hq') === 'store' ? 'store' : 'hq',
      raw: r,
    }
  }

  const sauceCostComputed: Record<string, number> = {}
  const sauceByCode: Record<string, SauceRow> = {}
  for (const s of sauceRows || []) {
    const c = String(s.code ?? '').trim()
    if (c) sauceByCode[c] = s
  }
  const ingBySauce: Record<number, SauceIngRow[]> = {}
  for (const si of sauceIngRows || []) {
    const sid = Number(si.sauce_id ?? 0)
    if (!ingBySauce[sid]) ingBySauce[sid] = []
    ingBySauce[sid].push(si)
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
        const itemInfo = resolvePosCostItemInfo(icode, buildPosCostItemLookup(itemMap))
        let subCost: number | undefined
        if (itemInfo) subCost = itemInfo.cost
        else if (sauceByCode[icode]) {
          subCost = (sauceCostComputed[icode] ?? Number(sauceByCode[icode].cost_per_unit ?? 0)) || undefined
        }
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
  for (const s of sauceRows || []) {
    const code = String(s.code ?? '').trim()
    if (code && !itemMap[code]) {
      const cost =
        Number(s.cost_per_unit ?? 0) > 0 ? Number(s.cost_per_unit ?? 0) : (sauceCostComputed[code] ?? 0)
      itemMap[code] = {
        name: String(s.name ?? ''),
        cost,
        unit: String(s.unit ?? 'g'),
        purchaseSource: 'hq',
        raw: { code, name: s.name, cost },
      }
    }
    const name = String(s.name ?? '').trim()
    if (name && !itemMap[name] && code) {
      const cost =
        Number(s.cost_per_unit ?? 0) > 0 ? Number(s.cost_per_unit ?? 0) : (sauceCostComputed[code] ?? 0)
      itemMap[name] = {
        name: String(s.name ?? ''),
        cost,
        unit: String(s.unit ?? 'g'),
        purchaseSource: 'hq',
        raw: { code, name: s.name, cost },
      }
    }
  }

  return buildPosCostItemLookup(itemMap)
}

export function posCostLineCostPerUnit(
  info: PosCostItemMapEntry | undefined,
  isPackaging: boolean
): number {
  if (!info?.raw) return info?.cost ?? 0
  return getItemCostPerUnit(info.raw, isPackaging)
}
