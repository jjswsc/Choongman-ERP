import type { ReceiptModalData } from '@/components/pos/pos-receipt-modal'
import type { PosOrder } from '@/lib/api-client'
import {
  enrichReceiptModalItemsForPromoDisplay,
  receiptModalDataFromPosOrderReprint,
  type PosOrderReceiptLineOptions,
} from '@/lib/pos-payment-receipt-from-order'
import { computePosPricing, type PosPricingAdjustments } from '@/lib/pos-pricing'
import { receiptPaymentFieldsFromSnapshot } from '@/lib/pos-receipt-cash-tender'
import { coercePosReceiptLineDiscountAmt } from '@/lib/pos-receipt-line-discount'
import { parsePosOrderMemo, upsertPosOrderTaxInvoiceMemo } from '@/lib/pos-tax-invoice'
import {
  parsePosSplitReceiptsFromMemo,
  type PosSplitReceiptSnapshot,
} from '@/lib/pos-split-receipt-memo'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function linePoolKey(id: string, name: string): string {
  const nid = String(id ?? '').trim()
  const nname = String(name ?? '').trim()
  return nid ? `id:${nid}` : `name:${nname.toLowerCase()}`
}

type OrderLineDiscountPool = { remainingQty: number; remainingDisc: number }

/** 분할 스냅샷에 줄 할인이 없으면 주문 품목 스냅샷에서 수량 비율로 채움 */
export function applyOrderLineDiscountsToSplitSnapshots(
  splits: PosSplitReceiptSnapshot[],
  orderItems: unknown[] | null | undefined
): PosSplitReceiptSnapshot[] {
  if (!splits.length) return splits
  const alreadyHasLineDiscount = splits.some((split) =>
    (split.items || []).some((it) => Math.max(0, Number(it.lineDiscountAmt) || 0) > 0.0001)
  )
  if (alreadyHasLineDiscount) return splits
  const pools = new Map<string, OrderLineDiscountPool>()
  for (const raw of orderItems || []) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const id = String(row.id ?? '').trim()
    const name = String(row.name ?? '').trim()
    const qty = Math.max(0, Number(row.qty ?? row.quantity ?? 0) || 0)
    const disc = coercePosReceiptLineDiscountAmt(row)
    if (!id && !name) continue
    if (qty <= 0.0001 || disc <= 0.0001) continue
    const key = linePoolKey(id, name)
    const prev = pools.get(key)
    if (prev) {
      prev.remainingQty = round2(prev.remainingQty + qty)
      prev.remainingDisc = round2(prev.remainingDisc + disc)
    } else {
      pools.set(key, { remainingQty: qty, remainingDisc: disc })
    }
  }
  if (pools.size === 0) return splits

  return splits.map((split) => ({
    ...split,
    items: (split.items || []).map((it) => {
      if (Math.max(0, Number(it.lineDiscountAmt) || 0) > 0.0001) return it
      const pool = pools.get(linePoolKey(it.id, it.name)) || pools.get(linePoolKey('', it.name))
      if (!pool || pool.remainingDisc <= 0.0001 || pool.remainingQty <= 0.0001) return it
      const takeQty = Math.min(Math.max(0, Number(it.quantity) || 0), pool.remainingQty)
      if (takeQty <= 0.0001) return it
      const share =
        pool.remainingQty - takeQty <= 0.0001
          ? round2(pool.remainingDisc)
          : round2((pool.remainingDisc * takeQty) / pool.remainingQty)
      pool.remainingQty = round2(Math.max(0, pool.remainingQty - takeQty))
      pool.remainingDisc = round2(Math.max(0, pool.remainingDisc - share))
      return share > 0.0001 ? { ...it, lineDiscountAmt: share } : it
    }),
  }))
}

function allocateAmountBySplitTotals(
  splits: PosSplitReceiptSnapshot[],
  amount: number,
  orderTotal: number
): number[] {
  const amt = Math.max(0, Number(amount) || 0)
  const total = Math.max(0, Number(orderTotal) || 0)
  if (amt <= 0.001 || total <= 0.001) return splits.map(() => 0)
  const out: number[] = []
  let used = 0
  for (let i = 0; i < splits.length; i += 1) {
    if (i === splits.length - 1) {
      out.push(round2(Math.max(0, amt - used)))
      break
    }
    const share = round2((amt * Math.max(0, Number(splits[i].total) || 0)) / total)
    out.push(share)
    used = round2(used + share)
  }
  return out
}

export type SplitPaymentReceiptBatchBase = {
  orderNo: string
  storeCode: string
  orderType: string
  tableName?: string
  memo?: string
  discountReason?: string
  vatFeeMode?: 'included' | 'separate'
  serviceFeeMode?: 'included' | 'separate'
  cardFeeMode?: 'included' | 'separate'
  otherFeeMode?: 'included' | 'separate'
}

/** 합산 영수증 + 분할 영수증. 분할이 없으면 합산만. */
export function composeCheckoutPaymentReceiptPrintBatch(
  fullReceipt: ReceiptModalData,
  splitBatch: ReceiptModalData[]
): ReceiptModalData[] {
  if (!Array.isArray(splitBatch) || splitBatch.length === 0) return [fullReceipt]
  return [fullReceipt, ...splitBatch]
}

/** 결제 직후·사후 세금계산서 공통 — 분할 영수증 `ReceiptModalData` 배열 */
export function buildSplitPaymentReceiptBatch(
  base: SplitPaymentReceiptBatchBase,
  splits: PosSplitReceiptSnapshot[] | null | undefined,
  opts?: {
    suppressReceiptModalAutoPrint?: boolean
    orderVat?: number
    orderServiceFee?: number
    orderCardFee?: number
    orderOtherFee?: number
    orderTotal?: number
    taxInvoiceMemo?: string
    serverOrderId?: number
  }
): ReceiptModalData[] {
  if (!splits || splits.length <= 1) return []
  const parsedMemo = parsePosOrderMemo(opts?.taxInvoiceMemo ?? base.memo ?? '')
  const orderVat = Math.max(0, Number(opts?.orderVat ?? 0) || 0)
  const orderService = Math.max(0, Number(opts?.orderServiceFee ?? 0) || 0)
  const orderCard = Math.max(0, Number(opts?.orderCardFee ?? 0) || 0)
  const orderOther = Math.max(0, Number(opts?.orderOtherFee ?? 0) || 0)
  const orderTotal = Math.max(0, Number(opts?.orderTotal ?? 0) || 0)
  const vatAlloc = allocateAmountBySplitTotals(splits, orderVat, orderTotal)
  const serviceAlloc = allocateAmountBySplitTotals(splits, orderService, orderTotal)
  const cardAlloc = allocateAmountBySplitTotals(splits, orderCard, orderTotal)
  const otherAlloc = allocateAmountBySplitTotals(splits, orderOther, orderTotal)
  const vatFeeMode = base.vatFeeMode ?? (orderVat > 0.001 ? ('separate' as const) : undefined)
  const serviceFeeMode = base.serviceFeeMode ?? (orderService > 0.001 ? ('separate' as const) : undefined)
  const cardFeeMode = base.cardFeeMode ?? (orderCard > 0.001 ? ('separate' as const) : undefined)
  const otherFeeMode = base.otherFeeMode ?? (orderOther > 0.001 ? ('separate' as const) : undefined)

  return splits.flatMap((split, idx) => {
    const items = (split.items || [])
      .map((it) => {
        const lineDiscountAmt = round2(Math.max(0, Number(it.lineDiscountAmt) || 0))
        return {
          id: String(it.id ?? ''),
          name: String(it.name ?? '').trim(),
          price: Number(it.price ?? 0),
          qty: Math.max(0, Number(it.quantity ?? 0) || 0),
          ...(String(it.note ?? '').trim() ? { note: String(it.note).trim() } : {}),
          ...(it.menuId ? { menuId: String(it.menuId) } : {}),
          ...(lineDiscountAmt > 0.0001 ? { lineDiscountAmt } : {}),
        }
      })
      .filter((it) => it.qty > 0 && it.name)
    const subtotal = Math.max(0, Number(split.subtotal ?? 0) || 0)
    const total = Math.max(0, Number(split.total ?? 0) || 0)
    if (items.length === 0 && total <= 0.0001) return []

    const splitMemoTag = `[DUTCH_SPLIT] ${String(split.label || `${idx + 1}/${splits.length}`)}`
    const memoCombined = [parsedMemo.plainMemo, splitMemoTag].filter(Boolean).join('\n')
    const memoWithTax = parsedMemo.taxInvoice
      ? upsertPosOrderTaxInvoiceMemo(memoCombined, parsedMemo.taxInvoice)
      : memoCombined
    const vatAmt = vatAlloc[idx] ?? 0
    const serviceAmt = serviceAlloc[idx] ?? 0
    const cardAmt = cardAlloc[idx] ?? 0
    const otherAmt = otherAlloc[idx] ?? 0
    const serverOrderId = Number(opts?.serverOrderId ?? 0)
    const snapshotDiscount = round2(Math.max(0, Number(split.discountAmt ?? 0) || 0))
    const lineDiscountSum = round2(
      items.reduce((sum, it) => sum + Math.max(0, Number(it.lineDiscountAmt) || 0), 0)
    )
    const discountAmt = snapshotDiscount > 0.0001 ? snapshotDiscount : lineDiscountSum

    return [
      {
        orderNo: base.orderNo,
        storeCode: base.storeCode,
        orderType: base.orderType,
        tableName: base.tableName,
        memo: memoWithTax,
        discountReason: base.discountReason,
        items,
        subtotal,
        discountAmt,
        total: total > 0 ? total : subtotal,
        ...(vatAmt > 0.001 ? { vatFeeAmt: vatAmt, vatFeeMode } : {}),
        ...(serviceAmt > 0.001 ? { serviceFeeAmt: serviceAmt, serviceFeeMode } : {}),
        ...(cardAmt > 0.001 ? { cardFeeAmt: cardAmt, cardFeeMode } : {}),
        ...(otherAmt > 0.001 ? { otherFeeAmt: otherAmt, otherFeeMode } : {}),
        ...(split.payment ? receiptPaymentFieldsFromSnapshot(split.payment) : {}),
        receiptAutoPrintContext: 'payment' as const,
        suppressReceiptModalAutoPrint: opts?.suppressReceiptModalAutoPrint ?? false,
        printInstanceKey: `dutch:${base.orderNo}:${idx}:${split.key}`,
        ...(serverOrderId > 0 ? { serverOrderId } : {}),
      },
    ]
  })
}

/** 영수증 관리 재인쇄·사후 세금계산서 — memo 스냅샷 기준 분할 영수증(+합산) */
export function buildSplitPaymentReceiptBatchFromOrder(
  order: PosOrder,
  opts?: PosOrderReceiptLineOptions & {
    suppressReceiptModalAutoPrint?: boolean
    pricingAdjustments?: PosPricingAdjustments
  }
): ReceiptModalData[] | null {
  const splits = parsePosSplitReceiptsFromMemo(order.memo ?? '')
  if (!splits) return null

  const adjustments = opts?.pricingAdjustments
  const fullReceipt = receiptModalDataFromPosOrderReprint(order, opts, adjustments)
  const pricing = adjustments
    ? computePosPricing({
        subtotal: order.subtotal ?? 0,
        discountAmt: Number(fullReceipt.discountAmt ?? 0) || 0,
        deliveryFee: order.deliveryFee ?? 0,
        packagingFee: order.packagingFee ?? 0,
        cardPaymentAmount: order.paymentCard ?? 0,
        adjustments,
      })
    : null

  const orderVat = pricing
    ? Math.max(0, Number(pricing.vatFeeAmt ?? 0) || 0)
    : Math.max(0, Number(order.vat ?? 0) || 0)
  const orderService = Math.max(0, Number(fullReceipt.serviceFeeAmt ?? pricing?.serviceFeeAmt ?? 0) || 0)
  const orderCard = Math.max(0, Number(fullReceipt.cardFeeAmt ?? pricing?.cardFeeAmt ?? 0) || 0)
  const orderOther = Math.max(0, Number(fullReceipt.otherFeeAmt ?? pricing?.otherFeeAmt ?? 0) || 0)

  const splitsWithLineDiscount = applyOrderLineDiscountsToSplitSnapshots(
    splits,
    Array.isArray(order.items) ? order.items : fullReceipt.items
  )

  const splitRows = buildSplitPaymentReceiptBatch(
    {
      orderNo: order.orderNo ?? '',
      storeCode: order.storeCode ?? '',
      orderType: order.orderType ?? 'dine_in',
      tableName: order.tableName,
      memo: order.memo,
      discountReason: order.discountReason,
      vatFeeMode: fullReceipt.vatFeeMode ?? (orderVat > 0.001 ? 'separate' : undefined),
      serviceFeeMode: fullReceipt.serviceFeeMode,
      cardFeeMode: fullReceipt.cardFeeMode,
      otherFeeMode: fullReceipt.otherFeeMode,
    },
    splitsWithLineDiscount,
    {
      suppressReceiptModalAutoPrint: opts?.suppressReceiptModalAutoPrint ?? true,
      orderVat,
      orderServiceFee: orderService,
      orderCardFee: orderCard,
      orderOtherFee: orderOther,
      orderTotal: Number(order.total ?? 0) || 0,
      taxInvoiceMemo: order.memo,
      serverOrderId: Number(order.id) > 0 ? Number(order.id) : undefined,
    }
  ).map((row) => ({
    ...row,
    items: enrichReceiptModalItemsForPromoDisplay(row.items, opts),
  }))
  if (splitRows.length === 0) return null
  return composeCheckoutPaymentReceiptPrintBatch(
    {
      ...fullReceipt,
      items: enrichReceiptModalItemsForPromoDisplay(fullReceipt.items, opts),
      receiptAutoPrintContext: 'payment',
      suppressReceiptModalAutoPrint: opts?.suppressReceiptModalAutoPrint ?? true,
      printInstanceKey: fullReceipt.printInstanceKey || `full:${order.orderNo ?? order.id ?? 'order'}`,
      ...(Number(order.id) > 0 ? { serverOrderId: Number(order.id) } : {}),
    },
    splitRows
  )
}
