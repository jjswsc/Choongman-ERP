import { resolvePosSalesDiscountAmount } from '@/lib/pos-coupon-domain'
import { resolveItemsJsonLineQty } from '@/lib/pos-order-item-map'
import {
  orderTypeToPromoRegularPriceChannel,
  resolvePromoRegularPricePerSet,
  type PromoPricingCatalog,
} from '@/lib/pos-order-promo-regular-price'
import { resolvePosPromoSalesKind, type PosPromoSalesKind } from '@/lib/pos-promo-sales-kind'
import {
  classifyNonCouponKind,
  resolveCouponLines,
  resolveNonCouponDiscountAmt,
  type PosPaymentDiscountKind,
} from '@/lib/pos-sales-payment-discount-aggregate'
import {
  isDeliveryPlatformDiscountOrder,
  resolvePlatformDiscountReasonForAnalytics,
} from '@/lib/pos-platform-discount-reason'

export type PosSalesDiscountDrillLayer = 'bundle' | 'payment'

export type PosSalesDiscountDrillOrderRow = {
  orderId: number
  orderNo: string
  storeCode: string
  orderType: string
  tableName: string
  total: number
  discountAmount: number
  discountReason?: string
  couponCode?: string
  promoLabel?: string
  paidAt?: string
  createdAt: string
}

type OrderRowBase = {
  id?: number
  order_no?: string
  store_code?: string
  order_type?: string
  table_name?: string
  total?: number
  discount_amt?: number
  coupon_discount_amt?: number
  discount_reason?: string
  coupon_code?: string
  applied_coupons?: unknown
  items_json?: string
  delivery_app_code?: string | null
  created_at?: string
  paid_at?: string
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function resolveLineSaleAmount(row: Record<string, unknown>, qty: number): number {
  const price = Math.max(0, Number(row.price ?? 0) || 0)
  const lineDisc = Math.max(
    0,
    Number(row.lineDiscountAmt ?? row.line_discount_amt ?? 0) || 0
  )
  return Math.max(0, qty * price - lineDisc)
}

function parseOrderItems(itemsJson: string | undefined): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(String(itemsJson || '[]'))
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : []
  } catch {
    return []
  }
}

function baseOrderRow(order: OrderRowBase): Omit<PosSalesDiscountDrillOrderRow, 'discountAmount'> {
  return {
    orderId: Math.max(0, Number(order.id) || 0),
    orderNo: str(order.order_no),
    storeCode: str(order.store_code),
    orderType: str(order.order_type),
    tableName: str(order.table_name),
    total: round2(Math.max(0, Number(order.total) || 0)),
    discountReason: str(order.discount_reason) || undefined,
    couponCode: str(order.coupon_code).toUpperCase() || undefined,
    paidAt: str(order.paid_at) || undefined,
    createdAt: str(order.created_at),
  }
}

function paymentRowKey(kind: PosPaymentDiscountKind, label: string, code: string): string {
  if (kind === 'coupon') return `coupon::${code.toUpperCase() || '(coupon)'}`
  return `${kind}::${label.toLowerCase()}`
}

function mergeDrillRow(
  map: Map<number, PosSalesDiscountDrillOrderRow>,
  order: OrderRowBase,
  amount: number,
  extra?: Pick<PosSalesDiscountDrillOrderRow, 'promoLabel' | 'discountReason' | 'couponCode'>
) {
  const orderId = Math.max(0, Number(order.id) || 0)
  if (orderId <= 0 || amount <= 0.0001) return
  const prev = map.get(orderId)
  if (prev) {
    prev.discountAmount = round2(prev.discountAmount + amount)
    if (extra?.promoLabel && !prev.promoLabel) prev.promoLabel = extra.promoLabel
    if (extra?.discountReason && !prev.discountReason) prev.discountReason = extra.discountReason
    if (extra?.couponCode && !prev.couponCode) prev.couponCode = extra.couponCode
    return
  }
  map.set(orderId, {
    ...baseOrderRow(order),
    discountAmount: round2(amount),
    ...extra,
  })
}

export function collectPosSalesPaymentDiscountDrillOrders(params: {
  orderRows: OrderRowBase[]
  filter: { kind?: PosPaymentDiscountKind; rowKey?: string }
  limit?: number
}): PosSalesDiscountDrillOrderRow[] {
  const map = new Map<number, PosSalesDiscountDrillOrderRow>()
  const kindFilter = params.filter.kind
  const rowKeyFilter = str(params.filter.rowKey)

  for (const order of params.orderRows) {
    const discountAmt = Math.max(0, Number(order.discount_amt) || 0)
    const couponAmtField = Math.max(0, Number(order.coupon_discount_amt) || 0)
    const reason = str(order.discount_reason)
    const couponLines = resolveCouponLines(order)
    const couponFromLines = round2(
      couponLines.reduce((s, line) => s + Math.max(0, Number(line.discountAmt) || 0), 0)
    )
    const couponTotal = couponFromLines > 0.0001 ? couponFromLines : couponAmtField
    const orderTotalDiscount = resolvePosSalesDiscountAmount(discountAmt, couponAmtField)
    if (orderTotalDiscount <= 0.0001) continue

    const nonCouponAmt = resolveNonCouponDiscountAmt(discountAmt, couponTotal)
    if (nonCouponAmt > 0.0001) {
      const kind = classifyNonCouponKind(reason, order)
      const label =
        reason ||
        (kind === 'platform' ? resolvePlatformDiscountReasonForAnalytics(order, nonCouponAmt) : '')
      const key = paymentRowKey(kind, label, kind)
      const kindOk = !kindFilter || kindFilter === kind
      const keyOk = !rowKeyFilter || rowKeyFilter === key
      if (kindOk && keyOk) {
        mergeDrillRow(map, order, nonCouponAmt, {
          discountReason: label || reason || undefined,
        })
      }
    }

    for (const coupon of couponLines) {
      const amt = Math.max(0, Number(coupon.discountAmt) || 0)
      if (amt <= 0.0001) continue
      const code = str(coupon.code).toUpperCase() || '(coupon)'
      const key = paymentRowKey('coupon', str(coupon.name) || code, code)
      const kindOk = !kindFilter || kindFilter === 'coupon'
      const keyOk = !rowKeyFilter || rowKeyFilter === key
      if (kindOk && keyOk) {
        mergeDrillRow(map, order, amt, { couponCode: code })
      }
    }
  }

  const limit = Math.max(1, Math.min(500, params.limit ?? 200))
  return Array.from(map.values())
    .sort((a, b) => b.discountAmount - a.discountAmount || b.total - a.total)
    .slice(0, limit)
}

function resolvePromoMeta(
  promoId: string,
  promoCode: string,
  lineName: string,
  catalog: PromoPricingCatalog
): { code: string; name: string; kind: PosPromoSalesKind; key: string } {
  if (promoId) {
    const hit = catalog.promoMetaById.get(promoId)
    if (hit) {
      const key = promoId || hit.code || promoCode || hit.name
      return {
        code: hit.code || promoCode,
        name: hit.name,
        kind: hit.kind,
        key,
      }
    }
  }
  const code = promoCode || promoId
  const name = lineName || code || '(세트·프로모)'
  return {
    code,
    name,
    kind: resolvePosPromoSalesKind({ promoCode: code }),
    key: promoId || promoCode || name,
  }
}

export function collectPosSalesPromoBundleDrillOrders(params: {
  orderRows: OrderRowBase[]
  catalog: PromoPricingCatalog
  filter: { kind?: PosPromoSalesKind; promoKey?: string }
  limit?: number
}): PosSalesDiscountDrillOrderRow[] {
  const map = new Map<number, PosSalesDiscountDrillOrderRow>()
  const kindFilter = params.filter.kind
  const promoKeyFilter = str(params.filter.promoKey)

  for (const order of params.orderRows) {
    if (isDeliveryPlatformDiscountOrder(order)) continue

    const channel = orderTypeToPromoRegularPriceChannel(order.order_type)
    for (const row of parseOrderItems(order.items_json)) {
      const promoId = str(row.promoId ?? row.promo_id)
      const promoCode = str(row.promoCode ?? row.promo_code)
      if (!promoId && !promoCode) continue

      const qty = Math.max(0, resolveItemsJsonLineQty(row))
      if (qty <= 0) continue

      const lineName = str(row.name)
      const meta = resolvePromoMeta(promoId, promoCode, lineName, params.catalog)
      const kindOk = !kindFilter || kindFilter === meta.kind
      const keyOk = !promoKeyFilter || promoKeyFilter === meta.key
      if (!kindOk || !keyOk) continue

      const saleAmount = resolveLineSaleAmount(row, qty)
      const regularResolved = resolvePromoRegularPricePerSet({
        row,
        promoId,
        channel,
        catalog: params.catalog,
      })
      if (regularResolved.source == null) continue

      const regularAmount = round2(regularResolved.regularPerSet * qty)
      const bundleDiscount = round2(Math.max(0, regularAmount - saleAmount))
      if (bundleDiscount <= 0.0001) continue

      mergeDrillRow(map, order, bundleDiscount, {
        promoLabel: meta.name || meta.code || undefined,
      })
    }
  }

  const limit = Math.max(1, Math.min(500, params.limit ?? 200))
  return Array.from(map.values())
    .sort((a, b) => b.discountAmount - a.discountAmount || b.total - a.total)
    .slice(0, limit)
}
