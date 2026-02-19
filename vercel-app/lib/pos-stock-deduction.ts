import { supabaseSelectFilter, supabaseInsertMany, supabaseInsert } from '@/lib/supabase-server'

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

  let items: { id?: string; qty?: number; promoId?: string; promoItems?: { menuId: string; optionId: string | null; quantity: number }[] }[] = []
  try {
    items = JSON.parse(order.items_json || '[]')
  } catch {
    return { success: false, deductedCount: 0 }
  }

  const storeCode = String(order.store_code ?? '').trim()
  if (!storeCode) {
    return { success: false, deductedCount: 0 }
  }

  const usageByItem: Record<string, number> = {}
  const now = new Date().toISOString().slice(0, 19)

  for (const it of items) {
    const cartQty = Math.max(0, Number(it.qty ?? 1))
    if (cartQty <= 0) continue

    if (it.promoId && Array.isArray(it.promoItems) && it.promoItems.length > 0) {
      for (const pi of it.promoItems) {
        const menuId = String(pi.menuId ?? '').trim()
        if (!menuId) continue
        const menuQty = cartQty * (Number(pi.quantity) ?? 1)
        if (menuQty <= 0) continue

        const bomRows = (await supabaseSelectFilter(
          'pos_menu_ingredients',
          `menu_id=eq.${encodeURIComponent(menuId)}`,
          { limit: 200 }
        )) as { item_code?: string; quantity?: number }[] | null

        for (const b of bomRows || []) {
          const code = String(b.item_code ?? '').trim()
          if (!code) continue
          const need = menuQty * (Number(b.quantity) ?? 1)
          usageByItem[code] = (usageByItem[code] ?? 0) + need
        }
      }
    } else {
      const menuId = String(it.id ?? '').split('-')[0]
      const menuQty = cartQty
      if (!menuId) continue

      const bomRows = (await supabaseSelectFilter(
        'pos_menu_ingredients',
        `menu_id=eq.${encodeURIComponent(menuId)}`,
        { limit: 200 }
      )) as { item_code?: string; quantity?: number }[] | null

      for (const b of bomRows || []) {
        const code = String(b.item_code ?? '').trim()
        if (!code) continue
        const need = menuQty * (Number(b.quantity) ?? 1)
        usageByItem[code] = (usageByItem[code] ?? 0) + need
      }
    }
  }

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
