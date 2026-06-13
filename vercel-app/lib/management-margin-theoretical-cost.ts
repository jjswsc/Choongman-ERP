import { resolveItemsJsonLineQty } from '@/lib/pos-order-item-map'
import type { PosMenuCostIndexEntry } from '@/lib/pos-menu-cost-index-server'

export const MANAGEMENT_MARGIN_MISE_RATE = 3

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function parseOrderItems(itemsJson: string | undefined): Record<string, unknown>[] {
  if (!itemsJson) return []
  try {
    const parsed = JSON.parse(itemsJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function isLineCancelled(row: Record<string, unknown>): boolean {
  return Boolean(str(row.cancelledAt ?? row.cancelled_at))
}

function resolveLineMenuId(row: Record<string, unknown>): string {
  return str(row.menuId1 ?? row.menu_id1 ?? row.menuId ?? row.menu_id)
}

function resolveLineOptionId(row: Record<string, unknown>): string {
  return str(row.optionId1 ?? row.option_id1 ?? row.optionId ?? row.option_id)
}

export function isDeliveryChannelOrderType(orderType: string | undefined): boolean {
  const t = str(orderType).toLowerCase()
  if (!t) return false
  return (
    t.includes('delivery') ||
    t.includes('grab') ||
    t.includes('lineman') ||
    t.includes('foodpanda') ||
    t.includes('shopee') ||
    t.includes('app') ||
    t === 'takeaway' ||
    t === 'take_out' ||
    t === 'takeout' ||
    t.includes('포장') ||
    t.includes('배달')
  )
}

export type TheoreticalCostAgg = {
  foodCost: number
  packagingCost: number
  totalCost: number
  matchedLineQty: number
  unmatchedLineQty: number
}

export type BomUnmatchedReason = 'missing_menu_id' | 'missing_bom'

export type TheoreticalCostUnmatchedLine = {
  menuId: string
  optionId: string
  menuLabel: string
  optionLabel: string
  reason: BomUnmatchedReason
  lineQty: number
}

function resolveLineMenuName(row: Record<string, unknown>): string {
  return str(row.menuName ?? row.menu_name ?? row.name)
}

function resolveLineOptionName(row: Record<string, unknown>): string {
  return str(row.optionName ?? row.option_name)
}

function unmatchedBucketKey(reason: BomUnmatchedReason, menuId: string, optionId: string): string {
  return `${reason}|${menuId}|${optionId}`
}

function formatMenuLabel(menuId: string, menuName: string): string {
  if (menuName) return menuName
  if (menuId) return `#${menuId}`
  return '—'
}

function formatOptionLabel(optionId: string, optionName: string): string {
  if (optionName) return optionName
  if (optionId) return `#${optionId}`
  return '—'
}

function resolveLineMenuId2(row: Record<string, unknown>): string {
  return str(row.menuId2 ?? row.menu_id2)
}

function resolveLineOptionId2(row: Record<string, unknown>): string {
  return str(row.optionId2 ?? row.option_id2)
}

export type TheoreticalCostLookupLine = {
  menuId: string
  optionId: string
  menuName: string
  optionName: string
  qty: number
}

function promoChildCostLines(row: Record<string, unknown>, parentQty: number): TheoreticalCostLookupLine[] {
  const raw = row.promoItems ?? row.promo_items
  if (!Array.isArray(raw) || raw.length === 0) return []
  const out: TheoreticalCostLookupLine[] = []
  for (const child of raw) {
    const c = child as Record<string, unknown>
    const childQty = Math.max(0, resolveItemsJsonLineQty(c))
    if (childQty <= 0) continue
    const qty = parentQty * childQty
    if (qty <= 0) continue
    out.push({
      menuId: str(c.menuId ?? c.menu_id),
      optionId: str(c.optionId ?? c.option_id),
      menuName: str(c.menuName ?? c.menu_name),
      optionName: str(c.optionName ?? c.option_name),
      qty,
    })
  }
  return out
}

/** 주문 줄 → BOM lookup 단위(세트 promoItems·반반 menuId2 펼침) */
export function expandOrderLineToCostLines(row: Record<string, unknown>): TheoreticalCostLookupLine[] {
  const parentQty = Math.max(0, resolveItemsJsonLineQty(row))
  if (parentQty <= 0) return []

  const promoChildren = promoChildCostLines(row, parentQty)
  if (promoChildren.length > 0) return promoChildren

  const menuId = resolveLineMenuId(row)
  const menuId2 = resolveLineMenuId2(row)
  const menuName = resolveLineMenuName(row)
  const optionName = resolveLineOptionName(row)

  if (menuId && menuId2) {
    const halfQty = parentQty * 0.5
    return [
      {
        menuId,
        optionId: resolveLineOptionId(row),
        menuName,
        optionName,
        qty: halfQty,
      },
      {
        menuId: menuId2,
        optionId: resolveLineOptionId2(row),
        menuName,
        optionName,
        qty: halfQty,
      },
    ]
  }

  return [
    {
      menuId,
      optionId: resolveLineOptionId(row),
      menuName,
      optionName,
      qty: parentQty,
    },
  ]
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

export function collectTheoreticalCostUnmatchedLines(params: {
  orderRows: { order_type?: string; items_json?: string }[]
  costIndex: Map<string, PosMenuCostIndexEntry>
}): TheoreticalCostUnmatchedLine[] {
  const bucket = new Map<string, TheoreticalCostUnmatchedLine>()

  const upsert = (key: string, row: TheoreticalCostUnmatchedLine, menuName: string, optionName: string) => {
    const prev = bucket.get(key)
    if (prev) {
      prev.lineQty += row.lineQty
      if (!prev.menuLabel || prev.menuLabel.startsWith('#')) {
        prev.menuLabel = formatMenuLabel(prev.menuId, menuName || prev.menuLabel)
      }
      if (!prev.optionLabel || prev.optionLabel.startsWith('#')) {
        prev.optionLabel = formatOptionLabel(prev.optionId, optionName || prev.optionLabel)
      }
      return
    }
    bucket.set(key, { ...row })
  }

  for (const order of params.orderRows) {
    for (const row of parseOrderItems(order.items_json)) {
      if (isLineCancelled(row)) continue
      for (const line of expandOrderLineToCostLines(row)) {
        const { menuId, optionId, menuName, optionName, qty } = line
        if (qty <= 0) continue
        if (!menuId) {
          const labelKey = menuName || '—'
          const key = unmatchedBucketKey('missing_menu_id', labelKey, optionId)
          upsert(
            key,
            {
              menuId: '',
              optionId,
              menuLabel: formatMenuLabel('', menuName),
              optionLabel: formatOptionLabel(optionId, optionName),
              reason: 'missing_menu_id',
              lineQty: qty,
            },
            menuName,
            optionName
          )
          continue
        }
        if (!lookupCostEntry(params.costIndex, menuId, optionId)) {
          const key = unmatchedBucketKey('missing_bom', menuId, optionId)
          upsert(
            key,
            {
              menuId,
              optionId,
              menuLabel: formatMenuLabel(menuId, menuName),
              optionLabel: formatOptionLabel(optionId, optionName),
              reason: 'missing_bom',
              lineQty: qty,
            },
            menuName,
            optionName
          )
        }
      }
    }
  }

  return [...bucket.values()].sort((a, b) => b.lineQty - a.lineQty || a.menuLabel.localeCompare(b.menuLabel))
}

export function aggregateTheoreticalCostFromOrders(params: {
  orderRows: { order_type?: string; items_json?: string }[]
  costIndex: Map<string, PosMenuCostIndexEntry>
  miseRatePercent?: number
}): TheoreticalCostAgg {
  const miseMult = 1 + (params.miseRatePercent ?? MANAGEMENT_MARGIN_MISE_RATE) / 100
  let foodCost = 0
  let packagingCost = 0
  let matchedLineQty = 0
  let unmatchedLineQty = 0

  for (const order of params.orderRows) {
    const isDelivery = isDeliveryChannelOrderType(order.order_type)
    for (const row of parseOrderItems(order.items_json)) {
      if (isLineCancelled(row)) continue
      for (const line of expandOrderLineToCostLines(row)) {
        const { menuId, optionId, qty } = line
        if (qty <= 0) continue
        if (!menuId) {
          unmatchedLineQty += qty
          continue
        }
        const entry = lookupCostEntry(params.costIndex, menuId, optionId)
        if (!entry) {
          unmatchedLineQty += qty
          continue
        }
        matchedLineQty += qty
        const unitFood = entry.foodCost * miseMult
        const unitPack = entry.packagingCost * miseMult
        foodCost += unitFood * qty
        if (isDelivery) packagingCost += unitPack * qty
      }
    }
  }

  foodCost = round2(foodCost)
  packagingCost = round2(packagingCost)
  return {
    foodCost,
    packagingCost,
    totalCost: round2(foodCost + packagingCost),
    matchedLineQty,
    unmatchedLineQty,
  }
}
