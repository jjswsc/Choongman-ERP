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
      const qty = Math.max(0, resolveItemsJsonLineQty(row))
      if (qty <= 0) continue
      const menuId = resolveLineMenuId(row)
      if (!menuId) {
        unmatchedLineQty += qty
        continue
      }
      const optionId = resolveLineOptionId(row)
      const keyWithOpt = `${menuId}|${optionId}`
      const keyBase = `${menuId}|`
      const entry = params.costIndex.get(keyWithOpt) ?? params.costIndex.get(keyBase)
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
