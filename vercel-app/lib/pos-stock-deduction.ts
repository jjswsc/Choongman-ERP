import { supabaseSelectFilter, supabaseInsertMany, supabaseInsert } from '@/lib/supabase-server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import {
  buildPosMenuBomIndexForMenus,
  collectCartMenuRefsForBom,
  explodeCartItemsToUsage,
  isCartLineCancelledForBom,
} from '@/lib/pos-menu-bom-explode'

/** POS 주문 완료 시 재고 차감 실행 */
export async function processPosStockDeduction(orderId: number): Promise<{ success: boolean; deductedCount: number }> {
  const orderRows = (await supabaseSelectFilter('pos_orders', `id=eq.${orderId}`, {
    limit: 1,
    select: 'store_code,items_json',
  })) as { store_code?: string; items_json?: string }[] | null

  if (!orderRows?.length) {
    return { success: false, deductedCount: 0 }
  }

  const order = orderRows[0]

  try {
    const ded = (await supabaseSelectFilter('pos_stock_deductions', `order_id=eq.${orderId}`, { limit: 1 })) as unknown[]
    if (ded?.length) {
      return { success: true, deductedCount: 0 }
    }
  } catch {
  }

  let items: {
    id?: string
    qty?: number
    promoId?: string
    promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
  }[] = []
  try {
    items = JSON.parse(order.items_json || '[]')
  } catch {
    return { success: false, deductedCount: 0 }
  }

  const storeCode = String(order.store_code ?? '').trim()
  if (!storeCode) {
    return { success: false, deductedCount: 0 }
  }

  const now = getBangkokDateTimeString()
  const activeItems = (Array.isArray(items) ? items : []).filter((it) => !isCartLineCancelledForBom(it))
  const { menuIds, optionIds } = collectCartMenuRefsForBom(activeItems)
  const bomIndex = await buildPosMenuBomIndexForMenus(menuIds, optionIds)
  const usageByItem = explodeCartItemsToUsage(bomIndex, activeItems)

  const rows = Object.entries(usageByItem)
    .filter(([, qty]) => qty > 0)
    .map(([itemCode, qty]) => ({
      location: storeCode,
      item_code: itemCode,
      item_name: itemCode,
      spec: `POS-${orderId}`,
      qty: -Math.abs(qty),
      log_date: now,
      vendor_target: 'Store',
      log_type: 'POS',
    }))

  if (rows.length > 0) {
    await supabaseInsertMany('stock_logs', rows)
    try {
      await supabaseInsert('pos_stock_deductions', { order_id: orderId })
    } catch {
    }
  }

  return { success: true, deductedCount: rows.length }
}

/** POS 주문 취소/환불 시 이전 차감분을 되돌린다. (이미 되돌림이 있으면 중복 실행 방지) */
export async function reversePosStockDeduction(orderId: number): Promise<{ success: boolean; revertedCount: number }> {
  const safeId = Math.floor(Number(orderId) || 0)
  if (safeId <= 0) return { success: false, revertedCount: 0 }
  const sourceSpec = `POS-${safeId}`
  const reverseSpec = `POS-REV-${safeId}`

  try {
    const existingReverse = (await supabaseSelectFilter(
      'stock_logs',
      `spec=eq.${encodeURIComponent(reverseSpec)}`,
      { limit: 1, select: 'id' }
    )) as { id?: number }[] | null
    if (existingReverse?.length) {
      return { success: true, revertedCount: 0 }
    }
  } catch {
    /* ignore */
  }

  const originalRows = (await supabaseSelectFilter(
    'stock_logs',
    `spec=eq.${encodeURIComponent(sourceSpec)}&log_type=eq.POS`,
    {
      limit: 5000,
      select: 'location,item_code,item_name,qty,vendor_target',
    }
  )) as {
    location?: string
    item_code?: string
    item_name?: string
    qty?: number
    vendor_target?: string
  }[] | null

  const reverseRows = (originalRows || [])
    .map((row) => {
      const location = String(row.location ?? '').trim()
      const itemCode = String(row.item_code ?? '').trim()
      const qty = Number(row.qty ?? 0)
      if (!location || !itemCode || !Number.isFinite(qty) || qty >= 0) return null
      return {
        location,
        item_code: itemCode,
        item_name: String(row.item_name ?? itemCode).trim() || itemCode,
        spec: reverseSpec,
        qty: Math.abs(qty),
        log_date: getBangkokDateTimeString(),
        vendor_target: String(row.vendor_target ?? 'Store').trim() || 'Store',
        log_type: 'POS_REVERSAL',
      }
    })
    .filter((row): row is {
      location: string
      item_code: string
      item_name: string
      spec: string
      qty: number
      log_date: string
      vendor_target: string
      log_type: string
    } => Boolean(row))

  if (!reverseRows.length) return { success: true, revertedCount: 0 }
  await supabaseInsertMany('stock_logs', reverseRows)
  return { success: true, revertedCount: reverseRows.length }
}
