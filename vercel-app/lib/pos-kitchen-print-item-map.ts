import type { PosMenu } from '@/lib/api-client'
import { resolveGrabItemPrintNote } from '@/lib/grab-pos-order-enrich'
import { flattenPosOrderItemOptionCodes } from '@/lib/pos-option-code-enrich'
import { resolvePosOrderItemMenuDisplayName } from '@/lib/pos-order-item-display-name'
import { isQrBuffetPackageKitchenSkipLine } from '@/lib/pos-qr-buffet-entry'

export type KitchenPrintPromoItem = {
  menuId: string
  optionId: string | null
  optionCode?: string | null
  quantity: number
}

export type KitchenPrintMappedItem = {
  id: string
  name: string
  price: number
  qty: number
  menuId?: string
  menuId1?: string
  menuId2?: string
  optionCode?: string
  optionCode1?: string
  optionCode2?: string
  optionCodes?: string[]
  note?: string
  deliveryAppCode?: string
  promoId?: string
  promoCode?: string
  promoItems?: KitchenPrintPromoItem[]
  isBuffetEntry?: boolean
  kitchenPrinter?: number | null
  source?: string
  buffetTierId?: unknown
}

type PromoEnricher = (items: KitchenPrintPromoItem[]) => KitchenPrintPromoItem[]

/**
 * POS 주문 줄 → 주방 슬립 인쇄용 한 줄.
 * 반반(Banban)은 parent `menuId`와 맛 `menuId1`/`menuId2`를 분리해 보존한다.
 * (`menuId1`을 parent로 쓰면 주방 맛 복원·라우팅이 깨진다.)
 */
export function mapPosOrderRowForKitchenPrint(
  it: Record<string, unknown>,
  opts?: {
    menus?: PosMenu[]
    deliveryAppCode?: string | null
    enrichPromoItems?: PromoEnricher
  }
): KitchenPrintMappedItem {
  const note = String(it.note ?? '').trim()
  const parentMenuId = String(
    (it as { menuId?: string; menu_id?: string }).menuId ??
      (it as { menu_id?: string }).menu_id ??
      ''
  ).trim()
  const flavorMenuId1 = String(
    (it as { menuId1?: string; menu_id1?: string }).menuId1 ??
      (it as { menu_id1?: string }).menu_id1 ??
      ''
  ).trim()
  const flavorMenuId2 = String(
    (it as { menuId2?: string; menu_id2?: string }).menuId2 ??
      (it as { menu_id2?: string }).menu_id2 ??
      ''
  ).trim()
  const hasDistinctFlavorIds =
    Boolean(flavorMenuId1 && flavorMenuId2 && flavorMenuId1 !== flavorMenuId2)
  const menuId = parentMenuId || (hasDistinctFlavorIds ? '' : flavorMenuId1)
  const pit = it as {
    optionCode?: string
    optionCode1?: string
    optionCode2?: string
    optionCodes?: string[]
    promoId?: string
    promo_id?: string
    promoCode?: string
    promo_code?: string
    promoItems?: KitchenPrintPromoItem[]
  }
  const optionCodes = Array.isArray(pit.optionCodes)
    ? pit.optionCodes.map((c) => String(c ?? '').trim()).filter(Boolean)
    : []
  const optionCode1 = String(
    pit.optionCode1 ?? pit.optionCode2 ?? pit.optionCode ?? optionCodes[0] ?? ''
  ).trim()
  const optionCode2 = String(pit.optionCode2 ?? '').trim()
  const optionCodesMerged = [
    ...new Set([...optionCodes, ...flattenPosOrderItemOptionCodes(pit), optionCode1, optionCode2].filter(Boolean)),
  ]
  const primaryOptionCode = optionCodesMerged[0] ?? ''
  const secondaryOptionCode = optionCodesMerged[1] ?? optionCode2
  const displayName = resolvePosOrderItemMenuDisplayName(
    {
      id: String(it.id ?? ''),
      name: String(it.name ?? ''),
      menuId,
    },
    opts?.menus
  )
  const promoId = String(pit.promoId ?? pit.promo_id ?? '').trim()
  const promoCode = String(pit.promoCode ?? pit.promo_code ?? '').trim()
  const deliveryAppCode = String(opts?.deliveryAppCode ?? it.deliveryAppCode ?? it.delivery_app_code ?? '')
    .trim()
    .toLowerCase()
  const grabLine =
    /^grab:/i.test(String(it.id ?? '')) || deliveryAppCode === 'grab'
  const mergedNote = resolveGrabItemPrintNote({
    note: note || null,
    optionCode: primaryOptionCode || null,
    optionCode1: primaryOptionCode || null,
    optionCode2: secondaryOptionCode || null,
    optionCodes: optionCodesMerged.length > 0 ? optionCodesMerged : undefined,
  })
  const rawPromoItems = Array.isArray(pit.promoItems) ? pit.promoItems : undefined
  const skipKitchenPackage = isQrBuffetPackageKitchenSkipLine(it)
  const promoItems =
    skipKitchenPackage
      ? undefined
      : rawPromoItems && rawPromoItems.length > 0 && opts?.enrichPromoItems
        ? opts.enrichPromoItems(rawPromoItems)
        : rawPromoItems
  const isBuffetEntry = it.isBuffetEntry === true || skipKitchenPackage
  const kitchenPrinterRaw = Number(it.kitchenPrinter ?? it.kitchen_printer)
  const kitchenPrinter =
    kitchenPrinterRaw === 0 || kitchenPrinterRaw === 1 || kitchenPrinterRaw === 2 || kitchenPrinterRaw === 3
      ? (kitchenPrinterRaw as 0 | 1 | 2 | 3)
      : undefined

  return {
    id: String(it.id ?? ''),
    name: grabLine ? String(it.name ?? displayName) : displayName,
    price: Number(it.price ?? 0),
    qty: Number(it.qty ?? it.quantity ?? 1),
    ...(parentMenuId ? { menuId: parentMenuId } : menuId ? { menuId } : {}),
    ...(flavorMenuId1 ? { menuId1: flavorMenuId1 } : {}),
    ...(flavorMenuId2 ? { menuId2: flavorMenuId2 } : {}),
    ...(primaryOptionCode ? { optionCode: primaryOptionCode, optionCode1: primaryOptionCode } : {}),
    ...(secondaryOptionCode ? { optionCode2: secondaryOptionCode } : {}),
    ...(optionCodesMerged.length > 0 ? { optionCodes: optionCodesMerged } : {}),
    ...(mergedNote ? { note: mergedNote } : {}),
    ...(deliveryAppCode ? { deliveryAppCode } : {}),
    ...(promoId && !skipKitchenPackage ? { promoId } : {}),
    ...(promoCode && !skipKitchenPackage ? { promoCode } : {}),
    ...(promoItems && promoItems.length > 0 ? { promoItems } : {}),
    ...(isBuffetEntry ? { isBuffetEntry: true } : {}),
    ...(kitchenPrinter === 0 || kitchenPrinter === 1 || kitchenPrinter === 2 || kitchenPrinter === 3
      ? { kitchenPrinter }
      : {}),
    ...(String(it.source ?? '').trim() ? { source: String(it.source).trim() } : {}),
  }
}

/** 홀 추가 주문 cart line → 주방 슬립 인쇄용 (신규 주문 `prepareOrderItemsForKitchenPrint`와 동일 매핑) */
export function mapDineInAddonCartLineForKitchenPrint(
  line: Record<string, unknown>,
  opts?: {
    menus?: PosMenu[]
    enrichPromoItems?: PromoEnricher
  }
): KitchenPrintMappedItem {
  const qty = Math.max(0, Math.trunc(Number(line.quantity ?? line.qty ?? 1) || 1))
  return mapPosOrderRowForKitchenPrint({ ...line, qty, quantity: qty }, opts)
}
