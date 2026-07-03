import type { PosMenu, PosMenuOption, PosPromoWithItems } from '@/lib/api-client'
import type { OrderItem } from '@/lib/pos-types'
import type { PosOrderReceiptLineOptions } from '@/lib/pos-payment-receipt-from-order'
import { kitchenRoutingItemFromOrderItem, preparePosOrderItemsForKitchenSlip } from '@/lib/pos-kitchen-slip-routing'
import { resolvePosOrderItemMenuDisplayName } from '@/lib/pos-order-item-display-name'

export function enrichOrderPromoItemsWithOptionName(
  list: NonNullable<OrderItem['promoItems']>,
  optionNameByCode: Map<string, string>,
  optionNameById: Map<string, string>
): NonNullable<OrderItem['promoItems']> {
  return list.map((p) => ({
    ...p,
    ...(p.optionCode && optionNameByCode.get(String(p.optionCode).trim())
      ? { optionName: optionNameByCode.get(String(p.optionCode).trim()) }
      : {}),
    ...(p.optionId && optionNameById.get(String(p.optionId).trim())
      ? { optionName: optionNameById.get(String(p.optionId).trim()) }
      : {}),
  }))
}

function buildOptionNameMaps(menuOptions: PosMenuOption[]) {
  const optionNameByCode = new Map<string, string>()
  const optionNameById = new Map<string, string>()
  for (const opt of menuOptions) {
    const id = String(opt.id ?? '').trim()
    const name = String(opt.name ?? '').trim()
    const code = String(opt.optionCode ?? '').trim().toUpperCase()
    if (id && name) optionNameById.set(id, name)
    if (code && name) optionNameByCode.set(code, name)
  }
  return { optionNameByCode, optionNameById }
}

/** 홀·포장·배달 체크리스트 — DB 스냅샷·카탈로그로 세트 구성 보강(주방 슬립과 동일 기준) */
export function buildOrderItemsWithPromoDisplayEnrichment(params: {
  items: OrderItem[]
  menus: PosMenu[]
  promos: PosPromoWithItems[]
  menuOptions: PosMenuOption[]
  translateLine: (name: string) => string
}): OrderItem[] {
  const { items, menus, promos, menuOptions, translateLine } = params
  if (!items.length) return []

  const { optionNameByCode, optionNameById } = buildOptionNameMaps(menuOptions)
  const promoCatalogById = new Map<string, PosPromoWithItems>()
  for (const p of promos) {
    const id = String(p?.id ?? '').trim()
    if (id) promoCatalogById.set(id, p)
  }
  const posReceiptLineOpts: PosOrderReceiptLineOptions = { promoCatalogById, menus }

  const routingRows = items.map((it) => {
    const raw = resolvePosOrderItemMenuDisplayName(
      { id: it.id, name: it.name, menuId: it.menuId, promoId: it.promoId, promoCode: it.promoCode },
      menus,
      promos
    )
    return kitchenRoutingItemFromOrderItem(it, translateLine(raw))
  })
  const prepared = preparePosOrderItemsForKitchenSlip(routingRows, {
    ...posReceiptLineOpts,
    menus,
  })
  return items.map((orig, idx) => {
    const fromPrepared = prepared[idx]?.promoItems
    const promoItems =
      Array.isArray(fromPrepared) && fromPrepared.length > 0
        ? enrichOrderPromoItemsWithOptionName(
            fromPrepared as NonNullable<OrderItem['promoItems']>,
            optionNameByCode,
            optionNameById
          )
        : Array.isArray(orig.promoItems) && orig.promoItems.length > 0
          ? enrichOrderPromoItemsWithOptionName(orig.promoItems, optionNameByCode, optionNameById)
          : undefined
    return promoItems ? { ...orig, promoItems } : orig
  })
}
