import { resolvePosSalesDiscountAmount } from '@/lib/pos-coupon-domain'
import { resolveItemsJsonLineQty } from '@/lib/pos-order-item-map'
import { isDeliveryPlatformDiscountOrder, resolveDeliveryPlatformBundleDiscountAmt, resolveDeliveryPlatformBundleKey, resolvePlatformDiscountReasonForAnalytics } from '@/lib/pos-platform-discount-reason'
import {
  orderTypeToPromoRegularPriceChannel,
  resolvePromoRegularPricePerSet,
  type PromoPricingCatalog,
} from '@/lib/pos-order-promo-regular-price'
import { resolvePosPromoSalesKind, type PosPromoSalesKind } from '@/lib/pos-promo-sales-kind'

export type { PromoPricingCatalog }
export { orderTypeToPromoRegularPriceChannel }
export type { PosPromoSalesKind }

export type PosSalesPromoRow = {
  key: string
  promoId: string
  promoCode: string
  name: string
  kind: PosPromoSalesKind
  qty: number
  saleAmount: number
  regularAmount: number
  bundleDiscount: number
  /** 정가 대비 내재 할인율 */
  discountPct: number
  /** 기간 총매출 대비 내재 할인 비중 */
  discountPctOfGross: number
  /** 기간 총매출 대비 해당 프로모 판매액 비중 */
  saleSharePctOfGross: number
  /** 전체 세트 내재 할인 중 비중 */
  bundleDiscountSharePct: number
  estimatedLineQty: number
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
  /** 완료 주문 total 합(동일 기간·필터) */
  periodGrossSales: number
  periodOrderCount: number
  /** 세트·프로모 줄 판매액 / 총매출 */
  promoLineSaleSharePct: number
  bundleDiscountPctOfGross: number
  paymentDiscountPctOfGross: number
  totalDiscountPctOfGross: number
  estimatedLineQty: number
  unresolvedLineQty: number
}

export type PosSalesPromoKindTotals = {
  kind: PosPromoSalesKind
  qty: number
  saleAmount: number
  regularAmount: number
  bundleDiscount: number
  discountPct: number
  saleSharePctOfGross: number
  bundleDiscountPctOfGross: number
  bundleDiscountSharePct: number
}

export type PosSalesPromoAggregateResult = {
  rows: PosSalesPromoRow[]
  totals: PosSalesPromoAggregateTotals
  byKind: PosSalesPromoKindTotals[]
}

type OrderRowForPromoAgg = {
  items_json?: string
  order_type?: string
  total?: number
  discount_amt?: number
  coupon_discount_amt?: number
  discount_reason?: string
  delivery_app_code?: string | null
  memo?: string | null
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function pctOf(part: number, whole: number): number {
  if (whole <= 0.0001) return 0
  return round2((part / whole) * 100)
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
): { code: string; name: string; kind: PosPromoSalesKind } {
  if (promoId) {
    const hit = catalog.promoMetaById.get(promoId)
    if (hit) {
      return {
        code: hit.code || promoCode,
        name: hit.name,
        kind: hit.kind,
      }
    }
  }
  const code = promoCode || promoId
  return {
    code,
    name: lineName || code || '(세트·프로모)',
    kind: resolvePosPromoSalesKind({ promoCode: code }),
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

function emptyKindTotals(kind: PosPromoSalesKind): Omit<PosSalesPromoKindTotals, 'discountPct' | 'saleSharePctOfGross' | 'bundleDiscountPctOfGross' | 'bundleDiscountSharePct'> {
  return {
    kind,
    qty: 0,
    saleAmount: 0,
    regularAmount: 0,
    bundleDiscount: 0,
  }
}

export function filterPromoSalesRows(
  rows: PosSalesPromoRow[],
  searchTokens: string[],
  searchAnd: boolean
): PosSalesPromoRow[] {
  if (searchTokens.length === 0) return rows
  return rows.filter((row) => {
    const haystack = [row.name, row.promoCode, row.promoId, row.key, row.kind].join(' ').toLowerCase()
    return searchAnd
      ? searchTokens.every((token) => haystack.includes(token))
      : searchTokens.some((token) => haystack.includes(token))
  })
}

/**
 * pos_orders items_json — promoId 줄의 정가(카탈로그 역산) vs 판매가 차이 집계.
 * 배달앱 API 플랫폼 프로모(discount_amt)는 세트 할인 층·platform 유형으로 집계.
 * POS 결제 할인(수동·쿠폰 등)은 paymentDiscount로 별도 제공.
 */
export function aggregatePosSalesPromoBundleDiscount(params: {
  orderRows: OrderRowForPromoAgg[]
  catalog: PromoPricingCatalog
}): PosSalesPromoAggregateResult {
  const buckets = new Map<
    string,
    Omit<PosSalesPromoRow, 'discountPct' | 'discountPctOfGross' | 'saleSharePctOfGross' | 'bundleDiscountSharePct'>
  >()
  const kindBuckets = new Map<PosPromoSalesKind, ReturnType<typeof emptyKindTotals>>()
  for (const kind of ['set', 'campaign', 'platform', 'other'] as const) {
    kindBuckets.set(kind, emptyKindTotals(kind))
  }

  const totals: PosSalesPromoAggregateTotals = {
    qty: 0,
    saleAmount: 0,
    regularAmount: 0,
    bundleDiscount: 0,
    paymentDiscount: 0,
    totalDiscount: 0,
    periodGrossSales: 0,
    periodOrderCount: 0,
    promoLineSaleSharePct: 0,
    bundleDiscountPctOfGross: 0,
    paymentDiscountPctOfGross: 0,
    totalDiscountPctOfGross: 0,
    estimatedLineQty: 0,
    unresolvedLineQty: 0,
  }

  for (const order of params.orderRows) {
    totals.periodGrossSales = round2(totals.periodGrossSales + Math.max(0, Number(order.total) || 0))
    totals.periodOrderCount += 1

    const orderPaymentDiscount = resolvePosSalesDiscountAmount(
      Number(order.discount_amt) || 0,
      Number(order.coupon_discount_amt) || 0
    )
    const platformBundleDiscount = resolveDeliveryPlatformBundleDiscountAmt(order)
    totals.paymentDiscount = round2(
      totals.paymentDiscount + Math.max(0, orderPaymentDiscount - platformBundleDiscount)
    )

    if (platformBundleDiscount > 0.0001) {
      const key = resolveDeliveryPlatformBundleKey(order)
      const label = resolvePlatformDiscountReasonForAnalytics(order, platformBundleDiscount)
      const prev = buckets.get(key) ?? {
        key,
        promoId: '',
        promoCode: key.replace(/^platform::/, '').toUpperCase(),
        name: label,
        kind: 'platform' as const,
        qty: 0,
        saleAmount: 0,
        regularAmount: 0,
        bundleDiscount: 0,
        estimatedLineQty: 0,
        unresolvedLineQty: 0,
      }
      prev.qty += 1
      prev.bundleDiscount = round2(prev.bundleDiscount + platformBundleDiscount)
      buckets.set(key, prev)

      const kindPrev = kindBuckets.get('platform') ?? emptyKindTotals('platform')
      kindPrev.qty += 1
      kindPrev.bundleDiscount = round2(kindPrev.bundleDiscount + platformBundleDiscount)
      kindBuckets.set('platform', kindPrev)

      totals.bundleDiscount = round2(totals.bundleDiscount + platformBundleDiscount)
    }

    /** 플랫폼 API 주문 — discount_amt가 세트 프로모이므로 promo 줄 정가 역산과 이중 집계하지 않음 */
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
        kind: meta.kind,
        qty: 0,
        saleAmount: 0,
        regularAmount: 0,
        bundleDiscount: 0,
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

      const kindPrev = kindBuckets.get(meta.kind) ?? emptyKindTotals(meta.kind)
      kindPrev.qty += qty
      kindPrev.saleAmount = round2(kindPrev.saleAmount + saleAmount)
      kindPrev.regularAmount = round2(kindPrev.regularAmount + regularAmount)
      kindPrev.bundleDiscount = round2(kindPrev.bundleDiscount + bundleDiscount)
      kindBuckets.set(meta.kind, kindPrev)

      totals.qty += qty
      totals.saleAmount = round2(totals.saleAmount + saleAmount)
      totals.regularAmount = round2(totals.regularAmount + regularAmount)
      totals.bundleDiscount = round2(totals.bundleDiscount + bundleDiscount)
      totals.estimatedLineQty += estimatedLineQty
      totals.unresolvedLineQty += unresolvedLineQty
    }
  }

  totals.paymentDiscount = round2(totals.paymentDiscount)
  totals.totalDiscount = round2(totals.bundleDiscount + totals.paymentDiscount)
  totals.promoLineSaleSharePct = pctOf(totals.saleAmount, totals.periodGrossSales)
  totals.bundleDiscountPctOfGross = pctOf(totals.bundleDiscount, totals.periodGrossSales)
  totals.paymentDiscountPctOfGross = pctOf(totals.paymentDiscount, totals.periodGrossSales)
  totals.totalDiscountPctOfGross = pctOf(totals.totalDiscount, totals.periodGrossSales)

  const rows: PosSalesPromoRow[] = Array.from(buckets.values())
    .map((row) => ({
      ...row,
      discountPct:
        row.regularAmount > 0.0001
          ? round2((row.bundleDiscount / row.regularAmount) * 100)
          : 0,
      discountPctOfGross: pctOf(row.bundleDiscount, totals.periodGrossSales),
      saleSharePctOfGross: pctOf(row.saleAmount, totals.periodGrossSales),
      bundleDiscountSharePct: pctOf(row.bundleDiscount, totals.bundleDiscount),
    }))
    .sort((a, b) => b.bundleDiscount - a.bundleDiscount || b.saleAmount - a.saleAmount)

  const byKind: PosSalesPromoKindTotals[] = (['set', 'campaign', 'platform', 'other'] as const)
    .map((kind) => {
      const bucket = kindBuckets.get(kind) ?? emptyKindTotals(kind)
      return {
        ...bucket,
        discountPct:
          bucket.regularAmount > 0.0001
            ? round2((bucket.bundleDiscount / bucket.regularAmount) * 100)
            : 0,
        saleSharePctOfGross: pctOf(bucket.saleAmount, totals.periodGrossSales),
        bundleDiscountPctOfGross: pctOf(bucket.bundleDiscount, totals.periodGrossSales),
        bundleDiscountSharePct: pctOf(bucket.bundleDiscount, totals.bundleDiscount),
      }
    })
    .filter((row) => row.qty > 0 || row.saleAmount > 0 || row.bundleDiscount > 0)

  return { rows, totals, byKind }
}
