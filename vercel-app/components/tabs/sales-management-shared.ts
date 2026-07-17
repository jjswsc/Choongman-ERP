import { i18n } from "@/lib/i18n"
import type { PosSalesByPromoResult, PosSalesPeriodRow, PosSalesPromoAggregateTotals } from "@/lib/api-client"
import { translatePeriodAxisLabel } from "@/lib/sales-analytics-labels"
import { rowMatchesSalesStoreSelection } from "@/lib/pos-sales-store-filter"
import type { PosOrderTypeValue } from "@/lib/pos-sales-order-type-filter"
import type { PeriodGroupValue } from "./sales-management-ia"

/** 번역 누락 시 주제·힌트 라벨 폴백 (ko 기준) */
export const I18N_KO = i18n.ko as Record<string, string>

export const PERIOD_GROUP = [
  { value: "year", labelKey: "salesPeriodYear" },
  { value: "month", labelKey: "salesPeriodMonth" },
  { value: "week", labelKey: "salesPeriodWeek" },
  { value: "day", labelKey: "salesPeriodDay" },
  { value: "hour", labelKey: "salesPeriodHour" },
  { value: "dow", labelKey: "salesPeriodDow" },
] as const

export const PERIOD_GROUP_VALUES = new Set(PERIOD_GROUP.map((g) => g.value))

export type PeriodPaymentField =
  | "cashSales"
  | "creditSales"
  | "qrSales"
  | "otherSales"
  | "deliveryAppSales"

export const PERIOD_PAYMENT_COLUMNS: {
  field: PeriodPaymentField
  labelKey: string
  fallback: string
}[] = [
  { field: "cashSales", labelKey: "salesPayCash", fallback: "현금" },
  { field: "creditSales", labelKey: "salesPayCard", fallback: "카드" },
  { field: "qrSales", labelKey: "salesPayQr", fallback: "QR" },
  { field: "deliveryAppSales", labelKey: "salesPayDeliveryApp", fallback: "배달앱" },
  { field: "otherSales", labelKey: "salesPayOther", fallback: "기타" },
]

export type PeriodPaymentRow = Partial<Record<PeriodPaymentField, number>>

export const SALES_ORDER_TYPE_TOGGLES: {
  type: PosOrderTypeValue
  labelKey: string
  fallback: string
}[] = [
  { type: "dine_in", labelKey: "salesAmountKindDineIn", fallback: "홀" },
  { type: "takeout", labelKey: "salesAmountKindTakeout", fallback: "포장" },
  { type: "delivery", labelKey: "salesAmountKindDelivery", fallback: "배달" },
]

export type SalesFilterPreset = {
  id: string
  name: string
  stores: string[]
  periodGroup: PeriodGroupValue
  orderTypesKey: string
  activeSubMenuId: string
  selectedTopicId: string
  menuSearch: string
  menuSearchAnd: boolean
  compareStores: boolean
}

export const SALES_FILTER_PRESET_STORAGE_KEY = "cm-sales-filter-presets-v1"

export type StoreSalesAggregateRow = {
  storeName: string
  count: number
  subtotal: number
  vat: number
  discount?: number
  service?: number
  total: number
}

export const EMPTY_POS_SALES_PROMO_TOTALS: PosSalesPromoAggregateTotals = {
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

export const EMPTY_POS_SALES_BY_PROMO: PosSalesByPromoResult = {
  rows: [],
  totals: EMPTY_POS_SALES_PROMO_TOTALS,
  byKind: [],
  payment: {
    rows: [],
    totals: {
      discountAmount: 0,
      orderCountWithDiscount: 0,
      periodGrossSales: 0,
      periodOrderCount: 0,
      discountPctOfGross: 0,
    },
    byKind: [],
  },
  combined: {
    totals: {
      periodGrossSales: 0,
      periodOrderCount: 0,
      bundleDiscount: 0,
      paymentDiscount: 0,
      totalDiscount: 0,
      bundleDiscountPctOfGross: 0,
      paymentDiscountPctOfGross: 0,
      totalDiscountPctOfGross: 0,
      promoLineSaleSharePct: 0,
      promoLineSaleAmount: 0,
      paymentOrderSharePct: 0,
    },
    byKind: [],
  },
  truncated: false,
}

export function periodPaymentAmount(row: PeriodPaymentRow, field: PeriodPaymentField) {
  return Number(row[field] ?? 0) || 0
}

export function formatSalesAmount(n: number) {
  const v = Number(n ?? 0)
  if (!Number.isFinite(v)) return "0"
  return Math.round(v).toLocaleString()
}

export function formatSalesPct(n: number) {
  const v = Number(n ?? 0)
  if (!Number.isFinite(v)) return "0.0%"
  return `${v.toFixed(1)}%`
}

export function normalizeStoreCodes(values: string[]): string[] {
  return [...new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  )
}

export function filterStoreRowsBySalesSelection<T extends { storeName: string }>(
  rows: T[],
  stores: string[] | undefined
): T[] {
  if (!stores?.length) return rows
  return rows.filter((r) =>
    stores.some((code) => rowMatchesSalesStoreSelection(r.storeName, code))
  )
}

export function sumStoreSalesTotals(rows: StoreSalesAggregateRow[]) {
  return rows.reduce(
    (acc, r) => ({
      subtotal: acc.subtotal + Number(r.subtotal ?? 0),
      vat: acc.vat + Number(r.vat ?? 0),
      discount: acc.discount + Number(r.discount ?? 0),
      service: acc.service + Number(r.service ?? 0),
      total: acc.total + Number(r.total ?? 0),
    }),
    { subtotal: 0, vat: 0, discount: 0, service: 0, total: 0 }
  )
}

/**
 * 순매출 워터폴 시작액(할인·서비스 차감 전).
 * VAT included 모드에서 subtotal·total은 이미 세포함이고 vat는 분해액이므로
 * subtotal+vat 하면 세금이 이중으로 더해진다. total+discount+service 가 항등식.
 */
export function salesWaterfallGross(parts: {
  total: number
  discount: number
  service: number
}): number {
  return Number(parts.total) + Number(parts.discount) + Number(parts.service)
}

export function mapPosSalesPeriodRowToChartRow(
  r: Partial<PosSalesPeriodRow> & Pick<PosSalesPeriodRow, "label" | "key">,
  periodGroup: PeriodGroupValue,
  tr: (key: string, fallback: string) => string
) {
  const total = r.total ?? r.sales ?? 0
  const count = r.count ?? 0
  const guestSum = r.guestSum ?? 0
  const dineInOrderCount = r.dineInOrderCount ?? 0
  const dineInGuestSum = r.dineInGuestSum ?? 0
  const dineInTotal = r.dineInTotal ?? 0
  const legacyBreakdown =
    r.dineInOrderCount === undefined &&
    r.dineInGuestSum === undefined &&
    r.dineInTotal === undefined
  const hallGuestSum = legacyBreakdown ? guestSum : dineInGuestSum

  const salesPerDineInOrder =
    dineInOrderCount > 0
      ? r.salesPerDineInOrder != null && r.salesPerDineInOrder > 0
        ? r.salesPerDineInOrder
        : Math.round((dineInTotal / dineInOrderCount) * 100) / 100
      : 0

  let salesPerGuestHall = 0
  if (dineInGuestSum > 0 && dineInTotal > 0) {
    salesPerGuestHall =
      r.salesPerGuest != null && r.salesPerGuest > 0
        ? r.salesPerGuest
        : Math.round((dineInTotal / dineInGuestSum) * 100) / 100
  } else if (legacyBreakdown && hallGuestSum > 0 && total > 0) {
    salesPerGuestHall =
      r.salesPerGuest != null && r.salesPerGuest > 0
        ? r.salesPerGuest
        : Math.round((total / hallGuestSum) * 100) / 100
  }

  const salesPerOrder =
    count > 0
      ? r.salesPerOrder != null
        ? r.salesPerOrder
        : Math.round((total / count) * 100) / 100
      : 0

  return {
    label: r.label,
    key: r.key,
    sales: r.sales ?? total,
    count,
    subtotal: r.subtotal ?? 0,
    vat: r.vat ?? 0,
    discount: r.discount ?? 0,
    service: r.service ?? 0,
    total,
    guestSum,
    hallGuestSum,
    dineInOrderCount,
    dineInTotal,
    dineInGuestSum,
    salesPerDineInOrder,
    salesPerGuestHall,
    salesPerOrder,
    cashSales: Number(r.cashSales ?? 0) || 0,
    creditSales: Number(r.creditSales ?? 0) || 0,
    qrSales: Number(r.qrSales ?? 0) || 0,
    otherSales: Number(r.otherSales ?? 0) || 0,
    deliveryAppSales: Number(r.deliveryAppSales ?? 0) || 0,
    axisLabel: translatePeriodAxisLabel(r, periodGroup, tr),
  }
}

export function resolveDefaultSalesLanding(pathname: string): {
  menuId: string
  topicId: string
  periodGroup: PeriodGroupValue
} {
  const p = String(pathname || "")
  if (p.startsWith("/admin/")) {
    return {
      menuId: "sales-compare",
      topicId: "compare-store-summary",
      periodGroup: "month",
    }
  }
  return {
    menuId: "sales-analysis",
    topicId: "analysis-period",
    periodGroup: "day",
  }
}
