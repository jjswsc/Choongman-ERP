import type { PosMenuCostIndexEntry } from '@/lib/pos-menu-cost-index-server'
import type { PosSalesCombinedDiscountResult } from '@/lib/pos-sales-combined-discount-aggregate'
import {
  aggregatePosSalesPaymentDiscount,
} from '@/lib/pos-sales-payment-discount-aggregate'
import {
  aggregatePosSalesPromoBundleDiscount,
} from '@/lib/pos-sales-promo-discount-aggregate'
import { buildPosSalesCombinedDiscount } from '@/lib/pos-sales-combined-discount-aggregate'
import type { PromoPricingCatalog } from '@/lib/pos-order-promo-regular-price'
import {
  aggregateTheoreticalCostFromOrders,
  buildTheoreticalCostResolveContext,
  collectTheoreticalCostUnmatchedLines,
  isDeliveryChannelOrderType,
  MANAGEMENT_MARGIN_MISE_RATE,
  type TheoreticalCostUnmatchedLine,
} from '@/lib/management-margin-theoretical-cost'
import {
  resolvePosOrderSalesExclVat,
  toPosCostSalesExclVat,
} from '@/lib/pos-cost-vat'

export type ManagementMarginChannelKey = 'dine_in' | 'takeout' | 'delivery' | 'other'

export type ManagementMarginChannelRow = {
  channel: ManagementMarginChannelKey
  orderCount: number
  netSales: number
  bundleDiscount: number
  paymentDiscount: number
  totalDiscount: number
  foodCost: number
  packagingCost: number
  totalCost: number
  contributionMargin: number
  costPctOfNet: number
}

export type ManagementMarginPosSlice = {
  grossSalesBeforeDiscount: number
  netSales: number
  bundleDiscount: number
  paymentDiscount: number
  totalDiscount: number
  periodOrderCount: number
  combined: PosSalesCombinedDiscountResult
  theoreticalCost: {
    foodCost: number
    packagingCost: number
    totalCost: number
    matchedLineQty: number
    unmatchedLineQty: number
    bomUnmatchedLines: TheoreticalCostUnmatchedLine[]
    costPctOfGross: number
    costPctOfNet: number
    miseRatePercent: number
  }
  byChannel: ManagementMarginChannelRow[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function pctOf(part: number, whole: number): number {
  if (whole <= 0.0001) return 0
  return round2((part / whole) * 100)
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

export function resolveManagementMarginChannel(orderType: string | undefined): ManagementMarginChannelKey {
  const t = str(orderType).toLowerCase().replace(/-/g, '_')
  if (t === 'dine_in' || t === '') return 'dine_in'
  if (t === 'takeout') return 'takeout'
  if (t === 'delivery' || isDeliveryChannelOrderType(orderType)) return 'delivery'
  return 'other'
}

type OrderRow = {
  order_type?: string
  items_json?: string
  total?: number
  vat?: number
  discount_amt?: number
  coupon_discount_amt?: number
}

function sumOrdersSalesExclVat(rows: OrderRow[]): number {
  return round2(rows.reduce((s, o) => s + resolvePosOrderSalesExclVat(o), 0))
}

export function buildManagementMarginPosSlice(params: {
  orderRows: OrderRow[]
  catalog: PromoPricingCatalog
  costIndex: Map<string, PosMenuCostIndexEntry>
  miseRatePercent?: number
}): ManagementMarginPosSlice {
  const mise = params.miseRatePercent ?? MANAGEMENT_MARGIN_MISE_RATE
  const bundle = aggregatePosSalesPromoBundleDiscount({
    orderRows: params.orderRows,
    catalog: params.catalog,
  })
  const payment = aggregatePosSalesPaymentDiscount({ orderRows: params.orderRows })
  const combined = buildPosSalesCombinedDiscount({
    periodGrossSales: bundle.totals.periodGrossSales,
    periodOrderCount: bundle.totals.periodOrderCount,
    bundleDiscount: bundle.totals.bundleDiscount,
    paymentDiscount: payment.totals.discountAmount,
    promoLineSaleAmount: bundle.totals.saleAmount,
    paymentOrderCountWithDiscount: payment.totals.orderCountWithDiscount,
    bundleByKind: bundle.byKind,
    paymentByKind: payment.byKind,
  })

  /** 순매출·할인 분모는 부가세 제외(원가·계산기와 동일). 할인 집계 원천 periodGrossSales는 VAT 포함. */
  const netSales = sumOrdersSalesExclVat(params.orderRows)
  const totalDiscount = toPosCostSalesExclVat(combined.totals.totalDiscount)
  const grossBefore = round2(netSales + totalDiscount)

  const resolveContext = buildTheoreticalCostResolveContext({
    costIndex: params.costIndex,
    catalog: params.catalog,
  })

  const theory = aggregateTheoreticalCostFromOrders({
    orderRows: params.orderRows,
    costIndex: params.costIndex,
    miseRatePercent: mise,
    resolveContext,
  })
  const bomUnmatchedLines = collectTheoreticalCostUnmatchedLines({
    orderRows: params.orderRows,
    costIndex: params.costIndex,
    resolveContext,
  })

  const channelKeys: ManagementMarginChannelKey[] = ['dine_in', 'takeout', 'delivery', 'other']
  const byChannelOrders = new Map<ManagementMarginChannelKey, OrderRow[]>()
  for (const k of channelKeys) byChannelOrders.set(k, [])
  for (const o of params.orderRows) {
    const ch = resolveManagementMarginChannel(o.order_type)
    byChannelOrders.get(ch)!.push(o)
  }

  const byChannel: ManagementMarginChannelRow[] = channelKeys.map((channel) => {
    const rows = byChannelOrders.get(channel) || []
    const chBundle = aggregatePosSalesPromoBundleDiscount({ orderRows: rows, catalog: params.catalog })
    const chPayment = aggregatePosSalesPaymentDiscount({ orderRows: rows })
    const chNet = sumOrdersSalesExclVat(rows)
    const chBundleDisc = toPosCostSalesExclVat(chBundle.totals.bundleDiscount)
    const chPayDisc = toPosCostSalesExclVat(chPayment.totals.discountAmount)
    const chTotalDisc = round2(chBundleDisc + chPayDisc)
    const chTheory = aggregateTheoreticalCostFromOrders({
      orderRows: rows,
      costIndex: params.costIndex,
      miseRatePercent: mise,
      resolveContext,
    })
    const contribution = round2(chNet - chTheory.totalCost)
    return {
      channel,
      orderCount: rows.length,
      netSales: chNet,
      bundleDiscount: chBundleDisc,
      paymentDiscount: chPayDisc,
      totalDiscount: chTotalDisc,
      foodCost: chTheory.foodCost,
      packagingCost: chTheory.packagingCost,
      totalCost: chTheory.totalCost,
      contributionMargin: contribution,
      costPctOfNet: pctOf(chTheory.totalCost, chNet),
    }
  }).filter((r) => r.orderCount > 0 || r.netSales > 0)

  return {
    grossSalesBeforeDiscount: grossBefore,
    netSales,
    bundleDiscount: toPosCostSalesExclVat(combined.totals.bundleDiscount),
    paymentDiscount: toPosCostSalesExclVat(combined.totals.paymentDiscount),
    totalDiscount,
    periodOrderCount: combined.totals.periodOrderCount,
    combined,
    theoreticalCost: {
      ...theory,
      bomUnmatchedLines,
      costPctOfGross: pctOf(theory.totalCost, grossBefore),
      costPctOfNet: pctOf(theory.totalCost, netSales),
      miseRatePercent: mise,
    },
    byChannel,
  }
}

export type ManagementMarginMomDelta = {
  label: string
  current: number
  prior: number
  diff: number
  diffPct: number | null
}

export function buildMomDelta(label: string, current: number, prior: number): ManagementMarginMomDelta {
  const cur = round2(current)
  const prv = round2(prior)
  const diff = round2(cur - prv)
  const diffPct = prv > 0.0001 ? pctOf(diff, prv) : null
  return { label, current: cur, prior: prv, diff, diffPct }
}
