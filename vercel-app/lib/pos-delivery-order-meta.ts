/**
 * pos_orders 배달 플랫폼 식별: 컬럼 delivery_app_code 우선, 없으면 items_json의 deliveryAppCode.
 */
export function parseDeliveryAppCodeFromItemsJson(itemsJson: string | null | undefined): string {
  if (!itemsJson) return ''
  try {
    const arr = JSON.parse(itemsJson) as unknown
    if (!Array.isArray(arr)) return ''
    for (const it of arr) {
      if (!it || typeof it !== 'object') continue
      const o = it as Record<string, unknown>
      const c = String(o.deliveryAppCode ?? o.delivery_app_code ?? '')
        .trim()
        .toLowerCase()
      if (c) return c
    }
  } catch {
    /* ignore */
  }
  return ''
}

export function resolveOrderDeliveryAppCode(row: {
  delivery_app_code?: string | null
  delivery_payment_channel?: string | null
  order_type?: string | null
  items_json?: string | null
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
