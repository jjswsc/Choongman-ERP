import type { OrderItem } from '@/lib/pos-types'

/** CartPanel `CartPanelAddItemPayload` 와 동일 필드 */
export type MergeCartItemInput = {
  id: string
  name: string
  price: number
  promoId?: string
  promoCode?: string
  promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
}

/** CartPanel.addItem 과 동일한 병합 규칙 (단일 진실 원천용 순수 함수) */
export function mergeCartPanelAddItem(prev: OrderItem[], item: MergeCartItemInput): OrderItem[] {
  const lineId = item.promoId ? `promo-cart-${item.promoId}` : `cart-${Date.now()}-${item.id}`
  if (item.promoId) {
    const existing = prev.find((p) => p.promoId === item.promoId)
    if (existing) {
      return prev.map((p) => (p.id === existing.id ? { ...p, quantity: p.quantity + 1 } : p))
    }
    return [
      ...prev,
      {
        id: lineId,
        name: item.name,
        price: item.price,
        quantity: 1,
        promoId: item.promoId,
        promoCode: item.promoCode,
        promoItems: item.promoItems,
      },
    ]
  }
  const existing = prev.find(
    (p) =>
      p.name === item.name &&
      p.price === item.price &&
      !p.promoId &&
      !(p.note || '').trim()
  )
  if (existing) {
    return prev.map((p) => (p.id === existing.id ? { ...p, quantity: p.quantity + 1 } : p))
  }
  return [...prev, { id: lineId, name: item.name, price: item.price, quantity: 1 }]
}
