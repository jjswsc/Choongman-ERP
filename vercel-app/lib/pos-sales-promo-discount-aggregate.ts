import { resolvePosSalesDiscountAmount } from '@/lib/pos-coupon-domain'
import { resolveItemsJsonLineQty } from '@/lib/pos-order-item-map'
import {
  orderTypeToPromoRegularPriceChannel,
  resolvePromoRegularPricePerSet,
  type PromoPricingCatalog,
} from '@/lib/pos-order-promo-regular-price'

export type { PromoPricingCatalog }
export { orderTypeToPromoRegularPriceChannel }

export type PosSalesPromoRow = {
  key: string
  promoId: string
  promoCode: string
  name: string
  qty: number
  saleAmount: number
  regularAmount: number
  bundleDiscount: number
  discountPct: number
  /** 정가를 카탈로그·DB 구성으로만 추정한 줄 수 */
  estimatedLineQty: number
  /** 정가 산출 불가 줄 수 */
  unresolvedLineQty: number
}

export type PosSalesPromoAggregateTotals = {
  qty: number
  saleAmount: number
  regularAmount: number
  bundleDiscount: number
  paymentDiscount: number
  /** 세트 내재 + 결제 할인(중복 없음) */
  totalDiscount: number
  estimatedLineQty: number
  unresolvedLineQty: number
}

export type PosSalesPromoAggregateResult = {
  rows: PosSalesPromoRow[]
  totals: PosSalesPromoAggregateTotals
}

type OrderRowForPromoAgg = {
  items_json?: string
  order_type?: string
  discount_amt?: number
  coupon_discount_amt?: number
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

function resolvePromoMeta(
  promoId: string,
  promoCode: string,
  lineName: string,
  catalog: PromoPricingCatalog
): { code: string; name: string } {
  if (promoId) {
    const hit = catalog.promoMetaById.get(promoId)
    if (hit) return hit
  }
  return {
    code: promoCode || promoId,
    name: lineName || promoCode || promoId || '(세트·프로모)',
  }
}

function parseOrderItems(itemsJson: string | undefined): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(String(itemsJson || '[]'))
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : []
  } catch {
    return []
  }
}

export function filterPromoSalesRows(
  rows: PosSalesPromoRow[],
  searchTokens: string[],
  searchAnd: boolean
): PosSalesPromoRow[] {
  if (searchTokens.length === 0) return rows
  return rows.filter((row) => {
    const haystack = [row.name, row.promoCode, row.promoId, row.key].join(' ').toLowerCase()
    return searchAnd
      ? searchTokens.every((token) => haystack.includes(token))
      : searchTokens.some((token) => haystack.includes(token))
  })
}

/**
 * pos_orders items_json — promoId 줄의 정가(카탈로그 역산) vs 판매가 차이 집계.
 * 결제 할인(discount_amt·coupon)은 기간 합계로 별도 제공(세트 내재 할인과 중복 아님).
 */
export function aggregatePosSalesPromoBundleDiscount(params: {
  orderRows: OrderRowForPromoAgg[]
  catalog: PromoPricingCatalog
}): PosSalesPromoAggregateResult {
  const buckets = new Map<
    string,
    Omit<PosSalesPromoRow, 'discountPct'> & { discountPct: number }
  >()
  const totals: PosSalesPromoAggregateTotals = {
    qty: 0,
    saleAmount: 0,
    regularAmount: 0,
    bundleDiscount: 0,
    paymentDiscount: 0,
    totalDiscount: 0,
    estimatedLineQty: 0,
    unresolvedLineQty: 0,
  }

  for (const order of params.orderRows) {
    totals.paymentDiscount += resolvePosSalesDiscountAmount(
      Number(order.discount_amt) || 0,
      Number(order.coupon_discount_amt) || 0
    )
    const channel = orderTypeToPromoRegularPriceChannel(order.order_type)
    for (const row of parseOrderItems(order.items_json)) {
      const promoId = str(row.promoId ?? row.promo_id)
      const promoCode = str(row.promoCode ?? row.promo_code)
      if (!promoId && !promoCode) continue

      const qty = Math.max(0, resolveItemsJsonLineQty(row))
      if (qty <= 0) continue

      const lineName = str(row.name)
      const meta = resolvePromoMeta(promoId, promoCode, lineName, params.catalog)
      const key = promoId || promoCode || meta.name
      const saleAmount = resolveLineSaleAmount(row, qty)
      const regularResolved = resolvePromoRegularPricePerSet({
        row,
        promoId,
        channel,
        catalog: params.catalog,
      })

      let regularAmount = 0
      let bundleDiscount = 0
      let estimatedLineQty = 0
      let unresolvedLineQty = 0

      if (regularResolved.source == null) {
        unresolvedLineQty = qty
      } else {
        regularAmount = round2(regularResolved.regularPerSet * qty)
        bundleDiscount = round2(Math.max(0, regularAmount - saleAmount))
        if (regularResolved.estimated) estimatedLineQty = qty
      }

      const prev = buckets.get(key) ?? {
        key,
        promoId,
        promoCode: meta.code,
        name: meta.name,
        qty: 0,
        saleAmount: 0,
        regularAmount: 0,
        bundleDiscount: 0,
        discountPct: 0,
        estimatedLineQty: 0,
        unresolvedLineQty: 0,
      }
      prev.qty += qty
      prev.saleAmount = round2(prev.saleAmount + saleAmount)
      prev.regularAmount = round2(prev.regularAmount + regularAmount)
      prev.bundleDiscount = round2(prev.bundleDiscount + bundleDiscount)
      prev.estimatedLineQty += estimatedLineQty
      prev.unresolvedLineQty += unresolvedLineQty
      buckets.set(key, prev)

      totals.qty += qty
      totals.saleAmount = round2(totals.saleAmount + saleAmount)
      totals.regularAmount = round2(totals.regularAmount + regularAmount)
      totals.bundleDiscount = round2(totals.bundleDiscount + bundleDiscount)
      totals.estimatedLineQty += estimatedLineQty
      totals.unresolvedLineQty += unresolvedLineQty
    }
  }

  const rows: PosSalesPromoRow[] = Array.from(buckets.values())
    .map((row) => ({
      ...row,
      discountPct:
        row.regularAmount > 0.0001
          ? round2((row.bundleDiscount / row.regularAmount) * 100)
          : 0,
    }))
    .sort((a, b) => b.bundleDiscount - a.bundleDiscount || b.saleAmount - a.saleAmount)

  totals.paymentDiscount = round2(totals.paymentDiscount)
  totals.totalDiscount = round2(totals.bundleDiscount + totals.paymentDiscount)

  return { rows, totals }
}
