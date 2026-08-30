/**
 * 매출 관리 조회 결과 — 탭 전환으로 컴포넌트가 remount 되어도 복구.
 * (Next App Router + keep-alive element 캐시만으로는 fiber state가 비는 경우가 있음)
 *
 * 필터와 결과를 함께 저장한다. 키 일치 여부와 무관하게 마지막 성공 조회를 복구한다.
 */

import { createErpQueryViewCache } from "@/lib/erp-query-view-cache"
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
  ForecastHorizon,
  MomDayCompareRow,
  SalesForecastSummary,
  YoyMonthCompareRow,
} from "@/lib/pos-sales-forecast-compare"

export type SalesManagementViewCache = {
  analyticsParamKey: string
  startStr: string
  endStr: string
  selectedStores: string[]
  periodGroup: "year" | "month" | "week" | "day" | "hour" | "dow"
  orderTypesKey: string
  dowsKey: string
  compareStores: boolean
  menuSearch: string
  menuSearchAnd: boolean
  activeSubMenuId: string
  selectedTopicBySubMenu: Record<string, string>
  forecastHorizon: ForecastHorizon
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
}

export const salesManagementViewCache = createErpQueryViewCache<SalesManagementViewCache>()

export function saveSalesManagementViewCache(snapshot: SalesManagementViewCache): void {
  if (!snapshot.analyticsParamKey) return
  salesManagementViewCache.save(snapshot)
}

export function readSalesManagementViewCache(
  analyticsParamKey?: string
): SalesManagementViewCache | null {
  const snap = salesManagementViewCache.read()
  if (!snap) return null
  if (analyticsParamKey && snap.analyticsParamKey !== analyticsParamKey) return null
  return snap
}

export function clearSalesManagementViewCache(): void {
  salesManagementViewCache.clear()
}
