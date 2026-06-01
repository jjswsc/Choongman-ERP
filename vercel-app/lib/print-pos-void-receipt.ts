import type {
  PosMenu,
  PosMenuOption,
  PosOrder,
  PosPrinterSettings,
  PosPromoWithItems,
} from '@/lib/api-client'
import { buildOptionNameByCodeFromMenus } from '@/lib/grab-pos-order-enrich'
import {
  buildPosHallOrderReceiptDocumentHtml,
  type HallOrderPayload,
} from '@/lib/pos-hall-order-receipt-document-html'
import { buildPosPaymentReceiptDocumentHtml } from '@/lib/pos-payment-receipt-document-html'
import {
  enrichReceiptModalItemsForPromoDisplay,
  hallOrderReceiptPayloadFromPosOrder,
  posOrderPaymentSum,
  type PosOrderReceiptLineOptions,
} from '@/lib/pos-payment-receipt-from-order'
import type { PosPricingAdjustments } from '@/lib/pos-pricing'
import {
  POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS,
  printPosHtmlDocument,
} from '@/lib/pos-print-html'
import { resolvePosOrderItemMenuDisplayName } from '@/lib/pos-order-item-display-name'
import { shouldForceSimplePaymentReceiptForStore } from '@/lib/pos-receipt-store-flags'
import { normalizePosOrderTypeKey } from '@/lib/pos-sales-order-type-filter'
import { parseGrabSetChildLineName } from '@/lib/grab-set-pos-lines'
import { resolveEscPosCutOverride } from '@/lib/pos-thermal-escpos-cut'
import { buildSplitPaymentReceiptBatchFromOrder } from '@/lib/pos-split-payment-receipt-batch'
import {
  negatePosReceiptMoney,
  receiptModalDataForVoidReceipt,
  voidReceiptModalData,
} from '@/lib/pos-void-receipt'

export type PrintPosVoidReceiptParams = {
  order: PosOrder
  menus: PosMenu[]
  menuOptions?: PosMenuOption[]
  promos?: PosPromoWithItems[]
  lineOpts?: PosOrderReceiptLineOptions
  t: (key: string) => string
  lang: string
  printerSettings: PosPrinterSettings
  pricingAdjustments?: PosPricingAdjustments
  printedAt?: Date
  focusIframeBeforePrint?: boolean
  onPrintUnavailable?: () => void
}

function buildOrderTypeLabelMap(t: (key: string) => string) {
  return {
    dine_in: t('posOrderTypeDineIn') || '매장',
    takeout: t('posOrderTypeTakeout') || '포장',
    delivery: t('posOrderTypeDelivery') || '배달',
  }
}

function hallOrderPayloadForVoidReceipt(base: HallOrderPayload): HallOrderPayload {
  const neg = negatePosReceiptMoney
  return {
    ...base,
    items: (base.items || []).map((it) => ({
      ...it,
      price: neg(it.price),
    })),
    subtotal: neg(base.subtotal),
    total: neg(base.total),
    ...(base.deliveryFee != null && Math.abs(Number(base.deliveryFee) || 0) > 0.0001
      ? { deliveryFee: neg(base.deliveryFee) }
      : {}),
    ...(base.packagingFee != null && Math.abs(Number(base.packagingFee) || 0) > 0.0001
      ? { packagingFee: neg(base.packagingFee) }
      : {}),
    ...(base.vatFeeAmt != null && Math.abs(Number(base.vatFeeAmt) || 0) > 0.0001
      ? {
          vatFeeAmt: neg(base.vatFeeAmt),
          ...(base.receiptExclusiveSubtotalDisplay != null
            ? { receiptExclusiveSubtotalDisplay: neg(base.receiptExclusiveSubtotalDisplay) }
            : {}),
          ...(base.receiptVatDisplayAmt != null
            ? { receiptVatDisplayAmt: neg(base.receiptVatDisplayAmt) }
            : {}),
          ...(base.receiptTaxableGrossForDisplay != null
            ? { receiptTaxableGrossForDisplay: neg(base.receiptTaxableGrossForDisplay) }
            : {}),
        }
      : {}),
    ...(base.serviceFeeAmt != null && Math.abs(Number(base.serviceFeeAmt) || 0) > 0.0001
      ? { serviceFeeAmt: neg(base.serviceFeeAmt) }
      : {}),
    ...(base.cardFeeAmt != null && Math.abs(Number(base.cardFeeAmt) || 0) > 0.0001
      ? { cardFeeAmt: neg(base.cardFeeAmt) }
      : {}),
    ...(base.otherFeeAmt != null && Math.abs(Number(base.otherFeeAmt) || 0) > 0.0001
      ? { otherFeeAmt: neg(base.otherFeeAmt) }
      : {}),
    voidReceiptMode: true,
  }
}

function resolveOrderItemDisplayNameForPrint(
  item: { id?: string; name?: string; menuId?: string; promoId?: string; promoCode?: string },
  menus: PosMenu[],
  promos: PosPromoWithItems[]
): string {
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
    menus,
    promos
  )
}

/** 주문 취소 직후 void 영수증 인쇄(결제 있으면 결제 영수증, 없으면 홀 주문표). 성공 시 true. */
export async function printPosVoidReceiptForOrder(params: PrintPosVoidReceiptParams): Promise<boolean> {
  const order = params.order
  if (!order?.items?.length) return false

  const storeCode = String(order.storeCode ?? '').trim()
  if (!storeCode) return false

  const lineOpts: PosOrderReceiptLineOptions = params.lineOpts ?? { menus: params.menus }
  const promos = params.promos ?? []
  const paymentSum = posOrderPaymentSum(order)
  const orderTypeLabelMap = buildOrderTypeLabelMap(params.t)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const optionNameByCode = buildOptionNameByCodeFromMenus(params.menus, params.menuOptions ?? [])
  const printedAt = params.printedAt ?? new Date()

  const printHtml = async (fullHtml: string, printReceiptKind: 'payment' | 'hall_order'): Promise<boolean> => {
    try {
      await printPosHtmlDocument(fullHtml, {
        title: params.t('posReceipt') || '영수증',
        printDelayMs: 0,
        fallbackCleanupMs: 120_000,
        focusIframeBeforePrint: params.focusIframeBeforePrint ?? false,
        printRole: 'receipt',
        printReceiptKind,
        escPosCutOverride: resolveEscPosCutOverride(params.printerSettings, {
          printRole: 'receipt',
          printReceiptKind,
        }),
      })
      return true
    } catch {
      params.onPrintUnavailable?.()
      return false
    }
  }

  if (paymentSum > 0.005) {
    const splitBatch = buildSplitPaymentReceiptBatchFromOrder(order, lineOpts)
    const receiptRows = splitBatch?.length
      ? splitBatch.map((row) => voidReceiptModalData(row))
      : [receiptModalDataForVoidReceipt(order, lineOpts)]

    let allPrinted = true
    for (let idx = 0; idx < receiptRows.length; idx += 1) {
      const voidBase = receiptRows[idx]
      const receiptData = {
        ...voidBase,
        items: enrichReceiptModalItemsForPromoDisplay(voidBase.items, lineOpts),
      }
      const receiptHtml = buildPosPaymentReceiptDocumentHtml({
        receiptData,
        menus: params.menus,
        optionNameByCode,
        orderTypeLabels: orderTypeLabelMap,
        t: params.t,
        lang: params.lang,
        origin,
        printedAt,
        printerSettings: params.printerSettings,
        forceSimpleTextMode: shouldForceSimplePaymentReceiptForStore(storeCode),
      })
      const ok = await printHtml(receiptHtml, 'payment')
      if (!ok) allPrinted = false
      if (idx < receiptRows.length - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS))
      }
    }
    return allPrinted
  }

  const channel = normalizePosOrderTypeKey(order.orderType ?? 'dine_in')
  const orderTypeLabel =
    channel === 'delivery'
      ? orderTypeLabelMap.delivery
      : channel === 'takeout'
        ? orderTypeLabelMap.takeout
        : orderTypeLabelMap.dine_in

  const hallBase = hallOrderReceiptPayloadFromPosOrder(
    order,
    params.pricingAdjustments ?? {},
    {
      ...lineOpts,
      orderTypeLabel,
      storeCodeFallback: storeCode,
    }
  )
  const hallPayload = hallOrderPayloadForVoidReceipt(hallBase)
  const hallHtml = buildPosHallOrderReceiptDocumentHtml({
    payload: hallPayload,
    t: params.t,
    lang: params.lang,
    resolveOrderItemDisplayName: (it) =>
      resolveOrderItemDisplayNameForPrint(
        {
          id: String(it.id ?? ''),
          name: String(it.name ?? ''),
          menuId: String((it as { menuId?: string }).menuId ?? ''),
          promoId: String((it as { promoId?: string }).promoId ?? ''),
          promoCode: String((it as { promoCode?: string }).promoCode ?? ''),
        },
        params.menus,
        promos
      ),
    menuNameById: (menuId: string) =>
      params.menus.find((m) => String(m.id) === String(menuId))?.name?.trim() || '',
    menuCodeByMenuId: Object.fromEntries(
      params.menus.map((m) => [String(m.id), String(m.code ?? '')]).filter(([id, code]) => id && code)
    ),
    optionNameByCode,
  })
  return printHtml(hallHtml, 'hall_order')
}
