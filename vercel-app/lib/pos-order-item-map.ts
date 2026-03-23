import type { PosOrderItem } from '@/lib/api-client'

export type CartLineForPosOrder = {
  id: string
  name: string
  price: number
  quantity?: number
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
    ...(i.orderType ? { orderType: i.orderType } : {}),
    ...(i.deliveryAppCode ? { deliveryAppCode: i.deliveryAppCode } : {}),
    ...(i.promoId && i.promoItems
      ? { promoId: i.promoId, promoCode: i.promoCode, promoItems: i.promoItems }
      : {}),
  }))
}
