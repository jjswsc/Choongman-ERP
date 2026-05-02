import type { PosOrderItem } from '@/lib/api-client'

export type CartLineForPosOrder = {
  id: string
  name: string
  price: number
  quantity?: number
  note?: string
  orderType?: string
  deliveryAppCode?: string
  promoId?: string
  promoCode?: string
  promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
}

/** 장바구니 줄 → savePosOrder items_json용 (분석·프로모 스냅샷 필드 유지) */
export function cartLinesToPosOrderItems(lines: CartLineForPosOrder[]): PosOrderItem[] {
  return lines.map((i) => ({
    id: i.id,
    name: i.name,
    price: i.price,
    qty: Number(i.quantity) || 1,
    ...(String(i.note ?? '').trim() ? { note: String(i.note).trim() } : {}),
    ...(i.orderType ? { orderType: i.orderType } : {}),
    ...(i.deliveryAppCode ? { deliveryAppCode: i.deliveryAppCode } : {}),
    ...(i.promoId
      ? {
          promoId: i.promoId,
          ...(i.promoCode ? { promoCode: i.promoCode } : {}),
          ...(Array.isArray(i.promoItems) && i.promoItems.length > 0 ? { promoItems: i.promoItems } : {}),
        }
      : {}),
  }))
}
