import { appAlert } from '@/lib/app-message'
import type { ReceiptModalData } from '@/components/pos/pos-receipt-modal'
import {
  getPosOrders,
  updatePosOrderStatus,
  type PosMenu,
  type PosMenuOption,
  type PosOrder,
  type PosPrinterSettings,
  type PosPromoWithItems,
} from '@/lib/api-client'
import { buildPosHallOrderReceiptDocumentHtml } from '@/lib/pos-hall-order-receipt-document-html'
import { buildPosPaymentReceiptDocumentHtmlAsync } from '@/lib/pos-payment-receipt-document-html'
import { buildKitchenSlipDocumentHtml, resolveKitchenSlipDesign } from '@/lib/pos-kitchen-slip-html'
import {
  buildKitchenSlipGroupOpts,
  buildKitchenSlipGroups,
  preparePosOrderItemsForKitchenSlip,
  type KitchenSlipRoutingItem,
} from '@/lib/pos-kitchen-slip-routing'
import { mapKitchenSlipGroupItemsForPrint, stripQrKitchenSourceBracketTags } from '@/lib/pos-kitchen-slip-display'
import { mergeGrabOrderItemsForKitchenPrint } from '@/lib/grab-kitchen-print-items'
import { mapPosOrderRowForKitchenPrint } from '@/lib/pos-kitchen-print-item-map'
import { mergeSetChildrenForReceipt } from '@/lib/pos-hall-order-receipt-document-html'
import {
  mergeGrabSetChildLinesIntoPromoParents,
  parseGrabSetChildLineName,
} from '@/lib/grab-set-pos-lines'
import {
  enrichPosOrderLikeItemsWithPromoSnapshot,
  enrichReceiptModalItemsForPromoDisplay,
  hallOrderReceiptPayloadFromPosOrder,
  isPosOrderPaidLikeStatus,
  posOrderPaymentSum,
  receiptModalDataFromPosOrderForPayment,
  type PosOrderReceiptLineOptions,
} from '@/lib/pos-payment-receipt-from-order'
import { resolveGrabItemPrintNote } from '@/lib/grab-pos-order-enrich'
import { resolvePosOrderItemMenuDisplayName } from '@/lib/pos-order-item-display-name'
import { resolvePosOrderTypeReceiptLabel } from '@/lib/pos-sales-order-type-filter'
import { isApiInboundDeliveryOrderMemo } from '@/lib/pos-delivery-platform'
import { extractGrabOrderIdFromMemo } from '@/lib/grab-order-memo'
import {
  parsePosOrderMemo,
  posTaxInvoiceReceiptFingerprint,
} from '@/lib/pos-tax-invoice'
import {
  posPaymentAutoPrintDedupeKey,
  reservePosAutoPrintKey,
  reservePosAutoPrintKeys,
} from '@/lib/pos-auto-print-dedupe'
import {
  printPosHtmlDocument,
  resolveAfterReceiptToKitchenDelayMs,
  resolveBetweenKitchenSlipsDelayMs,
  POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS,
} from '@/lib/pos-print-html'
import { resolveEscPosCutOverride } from '@/lib/pos-thermal-escpos-cut'
import { kitchenSlipPrintI18n } from '@/lib/pos-kitchen-slip-print-i18n'
import { formatPosDateTimeMedium } from '@/lib/pos-datetime-locale'
import { buildPosCustomerMemoLineForPrint } from '@/lib/pos-member-portal-takeout-label'
import { translatePosMenuLineForReceipt, translateReceiptTableDisplayName } from '@/lib/pos-print-translate'
import { escapeHtml } from '@/lib/utils'
import { posKitchenGuestSpread } from '@/lib/pos-terminal-auto-print'
import { pickQrGuestNoKitchenLinesForHallPrint } from '@/lib/qr-table-types'
import { shouldForceSimplePaymentReceiptForStore } from '@/lib/pos-receipt-store-flags'
import type { LangCode } from '@/lib/lang-context'
import type { PosPricingAdjustments } from '@/lib/pos-pricing'
import type { StoreAutoPrintFlags } from '@/lib/pos-terminal-auto-print'
import type { IncomingDeliveryFocusParams } from '@/lib/pos-main-device-sync-types'
import { backgroundAcceptedDeliveryOrderIdsRef, printedPaymentReceiptIdsRef } from '@/lib/pos-main-device-sync-state'
import type { GrabPosCatalog } from '@/lib/grab-pos-order-enrich'
import { getPosPrinterSettings } from '@/lib/api-client'

export type PosMainDeviceAutoprintCtx = {
  storeCode: string
  lang: string
  printLang: string
  t: (key: string) => string
  tPrint: (key: string) => string
  menus: PosMenu[]
  menuOptions: PosMenuOption[]
  promos: PosPromoWithItems[]
  pricingAdjustments: PosPricingAdjustments
  posReceiptLineOpts: PosOrderReceiptLineOptions
  printerSettings: PosPrinterSettings | null
  autoPrint: StoreAutoPrintFlags
  optionNameByCode: Map<string, string>
  grabCatalogForPrint: GrabPosCatalog
  kitchenSlipOrderTypeLabel: (
    order: {
      orderType?: string
      tableName?: string
      orderNo?: string
      memo?: string
      deliveryAppCode?: string
      items?: Array<{ deliveryAppCode?: string } | Record<string, unknown>>
    },
    ki: ReturnType<typeof kitchenSlipPrintI18n>
  ) => string
  formatLineNoteForPrint: (note?: string | null) => string
  logPosPrintDebug?: (event: string, detail?: Record<string, unknown>) => void
  reserveKitchenAutoPrintKey: (rawKeyOrKeys: string | string[], ttlMs?: number) => boolean
  releaseKitchenAutoPrintKey: (rawKeyOrKeys: string | string[]) => void
  onRefetchStores?: (scope?: 'all' | 'current') => void
}

export type HallReceiptPrintPayload = {
  orderNo: string
  storeCode: string
  orderType: string
  tableName?: string
  memo?: string
  items: ReceiptModalData['items']
  subtotal: number
  discountAmt: number
  couponDiscountAmt?: number
  discountReason?: string
  total: number
  vatFeeAmt?: number
  vatFeeMode?: 'included' | 'separate'
  receiptExclusiveSubtotalDisplay?: number
  receiptVatDisplayAmt?: number
  receiptTaxableGrossForDisplay?: number
  serviceFeeAmt?: number
  serviceFeeMode?: 'included' | 'separate'
  cardFeeAmt?: number
  cardFeeMode?: 'included' | 'separate'
  otherFeeAmt?: number
  otherFeeMode?: 'included' | 'separate'
  guestCount?: number
  _autoPrintDedupeKey?: string
}

function enrichPromoItemsWithOptionName(
  list: { menuId: string; optionId: string | null; optionCode?: string | null; quantity: number }[],
  optionNameByCode: Map<string, string>,
  optionNameById: Map<string, string>
) {
  return list.map((p) => ({
    ...p,
    ...((p.optionCode && optionNameByCode.get(String(p.optionCode)))
      ? { optionName: optionNameByCode.get(String(p.optionCode)) }
      : {}),
    ...((p.optionId && optionNameById.get(String(p.optionId)))
      ? { optionName: optionNameById.get(String(p.optionId)) }
      : {}),
  }))
}

export function prepareOrderItemsForKitchenPrint(
  orderItems: unknown[],
  ctx: PosMainDeviceAutoprintCtx,
  deliveryAppCode?: string | null
) {
  const base = Array.isArray(orderItems) ? orderItems : []
  const optionNameById = new Map<string, string>(
    ctx.menuOptions
      .map((o) => [String(o.id), String(o.name ?? '').trim()] as [string, string])
      .filter(([id, name]) => Boolean(id && name))
  )
  const enrichPromo = (
    list: { menuId: string; optionId: string | null; optionCode?: string | null; quantity: number }[]
  ) => enrichPromoItemsWithOptionName(list, ctx.optionNameByCode, optionNameById)
  const merged = mergeGrabOrderItemsForKitchenPrint(
    base as Parameters<typeof mergeGrabOrderItemsForKitchenPrint>[0],
    ctx.grabCatalogForPrint
  )
  return merged.map((it) =>
    mapPosOrderRowForKitchenPrint(it as unknown as Record<string, unknown>, {
      menus: ctx.menus,
      deliveryAppCode,
      enrichPromoItems: enrichPromo,
    })
  )
}

function kitchenItemsWithResolvedPromo<T extends Record<string, unknown>>(
  rows: T[],
  ctx: PosMainDeviceAutoprintCtx
): T[] {
  if (!rows.length) return rows
  const optionNameById = new Map<string, string>(
    ctx.menuOptions
      .map((o) => [String(o.id), String(o.name ?? '').trim()] as [string, string])
      .filter(([id, name]) => Boolean(id && name))
  )
  const enrichPromo = (
    list: { menuId: string; optionId: string | null; quantity: number }[]
  ) => enrichPromoItemsWithOptionName(list, ctx.optionNameByCode, optionNameById)
  const prepared = preparePosOrderItemsForKitchenSlip(
    rows as Parameters<typeof preparePosOrderItemsForKitchenSlip>[0],
    { ...ctx.posReceiptLineOpts, menus: ctx.menus }
  )
  const mapped = prepared.map((it) => {
    const list = (it as { promoItems?: { menuId: string; optionId: string | null; quantity: number }[] })
      .promoItems
    const enrichedPromo =
      Array.isArray(list) && list.length > 0 ? enrichPromo(list) : undefined
    return {
      ...it,
      ...(enrichedPromo ? { promoItems: enrichedPromo } : {}),
    } as unknown as T
  })
  return mergeSetChildrenForReceipt(mapped as unknown as Parameters<typeof mergeSetChildrenForReceipt>[0], {
    optionNameByCode: ctx.optionNameByCode,
  }) as unknown as T[]
}

async function resolveMenusForKitchenPrint(
  rows: Array<Record<string, unknown>>,
  ctx: PosMainDeviceAutoprintCtx,
  targetStoreCode?: string | null
): Promise<PosMenu[]> {
  void targetStoreCode
  const collectRows = kitchenItemsWithResolvedPromo(rows as Record<string, unknown>[], ctx)
  const requiredMenuIds = new Set<string>()
  for (const row of collectRows) {
    const menuId = String(
      (row as { menuId?: unknown; menuId1?: unknown; menu_id1?: unknown }).menuId1 ??
        (row as { menuId?: unknown }).menuId ??
        ''
    ).trim()
    if (menuId) requiredMenuIds.add(menuId)
    const promoItems = (row as { promoItems?: { menuId: string }[] }).promoItems
    if (Array.isArray(promoItems)) {
      for (const p of promoItems) {
        const mid = String(p.menuId ?? '').trim()
        if (mid) requiredMenuIds.add(mid)
      }
    }
  }
  const catalog = ctx.menus
  if (requiredMenuIds.size === 0) return catalog
  const missing = [...requiredMenuIds].filter((id) => !catalog.some((m) => String(m.id) === id))
  if (!missing.length) return catalog
  return catalog
}

async function resolveOptionNameByCodeForKitchenPrint(
  rows: Array<Record<string, unknown>>,
  _menusForPrint: PosMenu[],
  ctx: PosMainDeviceAutoprintCtx
): Promise<Map<string, string>> {
  void rows
  return ctx.optionNameByCode
}

function kitchenSlipItemsForPrint(
  slipItems: KitchenSlipRoutingItem[],
  orderSource: KitchenSlipRoutingItem[],
  ki: { t: (key: string) => string },
  ctx: PosMainDeviceAutoprintCtx,
  menuCatalog?: PosMenu[],
  optionNameByCodeForPrint?: Map<string, string>
) {
  const activeMenus = Array.isArray(menuCatalog) && menuCatalog.length > 0 ? menuCatalog : ctx.menus
  const activeOptionMap = optionNameByCodeForPrint ?? ctx.optionNameByCode
  return mapKitchenSlipGroupItemsForPrint(slipItems, {
    orderItems: orderSource,
    menuNameByMenuId: Object.fromEntries(
      activeMenus.map((m) => [String(m.id), String(m.name ?? '').trim()]).filter(([id, name]) => id && name)
    ),
    menuCodeByMenuId: Object.fromEntries(
      activeMenus.map((m) => [String(m.id), String(m.code ?? '')]).filter(([id, code]) => id && code)
    ),
    optionNameByCode: activeOptionMap,
    translateName: (name: string) => translatePosMenuLineForReceipt(name, ki.t),
    formatNote: ctx.formatLineNoteForPrint,
  })
}

async function printQrNoKitchenLinesToHall(
  order: PosOrder,
  ctx: PosMainDeviceAutoprintCtx,
  hallLines: Array<Record<string, unknown>>
): Promise<void> {
  const orderId = Number(order.id ?? 0)
  const items: PosOrder['items'] = hallLines.map((it) => ({
    id: String(it.id ?? '').trim() || `qr-hall-${orderId}`,
    name: stripQrKitchenSourceBracketTags(String(it.name ?? '')),
    price: Number(it.price ?? 0) || 0,
    qty: Number(it.qty ?? it.quantity ?? 1) || 1,
    ...(String(it.menuId ?? '').trim() ? { menuId: String(it.menuId).trim() } : {}),
    ...(String(it.note ?? '').trim() ? { note: String(it.note).trim() } : {}),
  }))
  const drinkSubtotal = items.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.qty || 0), 0)
  const lineIds = items
    .map((it) => String(it.id ?? '').trim())
    .filter(Boolean)
    .sort()
    .join(',')
  const payload = {
    ...hallOrderReceiptPayloadFromPosOrder(
      {
        ...order,
        items,
        subtotal: drinkSubtotal,
        total: drinkSubtotal,
        discountAmt: 0,
        couponDiscountAmt: 0,
      },
      ctx.pricingAdjustments,
      {
        ...ctx.posReceiptLineOpts,
        orderTypeLabel: resolvePosOrderTypeReceiptLabel(order.orderType, ctx.t),
        storeCodeFallback: ctx.storeCode,
      }
    ),
    _autoPrintDedupeKey: `order:${orderId}:hall:qr-nokitchen:${lineIds || '0'}`,
  }
  await printHallReceiptPayload(payload, ctx)
}

function resolveOrderItemDisplayName(
  item: { id?: string; name?: string; menuId?: string; promoId?: string; promoCode?: string },
  ctx: PosMainDeviceAutoprintCtx
) {
  const rawName = String(item.name ?? '').trim()
  if (parseGrabSetChildLineName(rawName)) return rawName
  return resolvePosOrderItemMenuDisplayName(
    {
      id: String(item.id ?? ''),
      name: rawName,
      ...(String(item.menuId ?? '').trim() ? { menuId: String(item.menuId).trim() } : {}),
      ...(String(item.promoId ?? '').trim() ? { promoId: String(item.promoId).trim() } : {}),
      ...(String(item.promoCode ?? '').trim() ? { promoCode: String(item.promoCode).trim() } : {}),
    },
    ctx.menus,
    ctx.promos
  )
}

export async function printHallReceiptPayload(
  payload: HallReceiptPrintPayload,
  ctx: PosMainDeviceAutoprintCtx,
  opts?: { onAfterDirectPrint?: () => void }
): Promise<void> {
  const autoPrintDedupeKey = String(payload._autoPrintDedupeKey ?? '').trim()
  if (autoPrintDedupeKey) {
    const storeForDedupe = String(ctx.storeCode || payload.storeCode || '').trim()
    const dedupeKeys = [autoPrintDedupeKey]
    const orderNo = String(payload.orderNo ?? '').trim()
    if (/:hall:auto$/u.test(autoPrintDedupeKey) && orderNo) {
      dedupeKeys.push(`submit:hall:${orderNo}`)
    }
    if (!reservePosAutoPrintKeys(storeForDedupe, dedupeKeys)) {
      ctx.logPosPrintDebug?.('hall_autoprint_skip_dedupe', {
        orderNo: payload.orderNo,
        dedupeKey: autoPrintDedupeKey,
        dedupeKeys,
        storeCode: storeForDedupe,
      })
      opts?.onAfterDirectPrint?.()
      return
    }
  }

  const { _autoPrintDedupeKey: _omit, ...payloadWithoutDedupeKey } = payload
  type ReceiptPrintItem = (typeof payload)['items'][number]
  const mergedForReceipt = (() => {
    const base = payloadWithoutDedupeKey.items ?? []
    const hasSetChild = base.some((it) => parseGrabSetChildLineName(String(it.name ?? '')))
    if (!hasSetChild) return base
    return mergeGrabSetChildLinesIntoPromoParents(
      base as Parameters<typeof mergeGrabSetChildLinesIntoPromoParents>[0],
      ctx.grabCatalogForPrint
    ) as ReceiptPrintItem[]
  })()
  const optionNameById = new Map<string, string>(
    ctx.menuOptions
      .map((o) => [String(o.id), String(o.name ?? '').trim()] as [string, string])
      .filter(([id, name]) => Boolean(id && name))
  )
  const enrichedForReceipt = enrichPosOrderLikeItemsWithPromoSnapshot(mergedForReceipt, ctx.posReceiptLineOpts)
    .filter((it) => !(it as { grabSetChild?: boolean }).grabSetChild)
    .map((it) => {
      const promoItems = Array.isArray(it.promoItems)
        ? enrichPromoItemsWithOptionName(
            it.promoItems as {
              menuId: string
              optionId: string | null
              optionCode?: string | null
              quantity: number
            }[],
            ctx.optionNameByCode,
            optionNameById
          )
        : undefined
      return {
        ...it,
        note: resolveGrabItemPrintNote({
          note: String(it.note ?? ''),
          optionCode: String((it as { optionCode?: string }).optionCode ?? '').trim() || undefined,
          optionCode1: String((it as { optionCode1?: string }).optionCode1 ?? '').trim() || undefined,
          optionCode2: String((it as { optionCode2?: string }).optionCode2 ?? '').trim() || undefined,
          optionCodes: Array.isArray((it as { optionCodes?: string[] }).optionCodes)
            ? (it as { optionCodes?: string[] }).optionCodes
            : undefined,
        }),
        ...(promoItems ? { promoItems } : {}),
      }
    })

  const receiptHtml = buildPosHallOrderReceiptDocumentHtml({
    payload: { ...payloadWithoutDedupeKey, items: enrichedForReceipt },
    t: ctx.tPrint,
    lang: ctx.printLang,
    resolveOrderItemDisplayName: (it) =>
      resolveOrderItemDisplayName(
        {
          id: String(it.id ?? ''),
          name: String(it.name ?? ''),
          menuId: String((it as { menuId?: string }).menuId ?? ''),
          promoId: String((it as { promoId?: string }).promoId ?? ''),
          promoCode: String((it as { promoCode?: string }).promoCode ?? ''),
        },
        ctx
      ),
    menuNameById: (menuId: string) =>
      ctx.menus.find((m) => String(m.id) === String(menuId))?.name?.trim() || '',
    menuCodeByMenuId: Object.fromEntries(
      ctx.menus.map((m) => [String(m.id), String(m.code ?? '')]).filter(([id, code]) => id && code)
    ),
    optionNameByCode: ctx.optionNameByCode,
    printerSettings: ctx.printerSettings,
  })

  await printPosHtmlDocument(receiptHtml, {
    title: ctx.tPrint('posReceipt') || '영수증',
    printDelayMs: 0,
    fallbackCleanupMs: 120_000,
    printRole: 'receipt',
    printReceiptKind: 'hall_order',
    escPosCutOverride: resolveEscPosCutOverride(ctx.printerSettings, {
      printRole: 'receipt',
      printReceiptKind: 'hall_order',
    }),
    focusIframeBeforePrint: false,
    onPrintUnavailable: () => {
      void appAlert(ctx.t('posPrintUnavailable'))
    },
    ...(opts?.onAfterDirectPrint
      ? {
          onAfterCleanup: () => {
            const postReceiptDelayMs =
              typeof window !== 'undefined' && window.cmPosShell
                ? resolveAfterReceiptToKitchenDelayMs()
                : POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS
            window.setTimeout(opts.onAfterDirectPrint!, postReceiptDelayMs)
          },
        }
      : {}),
  })
}

export async function printKitchenForOrder(
  order: PosOrder,
  ctx: PosMainDeviceAutoprintCtx,
  opts?: { kitchenLines?: Array<Record<string, unknown>>; dedupeKey?: string }
): Promise<void> {
  const orderId = Number(order.id ?? 0)
  if (!Number.isFinite(orderId) || orderId <= 0) throw new Error('invalid_order_id')
  const effectiveStoreCode = String(ctx.storeCode || order.storeCode || '').trim()
  if (!effectiveStoreCode) throw new Error('missing_store_code')
  const rawItems: Array<Record<string, unknown>> =
    Array.isArray(opts?.kitchenLines) && opts.kitchenLines.length > 0
      ? opts.kitchenLines
      : Array.isArray(order.items)
        ? (order.items as unknown as Array<Record<string, unknown>>)
        : []
  if (!rawItems.length) throw new Error('empty_order_items')

  const callerAlreadyReserved = Boolean(opts?.dedupeKey)
  const kitchenDedupeKey = opts?.dedupeKey ?? `order:${orderId}:kitchen`
  if (!callerAlreadyReserved && !ctx.reserveKitchenAutoPrintKey(kitchenDedupeKey)) return

  try {
    const items = prepareOrderItemsForKitchenPrint(rawItems, ctx, order.deliveryAppCode)
    const settings = ctx.printerSettings ?? (await getPosPrinterSettings({ storeCode: effectiveStoreCode }))
    const menusForPrint = await resolveMenusForKitchenPrint(items as Array<Record<string, unknown>>, ctx, effectiveStoreCode)
    const optionNameByCodeForPrint = await resolveOptionNameByCodeForKitchenPrint(
      items as Array<Record<string, unknown>>,
      menusForPrint,
      ctx
    )
    const ki = kitchenSlipPrintI18n(settings, ctx.lang as LangCode)
    const slips = buildKitchenSlipGroups(
      kitchenItemsWithResolvedPromo(items as Record<string, unknown>[], ctx) as typeof items,
      buildKitchenSlipGroupOpts(settings, menusForPrint, ki.kLabels)
    )
    const hallLines = pickQrGuestNoKitchenLinesForHallPrint(
      items as Array<{
        id?: unknown
        source?: unknown
        kitchenPrinter?: number | null
        isBuffetEntry?: unknown
      }>,
      slips.flatMap((slip) => slip.items)
    )
    if (!slips.length) {
      if (hallLines.length) {
        await printQrNoKitchenLinesToHall(order, ctx, hallLines as Array<Record<string, unknown>>)
        ctx.logPosPrintDebug?.('kitchen_autoprint_qr_hall_only', {
          orderId,
          lines: hallLines.length,
        })
        return
      }
      ctx.releaseKitchenAutoPrintKey(kitchenDedupeKey)
      ctx.logPosPrintDebug?.('kitchen_autoprint_skip_empty_slips', { orderId })
      return
    }
    const slipDesign = resolveKitchenSlipDesign(settings)
    const memoLine = buildPosCustomerMemoLineForPrint(order.memo, ki.t, ki.lang)
    for (let idx = 0; idx < slips.length; idx += 1) {
      const slip = slips[idx]
      const tablePart = order.tableName
        ? ' · ' + (ki.t('posTable') || '테이블') + ': ' + translateReceiptTableDisplayName(order.tableName, ki.t)
        : ''
      const orderTypeLabel = ctx.kitchenSlipOrderTypeLabel(order, ki)
      const html = buildKitchenSlipDocumentHtml({
        label: slip.label,
        orderNo: order.orderNo ?? '',
        storeCode: effectiveStoreCode,
        orderTypeLabel,
        tablePart,
        dateStr: formatPosDateTimeMedium(new Date(), ki.lang),
        items: kitchenSlipItemsForPrint(
          slip.items,
          kitchenItemsWithResolvedPromo(items as Record<string, unknown>[], ctx) as KitchenSlipRoutingItem[],
          ki,
          ctx,
          menusForPrint,
          optionNameByCodeForPrint
        ),
        memoLine: memoLine || null,
        escapeHtml,
        design: slipDesign,
        printerSettings: ctx.printerSettings,
        optionNameByCode: optionNameByCodeForPrint,
        printColorAdjust: 'exact',
        ...posKitchenGuestSpread(order.guestCount, ki.t('posOrderGuestCount')),
      })
      await printPosHtmlDocument(html, {
        title: slip.label,
        printDelayMs: 0,
        focusIframeBeforePrint: false,
        printRole: 'kitchen',
        kitchenStation: slip.station,
        escPosCutOverride: resolveEscPosCutOverride(settings, { printRole: 'kitchen' }),
        onPrintUnavailable: () => {
          throw new Error('print_unavailable')
        },
      })
      if (idx + 1 < slips.length) {
        await new Promise((resolve) => setTimeout(resolve, resolveBetweenKitchenSlipsDelayMs()))
      }
    }
    if (hallLines.length) {
      try {
        await printQrNoKitchenLinesToHall(order, ctx, hallLines as Array<Record<string, unknown>>)
        ctx.logPosPrintDebug?.('kitchen_autoprint_qr_hall_drinks', {
          orderId,
          lines: hallLines.length,
        })
      } catch (e) {
        console.error('qr no-kitchen hall print:', e)
      }
    }
  } catch (e) {
    ctx.releaseKitchenAutoPrintKey(kitchenDedupeKey)
    throw e
  }
}

export function runKitchenAutoprintForOrder(
  order: PosOrder,
  ctx: PosMainDeviceAutoprintCtx,
  flow?: string
): void {
  const orderId = Number(order.id ?? 0)
  const kitchenDedupeKey = `order:${orderId}:kitchen`
  if (!ctx.reserveKitchenAutoPrintKey(kitchenDedupeKey)) return
  void (async () => {
    try {
      await printKitchenForOrder(order, ctx, { dedupeKey: kitchenDedupeKey })
    } catch (e) {
      ctx.releaseKitchenAutoPrintKey(kitchenDedupeKey)
      console.error(`Kitchen slip print (${flow ?? 'sync'}):`, e)
    }
  })()
}

export async function printHallOrderForOrder(
  order: PosOrder,
  ctx: PosMainDeviceAutoprintCtx,
  opts?: { onAfterKitchen?: () => void }
): Promise<void> {
  const orderId = Number(order.id ?? 0)
  const hallPayload = {
    ...hallOrderReceiptPayloadFromPosOrder(order, ctx.pricingAdjustments, {
      ...ctx.posReceiptLineOpts,
      orderTypeLabel: resolvePosOrderTypeReceiptLabel(order.orderType, ctx.t),
      storeCodeFallback: ctx.storeCode,
    }),
    _autoPrintDedupeKey: `order:${orderId}:hall:auto`,
  }
  await printHallReceiptPayload(hallPayload, ctx, {
    onAfterDirectPrint: opts?.onAfterKitchen,
  })
}

export async function printPaymentReceiptForOrder(
  order: PosOrder,
  ctx: PosMainDeviceAutoprintCtx,
  opts?: { printInstanceKeyOverride?: string }
): Promise<boolean> {
  const orderId = Number(order.id)
  if (!Number.isFinite(orderId) || orderId <= 0) return false
  if (!isPosOrderPaidLikeStatus(String(order.status ?? ''))) return false
  if (posOrderPaymentSum(order) <= 0) return false
  if (!(order.items || []).length) return false

  let data = receiptModalDataFromPosOrderForPayment(order, ctx.pricingAdjustments, ctx.posReceiptLineOpts)
  if (opts?.printInstanceKeyOverride) {
    data = { ...data, printInstanceKey: opts.printInstanceKeyOverride }
  }
  const storeCode = String(ctx.storeCode || order.storeCode || '').trim()

  if (!data.voidReceiptMode) {
    const dedupeKey = posPaymentAutoPrintDedupeKey(orderId, data.printInstanceKey)
    const storeForDedupe = String(ctx.storeCode || data.storeCode || '').trim()
    if (!reservePosAutoPrintKey(storeForDedupe, dedupeKey)) {
      ctx.logPosPrintDebug?.('payment_autoprint_skip_dedupe', {
        orderId,
        dedupeKey,
        orderNo: data.orderNo,
        storeCode: storeForDedupe,
      })
      return false
    }
  }

  printedPaymentReceiptIdsRef.current.add(orderId)

  try {
    let dataForPrint = data
    if ((data.items?.length ?? 0) === 0 && orderId > 0) {
      const fallbackRows = await getPosOrders({ orderId, storeCode: storeCode || undefined, limit: 1 })
      const fallbackOrder = fallbackRows?.[0]
      if (fallbackOrder?.items?.length) {
        const rebuilt = receiptModalDataFromPosOrderForPayment(
          fallbackOrder,
          ctx.pricingAdjustments,
          ctx.posReceiptLineOpts
        )
        dataForPrint = {
          ...rebuilt,
          ...data,
          items: rebuilt.items,
          orderNo: String(data.orderNo || rebuilt.orderNo || ''),
          receiptPrintedAt: data.receiptPrintedAt || rebuilt.receiptPrintedAt,
          serverOrderId: data.serverOrderId ?? rebuilt.serverOrderId ?? orderId,
        }
      }
    }

    const settings =
      ctx.printerSettings ??
      (await getPosPrinterSettings({ storeCode: storeCode || ctx.storeCode }))
    const optionNameById = new Map<string, string>(
      ctx.menuOptions
        .map((o) => [String(o.id), String(o.name ?? '').trim()] as [string, string])
        .filter(([id, name]) => Boolean(id && name))
    )
    const itemsBase = (() => {
      const base = dataForPrint.items ?? []
      const hasSetChild = base.some((it) => parseGrabSetChildLineName(String(it.name ?? '')))
      if (!hasSetChild) return base
      return mergeGrabSetChildLinesIntoPromoParents(
        base as Parameters<typeof mergeGrabSetChildLinesIntoPromoParents>[0],
        ctx.grabCatalogForPrint
      ) as typeof base
    })()
    const enrichedItems = enrichPosOrderLikeItemsWithPromoSnapshot(itemsBase, ctx.posReceiptLineOpts)
      .filter((it) => !(it as { grabSetChild?: boolean }).grabSetChild)
      .map((it) => {
        const promoItems = Array.isArray(it.promoItems)
          ? enrichPromoItemsWithOptionName(
              it.promoItems as {
                menuId: string
                optionId: string | null
                optionCode?: string | null
                quantity: number
              }[],
              ctx.optionNameByCode,
              optionNameById
            )
          : undefined
        return {
          ...it,
          note: resolveGrabItemPrintNote({
            note: String(it.note ?? ''),
            optionCode: String((it as { optionCode?: string }).optionCode ?? '').trim() || undefined,
          }),
          ...(promoItems ? { promoItems } : {}),
        }
      })
    const enriched = {
      ...dataForPrint,
      items: enrichReceiptModalItemsForPromoDisplay(enrichedItems, {
        ...ctx.posReceiptLineOpts,
        memo: dataForPrint.memo,
        deliveryAppCode: dataForPrint.deliveryAppCode,
      }),
    }
    const { enrichReceiptModalDataWithMember } = await import('@/lib/pos-receipt-member-enrich-client')
    const enrichedWithMember = await enrichReceiptModalDataWithMember(enriched, order)
    const receiptHtml = await buildPosPaymentReceiptDocumentHtmlAsync({
      receiptData: enrichedWithMember,
      menus: ctx.menus,
      optionNameByCode: ctx.optionNameByCode,
      orderTypeLabels: {
        dine_in: ctx.tPrint('posOrderTypeDineIn') ?? '매장',
        takeout: ctx.tPrint('posOrderTypeTakeout') ?? '포장',
        delivery: ctx.tPrint('posOrderTypeDelivery') ?? '배달',
      },
      t: ctx.tPrint,
      lang: ctx.printLang,
      origin: typeof window !== 'undefined' ? window.location.origin : '',
      printedAt: new Date(),
      printerSettings: settings,
      forceSimpleTextMode: shouldForceSimplePaymentReceiptForStore(storeCode || ctx.storeCode),
    })
    await printPosHtmlDocument(receiptHtml, {
      title: ctx.tPrint('posReceipt') || '영수증',
      printDelayMs: 0,
      fallbackCleanupMs: 120_000,
      focusIframeBeforePrint: false,
      printRole: 'receipt',
      printReceiptKind: 'payment',
      escPosCutOverride: resolveEscPosCutOverride(settings, {
        printRole: 'receipt',
        printReceiptKind: 'payment',
      }),
      onPrintUnavailable: () => {
        void appAlert(ctx.t('posPrintUnavailable'))
      },
    })
    return true
  } catch {
    printedPaymentReceiptIdsRef.current.delete(orderId)
    return false
  }
}

/** 결제 후 세금계산서 memo 추가·수정 — 결제 영수증 재인쇄(최초 결제 dedupe와 별도) */
export async function printPaymentReceiptTaxReprintForOrder(
  order: PosOrder,
  ctx: PosMainDeviceAutoprintCtx
): Promise<boolean> {
  const fingerprint = posTaxInvoiceReceiptFingerprint(parsePosOrderMemo(order.memo).taxInvoice)
  if (!fingerprint) return false
  return printPaymentReceiptForOrder(order, ctx, { printInstanceKeyOverride: `tax:${fingerprint}` })
}

export async function backgroundAcceptGrabAndAutoprint(
  params: IncomingDeliveryFocusParams,
  ctx: PosMainDeviceAutoprintCtx
): Promise<void> {
  const orderId = Number(params.orderId)
  if (!Number.isFinite(orderId) || orderId <= 0) return
  if (!ctx.autoPrint.receiptOnOrder && !ctx.autoPrint.kitchenOnOrder) return
  if (!isApiInboundDeliveryOrderMemo(String(params.memo ?? ''))) return
  const status = String(params.status ?? '').trim().toLowerCase()
  if (status !== 'pending') return
  if (backgroundAcceptedDeliveryOrderIdsRef.current.has(orderId)) return
  backgroundAcceptedDeliveryOrderIdsRef.current.add(orderId)
  try {
    const grabOrderId = extractGrabOrderIdFromMemo(String(params.memo ?? ''))
    const res = await updatePosOrderStatus({
      id: orderId,
      status: 'cooking',
      ...(grabOrderId ? { grabState: 'ACCEPTED' } : {}),
    })
    const applied = Boolean(res.success || res.statusAlreadyApplied)
    if (!applied) {
      backgroundAcceptedDeliveryOrderIdsRef.current.delete(orderId)
      ctx.logPosPrintDebug?.('bg_accept_status_failed', { orderId, message: String(res.message ?? '') })
      return
    }
    ctx.onRefetchStores?.('all')
    let list = await getPosOrders({
      orderId,
      storeCode: String(params.storeCode || ctx.storeCode || '').trim() || undefined,
    })
    if (!list.length) {
      list = await getPosOrders({ orderId, storeCode: ctx.storeCode })
    }
    const order = list[0]
    if (!order?.items?.length) {
      ctx.logPosPrintDebug?.('accept_flow_skip_empty_items', { orderId })
      return
    }
    const runKitchen = () => {
      if (!ctx.autoPrint.kitchenOnOrder) return
      runKitchenAutoprintForOrder(order, ctx, 'bg_accept')
    }
    if (ctx.autoPrint.receiptOnOrder) {
      await printHallOrderForOrder(order, ctx, {
        onAfterKitchen: ctx.autoPrint.kitchenOnOrder ? runKitchen : undefined,
      })
    } else if (ctx.autoPrint.kitchenOnOrder) {
      runKitchen()
    }
    ctx.logPosPrintDebug?.('bg_accept_autoprint_done', { orderId })
  } catch (e) {
    backgroundAcceptedDeliveryOrderIdsRef.current.delete(orderId)
    console.error('Background accept+print (layout sync):', e)
  }
}
