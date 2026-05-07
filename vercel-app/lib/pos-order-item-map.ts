import type { PosOrderItem } from '@/lib/api-client'

export type CartLineForPosOrder = {
  id: string
  name: string
  price: number
  quantity?: number
  /** 일부 경로·레거시 페이로드는 qty 만 포함할 수 있음 */
  qty?: number
  note?: string
  /** 터미널·카탈로그 줄의 POS 메뉴 id (주방 라우팅·재조회 안정화) — items_json 에 같이 저장 */
  menuId?: string
  menuId1?: string
  /** 카트·OrderItem 과 items_json 의 option_id1 교차 */
  optionId?: string
  optionId1?: string
  menuId2?: string
  optionId2?: string
  orderType?: string
  deliveryAppCode?: string
  promoId?: string
  promoCode?: string
  promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
}

/** items_json / API 줄 단위 — qty·quantity 외 레거시/연동 키 보강 */
export function resolveItemsJsonLineQty(it: {
  qty?: unknown
  quantity?: unknown
  count?: unknown
  order_qty?: unknown
  orderQty?: unknown
}): number {
  /** `resolveCartLineQuantityForSave`와 동일하게 quantity 우선 — 잘못된 legacy `qty`가 남아 있어도 UI 수량을 따름 */
  const raw = it.quantity ?? it.qty ?? it.count ?? it.order_qty ?? it.orderQty
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

/** 카트→저장 시 최종 qty (양수가 아니면 1) */
export function resolveCartLineQuantityForSave(line: {
  quantity?: unknown
  qty?: unknown
  count?: unknown
  order_qty?: unknown
  orderQty?: unknown
}): number {
  const n = Number(line.quantity ?? line.qty ?? line.count ?? line.order_qty ?? line.orderQty)
  if (Number.isFinite(n) && n > 0) return n
  return 1
}

/** 장바구니 줄 → savePosOrder items_json용 (분석·프로모 스냅샷 필드 유지) */
export function cartLinesToPosOrderItems(lines: CartLineForPosOrder[]): PosOrderItem[] {
  return lines.map((i) => {
    const q = resolveCartLineQuantityForSave(i)
    const menuIdPrimary = String(i.menuId1 ?? i.menuId ?? '').trim()
    const optionIdPrimary = String(i.optionId1 ?? i.optionId ?? '').trim()
    const menuId2 = String(i.menuId2 ?? '').trim()
    const optionId2 = String(i.optionId2 ?? '').trim()
    return {
      id: i.id,
      name: i.name,
      price: i.price,
      qty: q,
      quantity: q,
      ...(String(i.note ?? '').trim() ? { note: String(i.note).trim() } : {}),
      ...(menuIdPrimary ? { menuId1: menuIdPrimary } : {}),
      ...(optionIdPrimary ? { optionId1: optionIdPrimary } : {}),
      ...(menuId2 ? { menuId2 } : {}),
      ...(optionId2 ? { optionId2 } : {}),
      ...(i.orderType ? { orderType: i.orderType } : {}),
      ...(i.deliveryAppCode ? { deliveryAppCode: i.deliveryAppCode } : {}),
      ...(i.promoId
        ? {
            promoId: i.promoId,
            ...(i.promoCode ? { promoCode: i.promoCode } : {}),
            ...(Array.isArray(i.promoItems) && i.promoItems.length > 0 ? { promoItems: i.promoItems } : {}),
          }
        : {}),
    }
  })
}
