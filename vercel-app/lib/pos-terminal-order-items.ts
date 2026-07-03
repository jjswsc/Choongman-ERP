/**
 * POS 터미널 — 주문 아이템 변환·병합 순수/조회 헬퍼 (terminal/page.tsx에서 분리 — move only)
 * 로직 변경 없음. import 경로만 분리.
 */
import { getPosOrders, type PosOrder, type PosOrderItem } from '@/lib/api-client'
import type { OrderItem } from '@/lib/pos-types'
import { normalizeCartLineIdForSave, orderUiItemsToPosOrderItems, resolveCartLineQuantityForSave } from '@/lib/pos-order-item-map'

/** 홀·포장 결제 모달/저장용 — 세트 promoItems 스냅샷 유지 */
export function mapOrderItemForCheckoutPayment(item: OrderItem) {
  const menuId = String(item.menuId ?? item.menuId1 ?? '').trim()
  const optionId = String(item.optionId ?? item.optionId1 ?? '').trim()
  const optionCode = String(item.optionCode ?? item.optionCode1 ?? '').trim()
  const promoId = String(item.promoId ?? '').trim()
  const promoCode = String(item.promoCode ?? '').trim()
  const promoItems =
    Array.isArray(item.promoItems) && item.promoItems.length > 0 ? item.promoItems : undefined
  return {
    id: item.id,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    ...(menuId ? { menuId } : {}),
    ...(optionId ? { optionId } : {}),
    ...(optionCode ? { optionCode } : {}),
    ...(item.note?.trim() ? { note: item.note.trim() } : {}),
    ...(promoId
      ? {
          promoId,
          ...(promoCode ? { promoCode } : {}),
          ...(promoItems ? { promoItems } : {}),
        }
      : {}),
  }
}

/** 결제 payload 라인을 터미널 카트(서버 수량·옵션 기준)와 정합화 */
export function reconcilePayloadItemsWithTerminalCart<
  T extends {
    id?: unknown
    quantity?: unknown
    qty?: unknown
    menuId?: unknown
    menuId2?: unknown
    optionId?: unknown
    optionId2?: unknown
    optionCode?: unknown
    optionCode2?: unknown
    optionCodes?: unknown
    promoId?: unknown
    promoCode?: unknown
    promoItems?: unknown
  },
>(payloadItems: T[] | undefined | null, terminalLines: OrderItem[]): T[] {
  return (payloadItems || []).map((it) => {
    const hit = (terminalLines || []).find(
      (line) =>
        String(line.id ?? '') === String(it.id ?? '') ||
        normalizeCartLineIdForSave(line.id) === normalizeCartLineIdForSave(it.id)
    )
    if (hit) {
      const q = resolveCartLineQuantityForSave(hit as { quantity?: unknown; qty?: unknown })
      const mid = String(
        (it as { menuId?: unknown }).menuId ?? hit.menuId ?? ''
      ).trim()
      const mid2 = String(
        (it as { menuId2?: unknown }).menuId2 ?? (hit as { menuId2?: unknown }).menuId2 ?? ''
      ).trim()
      const oid = String(
        (it as { optionId?: unknown }).optionId ?? hit.optionId ?? ''
      ).trim()
      const oid2 = String(
        (it as { optionId2?: unknown }).optionId2 ?? (hit as { optionId2?: unknown }).optionId2 ?? ''
      ).trim()
      const oc = String(
        (it as { optionCode?: unknown }).optionCode ?? hit.optionCode ?? ''
      ).trim()
      const oc2 = String(
        (it as { optionCode2?: unknown }).optionCode2 ?? (hit as { optionCode2?: unknown }).optionCode2 ?? ''
      ).trim()
      const optionCodes = [
        ...new Set(
          [
            ...((Array.isArray((it as { optionCodes?: unknown }).optionCodes)
              ? ((it as { optionCodes?: unknown[] }).optionCodes ?? [])
              : []) as unknown[]).map((x) => String(x ?? '').trim()),
            oc,
            oc2,
          ].filter(Boolean)
        ),
      ]
      const promoId = String((it as { promoId?: unknown }).promoId ?? hit.promoId ?? '').trim()
      const promoCode = String((it as { promoCode?: unknown }).promoCode ?? hit.promoCode ?? '').trim()
      const promoItems =
        Array.isArray((it as { promoItems?: unknown }).promoItems) &&
        (it as { promoItems?: unknown[] }).promoItems!.length > 0
          ? (it as { promoItems: unknown[] }).promoItems
          : Array.isArray(hit.promoItems) && hit.promoItems.length > 0
            ? hit.promoItems
            : undefined
      return {
        ...it,
        quantity: q,
        ...(mid ? { menuId: mid } : {}),
        ...(mid2 ? { menuId2: mid2 } : {}),
        ...(oid ? { optionId: oid } : {}),
        ...(oid2 ? { optionId2: oid2 } : {}),
        ...(oc ? { optionCode: oc } : {}),
        ...(oc2 ? { optionCode2: oc2 } : {}),
        ...(optionCodes.length > 0 ? { optionCodes } : {}),
        ...(promoId
          ? {
              promoId,
              ...(promoCode ? { promoCode } : {}),
              ...(promoItems ? { promoItems } : {}),
            }
          : {}),
      }
    }
    const raw = Number((it as { quantity?: unknown }).quantity ?? (it as { qty?: unknown }).qty)
    if (Number.isFinite(raw) && raw > 0) return it
    return { ...it, quantity: resolveCartLineQuantityForSave(it as { quantity?: unknown; qty?: unknown }) }
  })
}

export function posOrderApiItemsToPosOrderItems(
  rows: NonNullable<PosOrder['items']> | undefined | null
): PosOrderItem[] {
  if (!rows?.length) return []
  return orderUiItemsToPosOrderItems(
    rows.map((it, idx) => ({
      id: String(it.id ?? `line-${idx}`),
      name: String(it.name ?? ''),
      quantity: Math.max(1, Number(it.qty ?? (it as { quantity?: number }).quantity ?? 1) || 1),
      price: Number(it.price ?? 0) || 0,
      ...(String(it.note ?? '').trim() ? { note: String(it.note).trim() } : {}),
      ...(String(it.promoId ?? '').trim() ? { promoId: String(it.promoId).trim() } : {}),
      ...(String(it.promoCode ?? '').trim() ? { promoCode: String(it.promoCode).trim() } : {}),
      ...(Array.isArray(it.promoItems) ? { promoItems: it.promoItems } : {}),
      ...(String(it.servedAt ?? '').trim() ? { servedAt: String(it.servedAt) } : {}),
      ...(String(it.servedBy ?? '').trim() ? { servedBy: String(it.servedBy) } : {}),
      ...(String(it.cancelledAt ?? '').trim() ? { cancelledAt: String(it.cancelledAt) } : {}),
      ...(String(it.cancelledBy ?? '').trim() ? { cancelledBy: String(it.cancelledBy) } : {}),
      ...(String(it.cancelReason ?? '').trim() ? { cancelReason: String(it.cancelReason) } : {}),
    }))
  )
}

export async function fetchPosOrderItemsForPaymentMerge(
  orderId: number,
  storeCode: string
): Promise<PosOrderItem[]> {
  const rows = await getPosOrders({ orderId, storeCode, limit: 1 })
  const hit = Array.isArray(rows) ? rows[0] : null
  return posOrderApiItemsToPosOrderItems(hit?.items)
}

/** 추가 주문 저장 직후 낙관적 스냅샷 — 서빙·취소 상태 포함 */
export function mapPosOrderItemsToTerminalOrderSnapshot(
  rows: PosOrderItem[]
): Array<{
  id: string
  name: string
  quantity: number
  price: number
  menuId?: string
  note?: string
  servedAt?: string
  servedBy?: string
  cancelledAt?: string
  cancelledBy?: string
  cancelReason?: string
  setChildrenState?: OrderItem['setChildrenState']
}> {
  return rows.map((it, idx) => {
    const quantity = resolveCartLineQuantityForSave(it)
    const id = String(it.id ?? '').trim() || `line-${idx + 1}`
    const menuId = String(it.menuId1 ?? (it as { menuId?: string }).menuId ?? '').trim()
    return {
      id,
      name: String(it.name ?? '').trim() || id,
      quantity,
      price: Number(it.price ?? 0) || 0,
      ...(menuId ? { menuId } : {}),
      ...(String(it.note ?? '').trim() ? { note: String(it.note).trim() } : {}),
      ...(String(it.servedAt ?? '').trim() ? { servedAt: String(it.servedAt) } : {}),
      ...(String(it.servedBy ?? '').trim() ? { servedBy: String(it.servedBy) } : {}),
      ...(String(it.cancelledAt ?? '').trim() ? { cancelledAt: String(it.cancelledAt) } : {}),
      ...(String(it.cancelledBy ?? '').trim() ? { cancelledBy: String(it.cancelledBy) } : {}),
      ...(String(it.cancelReason ?? '').trim() ? { cancelReason: String(it.cancelReason) } : {}),
      ...(it.setChildrenState ? { setChildrenState: it.setChildrenState } : {}),
    }
  })
}
