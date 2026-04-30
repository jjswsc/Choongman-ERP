import type { OrderItem } from '@/lib/pos-types'

/** CartPanel `CartPanelAddItemPayload` 와 동일 필드 */
export type MergeCartItemInput = {
  id: string
  name: string
  price: number
  note?: string
  promoId?: string
  promoCode?: string
  promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
}

/** CartPanel.addItem 과 동일한 병합 규칙 (단일 진실 원천용 순수 함수) */
export function mergeCartPanelAddItem(prev: OrderItem[], item: MergeCartItemInput): OrderItem[] {
  const promoSignature = JSON.stringify(
    (item.promoItems || []).map((r) => [String(r.menuId), r.optionId ? String(r.optionId) : null, Number(r.quantity) || 1])
  )
  const lineId = item.promoId ? `promo-cart-${item.promoId}-${promoSignature}` : `cart-${Date.now()}-${item.id}`
  if (item.promoId) {
    const stringifyPromoItems = (rows: { menuId: string; optionId: string | null; quantity: number }[] | undefined) =>
      JSON.stringify((rows || []).map((r) => [String(r.menuId), r.optionId ? String(r.optionId) : null, Number(r.quantity) || 1]))
    const incomingSignature = stringifyPromoItems(item.promoItems)
    const existing = prev.find(
      (p) => p.promoId === item.promoId && stringifyPromoItems(p.promoItems as MergeCartItemInput['promoItems']) === incomingSignature
    )
    if (existing) {
      return prev.map((p) =>
        p.id === existing.id
          ? {
              ...p,
              quantity: p.quantity + 1,
              ...(Array.isArray(p.promoItems) && p.promoItems.length > 0
                ? {}
                : Array.isArray(item.promoItems) && item.promoItems.length > 0
                  ? { promoItems: item.promoItems }
                  : {}),
              ...(String(p.note ?? '').trim()
                ? {}
                : String(item.note ?? '').trim()
                  ? { note: String(item.note).trim() }
                  : {}),
            }
          : p
      )
    }
    return [
      ...prev,
      {
        id: lineId,
        name: item.name,
        price: item.price,
        quantity: 1,
        ...(String(item.note ?? '').trim() ? { note: String(item.note).trim() } : {}),
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
