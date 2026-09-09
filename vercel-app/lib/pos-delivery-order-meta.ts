/**
 * pos_orders 배달 플랫폼 식별: 컬럼 delivery_app_code 우선, 없으면 items_json의 deliveryAppCode.
 */
import { parsePosOrderItemsJson } from '@/lib/pos-order-item-map'

export function parseDeliveryAppCodeFromItemsJson(itemsJson: unknown): string {
  const arr = parsePosOrderItemsJson(itemsJson)
  for (const o of arr) {
    const c = String(o.deliveryAppCode ?? o.delivery_app_code ?? '')
      .trim()
      .toLowerCase()
    if (c) return c
  }
  return ''
}

export function resolveOrderDeliveryAppCode(row: {
  delivery_app_code?: string | null
  delivery_payment_channel?: string | null
  order_type?: string | null
  items_json?: unknown
}): string {
  const col = String(row.delivery_app_code ?? '')
    .trim()
    .toLowerCase()
  if (col) return col
  if (String(row.order_type ?? '').trim() !== 'delivery') return ''
  const payCh = String(row.delivery_payment_channel ?? '')
    .trim()
    .toLowerCase()
  if (payCh && payCh !== 'dine_in') return payCh
  return parseDeliveryAppCodeFromItemsJson(row.items_json ?? undefined)
}
