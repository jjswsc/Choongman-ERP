import { resolveItemsJsonLineQty } from '@/lib/pos-order-item-map'
import type { PosMenuCostIndexEntry } from '@/lib/pos-menu-cost-index-server'
import {
  buildTheoreticalCostResolveContext,
  expandOrderLineToCostLines,
  isDeliveryChannelOrderType,
  type TheoreticalCostResolveContext,
} from '@/lib/management-margin-theoretical-cost'
import type { PromoPricingCatalog } from '@/lib/pos-order-promo-regular-price'
import type { PosMenuCatalogRow } from '@/lib/pos-sales-menu-hierarchy-aggregate'

const EMPTY_MAIN = '(대분류 없음)'

export type PosCostCategoryWeightedRow = {
  categoryMain: string
  netSales: number
  totalCost: number
  foodCost: number
  packagingCost: number
  costPctOfNet: number
  matchedQty: number
  unmatchedQty: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function pctOf(part: number, whole: number): number {
  if (whole <= 0.0001) return 0
  return round2((part / whole) * 100)
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function parseOrderItems(itemsJson: string | undefined): Record<string, unknown>[] {
  if (!itemsJson) return []
  try {
    const parsed = JSON.parse(itemsJson)
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : []
  } catch {
    return []
  }
}

function isLineCancelled(row: Record<string, unknown>): boolean {
  return Boolean(str(row.cancelledAt ?? row.cancelled_at))
}

function resolveLineSales(row: Record<string, unknown>, qty: number): number {
  const price = Number(row.price ?? 0) || 0
  const discount = Math.max(0, Number(row.lineDiscountAmt ?? row.line_discount_amt ?? 0) || 0)
  return Math.max(0, qty * price - discount)
}

function buildMenuCategoryById(menus: PosMenuCatalogRow[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of menus) {
    const id = str(m.id)
    if (!id) continue
    const cat =
      str(m.category_main) ||
      str(m.category) ||
      EMPTY_MAIN
    out.set(id, cat || EMPTY_MAIN)
  }
  return out
}

function lookupCostEntry(
  costIndex: Map<string, PosMenuCostIndexEntry>,
  menuId: string,
  optionId: string
): PosMenuCostIndexEntry | undefined {
  const keyWithOpt = `${menuId}|${optionId}`
  const keyBase = `${menuId}|`
  return costIndex.get(keyWithOpt) ?? costIndex.get(keyBase)
}

function resolveCategoryForMenu(
  menuId: string,
  row: Record<string, unknown>,
  categoryByMenuId: Map<string, string>
): string {
  const fromRow = str(row.category_main ?? row.categoryMain)
  if (fromRow) return fromRow
  if (menuId) {
    const hit = categoryByMenuId.get(menuId)
    if (hit) return hit
  }
  return EMPTY_MAIN
}

type Bucket = {
  netSales: number
  foodCost: number
  packagingCost: number
  matchedQty: number
  unmatchedQty: number
}

export function aggregatePosCostWeightedByCategory(params: {
  orderRows: { order_type?: string; items_json?: string }[]
  menus: PosMenuCatalogRow[]
  costIndex: Map<string, PosMenuCostIndexEntry>
  catalog?: Pick<PromoPricingCatalog, 'menus' | 'promoItemsByPromoId' | 'promoMetaById' | 'promoIdByMirrorMenuId'>
  miseRatePercent?: number
  resolveContext?: TheoreticalCostResolveContext
}): PosCostCategoryWeightedRow[] {
  const miseMult = 1 + (params.miseRatePercent ?? 3) / 100
  const categoryByMenuId = buildMenuCategoryById(params.menus)
  const resolveContext =
    params.resolveContext ??
    buildTheoreticalCostResolveContext({
      costIndex: params.costIndex,
      catalog: params.catalog,
    })

  const buckets = new Map<string, Bucket>()

  const upsert = (categoryMain: string): Bucket => {
    const key = categoryMain || EMPTY_MAIN
    const prev = buckets.get(key)
    if (prev) return prev
    const next: Bucket = {
      netSales: 0,
      foodCost: 0,
      packagingCost: 0,
      matchedQty: 0,
      unmatchedQty: 0,
    }
    buckets.set(key, next)
    return next
  }

  for (const order of params.orderRows) {
    const isDelivery = isDeliveryChannelOrderType(order.order_type)
    for (const row of parseOrderItems(order.items_json)) {
      if (isLineCancelled(row)) continue
      const parentQty = Math.max(0, resolveItemsJsonLineQty(row))
      if (parentQty <= 0) continue

      const parentSales = resolveLineSales(row, parentQty)
      const costLines = expandOrderLineToCostLines(row, resolveContext)
      if (costLines.length === 0) continue

      const totalCostQty = costLines.reduce((s, l) => s + Math.max(0, l.qty), 0)
      if (totalCostQty <= 0) continue

      for (const line of costLines) {
        const qty = Math.max(0, line.qty)
        if (qty <= 0) continue
        const categoryMain = resolveCategoryForMenu(line.menuId, row, categoryByMenuId)
        const bucket = upsert(categoryMain)
        const salesShare = (parentSales * qty) / totalCostQty
        bucket.netSales = round2(bucket.netSales + salesShare)

        if (!line.menuId) {
          bucket.unmatchedQty = round2(bucket.unmatchedQty + qty)
          continue
        }
        const entry = lookupCostEntry(params.costIndex, line.menuId, line.optionId)
        if (!entry) {
          bucket.unmatchedQty = round2(bucket.unmatchedQty + qty)
          continue
        }
        bucket.matchedQty = round2(bucket.matchedQty + qty)
        const unitFood = entry.foodCost * miseMult
        const unitPack = entry.packagingCost * miseMult
        bucket.foodCost = round2(bucket.foodCost + unitFood * qty)
        if (isDelivery) {
          bucket.packagingCost = round2(bucket.packagingCost + unitPack * qty)
        }
      }
    }
  }

  return Array.from(buckets.entries())
    .map(([categoryMain, b]) => {
      const totalCost = round2(b.foodCost + b.packagingCost)
      return {
        categoryMain,
        netSales: round2(b.netSales),
        totalCost,
        foodCost: b.foodCost,
        packagingCost: b.packagingCost,
        costPctOfNet: pctOf(totalCost, b.netSales),
        matchedQty: b.matchedQty,
        unmatchedQty: b.unmatchedQty,
      }
    })
    .filter((r) => r.netSales > 0 || r.totalCost > 0)
    .sort((a, b) => b.netSales - a.netSales || a.categoryMain.localeCompare(b.categoryMain, 'ko'))
}
