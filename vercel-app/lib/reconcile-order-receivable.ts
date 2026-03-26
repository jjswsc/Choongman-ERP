/**
 * 주문 1건의 Order 미수금을 cart·직접정산 규칙에 맞게 재계산 (분개는 변경 없음)
 */
import { supabaseSelectFilter, supabaseDeleteByFilter } from '@/lib/supabase-server'
import { upsertReceivableFromOrder } from '@/lib/receivable-payable'
import { computeOrderHqReceivableTotal } from '@/lib/order-receivable-hq'

const TZ = 'Asia/Bangkok'

export type ReconcileOrderReceivableResult = {
  ok: boolean
  orderId: number
  kind: 'updated' | 'removed' | 'skipped' | 'orphan_removed'
  subtotalHQ?: number
  totalHQ?: number
  skipReason?: string
  error?: string
}

export async function reconcileOrderReceivableById(orderId: number): Promise<ReconcileOrderReceivableResult> {
  if (!orderId || Number.isNaN(orderId)) {
    return { ok: false, orderId, kind: 'skipped', error: 'invalid_order_id' }
  }

  const existing = (await supabaseSelectFilter(
    'receivable_transactions',
    `ref_type=eq.Order&ref_id=eq.${orderId}`,
    { limit: 1, select: 'trans_date,store_name' }
  )) as { trans_date?: string; store_name?: string }[]

  const transDateFallback =
    (existing?.[0]?.trans_date && String(existing[0].trans_date).slice(0, 10))
    || new Date().toLocaleDateString('en-CA', { timeZone: TZ })

  const orders = (await supabaseSelectFilter('orders', 'id=eq.' + orderId, {
    limit: 1,
    select: 'id,store_name,cart_json,delivery_status',
  })) as { id?: number; store_name?: string; cart_json?: string; delivery_status?: string }[]

  const o = orders?.[0]
  if (!o?.id) {
    if (existing?.length) {
      await supabaseDeleteByFilter('receivable_transactions', `ref_type=eq.Order&ref_id=eq.${orderId}`)
      return { ok: true, orderId, kind: 'orphan_removed' }
    }
    return { ok: false, orderId, kind: 'skipped', skipReason: 'order_not_found', error: 'order_not_found' }
  }

  const ds = String(o.delivery_status || '')
  if (ds !== '배송완료' && ds !== '일부배송완료') {
    return { ok: true, orderId, kind: 'skipped', skipReason: 'not_delivered' }
  }

  let cart: { code?: string; name?: string; spec?: string; qty?: number; price?: number }[] = []
  try {
    cart = JSON.parse((o.cart_json as string) || '[]')
  } catch {
    cart = []
  }

  let storeName = String(o.store_name || '').trim()
  const { subtotalHQ, totalHQ } = await computeOrderHqReceivableTotal(cart)

  if (totalHQ > 0 && !storeName) {
    storeName = String(existing?.[0]?.store_name || '').trim()
  }
  if (totalHQ > 0 && !storeName) {
    return { ok: false, orderId, kind: 'skipped', skipReason: 'no_store_name', error: 'no_store_name' }
  }

  await upsertReceivableFromOrder({
    orderId,
    storeName: storeName || String(existing?.[0]?.store_name || '').trim() || '—',
    total: totalHQ,
    transDate: transDateFallback,
  })

  return {
    ok: true,
    orderId,
    kind: totalHQ <= 0 ? 'removed' : 'updated',
    subtotalHQ,
    totalHQ,
  }
}
