/**
 * 매출 관리 조회 결과 — 탭 전환으로 컴포넌트가 remount 되어도 복구.
 * (Next App Router + keep-alive element 캐시만으로는 fiber state가 비는 경우가 있음)
 */

import type {
  PosSalesByPromoResult,
  PosSalesPaymentBreakdown,
  PosSalesPeriodRow,
  PosDeliveryAppReconcileResult,
  PosKbankQrReconcileResult,
  PosCardReconcileResult,
  PosCashReconcileResult,
} from "@/lib/api-client"
import type {
  MomDayCompareRow,
  SalesForecastSummary,
  YoyMonthCompareRow,
} from "@/lib/pos-sales-forecast-compare"

export type SalesManagementViewCache = {
  analyticsParamKey: string
  periodData: {
    label: string
    key: string
    sales: number
    count?: number
    subtotal?: number
    vat?: number
    discount?: number
    service?: number
    total?: number
    guestSum?: number
    dineInOrderCount?: number
    dineInTotal?: number
    dineInGuestSum?: number
    salesPerDineInOrder?: number
    salesPerGuest?: number
    salesPerOrder?: number
    cashSales?: number
    creditSales?: number
    qrSales?: number
    otherSales?: number
    deliveryAppSales?: number
  }[]
  periodSplitSeries: Record<string, PosSalesPeriodRow[]> | null
  periodTruncated: boolean
  deliveryAppData: {
    items: {
      channelKey: string
      sales: number
      pct: number
      platforms?: { code: string; sales: number; pct: number }[]
    }[]
    total: number
  }
  deliveryAppReconcileData: PosDeliveryAppReconcileResult
  kbankQrReconcileData?: PosKbankQrReconcileResult
  cardReconcileData?: PosCardReconcileResult
  cashReconcileData?: PosCashReconcileResult
  channelData: { channelKey: string; sales: number }[]
  menuData: { name: string; qty: number; sales: number }[]
  promoBundleData: PosSalesByPromoResult
  paymentData: { paymentKey: string; sales: number }[]
  paymentBreakdownData: PosSalesPaymentBreakdown
  storeData: {
    storeName: string
    count: number
    subtotal: number
    vat: number
    discount?: number
    service?: number
    total: number
    guestSum?: number
    dineInOrderCount?: number
    dineInTotal?: number
    dineInGuestSum?: number
    salesPerDineInOrder?: number
    salesPerGuest?: number
    salesPerOrder?: number
  }[]
  yoyCompareRows: YoyMonthCompareRow[]
  momCompareRows: MomDayCompareRow[]
  forecastSummary: SalesForecastSummary | null
  forecastLookbackRows: PosSalesPeriodRow[]
  forecastActualRows: PosSalesPeriodRow[]
  summaryCards: { current: number; prevRange: number; prevWeek: number }
  cancelReasonSummary: {
    lineRows: { reason: string; count: number; amount: number }[]
    orderRows: { reason: string; count: number; amount: number }[]
    lineTotalCount: number
    lineTotalAmount: number
    orderTotalCount: number
    orderTotalAmount: number
    truncated: boolean
  }
}

let viewCache: SalesManagementViewCache | null = null

export function saveSalesManagementViewCache(snapshot: SalesManagementViewCache): void {
  viewCache = snapshot
}

export function readSalesManagementViewCache(
  analyticsParamKey: string
): SalesManagementViewCache | null {
  if (!viewCache) return null
  if (viewCache.analyticsParamKey !== analyticsParamKey) return null
  return viewCache
}

export function clearSalesManagementViewCache(): void {
  viewCache = null
}
