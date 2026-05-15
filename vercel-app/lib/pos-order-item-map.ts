import type { PosOrderItem } from '@/lib/api-client'
import type { OrderItem } from '@/lib/pos-types'

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
  optionCode?: string
  optionCode1?: string
  menuId2?: string
  optionId2?: string
  optionCode2?: string
  orderType?: string
  deliveryAppCode?: string
  promoId?: string
  promoCode?: string
  promoItems?: { menuId: string; optionId: string | null; optionCode?: string | null; quantity: number }[]
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
    const optionCodePrimary = String(i.optionCode1 ?? i.optionCode ?? '').trim()
    const menuId2 = String(i.menuId2 ?? '').trim()
    const optionId2 = String(i.optionId2 ?? '').trim()
    const optionCode2 = String(i.optionCode2 ?? '').trim()
    return {
      id: i.id,
      name: i.name,
      price: i.price,
      qty: q,
      quantity: q,
      ...(String(i.note ?? '').trim() ? { note: String(i.note).trim() } : {}),
      ...(menuIdPrimary ? { menuId1: menuIdPrimary } : {}),
      ...(optionIdPrimary ? { optionId1: optionIdPrimary } : {}),
      ...(optionCodePrimary ? { optionCode1: optionCodePrimary } : {}),
      ...(menuId2 ? { menuId2 } : {}),
      ...(optionId2 ? { optionId2 } : {}),
      ...(optionCode2 ? { optionCode2 } : {}),
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

function normPosOrderItemId(id: unknown): string {
  return String(id ?? '').trim()
}

/** 테이블·조회용 `OrderItem` → `updatePosOrder` / 병합용 `PosOrderItem` */
export function orderUiItemsToPosOrderItems(items: OrderItem[]): PosOrderItem[] {
  return items.map((i) => {
    const q = resolveCartLineQuantityForSave(i as { quantity?: unknown; qty?: unknown })
    const menuIdPrimary = String(i.menuId ?? '').trim()
    const optionIdPrimary = String(i.optionId ?? '').trim()
    const optionCodePrimary = String(i.optionCode ?? '').trim()
    return {
      id: String(i.id ?? ''),
      name: String(i.name ?? ''),
      price: Number(i.price ?? 0) || 0,
      qty: q,
      quantity: q,
      ...(String(i.note ?? '').trim() ? { note: String(i.note).trim() } : {}),
      ...(menuIdPrimary ? { menuId1: menuIdPrimary } : {}),
      ...(optionIdPrimary ? { optionId1: optionIdPrimary } : {}),
      ...(optionCodePrimary ? { optionCode1: optionCodePrimary } : {}),
      ...(i.servedAt ? { servedAt: i.servedAt } : {}),
      ...(i.servedBy ? { servedBy: i.servedBy } : {}),
      ...(i.cancelledAt ? { cancelledAt: i.cancelledAt } : {}),
      ...(i.cancelledBy ? { cancelledBy: i.cancelledBy } : {}),
      ...(String(i.cancelReason ?? '').trim() ? { cancelReason: String(i.cancelReason) } : {}),
      ...(i.promoId
        ? {
            promoId: i.promoId,
            ...(i.promoCode ? { promoCode: i.promoCode } : {}),
            ...(Array.isArray(i.promoItems) && i.promoItems.length > 0 ? { promoItems: i.promoItems } : {}),
          }
        : {}),
      ...(i.deliveryAppCode ? { deliveryAppCode: i.deliveryAppCode } : {}),
      ...(i.setChildrenState ? { setChildrenState: i.setChildrenState } : {}),
    }
  })
}

/**
 * 홀(dine-in) 추가 주문: 카트에 **신규 줄만** 있을 때(기존 줄이 카트에 안 올라온 경우)
 * `updatePosOrder`가 `items_json` 전체를 덮어쓰므로, DB에 있던 줄을 유지하고 카트 줄을 이어붙인다.
 * 카트에 기존 id가 하나라도 있으면 카트를 전체 스냅샷으로 보고(수량·삭제 반영) 그대로 둔다.
 */
export function mergeDineInAddonCartPosItemsWithExisting(existing: PosOrderItem[], fromCart: PosOrderItem[]): PosOrderItem[] {
  if (fromCart.length === 0) return existing
  const baseIds = new Set(existing.map((b) => normPosOrderItemId(b.id)).filter(Boolean))
  const allCartLinesAreNewIds = fromCart.every((c) => !baseIds.has(normPosOrderItemId(c.id)))
  if (allCartLinesAreNewIds) {
    return [...existing.map((e) => ({ ...e })), ...fromCart.map((c) => ({ ...c }))]
  }
  const baseById = new Map<string, PosOrderItem>()
  for (const b of existing) {
    const k = normPosOrderItemId(b.id)
    if (k) baseById.set(k, b)
  }
  return fromCart.map((c) => {
    const k = normPosOrderItemId(c.id)
    const b = k ? baseById.get(k) : undefined
    if (!b) return { ...c }
    return {
      ...b,
      ...c,
      servedAt: c.servedAt ?? b.servedAt ?? null,
      servedBy: c.servedBy ?? b.servedBy ?? null,
      cancelledAt: c.cancelledAt ?? b.cancelledAt ?? null,
      cancelledBy: c.cancelledBy ?? b.cancelledBy ?? null,
      cancelReason: c.cancelReason ?? b.cancelReason ?? null,
    }
  })
}
