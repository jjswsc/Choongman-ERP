"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import {
  isFranchiseeRole,
  isManagerRole,
  canSelectAllStoresForPosSalesManagement,
} from "@/lib/permissions"
import {
  canFranchiseeAggregateAllowedStores,
  resolveFranchiseePosSalesFetchStoreCodes,
} from "@/lib/franchisee-multi-store"
import { useStoreView } from "@/lib/store-view-context"
import {
  parseOrderTypesParam,
  normalizeOrderTypesQueryString,
  type PosOrderTypeValue,
} from "@/lib/pos-sales-order-type-filter"
import {
  parseDowsParam,
  normalizeDowsQueryString,
  type PosSalesDowValue,
} from "@/lib/pos-sales-dow-filter"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useLang } from "@/lib/lang-context"
import { useOnlineStatus } from "@/lib/offline"
import { useT, i18n, tOr } from "@/lib/i18n"
import { useErpPageActive, useErpPageActiveRef, useErpRefetchOnActivate } from "@/lib/erp-page-visibility"
import {
  readSalesManagementViewCache,
  saveSalesManagementViewCache,
} from "@/lib/sales-management-view-cache"
import {
  downloadSalesManagementXlsx,
} from "@/lib/sales-management-excel-export"
import {
  translatePeriodAxisLabel,
  translateChannelKey,
  translatePaymentKey,
  translateDeliveryAppCode,
  translateDeliveryPaymentChannelKey,
  translateCreditPaymentChannelKey,
} from "@/lib/sales-analytics-labels"
import {
  getAdminVendors,
  getPosSalesFilterOptions,
  getPosSalesByPeriod,
  getPosSalesByDeliveryApp,
  getPosDeliveryAppReconcile,
  type PosDeliveryAppReconcileResult,
  getPosKbankQrReconcile,
  type PosKbankQrReconcileResult,
  getPosCardReconcile,
  type PosCardReconcileResult,
  getPosCashReconcile,
  type PosCashReconcileResult,
  getPosSalesByChannel,
  getPosSalesByMenu,
  getPosSalesByPromo,
  type PosSalesByPromoResult,
  type PosSalesPromoAggregateTotals,
  getPosSalesByPaymentBreakdown,
  type PosSalesPaymentBreakdown,
  getPosSalesByStore,
  getPosSalesByStoreChannel,
  getPosSalesByStoreDeliveryPlatform,
  type PosSalesStoreDeliveryPlatformRow,
  type PosSalesPeriodRow,
} from "@/lib/api-client"
import { SalesPosBusinessDaySettings } from "@/components/tabs/sales-pos-business-day-settings"
import {
  SalesCombinedDiscountPanel,
  SalesDiscountAnalyticsShell,
  SalesPaymentDiscountPanel,
  SalesPromoBundleDiscountPanel,
} from "@/components/tabs/sales-discount-analytics-panel"
import { useSalesDiscountDrillSheet } from "@/components/tabs/sales-discount-drill-sheet"
import { useSalesCashOrderDrillSheet } from "@/components/tabs/sales-cash-order-drill-sheet"
import { ADMIN_BTN_XS_CN, ADMIN_PANEL_WARNING_CN, ERP_NUMERIC_CHART_TICK } from "@/lib/admin-ui-standards"
import {
  mergePeriodSeriesToAggregated,
  periodRowsForStoreSelection,
  resolvePeriodSeriesStoreKey,
} from "@/lib/pos-sales-period-aggregate"
import {
  collectPosSalesPaymentTenderGaps,
  type PosSalesPaymentTenderGapItem,
} from "@/lib/pos-sales-payment-tender-gap"
import { rowMatchesSalesStoreSelection } from "@/lib/pos-sales-store-filter"
import { filterPosSalesStoreOptionsForManagement } from "@/lib/pos-sales-test-office"
import { todayStrBangkok, diffDaysInclusiveBangkok } from "@/lib/attendance-utils"
import { addDaysYmd } from "@/lib/pos-business-day"
import {
  buildMomDayCompareRows,
  buildYoyMonthCompareRows,
  computeSalesForecast,
  monthRangeYmd,
  parseYearFromYmd,
  parseYearMonthFromYmd,
  prevCalendarMonth,
  resolveForecastFetchPlan,
  sumPeriodRowTotals,
  yearRangeYmd,
  type ForecastHorizon,
  type MomDayCompareRow,
  type SalesForecastSummary,
  type YoyMonthCompareRow,
} from "@/lib/pos-sales-forecast-compare"
import {
  SalesForecastPanel,
  SalesMomComparePanel,
  SalesYoyComparePanel,
} from "@/components/tabs/sales-forecast-report-panels"
import {
  SALES_IA,
  PERIOD_GROUP_TOPIC_VIEWS,
  type PeriodGroupValue,
} from "@/components/tabs/sales-management-ia"
import { SalesOverviewPanel } from "@/components/tabs/sales-overview-panel"
import {
  SalesChannelReconcilePanel,
  type ChannelReconcileSection,
} from "@/components/tabs/sales-channel-reconcile-panel"
import {
  EMPTY_POS_DELIVERY_APP_RECONCILE,
} from "@/components/tabs/sales-delivery-app-reconcile-panel"
import { EMPTY_POS_KBANK_QR_RECONCILE } from "@/components/tabs/sales-kbank-qr-reconcile-panel"
import { EMPTY_POS_CARD_RECONCILE } from "@/components/tabs/sales-card-reconcile-panel"
import { EMPTY_POS_CASH_RECONCILE } from "@/components/tabs/sales-cash-reconcile-panel"
import {
  EMPTY_POS_SALES_BY_PROMO,
  formatSalesAmount,
  formatSalesPct,
  filterStoreRowsBySalesSelection,
  I18N_KO,
  mapPosSalesPeriodRowToChartRow,
  normalizeStoreCodes,
  PERIOD_GROUP,
  PERIOD_GROUP_VALUES,
  resolveDefaultSalesLanding,
  resolveSalesPeriodGroupForFastQuery,
  isSalesHeavyTopicSkippedOnLongRange,
  isSalesLongRangeQuery,
  SALES_FILTER_PRESET_STORAGE_KEY,
  SALES_ORDER_TYPE_TOGGLES,
  salesWaterfallGross,
  sumStoreSalesTotals,
  type SalesFilterPreset,
  type StoreSalesAggregateRow,
} from "@/components/tabs/sales-management-shared"
import { SalesManagementSummaryInsights } from "@/components/tabs/sales-management-summary-insights"
import { buildSalesExcelSheets } from "@/components/tabs/sales-management-excel-sheets"
import { buildPosStoreDisplayNameLookup, resolvePosStoreDisplayName } from "@/lib/pos-store-display-name"
import {
  getPosSalesFilterOptionsWithCache,
  getPosSalesByPeriodWithCache,
  getPosSalesByDeliveryAppWithCache,
  getPosSalesByChannelWithCache,
  getPosSalesByMenuWithCache,
  getPosSalesByPromoWithCache,
  getPosSalesByPaymentBreakdownWithCache,
  getPosSalesByStoreWithCache,
  getPosSalesByStoreChannelWithCache,
  getPosSalesByStoreDeliveryPlatformWithCache,
} from "@/lib/offline/sales-analytics-offline"
import { SalesManagementQueryBar } from "@/components/tabs/sales-management-query-bar"
import { SalesManagementNavPickerMobile } from "@/components/tabs/sales-management-nav-picker-mobile"
import { SalesManagementFiltersMobile } from "@/components/tabs/sales-management-filters-mobile"
import { SalesManagementFiltersDesktop } from "@/components/tabs/sales-management-filters-desktop"
import { SalesPeriodView } from "@/components/tabs/sales-management-period-view"
import { SalesStorePeriodView } from "@/components/tabs/sales-management-store-period-view"
import { SalesDeliveryView } from "@/components/tabs/sales-management-delivery-view"
import { SalesChannelView } from "@/components/tabs/sales-management-channel-view"
import { SalesMenuView } from "@/components/tabs/sales-management-menu-view"
import { SalesStoreView } from "@/components/tabs/sales-management-store-view"
import { SalesStoreCategoryView } from "@/components/tabs/sales-management-store-category-view"
import { SalesPaymentView } from "@/components/tabs/sales-management-payment-view"

export interface SalesManagementTabProps {
  /** POS용: 오프라인 시 캐시 사용, 온라인 시 API 호출 후 캐시 저장 */
  offlineAware?: boolean
}

export function SalesManagementTab(props: SalesManagementTabProps = {}) {
  const { offlineAware = false } = props
  const { lang } = useLang()
  const t = useT(lang)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const pageActive = useErpPageActive()
  const pageActiveRef = useErpPageActiveRef()
  /** soft 탭일 때 usePathname은 다른 메뉴를 가리키므로 URL 동기화는 hard 라우트일 때만 */
  const onSalesRoute = (pathname || "").startsWith("/admin/sales-management")
  const allowSalesUrlSync = pageActive && onSalesRoute
  const isHoursPanel = searchParams.get("hours") === "1"
  const { auth } = useAuth()
  const { viewStore } = useStoreView()
  const canSearchAll = canSelectAllStoresForPosSalesManagement(
    auth?.role || "",
    auth?.store || ""
  )
  const canFranchiseeMultiStore = canFranchiseeAggregateAllowedStores(
    auth?.role,
    auth?.allowedStores,
    auth?.store
  )
  const canMultiStorePicker = canSearchAll || canFranchiseeMultiStore
  const canEditPosBizDayStore = React.useMemo(() => {
    const r = String(auth?.role || "").toLowerCase()
    return isManagerRole(r) || isFranchiseeRole(r)
  }, [auth?.role])
  const defaultLanding = React.useMemo(() => resolveDefaultSalesLanding(pathname), [pathname])
  /** 방콕 달력 기준(브라우저/UTC `toISOString`·로컬 `getMonth` 사용 안 함) */
  const today = React.useMemo(() => todayStrBangkok(), [])
  const monthStart = React.useMemo(() => `${today.slice(0, 7)}-01`, [today])

  const [startStr, setStartStr] = React.useState(monthStart)
  const [endStr, setEndStr] = React.useState(today)
  const [selectedStores, setSelectedStores] = React.useState<string[]>([])
  const [posOptions, setPosOptions] = React.useState<string[]>([])
  const [posOptionsLoading, setPosOptionsLoading] = React.useState(false)
  const [posOptionsLoadFailed, setPosOptionsLoadFailed] = React.useState(false)
  const posBizDayStoreChoices = React.useMemo(() => {
    const raw = canSearchAll
      ? posOptions
      : (() => {
          const out: string[] = []
          const main = String(auth?.store || "").trim()
          if (main) out.push(main)
          for (const x of auth?.allowedStores || []) {
            const s = String(x || "").trim()
            if (s && !out.includes(s)) out.push(s)
          }
          return out
        })()
    return filterPosSalesStoreOptionsForManagement(raw)
  }, [canSearchAll, posOptions, auth?.store, auth?.allowedStores])
  const [loading, setLoading] = React.useState(false)
  /** 조회 실패를 매출 0으로 보여 주지 않기 위한 메시지. 성공 시 빈 문자열. */
  const [salesQueryError, setSalesQueryError] = React.useState("")
  /** 마지막으로「조회」로 성공 적용된 필터 키(자동 로드 없음; 키가 바뀌면 결과 비움) */
  const [fetchedAnalyticsKey, setFetchedAnalyticsKey] = React.useState("")
  const fetchedAnalyticsKeyRef = React.useRef(fetchedAnalyticsKey)
  fetchedAnalyticsKeyRef.current = fetchedAnalyticsKey
  const [periodGroup, setPeriodGroup] = React.useState<PeriodGroupValue>(defaultLanding.periodGroup)
  const isLongRangeSalesQuery = React.useMemo(
    () => isSalesLongRangeQuery(startStr, endStr),
    [startStr, endStr]
  )
  const periodGroupUi = React.useMemo(
    () => resolveSalesPeriodGroupForFastQuery(periodGroup, isLongRangeSalesQuery),
    [periodGroup, isLongRangeSalesQuery]
  )
  const [menuSearch, setMenuSearch] = React.useState("")
  const [storeSearch, setStoreSearch] = React.useState("")
  const [storePickerOpen, setStorePickerOpen] = React.useState(false)
  const storePickerRef = React.useRef<HTMLDivElement | null>(null)
  /** 본사: URL·프리셋으로 매장 0개를 유지할 때만 true(자동 전체 선택·URL 복원 억제) */
  const skipDefaultStoreAutoSelectRef = React.useRef(false)
  const defaultStoresHydratedRef = React.useRef(false)
  /** 빈 문자열 = 매출액 종류 전체(필터 없음) */
  const [orderTypesKey, setOrderTypesKey] = React.useState("")
  /** 빈 문자열 = 요일 전체. `5,6` = 금·토 (0=일…6=토) */
  const [dowsKey, setDowsKey] = React.useState("")
  const [compareStores, setCompareStores] = React.useState(false)
  const [periodSplitSeries, setPeriodSplitSeries] = React.useState<Record<string, PosSalesPeriodRow[]> | null>(null)
  const [periodTruncated, setPeriodTruncated] = React.useState(false)
  const [menuSearchAnd, setMenuSearchAnd] = React.useState(false)
  const storePickerListId = React.useId()
  const storePickerBtnId = React.useId()
  const [salesNavPickerOpen, setSalesNavPickerOpen] = React.useState(false)
  const [salesNavQuery, setSalesNavQuery] = React.useState("")
  const salesNavPickerRef = React.useRef<HTMLDivElement | null>(null)
  const salesNavPickerBtnId = React.useId()
  const salesNavPickerListId = React.useId()
  const [orderTypesPickerOpen, setOrderTypesPickerOpen] = React.useState(false)
  const [orderTypesQuery, setOrderTypesQuery] = React.useState("")
  const orderTypesPickerRef = React.useRef<HTMLDivElement | null>(null)
  const orderTypesPickerBtnId = React.useId()
  const orderTypesPickerListId = React.useId()
  const [periodPickerOpen, setPeriodPickerOpen] = React.useState(false)
  const [periodQuery, setPeriodQuery] = React.useState("")
  const periodPickerRef = React.useRef<HTMLDivElement | null>(null)
  const periodPickerBtnId = React.useId()
  const periodPickerListId = React.useId()

  const [activeSubMenuId, setActiveSubMenuId] = React.useState<string>(defaultLanding.menuId)
  const [selectedTopicBySubMenu, setSelectedTopicBySubMenu] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      SALES_IA.map((menu) => [
        menu.id,
        menu.id === defaultLanding.menuId ? defaultLanding.topicId : menu.topics[0]?.id ?? "",
      ])
    )
  )

  const [periodData, setPeriodData] = React.useState<
    {
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
  >([])
  const [deliveryAppData, setDeliveryAppData] = React.useState<{
    items: {
      channelKey: string
      sales: number
      pct: number
      platforms?: { code: string; sales: number; pct: number }[]
    }[]
    total: number
  }>({ items: [], total: 0 })
  const [deliveryAppReconcileData, setDeliveryAppReconcileData] =
    React.useState<PosDeliveryAppReconcileResult>(EMPTY_POS_DELIVERY_APP_RECONCILE)
  const [kbankQrReconcileData, setKbankQrReconcileData] =
    React.useState<PosKbankQrReconcileResult>(EMPTY_POS_KBANK_QR_RECONCILE)
  const [cardReconcileData, setCardReconcileData] =
    React.useState<PosCardReconcileResult>(EMPTY_POS_CARD_RECONCILE)
  const [cashReconcileData, setCashReconcileData] =
    React.useState<PosCashReconcileResult>(EMPTY_POS_CASH_RECONCILE)
  const [channelReconcileSection, setChannelReconcileSection] =
    React.useState<ChannelReconcileSection>("delivery")
  const [channelData, setChannelData] = React.useState<{ channelKey: string; sales: number }[]>([])
  const [storeChannelData, setStoreChannelData] = React.useState<
    { storeName: string; dineIn: number; takeout: number; delivery: number }[]
  >([])
  const [storeDeliveryPlatformData, setStoreDeliveryPlatformData] = React.useState<
    PosSalesStoreDeliveryPlatformRow[]
  >([])
  const [menuData, setMenuData] = React.useState<{ name: string; qty: number; sales: number }[]>([])
  const [promoBundleData, setPromoBundleData] = React.useState<PosSalesByPromoResult>(EMPTY_POS_SALES_BY_PROMO)
  const [paymentData, setPaymentData] = React.useState<{ paymentKey: string; sales: number; label?: string }[]>([])
  const [paymentBreakdownData, setPaymentBreakdownData] = React.useState<PosSalesPaymentBreakdown>({
    deliveryByChannel: [],
    deliveryTotal: 0,
    creditByChannel: [],
    creditTotal: 0,
    summary: [],
  })
  const [storeData, setStoreData] = React.useState<
    {
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
  >([])
  const [savedPresets, setSavedPresets] = React.useState<SalesFilterPreset[]>([])
  const [yoyCompareRows, setYoyCompareRows] = React.useState<YoyMonthCompareRow[]>([])
  const [momCompareRows, setMomCompareRows] = React.useState<MomDayCompareRow[]>([])
  const [forecastSummary, setForecastSummary] = React.useState<SalesForecastSummary | null>(null)
  const [forecastHorizon, setForecastHorizon] = React.useState<ForecastHorizon>("month")
  const [forecastLookbackRows, setForecastLookbackRows] = React.useState<PosSalesPeriodRow[]>([])
  const [forecastActualRows, setForecastActualRows] = React.useState<PosSalesPeriodRow[]>([])
  /** 연간 예상용: 해당 연 1/1~기준일 월별 합계(일별 YTD 대신) */
  const [forecastMonthActualTotal, setForecastMonthActualTotal] = React.useState<number | null>(null)
  /** 동일 필터로 한 번 조회한 뒤 주제만 바꿀 때 자동 재조회용 */
  const lastFetchedDataFilterKeyRef = React.useRef("")
  const [summaryCards, setSummaryCards] = React.useState<{
    current: number
    prevRange: number
    prevWeek: number
  }>({ current: 0, prevRange: 0, prevWeek: 0 })

  const tr = React.useCallback((key: string, fallback: string) => tOr(t, key, fallback), [t])

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SALES_FILTER_PRESET_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as SalesFilterPreset[]
      if (!Array.isArray(parsed)) return
      setSavedPresets(parsed.filter((p) => p && typeof p.id === "string" && typeof p.name === "string"))
    } catch {
      setSavedPresets([])
    }
  }, [])

  const persistPresets = React.useCallback((next: SalesFilterPreset[]) => {
    setSavedPresets(next)
    try {
      window.localStorage.setItem(SALES_FILTER_PRESET_STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }, [])

  const [posStoreNameLookup, setPosStoreNameLookup] = React.useState<Map<string, string>>(() => new Map())
  React.useEffect(() => {
    let cancel = false
    getAdminVendors()
      .then((list) => {
        if (cancel) return
        setPosStoreNameLookup(buildPosStoreDisplayNameLookup(list))
      })
      .catch(() => {})
    return () => {
      cancel = true
    }
  }, [])

  const posStoreDisplayName = React.useCallback(
    (code: string) => resolvePosStoreDisplayName(code, posStoreNameLookup),
    [posStoreNameLookup]
  )

  const selectedStoresKey = React.useMemo(
    () => normalizeStoreCodes(selectedStores).join(","),
    [selectedStores]
  )
  const selectedStoresParam = React.useMemo(
    () => (selectedStoresKey ? selectedStoresKey.split(",") : undefined),
    [selectedStoresKey]
  )

  const compareStoreLabel = React.useMemo(() => {
    if ((selectedStoresParam?.length ?? 0) === 1) {
      return posStoreDisplayName(selectedStoresParam![0]!)
    }
    if ((selectedStoresParam?.length ?? 0) > 1) {
      return tr("salesMultiStoreSelected", "선택 매장 합계")
    }
    return tr("salesSelectStoreAll", "매장(전체)")
  }, [selectedStoresParam, posStoreDisplayName, tr])

  /** 본사: 매장 미선택 시 API 호출 없음. 선택·「전체 선택」만 조회 대상 */
  const salesFetchStoresParam = React.useMemo((): string[] | undefined => {
    if (selectedStoresKey) return selectedStoresParam
    return undefined
  }, [selectedStoresKey, selectedStoresParam])

  const officeStoreSelectionReady = !canMultiStorePicker || selectedStores.length > 0
  const canQuerySales = !!(startStr && endStr) && officeStoreSelectionReady

  const scopedStoreData = React.useMemo(
    () => filterStoreRowsBySalesSelection(storeData, salesFetchStoresParam),
    [storeData, salesFetchStoresParam]
  )

  /** 매장별 집계(posSalesByStore) 합 — 상단 카드·순매출·매장·기간 표와 동일 */
  const scopedStoreSalesTotal = React.useMemo(() => {
    if (scopedStoreData.length === 0) return null
    return sumStoreSalesTotals(scopedStoreData).total
  }, [scopedStoreData])

  const storeChartRows = React.useMemo(
    () =>
      scopedStoreData.map((r) => ({
        ...r,
        storeDisplayName: posStoreDisplayName(r.storeName),
        axisLabel: posStoreDisplayName(r.storeName),
        sales: r.total,
      })),
    [scopedStoreData, posStoreDisplayName]
  )

  const filteredStoreOptions = React.useMemo(() => {
    const base = canSearchAll ? posOptions : posBizDayStoreChoices
    const q = storeSearch.trim().toLowerCase()
    if (!q) return base
    return base.filter((p) => {
      const pl = p.toLowerCase()
      if (pl.includes(q)) return true
      return posStoreDisplayName(p).toLowerCase().includes(q)
    })
  }, [canSearchAll, posOptions, posBizDayStoreChoices, storeSearch, posStoreDisplayName])

  React.useEffect(() => {
    if (!storePickerOpen) return
    const onDown = (e: MouseEvent) => {
      const root = storePickerRef.current
      const target = e.target as Node | null
      if (root && target && !root.contains(target)) {
        setStorePickerOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStorePickerOpen(false)
    }
    const tid = window.setTimeout(() => {
      document.addEventListener("mousedown", onDown)
      document.addEventListener("keydown", onKeyDown)
    }, 0)
    return () => {
      clearTimeout(tid)
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [storePickerOpen])

  const salesNavFlatRows = React.useMemo(() => {
    const rows: {
      subMenuId: string
      topicId: string
      menuLabel: string
      topicLabel: string
      haystack: string
    }[] = []
    for (const menu of SALES_IA) {
      const menuLabel = tr(menu.labelKey, menu.fallbackLabel)
      for (const topic of menu.topics) {
        const topicLabel = tr(topic.labelKey, I18N_KO[topic.labelKey] ?? topic.labelKey)
        rows.push({
          subMenuId: menu.id,
          topicId: topic.id,
          menuLabel,
          topicLabel,
          haystack: `${menuLabel} ${topicLabel}`.toLowerCase(),
        })
      }
    }
    return rows
  }, [tr])

  const filteredSalesNavRows = React.useMemo(() => {
    const q = salesNavQuery.trim().toLowerCase()
    if (!q) return salesNavFlatRows
    return salesNavFlatRows.filter((r) => r.haystack.includes(q))
  }, [salesNavFlatRows, salesNavQuery])

  React.useEffect(() => {
    if (!salesNavPickerOpen) return
    const onDown = (e: MouseEvent) => {
      const root = salesNavPickerRef.current
      const target = e.target as Node | null
      if (root && target && !root.contains(target)) {
        setSalesNavPickerOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSalesNavPickerOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [salesNavPickerOpen])

  const orderTypesPickerFlatRows = React.useMemo(() => {
    const allLabel = tr("salesAmountKindAll", "전체")
    const rows: { kind: "all" | "type"; type?: PosOrderTypeValue; label: string; haystack: string }[] = [
      { kind: "all", label: allLabel, haystack: `${allLabel} all 전체`.toLowerCase() },
    ]
    for (const row of SALES_ORDER_TYPE_TOGGLES) {
      const label = tr(row.labelKey, row.fallback)
      rows.push({
        kind: "type",
        type: row.type,
        label,
        haystack: `${label} ${row.type}`.toLowerCase(),
      })
    }
    return rows
  }, [tr])

  const filteredOrderTypesPickerRows = React.useMemo(() => {
    const q = orderTypesQuery.trim().toLowerCase()
    if (!q) return orderTypesPickerFlatRows
    return orderTypesPickerFlatRows.filter((r) => r.haystack.includes(q))
  }, [orderTypesPickerFlatRows, orderTypesQuery])

  const periodPickerFlatRows = React.useMemo(
    () =>
      PERIOD_GROUP.map((g) => ({
        value: g.value,
        label: tr(g.labelKey, I18N_KO[g.labelKey] ?? g.labelKey),
        haystack: `${tr(g.labelKey, I18N_KO[g.labelKey] ?? g.labelKey)} ${g.value}`.toLowerCase(),
      })),
    [tr]
  )

  const filteredPeriodPickerRows = React.useMemo(() => {
    const q = periodQuery.trim().toLowerCase()
    if (!q) return periodPickerFlatRows
    return periodPickerFlatRows.filter((r) => r.haystack.includes(q))
  }, [periodPickerFlatRows, periodQuery])

  const orderTypesSummaryLabel = React.useMemo(() => {
    if (orderTypesKey === "") return tr("salesAmountKindAll", "전체")
    const parts = orderTypesKey.split(",").filter(Boolean) as PosOrderTypeValue[]
    return parts
      .map((type) => {
        const hit = SALES_ORDER_TYPE_TOGGLES.find((x) => x.type === type)
        return hit ? tr(hit.labelKey, hit.fallback) : type
      })
      .join(", ")
  }, [orderTypesKey, tr])

  React.useEffect(() => {
    if (!orderTypesPickerOpen) return
    const onDown = (e: MouseEvent) => {
      const root = orderTypesPickerRef.current
      const target = e.target as Node | null
      if (root && target && !root.contains(target)) {
        setOrderTypesPickerOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOrderTypesPickerOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [orderTypesPickerOpen])

  React.useEffect(() => {
    if (!periodPickerOpen) return
    const onDown = (e: MouseEvent) => {
      const root = periodPickerRef.current
      const target = e.target as Node | null
      if (root && target && !root.contains(target)) {
        setPeriodPickerOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPeriodPickerOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [periodPickerOpen])

  /** 구버전·캐시 행에 누락된 집계 필드 보정 — 홀 전용 지표와 조회 건당 분리 */
  const periodChartRows = React.useMemo(
    () => periodData.map((r) => mapPosSalesPeriodRowToChartRow(r, periodGroupUi, tr)),
    [periodData, periodGroupUi, tr]
  )

  /** 기간 막대차트가 시간대(24슬롯)일 때 라벨 겹침 완화 */
  const periodBarXAxisProps = React.useMemo(
    () =>
      periodGroupUi === "hour"
        ? {
            angle: -55,
            textAnchor: "end" as const,
            tick: { fontSize: 9, ...ERP_NUMERIC_CHART_TICK },
            height: 72,
            interval: 0,
          }
        : { tick: { fontSize: 11, ...ERP_NUMERIC_CHART_TICK } },
    [periodGroupUi]
  )

  const periodChartYAxisProps = React.useMemo(
    () => ({
      tick: { fontSize: 11, ...ERP_NUMERIC_CHART_TICK },
      tickFormatter: (v: number) => `${(v / 1000).toFixed(0)}k`,
    }),
    []
  )

  const currentSubMenu = SALES_IA.find((menu) => menu.id === activeSubMenuId) ?? SALES_IA[0]
  const selectedTopicId = selectedTopicBySubMenu[currentSubMenu.id] ?? currentSubMenu.topics[0].id
  const selectedTopic = currentSubMenu.topics.find((topic) => topic.id === selectedTopicId) ?? currentSubMenu.topics[0]
  const selectedView = selectedTopic?.view ?? null

  const navigateToSalesReports = React.useCallback(() => {
    const p = new URLSearchParams()
    p.set("menu", activeSubMenuId)
    p.set("topic", selectedTopicId)
    p.set("group", periodGroup)
    if (startStr) p.set("start", startStr)
    if (endStr) p.set("end", endStr)
    if (selectedStoresKey) p.set("stores", selectedStoresKey)
    if (compareStores) p.set("compare", "1")
    if (orderTypesKey) p.set("orderTypes", orderTypesKey)
    if (dowsKey) p.set("dows", dowsKey)
    router.replace(`${pathname}?${p.toString()}`, { scroll: false })
  }, [
    activeSubMenuId,
    selectedTopicId,
    periodGroup,
    startStr,
    endStr,
    selectedStoresKey,
    compareStores,
    orderTypesKey,
    dowsKey,
    pathname,
    router,
  ])

  const navigateToBusinessHours = React.useCallback(() => {
    router.replace(`${pathname}?hours=1`, { scroll: false })
  }, [pathname, router])
  /** 하단 인사이트(총액 / TOP·LOW 메뉴 / TOP 채널)는 현재 주제에 맞는 것만 — 탭마다 전부 있으면 집중이 흐려짐 */
  const insightShowTotals =
    selectedView != null &&
    (selectedView === "period" ||
      selectedView === "store-period" ||
      selectedView === "store" ||
      selectedView === "store-category" ||
      selectedView === "payment")
  const insightShowMenu = selectedView === "menu" && !isLongRangeSalesQuery
  const insightShowChannel = selectedView === "channel"
  const needsPeriodGroup =
    selectedView != null &&
    PERIOD_GROUP_TOPIC_VIEWS.includes(selectedView) &&
    selectedView !== "overview"
  const hideOrderTypeFilter =
    selectedView === "channel-reconcile" || selectedView === "app-reconcile"

  const storesForCompareChart = React.useMemo(
    () => selectedStoresParam ?? [],
    [selectedStoresParam]
  )

  const comparePeriodChartRows = React.useMemo(() => {
    if (!periodSplitSeries || storesForCompareChart.length < 2) return []
    const keyOrder = mergePeriodSeriesToAggregated(periodSplitSeries, storesForCompareChart)
    if (keyOrder.length === 0) return []
    return keyOrder.map((r) => {
      const row: Record<string, string | number> = {
        key: r.key,
        axisLabel: translatePeriodAxisLabel({ key: r.key, label: r.label }, periodGroupUi, tr),
      }
      for (const s of storesForCompareChart) {
        const sk = resolvePeriodSeriesStoreKey(periodSplitSeries, s)
        const hit = sk ? periodSplitSeries[sk]?.find((x) => x.key === r.key) : undefined
        row[`sales_${s}`] = hit?.sales ?? 0
      }
      return row
    })
  }, [periodSplitSeries, storesForCompareChart, periodGroupUi, tr])

  /** 매장·기간 목록 — 단일 매장은 periodData(일별)와 동일, 복수 매장은 split 시리즈 */
  const storeByPeriodFlatRows = React.useMemo(() => {
    if (selectedView !== "store-period") return []

    const sortRows = (
      rows: Array<
        ReturnType<typeof mapPosSalesPeriodRowToChartRow> & { storeCode: string; storeDisplay: string }
      >
    ) =>
      rows.sort((a, b) => {
        const c = a.storeDisplay.localeCompare(b.storeDisplay, undefined, { sensitivity: "base" })
        if (c !== 0) return c
        return a.key.localeCompare(b.key)
      })

    if ((selectedStoresParam?.length ?? 0) === 1 && periodChartRows.length > 0) {
      const code = selectedStoresParam![0]!
      return sortRows(
        periodChartRows.map((r) => ({
          storeCode: code,
          storeDisplay: posStoreDisplayName(code),
          ...r,
        }))
      )
    }

    if (!periodSplitSeries) return []
    const codes = Object.keys(periodSplitSeries).sort((a, b) =>
      posStoreDisplayName(a).localeCompare(posStoreDisplayName(b), undefined, { sensitivity: "base" })
    )
    const out: Array<
      ReturnType<typeof mapPosSalesPeriodRowToChartRow> & { storeCode: string; storeDisplay: string }
    > = []
    for (const code of codes) {
      if (
        salesFetchStoresParam?.length &&
        !salesFetchStoresParam.some((sel) => rowMatchesSalesStoreSelection(code, sel))
      ) {
        continue
      }
      for (const pr of periodSplitSeries[code] ?? []) {
        out.push({
          storeCode: code,
          storeDisplay: posStoreDisplayName(code),
          ...mapPosSalesPeriodRowToChartRow(pr, periodGroupUi, tr),
        })
      }
    }
    return sortRows(out)
  }, [
    selectedView,
    selectedStoresParam,
    periodChartRows,
    periodSplitSeries,
    periodGroupUi,
    tr,
    posStoreDisplayName,
    salesFetchStoresParam,
  ])

  const periodPaymentTenderGaps = React.useMemo(
    () =>
      collectPosSalesPaymentTenderGaps(
        periodChartRows.map((r) => ({
          label: r.axisLabel,
          key: r.key,
          total: r.total,
          cashSales: r.cashSales,
          creditSales: r.creditSales,
          qrSales: r.qrSales,
          otherSales: r.otherSales,
          deliveryAppSales: r.deliveryAppSales,
        }))
      ),
    [periodChartRows]
  )

  const storePeriodPaymentTenderGaps = React.useMemo(
    () =>
      collectPosSalesPaymentTenderGaps(
        storeByPeriodFlatRows.map((r) => ({
          label: r.axisLabel,
          key: r.key,
          total: r.total,
          cashSales: r.cashSales,
          creditSales: r.creditSales,
          qrSales: r.qrSales,
          otherSales: r.otherSales,
          deliveryAppSales: r.deliveryAppSales,
          storeCode: r.storeCode,
          storeLabel: r.storeDisplay,
        }))
      ),
    [storeByPeriodFlatRows]
  )

  const showComparePeriodChart =
    selectedView === "period" && compareStores && !!periodSplitSeries && storesForCompareChart.length >= 2

  const channelChartRows = React.useMemo(
    () =>
      channelData.map((r) => ({
        ...r,
        axisLabel: translateChannelKey(r.channelKey, tr),
      })),
    [channelData, tr]
  )

  const storeChannelCompareRows = React.useMemo(() => {
    const scoped = salesFetchStoresParam?.length
      ? storeChannelData.filter((r) =>
          salesFetchStoresParam.some((code) => rowMatchesSalesStoreSelection(r.storeName, code))
        )
      : storeChannelData
    return scoped
      .map((r) => {
        const dineIn = Number(r.dineIn) || 0
        const delivery = Number(r.delivery) || 0
        const takeout = Number(r.takeout) || 0
        return {
          storeName: r.storeName,
          storeDisplayName: posStoreDisplayName(r.storeName),
          dineIn,
          delivery,
          takeout,
          total: dineIn + delivery + takeout,
        }
      })
      .sort((a, b) => b.total - a.total)
  }, [storeChannelData, salesFetchStoresParam, posStoreDisplayName])

  const scopedStoreDeliveryPlatformRows = React.useMemo(() => {
    if (!salesFetchStoresParam?.length) return storeDeliveryPlatformData
    return storeDeliveryPlatformData.filter((r) =>
      salesFetchStoresParam.some((code) => rowMatchesSalesStoreSelection(r.storeName, code))
    )
  }, [storeDeliveryPlatformData, salesFetchStoresParam])

  const paymentChartRows = React.useMemo(
    () =>
      (paymentBreakdownData.summary.length > 0 ? paymentBreakdownData.summary : paymentData).map((r) => ({
        ...r,
        axisLabel: String(r.label || '').trim() || translatePaymentKey(r.paymentKey, tr),
      })),
    [paymentBreakdownData.summary, paymentData, tr]
  )

  const deliveryPaymentChannelRows = React.useMemo(
    () =>
      paymentBreakdownData.deliveryByChannel.map((r) => ({
        ...r,
        axisLabel: translateDeliveryPaymentChannelKey(r.channelKey, tr),
      })),
    [paymentBreakdownData.deliveryByChannel, tr]
  )

  const creditPaymentChannelRows = React.useMemo(
    () =>
      paymentBreakdownData.creditByChannel.map((r) => ({
        ...r,
        axisLabel: translateCreditPaymentChannelKey(r.channelKey, tr),
      })),
    [paymentBreakdownData.creditByChannel, tr]
  )

  const deliveryPieRows = React.useMemo(
    () =>
      deliveryAppData.items.map((r) => ({
        ...r,
        axisLabel: translateChannelKey(r.channelKey, tr),
      })),
    [deliveryAppData.items, tr]
  )

  const deliveryPlatformBreakdown = React.useMemo(() => {
    const d = deliveryAppData.items.find((x) => x.channelKey === "delivery")
    return d?.platforms ?? []
  }, [deliveryAppData.items])

  const deliveryPlatformPieRows = React.useMemo(
    () =>
      deliveryPlatformBreakdown.map((p) => ({
        ...p,
        axisLabel: translateDeliveryAppCode(p.code, tr),
      })),
    [deliveryPlatformBreakdown, tr]
  )

  const hasData = !!(startStr && endStr)

  const orderTypesParam = React.useMemo(
    () => parseOrderTypesParam(orderTypesKey || null) ?? undefined,
    [orderTypesKey]
  )

  const daysOfWeekParam = React.useMemo(
    () => parseDowsParam(dowsKey || null) ?? undefined,
    [dowsKey]
  )

  const showDowFilter = selectedView === "period" || selectedView === "store-period"
  /** 요일 필터는 일자/시간·매장×기간에만 적용 (다른 주제의 기간 차트에 섞이지 않게) */
  const periodDaysOfWeekParam = showDowFilter ? daysOfWeekParam : undefined

  const discountDrillContext = React.useMemo(
    () => ({
      startStr,
      endStr,
      storeCodes: selectedStoresParam,
      orderTypes: orderTypesParam,
    }),
    [startStr, endStr, selectedStoresParam, orderTypesParam]
  )
  const discountDrillHint = tr(
    "salesDiscountDrillHint",
    "행을 클릭하면 해당 할인이 적용된 주문 목록과 설명을 볼 수 있습니다."
  )
  const { openDrill: openDiscountDrill, sheet: discountDrillSheet } = useSalesDiscountDrillSheet(
    discountDrillContext,
    tr
  )

  const cashDrillContext = React.useMemo(
    () => ({
      startStr,
      endStr,
      storeCodes: selectedStoresParam,
    }),
    [startStr, endStr, selectedStoresParam]
  )
  const { openDrill: openCashDrill, sheet: cashDrillSheet } = useSalesCashOrderDrillSheet(
    cashDrillContext,
    tr
  )

  const dataFilterKey = React.useMemo(
    () =>
      [
        startStr,
        endStr,
        selectedStoresKey,
        periodGroup,
        orderTypesKey,
        dowsKey,
        compareStores ? "1" : "0",
        menuSearch.trim(),
        menuSearchAnd ? "1" : "0",
      ].join("|"),
    [
      startStr,
      endStr,
      selectedStoresKey,
      periodGroup,
      orderTypesKey,
      dowsKey,
      compareStores,
      menuSearch,
      menuSearchAnd,
    ]
  )

  const analyticsParamKey = React.useMemo(
    () => [dataFilterKey, activeSubMenuId, selectedTopicId].join("|"),
    [dataFilterKey, activeSubMenuId, selectedTopicId]
  )

  const showSalesResults = fetchedAnalyticsKey !== "" && fetchedAnalyticsKey === analyticsParamKey

  const viewCacheRestoreKeyRef = React.useRef<string | null>(null)
  const viewCacheRestoredRef = React.useRef(false)
  const skipFilterClearOnceRef = React.useRef(false)

  React.useEffect(() => {
    if (!fetchedAnalyticsKey || fetchedAnalyticsKey !== analyticsParamKey) return
    saveSalesManagementViewCache({
      analyticsParamKey: fetchedAnalyticsKey,
      startStr,
      endStr,
      selectedStores,
      periodGroup,
      orderTypesKey,
      dowsKey,
      compareStores,
      menuSearch,
      menuSearchAnd,
      activeSubMenuId,
      selectedTopicBySubMenu,
      forecastHorizon,
      periodData,
      periodSplitSeries,
      periodTruncated,
      deliveryAppData,
      deliveryAppReconcileData,
      kbankQrReconcileData,
      cardReconcileData,
      cashReconcileData,
      channelData,
      storeChannelData,
      storeDeliveryPlatformData,
      menuData,
      promoBundleData,
      paymentData,
      paymentBreakdownData,
      storeData,
      yoyCompareRows,
      momCompareRows,
      forecastSummary,
      forecastLookbackRows,
      forecastActualRows,
      summaryCards,
    })
  }, [
    fetchedAnalyticsKey,
    analyticsParamKey,
    startStr,
    endStr,
    selectedStores,
    periodGroup,
    orderTypesKey,
    dowsKey,
    compareStores,
    menuSearch,
    menuSearchAnd,
    activeSubMenuId,
    selectedTopicBySubMenu,
    forecastHorizon,
    periodData,
    periodSplitSeries,
    periodTruncated,
    deliveryAppData,
    deliveryAppReconcileData,
    kbankQrReconcileData,
    cardReconcileData,
    cashReconcileData,
    channelData,
    storeChannelData,
    storeDeliveryPlatformData,
    menuData,
    promoBundleData,
    paymentData,
    paymentBreakdownData,
    storeData,
    yoyCompareRows,
    momCompareRows,
    forecastSummary,
    forecastLookbackRows,
    forecastActualRows,
    summaryCards,
  ])

  const salesAnalyticsPlaceholder = React.useMemo(() => {
    if (!hasData) return tr("salesSelectPeriod", "기간을 선택해 주세요.")
    if (canMultiStorePicker && selectedStores.length === 0) {
      return tr(
        "salesSelectStoreBeforeQuery",
        "매장을 하나 이상 선택한 뒤「조회」를 눌러 주세요. 「전체 선택」으로 여러 매장·전체를 볼 수 있습니다."
      )
    }
    if (loading && !showSalesResults) {
      return tr("salesQueryLoading", "집계 조회 중… 잠시만 기다려 주세요.")
    }
    if (!showSalesResults) {
      return tr(
        "salesPressQueryToLoad",
        "위에서 조건을 맞춘 뒤「조회」를 누르면 집계가 표시됩니다."
      )
    }
    return null
  }, [hasData, canMultiStorePicker, selectedStores.length, loading, showSalesResults, tr])

  /** 상단(현재·직전동일·전주) — 31일 이내 기간/매장×기간만 3칸 비교. 긴 기간·그 외 금액 위주는 현재만 */
  const summaryRowShowFull =
    showSalesResults &&
    !isHoursPanel &&
    !isLongRangeSalesQuery &&
    selectedView != null &&
    (selectedView === "period" || selectedView === "store-period")
  const summaryRowShowCurrentOnly =
    showSalesResults &&
    !isHoursPanel &&
    selectedView != null &&
    (selectedView === "store" ||
      selectedView === "store-category" ||
      selectedView === "payment" ||
      selectedView === "promo-bundle" ||
      selectedView === "payment-discount" ||
      selectedView === "discount-all" ||
      selectedView === "yoy-compare" ||
      selectedView === "mom-compare" ||
      selectedView === "forecast" ||
      (isLongRangeSalesQuery && (selectedView === "period" || selectedView === "store-period")))

  const showInsightPanel =
    !isHoursPanel && showSalesResults && (insightShowTotals || insightShowMenu || insightShowChannel)

  const totalsSummary = React.useMemo(() => {
    const subtotal = periodChartRows.reduce((a, x) => a + Number(x.subtotal ?? 0), 0)
    const vat = periodChartRows.reduce((a, x) => a + Number(x.vat ?? 0), 0)
    const discount = periodChartRows.reduce((a, x) => a + Number(x.discount ?? 0), 0)
    const service = periodChartRows.reduce((a, x) => a + Number(x.service ?? 0), 0)
    const total = periodChartRows.reduce((a, x) => a + Number(x.total ?? x.sales ?? 0), 0)
    return {
      subtotal,
      vat,
      discount,
      service,
      total,
      gross: salesWaterfallGross({ total, discount, service }),
    }
  }, [periodChartRows])

  const storeTotalsSummary = React.useMemo(() => {
    const t = sumStoreSalesTotals(scopedStoreData)
    return { ...t, gross: salesWaterfallGross(t) }
  }, [scopedStoreData])

  const paymentTotalsSummary = React.useMemo(() => {
    const rows = paymentBreakdownData.summary.length > 0 ? paymentBreakdownData.summary : paymentData
    const total = rows.reduce((a, r) => a + Number(r.sales ?? 0), 0)
    return { subtotal: 0, vat: 0, discount: 0, service: 0, total, gross: total }
  }, [paymentBreakdownData.summary, paymentData])

  const activeTotalsSummary = React.useMemo(() => {
    // posSalesByStore 는 요일 필터를 반영하지 않음 → 일자/시간·매장×기간은 period 합계 사용
    if (dowsKey && (selectedView === "period" || selectedView === "store-period")) {
      return totalsSummary
    }
    if (scopedStoreData.length > 0 && (selectedStoresParam?.length ?? 0) > 0) {
      const t = sumStoreSalesTotals(scopedStoreData)
      return { ...t, gross: salesWaterfallGross(t) }
    }
    if (
      selectedView === "store" ||
      selectedView === "store-category" ||
      selectedView === "store-period"
    )
      return storeTotalsSummary
    if (selectedView === "payment") return paymentTotalsSummary
    return totalsSummary
  }, [
    dowsKey,
    scopedStoreData,
    selectedStoresParam,
    selectedView,
    storeTotalsSummary,
    paymentTotalsSummary,
    totalsSummary,
  ])

  const activeSummaryCurrent = React.useMemo(() => {
    // posSalesByStore 는 요일 필터(dows)를 반영하지 않음 → 요일 선택 시 period 요약 사용
    if (
      !dowsKey &&
      scopedStoreSalesTotal != null &&
      (selectedStoresParam?.length ?? 0) > 0
    ) {
      return scopedStoreSalesTotal
    }
    if (
      selectedView === "store" ||
      selectedView === "store-category" ||
      (selectedView === "store-period" && !dowsKey)
    )
      return storeTotalsSummary.total
    if (selectedView === "payment") return paymentTotalsSummary.total
    if (selectedView === "promo-bundle") return promoBundleData.totals.saleAmount
    if (selectedView === "payment-discount") return promoBundleData.payment?.totals.discountAmount ?? 0
    if (selectedView === "discount-all") return promoBundleData.combined?.totals.totalDiscount ?? 0
    if (selectedView === "forecast" && forecastSummary) return forecastSummary.expectedTotal
    return summaryCards.current
  }, [
    dowsKey,
    scopedStoreSalesTotal,
    selectedStoresParam,
    selectedView,
    storeTotalsSummary.total,
    paymentTotalsSummary.total,
    summaryCards.current,
    forecastSummary,
    promoBundleData.totals.saleAmount,
  ])

  const summaryCardsCurrentDisplay = React.useMemo(() => {
    if (
      !dowsKey &&
      scopedStoreSalesTotal != null &&
      (selectedStoresParam?.length ?? 0) > 0
    ) {
      return scopedStoreSalesTotal
    }
    return summaryCards.current
  }, [dowsKey, scopedStoreSalesTotal, selectedStoresParam, summaryCards.current])

  const insightTopMenus = React.useMemo(
    () => [...menuData].sort((a, b) => b.sales - a.sales).slice(0, 3),
    [menuData]
  )
  const insightBottomMenus = React.useMemo(
    () => [...menuData].filter((m) => m.sales > 0).sort((a, b) => a.sales - b.sales).slice(0, 3),
    [menuData]
  )
  const insightTopChannels = React.useMemo(
    () => [...channelChartRows].sort((a, b) => b.sales - a.sales).slice(0, 3),
    [channelChartRows]
  )

  React.useEffect(() => {
    // keep-alive 숨김 중 dataFilterKey가 다른 탭 URL 때문에 바뀌어도 조회 결과를 지우지 않음.
    // pageActive를 deps에 넣으면 탭 복귀 시 effect가 재실행되며 결과가 초기화되므로 ref로만 가드한다.
    if (skipFilterClearOnceRef.current) {
      skipFilterClearOnceRef.current = false
      return
    }
    if (!pageActiveRef.current) return
    setPeriodData([])
    setPeriodSplitSeries(null)
    setPeriodTruncated(false)
    setDeliveryAppData({ items: [], total: 0 })
    setDeliveryAppReconcileData(EMPTY_POS_DELIVERY_APP_RECONCILE)
    setKbankQrReconcileData(EMPTY_POS_KBANK_QR_RECONCILE)
    setCardReconcileData(EMPTY_POS_CARD_RECONCILE)
    setCashReconcileData(EMPTY_POS_CASH_RECONCILE)
    setChannelData([])
    setStoreChannelData([])
    setStoreDeliveryPlatformData([])
    setMenuData([])
    setPromoBundleData(EMPTY_POS_SALES_BY_PROMO)
    setPaymentData([])
    setPaymentBreakdownData({
      deliveryByChannel: [],
      deliveryTotal: 0,
      creditByChannel: [],
      creditTotal: 0,
      summary: [],
    })
    setStoreData([])
    setYoyCompareRows([])
    setMomCompareRows([])
    setForecastSummary(null)
    setForecastLookbackRows([])
    setForecastActualRows([])
    setForecastMonthActualTotal(null)
    setSummaryCards({ current: 0, prevRange: 0, prevWeek: 0 })
    setSalesQueryError("")
    setFetchedAnalyticsKey("")
    lastFetchedDataFilterKeyRef.current = ""
    viewCacheRestoreKeyRef.current = null
  }, [dataFilterKey, pageActiveRef])

  const validTopicByMenu = React.useMemo(
    () =>
      Object.fromEntries(
        SALES_IA.map((menu) => [menu.id, new Set(menu.topics.map((topic) => topic.id))])
      ) as Record<string, Set<string>>,
    []
  )

  /** 사용자 선택 직후 URL 반영 전에 Effect 1이 state를 덮어쓰지 않도록 (경쟁 상태 방지) */
  const userSelectedRef = React.useRef<{
    subMenu?: string
    topic?: string
    storesKey?: string
    periodGroup?: string
    dateRange?: string
    orderTypesKey?: string
    dowsKey?: string
    compare?: boolean
  }>({})

  React.useLayoutEffect(() => {
    if (viewCacheRestoredRef.current) return
    if (!pageActiveRef.current) return
    viewCacheRestoredRef.current = true
    const snap = readSalesManagementViewCache()
    if (!snap?.analyticsParamKey) return
    skipFilterClearOnceRef.current = true
    defaultStoresHydratedRef.current = true
    skipDefaultStoreAutoSelectRef.current = true
    if (snap.startStr) setStartStr(snap.startStr)
    if (snap.endStr) setEndStr(snap.endStr)
    if (Array.isArray(snap.selectedStores)) setSelectedStores(snap.selectedStores)
    if (snap.periodGroup && PERIOD_GROUP_VALUES.has(snap.periodGroup)) {
      setPeriodGroup(snap.periodGroup)
    }
    if (typeof snap.orderTypesKey === "string") setOrderTypesKey(snap.orderTypesKey)
    if (typeof snap.dowsKey === "string") setDowsKey(snap.dowsKey)
    setCompareStores(Boolean(snap.compareStores))
    if (typeof snap.menuSearch === "string") setMenuSearch(snap.menuSearch)
    setMenuSearchAnd(Boolean(snap.menuSearchAnd))
    if (snap.activeSubMenuId && SALES_IA.some((m) => m.id === snap.activeSubMenuId)) {
      setActiveSubMenuId(snap.activeSubMenuId)
    }
    if (snap.selectedTopicBySubMenu && typeof snap.selectedTopicBySubMenu === "object") {
      setSelectedTopicBySubMenu((prev) => ({ ...prev, ...snap.selectedTopicBySubMenu }))
    }
    if (snap.forecastHorizon) setForecastHorizon(snap.forecastHorizon)
    userSelectedRef.current = {
      subMenu: snap.activeSubMenuId,
      topic: snap.selectedTopicBySubMenu?.[snap.activeSubMenuId],
      storesKey: (snap.selectedStores || []).join(","),
      periodGroup: snap.periodGroup,
      dateRange: `${snap.startStr || ""}~${snap.endStr || ""}`,
      orderTypesKey: snap.orderTypesKey,
      dowsKey: snap.dowsKey,
      compare: Boolean(snap.compareStores),
    }
    setPeriodData(snap.periodData)
    setPeriodSplitSeries(snap.periodSplitSeries)
    setPeriodTruncated(snap.periodTruncated)
    setDeliveryAppData(snap.deliveryAppData)
    setDeliveryAppReconcileData(snap.deliveryAppReconcileData ?? EMPTY_POS_DELIVERY_APP_RECONCILE)
    setKbankQrReconcileData(snap.kbankQrReconcileData ?? EMPTY_POS_KBANK_QR_RECONCILE)
    setCardReconcileData(snap.cardReconcileData ?? EMPTY_POS_CARD_RECONCILE)
    setCashReconcileData(snap.cashReconcileData ?? EMPTY_POS_CASH_RECONCILE)
    setChannelData(snap.channelData)
    setStoreChannelData(snap.storeChannelData ?? [])
    setStoreDeliveryPlatformData(snap.storeDeliveryPlatformData ?? [])
    setMenuData(snap.menuData)
    setPromoBundleData(snap.promoBundleData)
    setPaymentData(snap.paymentData)
    setPaymentBreakdownData(snap.paymentBreakdownData)
    setStoreData(snap.storeData)
    setYoyCompareRows(snap.yoyCompareRows)
    setMomCompareRows(snap.momCompareRows)
    setForecastSummary(snap.forecastSummary)
    setForecastLookbackRows(snap.forecastLookbackRows)
    setForecastActualRows(snap.forecastActualRows)
    setForecastMonthActualTotal(
      snap.forecastSummary?.horizon === "year" ? snap.forecastSummary.actualToDate : null
    )
    setSummaryCards(snap.summaryCards)
    setFetchedAnalyticsKey(snap.analyticsParamKey)
    lastFetchedDataFilterKeyRef.current = [
      snap.startStr,
      snap.endStr,
      (snap.selectedStores || []).join(","),
      snap.periodGroup,
      snap.orderTypesKey,
      snap.dowsKey,
      snap.compareStores ? "1" : "0",
      String(snap.menuSearch || "").trim(),
      snap.menuSearchAnd ? "1" : "0",
    ].join("|")
    viewCacheRestoreKeyRef.current = snap.analyticsParamKey
  }, [pageActive, pageActiveRef])

  const applyStoreSelection = React.useCallback(
    (next: string[], meta?: { clearedAll?: boolean }) => {
      const normalized = normalizeStoreCodes(next)
      if (meta?.clearedAll) {
        skipDefaultStoreAutoSelectRef.current = true
        userSelectedRef.current.storesKey = ""
      } else {
        skipDefaultStoreAutoSelectRef.current = false
        userSelectedRef.current.storesKey = normalized.join(",")
      }
      setSelectedStores(normalized)
    },
    []
  )

  const saveCurrentPreset = React.useCallback(() => {
    const name = window.prompt(tr("salesPresetPrompt", "프리셋 이름을 입력하세요."), "")
    const trimmed = String(name || "").trim()
    if (!trimmed) return
    const currentTopic = selectedTopic?.id ?? ""
    const preset: SalesFilterPreset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      stores: selectedStores,
      periodGroup,
      orderTypesKey,
      dowsKey,
      activeSubMenuId,
      selectedTopicId: currentTopic,
      menuSearch,
      menuSearchAnd,
      compareStores,
    }
    persistPresets([preset, ...savedPresets.filter((p) => p.name !== trimmed)].slice(0, 20))
  }, [
    tr,
    selectedTopic?.id,
    startStr,
    endStr,
    selectedStores,
    periodGroup,
    orderTypesKey,
    dowsKey,
    activeSubMenuId,
    menuSearch,
    menuSearchAnd,
    compareStores,
    persistPresets,
    savedPresets,
  ])

  const canExportExcel = React.useMemo(() => {
    if (!showSalesResults || isHoursPanel) return false
    switch (selectedView) {
      case "period":
        return periodChartRows.length > 0
      case "store-period":
        return storeByPeriodFlatRows.length > 0
      case "store":
        return scopedStoreData.length > 0
      case "channel":
        return channelChartRows.length > 0
      case "menu":
        return menuData.length > 0
      case "promo-bundle":
        return promoBundleData.rows.length > 0
      case "payment-discount":
        return (promoBundleData.payment?.rows.length ?? 0) > 0
      case "discount-all":
        return (promoBundleData.combined?.byKind.length ?? 0) > 0
      case "delivery":
        return deliveryPieRows.length > 0
      case "channel-reconcile":
      case "app-reconcile":
        return (
          deliveryAppReconcileData.rows.length > 0 ||
          kbankQrReconcileData.rows.length > 0 ||
          cardReconcileData.rows.length > 0 ||
          cashReconcileData.rows.length > 0
        )
      case "payment":
        return (
          deliveryPaymentChannelRows.length > 0 ||
          creditPaymentChannelRows.length > 0 ||
          paymentChartRows.length > 0
        )
      case "store-category":
        return (
          storeChartRows.length > 0 ||
          channelChartRows.length > 0 ||
          storeChannelCompareRows.length > 0 ||
          scopedStoreDeliveryPlatformRows.length > 0
        )
      case "yoy-compare":
        return yoyCompareRows.length > 0
      case "mom-compare":
        return momCompareRows.length > 0
      case "forecast":
        return forecastSummary != null
      default:
        return false
    }
  }, [
    showSalesResults,
    isHoursPanel,
    selectedView,
    periodChartRows.length,
    storeByPeriodFlatRows.length,
    scopedStoreData.length,
    channelChartRows.length,
    menuData.length,
    promoBundleData.rows.length,
    deliveryPieRows.length,
    deliveryAppReconcileData.rows.length,
    kbankQrReconcileData.rows.length,
    cardReconcileData.rows.length,
    cashReconcileData.rows.length,
    deliveryPaymentChannelRows.length,
    creditPaymentChannelRows.length,
    paymentChartRows.length,
    storeChartRows.length,
    storeChannelCompareRows.length,
    scopedStoreDeliveryPlatformRows.length,
    yoyCompareRows.length,
    momCompareRows.length,
    forecastSummary,
  ])

  const handleExportExcel = React.useCallback(async () => {
    if (!canExportExcel) return
    const sheets = buildSalesExcelSheets({
      periodGroupUi,
      tr,
      selectedView,
      periodChartRows,
      storeByPeriodFlatRows,
      scopedStoreData,
      posStoreDisplayName,
      channelChartRows,
      menuData,
      promoBundleData,
      deliveryPieRows,
      deliveryAppReconcileData,
      kbankQrReconcileData,
      cardReconcileData,
      cashReconcileData,
      deliveryPaymentChannelRows,
      creditPaymentChannelRows,
      storeChartRows,
      storeChannelCompareRows,
      storeDeliveryPlatformRows: scopedStoreDeliveryPlatformRows,
      yoyCompareRows,
      endStr,
      momCompareRows,
      forecastSummary,
    })

    if (sheets.length === 0) return
    const topicSlug = String(selectedTopic?.id ?? selectedView ?? "sales").replace(/[^\w-]+/g, "_")
    const fname = `sales-${topicSlug}-${startStr}_${endStr}.xlsx`
    await downloadSalesManagementXlsx(fname, sheets)
  }, [
    canExportExcel,
    periodGroup,
    tr,
    selectedView,
    periodChartRows,
    storeByPeriodFlatRows,
    scopedStoreData,
    channelChartRows,
    menuData,
    promoBundleData,
    deliveryPieRows,
    deliveryAppReconcileData,
    kbankQrReconcileData,
    cardReconcileData,
    cashReconcileData,
    deliveryPaymentChannelRows,
    creditPaymentChannelRows,
    storeChartRows,
    storeChannelCompareRows,
    scopedStoreDeliveryPlatformRows,
    yoyCompareRows,
    momCompareRows,
    forecastSummary,
    posStoreDisplayName,
    selectedTopic?.id,
    startStr,
    endStr,
  ])

  const applyPreset = React.useCallback((preset: SalesFilterPreset) => {
    const normalizedStores = normalizeStoreCodes(preset.stores || [])
    const normalizedPeriodGroup = PERIOD_GROUP_VALUES.has(preset.periodGroup) ? preset.periodGroup : periodGroup
    const normalizedOrderTypesKey = normalizeOrderTypesQueryString(preset.orderTypesKey)
    const normalizedDowsKey = normalizeDowsQueryString(preset.dowsKey)
    userSelectedRef.current = {
      subMenu: preset.activeSubMenuId,
      topic: preset.selectedTopicId,
      storesKey: normalizedStores.join(","),
      periodGroup: normalizedPeriodGroup,
      orderTypesKey: normalizedOrderTypesKey,
      dowsKey: normalizedDowsKey,
      compare: preset.compareStores,
    }
    skipDefaultStoreAutoSelectRef.current = normalizedStores.length === 0
    setSelectedStores(normalizedStores)
    setPeriodGroup(normalizedPeriodGroup)
    setOrderTypesKey(normalizedOrderTypesKey)
    setDowsKey(normalizedDowsKey)
    setMenuSearch(preset.menuSearch || "")
    setMenuSearchAnd(Boolean(preset.menuSearchAnd))
    setCompareStores(Boolean(preset.compareStores))
    if (SALES_IA.some((menu) => menu.id === preset.activeSubMenuId)) {
      setActiveSubMenuId(preset.activeSubMenuId)
      setSelectedTopicBySubMenu((prev) => ({
        ...prev,
        [preset.activeSubMenuId]: preset.selectedTopicId,
      }))
    }
  }, [periodGroup])

  const removePreset = React.useCallback((id: string) => {
    persistPresets(savedPresets.filter((p) => p.id !== id))
  }, [persistPresets, savedPresets])

  React.useEffect(() => {
    if ((selectedStoresParam?.length ?? 0) < 2 && compareStores) setCompareStores(false)
  }, [selectedStoresParam, compareStores])

  React.useEffect(() => {
    if (!allowSalesUrlSync) return
    if (searchParams.get("hours") === "1") return
    const qMenu = searchParams.get("menu")
    const qTopic = searchParams.get("topic")
    const qGroup = searchParams.get("group")
    if (qMenu || qTopic || qGroup) return
    // 탭 복귀 시 URL이 pathname만 있어도 조회 조건·결과를 기본 랜딩으로 덮지 않음
    if (fetchedAnalyticsKeyRef.current) return
    if (readSalesManagementViewCache()?.analyticsParamKey) return
    if (activeSubMenuId !== defaultLanding.menuId) {
      userSelectedRef.current.subMenu = defaultLanding.menuId
      setActiveSubMenuId(defaultLanding.menuId)
    }
    if (periodGroup !== defaultLanding.periodGroup) {
      userSelectedRef.current.periodGroup = defaultLanding.periodGroup
      setPeriodGroup(defaultLanding.periodGroup)
    }
    setSelectedTopicBySubMenu((prev) => {
      if (prev[defaultLanding.menuId] === defaultLanding.topicId) return prev
      return { ...prev, [defaultLanding.menuId]: defaultLanding.topicId }
    })
  }, [allowSalesUrlSync, searchParams, defaultLanding, activeSubMenuId, periodGroup])

  React.useEffect(() => {
    if (!allowSalesUrlSync) return
    const qMenuRaw = searchParams.get("menu")
    const qTopicRaw = searchParams.get("topic")
    const qMenu =
      qMenuRaw === "sales-app-reconcile" ? "sales-channel-reconcile" : qMenuRaw
    const qTopic = qTopicRaw === "app-reconcile" ? "channel-reconcile" : qTopicRaw
    const qGroup = searchParams.get("group")
    const qCompare = searchParams.get("compare") === "1"
    const qStores = normalizeStoreCodes(
      (searchParams.get("stores") ?? searchParams.get("pos") ?? "").split(",")
    )
    const qStoresKey = qStores.join(",")
    const qOrderTypes = normalizeOrderTypesQueryString(searchParams.get("orderTypes"))
    const qDows = normalizeDowsQueryString(searchParams.get("dows"))
    const qStart = searchParams.get("start")
    const qEnd = searchParams.get("end")
    if (qStart && /^\d{4}-\d{2}-\d{2}$/.test(qStart) && userSelectedRef.current.dateRange !== `${startStr}~${endStr}`) {
      setStartStr(qStart)
    }
    if (qEnd && /^\d{4}-\d{2}-\d{2}$/.test(qEnd) && userSelectedRef.current.dateRange !== `${startStr}~${endStr}`) {
      setEndStr(qEnd)
    }
    const menuExists = !!qMenu && SALES_IA.some((m) => m.id === qMenu)
    if (menuExists) {
      const nextMenu = qMenu as string
      if (nextMenu !== activeSubMenuId && userSelectedRef.current.subMenu !== activeSubMenuId) {
        setActiveSubMenuId(nextMenu)
      }

      const topicSet = validTopicByMenu[nextMenu]
      if (qTopic && topicSet?.has(qTopic)) {
        const currentTopic = selectedTopicBySubMenu[nextMenu]
        if (currentTopic !== qTopic && userSelectedRef.current.topic !== currentTopic) {
          setSelectedTopicBySubMenu((prev) => {
            if (prev[nextMenu] === qTopic) return prev
            return { ...prev, [nextMenu]: qTopic }
          })
        }
      }
    }

    if (qGroup && PERIOD_GROUP_VALUES.has(qGroup as PeriodGroupValue)) {
      if (periodGroup !== qGroup && userSelectedRef.current.periodGroup !== periodGroup) {
        setPeriodGroup(qGroup as PeriodGroupValue)
      }
    }

    // URL에 stores가 없을 때 빈 배열로 덮어쓰면 가맹·매장 자동 선택과 무한 경쟁(조회·메뉴 클릭 불가)이 난다
    if (
      qStoresKey &&
      qStoresKey !== selectedStoresKey &&
      userSelectedRef.current.storesKey !== selectedStoresKey &&
      !skipDefaultStoreAutoSelectRef.current
    ) {
      setSelectedStores(qStores)
    }
    if (qOrderTypes !== orderTypesKey && userSelectedRef.current.orderTypesKey !== orderTypesKey) {
      setOrderTypesKey(qOrderTypes)
    }
    if (qDows !== dowsKey && userSelectedRef.current.dowsKey !== dowsKey) {
      setDowsKey(qDows)
    }
    if (qCompare !== compareStores && userSelectedRef.current.compare !== compareStores) {
      setCompareStores(qCompare)
    }
    if (
      qMenu === activeSubMenuId &&
      qStoresKey === selectedStoresKey &&
      qGroup === periodGroup &&
      qStart === startStr &&
      qEnd === endStr &&
      qOrderTypes === orderTypesKey &&
      qDows === dowsKey &&
      qCompare === compareStores
    ) {
      userSelectedRef.current = {}
    }
  }, [
    allowSalesUrlSync,
    searchParams,
    activeSubMenuId,
    selectedStoresKey,
    periodGroup,
    startStr,
    endStr,
    orderTypesKey,
    dowsKey,
    compareStores,
    validTopicByMenu,
    selectedTopicBySubMenu,
    canSearchAll,
  ])

  React.useEffect(() => {
    if (!allowSalesUrlSync) return
    if (searchParams.get("hours") === "1") return
    if (storePickerOpen) return
    const currentTopic = selectedTopic?.id
    if (!currentTopic) return

    const qMenu = searchParams.get("menu")
    const qTopic = searchParams.get("topic")
    const qGroup = searchParams.get("group")
    const qStoresKey = normalizeStoreCodes(
      (searchParams.get("stores") ?? searchParams.get("pos") ?? "").split(",")
    ).join(",")
    const qCompare = searchParams.get("compare") === "1"
    const qOrderTypes = normalizeOrderTypesQueryString(searchParams.get("orderTypes"))
    const qDows = normalizeDowsQueryString(searchParams.get("dows"))
    const qStart = searchParams.get("start")
    const qEnd = searchParams.get("end")
    if (
      qMenu === activeSubMenuId &&
      qTopic === currentTopic &&
      qGroup === periodGroup &&
      qStoresKey === selectedStoresKey &&
      qOrderTypes === orderTypesKey &&
      qDows === dowsKey &&
      qStart === startStr &&
      qEnd === endStr &&
      qCompare === compareStores
    ) return

    const expected = new URLSearchParams()
    expected.set("menu", activeSubMenuId)
    expected.set("topic", currentTopic)
    expected.set("group", periodGroup)
    if (startStr) expected.set("start", startStr)
    if (endStr) expected.set("end", endStr)
    if (selectedStoresKey) expected.set("stores", selectedStoresKey)
    if (compareStores) expected.set("compare", "1")
    if (orderTypesKey) expected.set("orderTypes", orderTypesKey)
    if (dowsKey) expected.set("dows", dowsKey)
    const expectedStr = expected.toString()
    const currentStr = [
      searchParams.get("menu"),
      searchParams.get("topic"),
      searchParams.get("group"),
      searchParams.get("start"),
      searchParams.get("end"),
      normalizeStoreCodes((searchParams.get("stores") ?? searchParams.get("pos") ?? "").split(",")).join(","),
      normalizeOrderTypesQueryString(searchParams.get("orderTypes")),
      normalizeDowsQueryString(searchParams.get("dows")),
      searchParams.get("compare") === "1" ? "1" : "",
    ].join("|")
    const expectedValues = [
      activeSubMenuId,
      currentTopic,
      periodGroup,
      startStr,
      endStr,
      selectedStoresKey,
      orderTypesKey,
      dowsKey,
      compareStores ? "1" : "",
    ].join("|")
    if (currentStr === expectedValues) return
    /** 같은 틱에 라우터·서스펜스 경계와 겹치면 "마운트 전 setState" 경고가 날 수 있어 지연 */
    const tid = window.setTimeout(() => {
      router.replace(`${pathname}?${expectedStr}`, { scroll: false })
    }, 0)
    return () => clearTimeout(tid)
  }, [
    allowSalesUrlSync,
    activeSubMenuId,
    pathname,
    periodGroup,
    selectedStoresKey,
    orderTypesKey,
    dowsKey,
    compareStores,
    startStr,
    endStr,
    router,
    searchParams,
    selectedTopic?.id,
    storePickerOpen,
  ])

  const posOptionsLoadIdRef = React.useRef(0)

  const loadPosOptions = React.useCallback(() => {
    if (!startStr || !endStr) return
    if (!canSearchAll) return
    const id = ++posOptionsLoadIdRef.current
    setPosOptionsLoading(true)
    setPosOptionsLoadFailed(false)
    const fetcher = offlineAware ? getPosSalesFilterOptionsWithCache : getPosSalesFilterOptions
    fetcher({ startStr, endStr })
      .then((r) => {
        if (posOptionsLoadIdRef.current !== id) return
        setPosOptions(r.posOptions || [])
      })
      .catch(() => {
        if (posOptionsLoadIdRef.current !== id) return
        setPosOptions([])
        setPosOptionsLoadFailed(true)
      })
      .finally(() => {
        if (posOptionsLoadIdRef.current !== id) return
        setPosOptionsLoading(false)
      })
  }, [startStr, endStr, offlineAware, canSearchAll])

  const storePickerPlaceholder = React.useMemo(() => {
    if (posBizDayStoreChoices.length > 0) return tr("salesSelectStorePrompt", "매장 선택")
    if (canSearchAll && posOptionsLoading) return tr("salesStorePickerLoading", "매장 목록 불러오는 중…")
    if (posOptionsLoadFailed) return tr("salesStorePickerLoadFailed", "매장 목록을 불러오지 못했습니다")
    if (canSearchAll) return tr("salesStorePickerEmpty", "표시할 매장이 없습니다")
    return tr("salesSelectStorePrompt", "매장 선택")
  }, [posBizDayStoreChoices.length, posOptionsLoading, posOptionsLoadFailed, canSearchAll, tr])

  React.useEffect(() => {
    if (!canSearchAll) {
      posOptionsLoadIdRef.current += 1
      setPosOptionsLoading(false)
      setPosOptionsLoadFailed(false)
      return
    }
    setPosOptionsLoading(true)
    const tid = window.setTimeout(() => {
      loadPosOptions()
    }, 250)
    return () => {
      clearTimeout(tid)
      posOptionsLoadIdRef.current += 1
    }
  }, [loadPosOptions, canSearchAll])

  React.useEffect(() => {
    /** 관리자 URL 동기화 경로 또는 모바일 `/store-sales`(offlineAware)에서 기본「전체 매장」 */
    if (!allowSalesUrlSync && !offlineAware) return
    if (defaultStoresHydratedRef.current) return
    if (!canMultiStorePicker) {
      defaultStoresHydratedRef.current = true
      return
    }

    const qStores = normalizeStoreCodes(
      (searchParams.get("stores") ?? searchParams.get("pos") ?? "").split(",")
    )
    if (qStores.length > 0) {
      defaultStoresHydratedRef.current = true
      return
    }

    if (skipDefaultStoreAutoSelectRef.current) {
      defaultStoresHydratedRef.current = true
      return
    }

    const base = normalizeStoreCodes(
      canSearchAll ? posOptions : posBizDayStoreChoices
    )
    if (base.length === 0) return

    defaultStoresHydratedRef.current = true
    userSelectedRef.current.storesKey = base.join(",")
    setSelectedStores(base)
  }, [
    allowSalesUrlSync,
    offlineAware,
    canMultiStorePicker,
    canSearchAll,
    posOptions,
    posBizDayStoreChoices,
    searchParams,
  ])

  React.useEffect(() => {
    if (canSearchAll) return
    if (skipDefaultStoreAutoSelectRef.current) return
    if (isFranchiseeRole(auth?.role || "")) {
      const codes = resolveFranchiseePosSalesFetchStoreCodes(auth, viewStore)
      const normalized = normalizeStoreCodes(
        codes.length > 0 ? codes : posBizDayStoreChoices
      )
      const key = normalized.join(",")
      if (normalized.length && selectedStoresKey !== key) {
        userSelectedRef.current.storesKey = key
        setSelectedStores(normalized)
      }
      return
    }
    const fallback = normalizeStoreCodes(
      posBizDayStoreChoices.length > 0
        ? posBizDayStoreChoices
        : auth?.store
          ? [auth.store]
          : []
    )
    const key = fallback.join(",")
    if (fallback.length && selectedStoresKey !== key) {
      userSelectedRef.current.storesKey = key
      setSelectedStores(fallback)
    }
  }, [
    canSearchAll,
    auth?.role,
    auth?.store,
    auth?.allowedStores,
    viewStore,
    selectedStoresKey,
    posBizDayStoreChoices,
  ])

  const sumPeriodTotal = React.useCallback(
    (res: Awaited<ReturnType<typeof getPosSalesByPeriod>>) => {
      if (res.kind === "split") {
        return Object.values(res.series).reduce(
          (acc, rows) => acc + rows.reduce((s, row) => s + Number(row.total ?? row.sales ?? 0), 0),
          0
        )
      }
      return res.rows.reduce((acc, row) => acc + Number(row.total ?? row.sales ?? 0), 0)
    },
    []
  )

  /** API 응답 race 방지: 최신 요청 ID와 일치할 때만 setState */
  const loadIdRef = React.useRef(0)

  const loadAllAnalytics = React.useCallback((opts?: { silent?: boolean }) => {
    if (isHoursPanel) return
    if (!startStr || !endStr) return
    if (canMultiStorePicker && selectedStores.length === 0) return
    const keySnapshot = analyticsParamKey
    const id = ++loadIdRef.current
    const dateSpan = diffDaysInclusiveBangkok(startStr, endStr)
    const prevStart = addDaysYmd(startStr, -dateSpan)
    const prevEnd = addDaysYmd(endStr, -dateSpan)
    const weekStart = addDaysYmd(startStr, -7)
    const weekEnd = addDaysYmd(endStr, -7)
    const needSplit =
      (compareStores && (selectedStoresParam?.length ?? 0) >= 2 && selectedView === "period") ||
      selectedView === "store-period"
    const periodRun = offlineAware ? getPosSalesByPeriodWithCache : getPosSalesByPeriod
    const menuFetcher = offlineAware ? getPosSalesByMenuWithCache : getPosSalesByMenu
    const promoBundleFetcher = offlineAware ? getPosSalesByPromoWithCache : getPosSalesByPromo
    const channelFetcher = offlineAware ? getPosSalesByChannelWithCache : getPosSalesByChannel
    const needDelivery = selectedView === "delivery"
    const needChannelReconcile =
      selectedView === "channel-reconcile" || selectedView === "app-reconcile"
    const needChannel =
      selectedView === "channel" ||
      selectedView === "overview" ||
      selectedView === "store-category"
    const needStoreChannel = selectedView === "store-category"
    const needStoreDeliveryPlatform = selectedView === "store-category"
    const needMenu = selectedView === "menu"
    const needDiscountAnalytics =
      selectedView === "promo-bundle" ||
      selectedView === "payment-discount" ||
      selectedView === "discount-all"
    const needPayment = selectedView === "payment" || selectedView === "overview"
    const needStore =
      selectedView === "store" ||
      selectedView === "store-category" ||
      selectedView === "store-period" ||
      selectedView === "overview"
    const needYoyCompare = selectedView === "yoy-compare"
    const needMomCompare = selectedView === "mom-compare"
    const needForecast = selectedView === "forecast"
    const needPeriodChart =
      selectedView != null &&
      (PERIOD_GROUP_TOPIC_VIEWS.includes(selectedView) || selectedView === "overview") &&
      !(isLongRangeSalesQuery && isSalesHeavyTopicSkippedOnLongRange(selectedView))
    const effectivePeriodGroup: PeriodGroupValue =
      selectedView === "overview"
        ? isLongRangeSalesQuery
          ? "month"
          : "day"
        : resolveSalesPeriodGroupForFastQuery(periodGroup, isLongRangeSalesQuery)
    const needFullSummary =
      selectedView === "period" ||
      selectedView === "store-period" ||
      selectedView === "overview" ||
      needYoyCompare ||
      needMomCompare ||
      needForecast
    const needCurrentSummaryOnly =
      !needFullSummary &&
      (selectedView === "store" || selectedView === "store-category" || selectedView === "payment")
    const guarded =
      <T,>(setter: React.Dispatch<React.SetStateAction<T>>) =>
      (v: T) => {
        if (loadIdRef.current === id) setter(v)
      }
    const gDelivery = guarded(setDeliveryAppData)
    const gAppReconcile = guarded(setDeliveryAppReconcileData)
    const gKbankQrReconcile = guarded(setKbankQrReconcileData)
    const gCardReconcile = guarded(setCardReconcileData)
    const gCashReconcile = guarded(setCashReconcileData)
    const gChannel = guarded(setChannelData)
    const gStoreChannel = guarded(setStoreChannelData)
    const gStoreDeliveryPlatform = guarded(setStoreDeliveryPlatformData)
    const gPayment = guarded(setPaymentData)
    const gPaymentBreakdown = guarded(setPaymentBreakdownData)
    const gStore = guarded(setStoreData)
    const gMenu = guarded(setMenuData)
    const gPromoBundle = guarded(setPromoBundleData)
    const gYoy = guarded(setYoyCompareRows)
    const gMom = guarded(setMomCompareRows)
    const gForecast = guarded(setForecastSummary)
    const gForecastLookback = guarded(setForecastLookbackRows)
    const gForecastActual = guarded(setForecastActualRows)
    const gForecastMonthActual = guarded(setForecastMonthActualTotal)
    const gSummary = guarded(setSummaryCards)
    const noteQueryFailure = (e: unknown) => {
      if (loadIdRef.current !== id) return
      const fallback = tr(
        "salesQueryFailed",
        "매출 집계를 가져오지 못했습니다. 잠시 후 다시 조회해 주세요."
      )
      const msg = e instanceof Error && e.message.trim() ? e.message.trim() : fallback
      setSalesQueryError((prev) => prev || msg)
    }
    setSalesQueryError("")
    if (!opts?.silent) setLoading(true)
    if (isLongRangeSalesQuery && isSalesHeavyTopicSkippedOnLongRange(selectedView)) {
      setPeriodSplitSeries(null)
      setPeriodData([])
      setPeriodTruncated(false)
    }
    if (
      needFullSummary &&
      (selectedView === "period" || selectedView === "store-period" || selectedView === "overview")
    ) {
      setSummaryCards({ current: 0, prevRange: 0, prevWeek: 0 })
    }
    const tasks: Array<Promise<unknown>> = []
    const periodRowsFromResult = (res: Awaited<ReturnType<typeof periodRun>>): PosSalesPeriodRow[] =>
      res.kind === "split"
        ? periodRowsForStoreSelection(res.series, salesFetchStoresParam)
        : res.rows

    if (needPeriodChart) {
      tasks.push(
        periodRun({
          startStr,
          endStr,
          groupBy: effectivePeriodGroup,
          stores: salesFetchStoresParam,
          orderTypes: orderTypesParam,
          daysOfWeek: periodDaysOfWeekParam,
          splitByStore: needSplit,
        })
          .then((res) => {
            if (loadIdRef.current !== id) return
            if (res.kind === "split") {
              setPeriodSplitSeries(res.series)
              setPeriodData(periodRowsForStoreSelection(res.series, salesFetchStoresParam))
              setPeriodTruncated(res.truncated)
            } else {
              setPeriodSplitSeries(null)
              setPeriodData(res.rows)
              setPeriodTruncated(res.truncated)
            }
            if (
              needFullSummary &&
              (selectedView === "period" ||
                selectedView === "store-period" ||
                selectedView === "overview")
            ) {
              setSummaryCards((prev) => ({
                ...prev,
                current: sumPeriodTotal(res),
              }))
            }
          })
          .catch((err) => {
            noteQueryFailure(err)
            if (loadIdRef.current !== id) return
            setPeriodSplitSeries(null)
            setPeriodData([])
            setPeriodTruncated(false)
          })
      )
    }

    if (needYoyCompare) {
      const year = parseYearFromYmd(endStr)
      const currRange = yearRangeYmd(year)
      const prevRange = yearRangeYmd(year - 1)
      tasks.push(
        Promise.all([
          periodRun({
            startStr: currRange.startStr,
            endStr: currRange.endStr,
            groupBy: "month",
            stores: salesFetchStoresParam,
            orderTypes: orderTypesParam,
          }),
          periodRun({
            startStr: prevRange.startStr,
            endStr: prevRange.endStr,
            groupBy: "month",
            stores: salesFetchStoresParam,
            orderTypes: orderTypesParam,
          }),
        ])
          .then(([currRes, prevRes]) => {
            if (loadIdRef.current !== id) return
            const rows = buildYoyMonthCompareRows({
              year,
              prevYearRows: periodRowsFromResult(prevRes),
              currYearRows: periodRowsFromResult(currRes),
            })
            gYoy(rows)
            gSummary({
              current: rows.reduce((a, r) => a + r.currYear.total, 0),
              prevRange: rows.reduce((a, r) => a + r.prevYear.total, 0),
              prevWeek: 0,
            })
          })
          .catch((err) => {
            noteQueryFailure(err)
            gYoy([])
            gSummary({ current: 0, prevRange: 0, prevWeek: 0 })
          })
      )
    }

    if (needMomCompare) {
      const { year, month } = parseYearMonthFromYmd(endStr)
      const currRange = monthRangeYmd(year, month)
      const prev = prevCalendarMonth(year, month)
      const prevRange = monthRangeYmd(prev.year, prev.month)
      tasks.push(
        Promise.all([
          periodRun({
            startStr: currRange.startStr,
            endStr: currRange.endStr,
            groupBy: "day",
            stores: salesFetchStoresParam,
            orderTypes: orderTypesParam,
          }),
          periodRun({
            startStr: prevRange.startStr,
            endStr: prevRange.endStr,
            groupBy: "day",
            stores: salesFetchStoresParam,
            orderTypes: orderTypesParam,
          }),
        ])
          .then(([currRes, prevRes]) => {
            if (loadIdRef.current !== id) return
            const rows = buildMomDayCompareRows({
              year,
              month,
              prevMonthRows: periodRowsFromResult(prevRes),
              currMonthRows: periodRowsFromResult(currRes),
            })
            gMom(rows)
            gSummary({
              current: rows.reduce((a, r) => a + r.currMonth.total, 0),
              prevRange: rows.reduce((a, r) => a + r.prevMonth.total, 0),
              prevWeek: 0,
            })
          })
          .catch((err) => {
            noteQueryFailure(err)
            gMom([])
            gSummary({ current: 0, prevRange: 0, prevWeek: 0 })
          })
      )
    }

    if (needForecast) {
      const anchor = endStr
      const plan = resolveForecastFetchPlan({ horizon: forecastHorizon, anchorYmd: anchor })
      /** 주/월: lookback 일별만. 연: lookback(요일평균) + 연초~기준 월별 합(실적). 일별 YTD 금지. */
      const lookbackReq = periodRun({
        startStr: plan.lookbackStart,
        endStr: plan.lookbackEnd,
        groupBy: "day",
        stores: salesFetchStoresParam,
        orderTypes: orderTypesParam,
      })
      const monthActualReq = periodRun({
        startStr: plan.monthActualStart,
        endStr: plan.monthActualEnd,
        groupBy: "month",
        stores: salesFetchStoresParam,
        orderTypes: orderTypesParam,
      })
      tasks.push(
        Promise.all([lookbackReq, monthActualReq])
          .then(([lookbackRes, monthRes]) => {
            if (loadIdRef.current !== id) return
            const lbRows = periodRowsFromResult(lookbackRes)
            const monthTotal = sumPeriodRowTotals(periodRowsFromResult(monthRes))
            gForecastLookback(lbRows)
            gForecastActual(lbRows)
            gForecastMonthActual(monthTotal)
            const forecast = computeSalesForecast({
              horizon: forecastHorizon,
              anchorYmd: anchor,
              lookbackDailyRows: lbRows,
              actualDailyRows: lbRows,
              actualToDateOverride: forecastHorizon === "year" ? monthTotal : undefined,
            })
            gForecast(forecast)
            gSummary({
              current: forecast.expectedTotal,
              prevRange: 0,
              prevWeek: 0,
            })
          })
          .catch((err) => {
            noteQueryFailure(err)
            gForecast(null)
            gForecastLookback([])
            gForecastActual([])
            gForecastMonthActual(null)
            gSummary({ current: 0, prevRange: 0, prevWeek: 0 })
          })
      )
    }
    if (needDelivery) {
      tasks.push(
        (offlineAware ? getPosSalesByDeliveryAppWithCache : getPosSalesByDeliveryApp)({
          startStr,
          endStr,
          stores: salesFetchStoresParam,
          orderTypes: orderTypesParam,
        })
          .then(gDelivery)
          .catch((err) => {
            noteQueryFailure(err)
            gDelivery({ items: [], total: 0 })
          })
      )
    }
    if (needChannelReconcile) {
      if (isLongRangeSalesQuery) {
        gAppReconcile(EMPTY_POS_DELIVERY_APP_RECONCILE)
        gKbankQrReconcile(EMPTY_POS_KBANK_QR_RECONCILE)
        gCardReconcile(EMPTY_POS_CARD_RECONCILE)
        gCashReconcile(EMPTY_POS_CASH_RECONCILE)
      } else {
      tasks.push(
        getPosDeliveryAppReconcile({
          startStr,
          endStr,
          stores: salesFetchStoresParam,
        })
          .then(gAppReconcile)
          .catch((err) => {
            noteQueryFailure(err)
            gAppReconcile(EMPTY_POS_DELIVERY_APP_RECONCILE)
          })
      )
      tasks.push(
        getPosKbankQrReconcile({
          startStr,
          endStr,
          stores: salesFetchStoresParam,
        })
          .then(gKbankQrReconcile)
          .catch((err) => {
            noteQueryFailure(err)
            gKbankQrReconcile(EMPTY_POS_KBANK_QR_RECONCILE)
          })
      )
      tasks.push(
        getPosCardReconcile({
          startStr,
          endStr,
          stores: salesFetchStoresParam,
        })
          .then(gCardReconcile)
          .catch((err) => {
            noteQueryFailure(err)
            gCardReconcile(EMPTY_POS_CARD_RECONCILE)
          })
      )
      tasks.push(
        getPosCashReconcile({
          startStr,
          endStr,
          stores: salesFetchStoresParam,
        })
          .then(gCashReconcile)
          .catch((err) => {
            noteQueryFailure(err)
            gCashReconcile(EMPTY_POS_CASH_RECONCILE)
          })
      )
      }
    }
    if (needChannel) {
      tasks.push(
        channelFetcher({
          startStr,
          endStr,
          stores: salesFetchStoresParam,
          orderTypes: orderTypesParam,
        })
          .then(gChannel)
          .catch((err) => {
            noteQueryFailure(err)
            gChannel([])
          })
      )
    }
    if (needStoreChannel) {
      tasks.push(
        (offlineAware ? getPosSalesByStoreChannelWithCache : getPosSalesByStoreChannel)({
          startStr,
          endStr,
          stores: salesFetchStoresParam,
          orderTypes: orderTypesParam,
        })
          .then((rows) => {
            const scoped = salesFetchStoresParam?.length
              ? rows.filter((r) =>
                  salesFetchStoresParam.some((code) => rowMatchesSalesStoreSelection(r.storeName, code))
                )
              : rows
            gStoreChannel(scoped)
          })
          .catch((err) => {
            noteQueryFailure(err)
            gStoreChannel([])
          })
      )
    }
    if (needStoreDeliveryPlatform) {
      tasks.push(
        (offlineAware
          ? getPosSalesByStoreDeliveryPlatformWithCache
          : getPosSalesByStoreDeliveryPlatform)({
          startStr,
          endStr,
          stores: salesFetchStoresParam,
          orderTypes: orderTypesParam,
        })
          .then((rows) => {
            const scoped = salesFetchStoresParam?.length
              ? rows.filter((r) =>
                  salesFetchStoresParam.some((code) => rowMatchesSalesStoreSelection(r.storeName, code))
                )
              : rows
            gStoreDeliveryPlatform(scoped)
          })
          .catch((err) => {
            noteQueryFailure(err)
            gStoreDeliveryPlatform([])
          })
      )
    }
    if (needPayment) {
      tasks.push(
        (offlineAware ? getPosSalesByPaymentBreakdownWithCache : getPosSalesByPaymentBreakdown)({
          startStr,
          endStr,
          stores: salesFetchStoresParam,
          orderTypes: orderTypesParam,
        })
          .then((data) => {
            gPaymentBreakdown(data)
            gPayment(data.summary)
            if (needCurrentSummaryOnly && !needStore) {
              const total = data.summary.reduce((a, r) => a + Number(r.sales ?? 0), 0)
              gSummary({ current: total, prevRange: 0, prevWeek: 0 })
            }
          })
          .catch((err) => {
            noteQueryFailure(err)
            gPaymentBreakdown({
              deliveryByChannel: [],
              deliveryTotal: 0,
              creditByChannel: [],
              creditTotal: 0,
              summary: [],
            })
            gPayment([])
            if (needCurrentSummaryOnly && !needStore) gSummary({ current: 0, prevRange: 0, prevWeek: 0 })
          })
      )
    }
    if (needStore) {
      tasks.push(
        (offlineAware ? getPosSalesByStoreWithCache : getPosSalesByStore)({
          startStr,
          endStr,
          stores: salesFetchStoresParam,
          orderTypes: orderTypesParam,
        })
          .then((rows) => {
            gStore(rows)
            if (needCurrentSummaryOnly) {
              const scoped = filterStoreRowsBySalesSelection(rows, salesFetchStoresParam)
              gSummary({
                current: sumStoreSalesTotals(scoped).total,
                prevRange: 0,
                prevWeek: 0,
              })
            }
          })
          .catch((err) => {
            noteQueryFailure(err)
            gStore([])
            if (needCurrentSummaryOnly) gSummary({ current: 0, prevRange: 0, prevWeek: 0 })
          })
      )
    }
    if (needMenu) {
      if (isLongRangeSalesQuery) {
        gMenu([])
      } else {
      tasks.push(
        menuFetcher({
          startStr,
          endStr,
          stores: salesFetchStoresParam,
          search: menuSearch || undefined,
          searchMode: menuSearchAnd ? "and" : "or",
          orderTypes: orderTypesParam,
        })
          .then(gMenu)
          .catch((err) => {
            noteQueryFailure(err)
            gMenu([])
          })
      )
      }
    }
    if (needDiscountAnalytics) {
      tasks.push(
        promoBundleFetcher({
          startStr,
          endStr,
          stores: salesFetchStoresParam,
          search: menuSearch || undefined,
          searchMode: menuSearchAnd ? "and" : "or",
          orderTypes: orderTypesParam,
        })
          .then(gPromoBundle)
          .catch((err) => {
            noteQueryFailure(err)
            gPromoBundle(EMPTY_POS_SALES_BY_PROMO)
          })
      )
    }
    if (
      !isLongRangeSalesQuery &&
      needFullSummary &&
      (selectedView === "period" || selectedView === "store-period" || selectedView === "overview")
    ) {
      const storeSummaryFetcher = offlineAware ? getPosSalesByStoreWithCache : getPosSalesByStore
      const sumScopedStoreTotal = (rows: { total?: number }[]): number =>
        rows.reduce((s, r) => s + (Number(r.total) || 0), 0)
      // 당월 합계는 period 응답에서 채움. 전기·전주 카드는 메인 Promise.all 밖에서 채워
      // 차트 표시를 막지 않음 (70일×12매장 요약이 1분+ hang 하던 원인).
      const fillPrevSummary = () => {
        if (periodDaysOfWeekParam?.length) {
          return Promise.all([
            periodRun({
              startStr: prevStart,
              endStr: prevEnd,
              groupBy: "day",
              stores: salesFetchStoresParam,
              orderTypes: orderTypesParam,
              daysOfWeek: periodDaysOfWeekParam,
            }),
            periodRun({
              startStr: weekStart,
              endStr: weekEnd,
              groupBy: "day",
              stores: salesFetchStoresParam,
              orderTypes: orderTypesParam,
              daysOfWeek: periodDaysOfWeekParam,
            }),
          ])
            .then(([prevRes, weekRes]) => {
              if (loadIdRef.current !== id) return
              setSummaryCards((prev) => ({
                current: prev.current,
                prevRange: sumPeriodTotal(prevRes),
                prevWeek: sumPeriodTotal(weekRes),
              }))
            })
            .catch(() => {
              if (loadIdRef.current !== id) return
              setSummaryCards((prev) => ({ current: prev.current, prevRange: 0, prevWeek: 0 }))
            })
        }
        return Promise.all([
          storeSummaryFetcher({
            startStr: prevStart,
            endStr: prevEnd,
            stores: salesFetchStoresParam,
            orderTypes: orderTypesParam,
          }),
          storeSummaryFetcher({
            startStr: weekStart,
            endStr: weekEnd,
            stores: salesFetchStoresParam,
            orderTypes: orderTypesParam,
          }),
        ])
          .then(([prevRows, weekRows]) => {
            if (loadIdRef.current !== id) return
            const scope = (rows: { total?: number; storeName: string }[]) =>
              filterStoreRowsBySalesSelection(rows, salesFetchStoresParam)
            setSummaryCards((prev) => ({
              current: prev.current,
              prevRange: sumScopedStoreTotal(scope(prevRows)),
              prevWeek: sumScopedStoreTotal(scope(weekRows)),
            }))
          })
          .catch(() => {
            if (loadIdRef.current !== id) return
            setSummaryCards((prev) => ({ current: prev.current, prevRange: 0, prevWeek: 0 }))
          })
      }
      void fillPrevSummary()
    }
    Promise.all(tasks).finally(() => {
      if (loadIdRef.current === id) {
        setLoading(false)
        setFetchedAnalyticsKey(keySnapshot)
        lastFetchedDataFilterKeyRef.current = dataFilterKey
      }
    })
  }, [
    dataFilterKey,
    analyticsParamKey,
    startStr,
    endStr,
    periodGroup,
    salesFetchStoresParam,
    orderTypesParam,
    periodDaysOfWeekParam,
    compareStores,
    selectedView,
    offlineAware,
    menuSearch,
    menuSearchAnd,
    sumPeriodTotal,
    isHoursPanel,
    canSearchAll,
    selectedStores.length,
    forecastHorizon,
    isLongRangeSalesQuery,
    tr,
  ])

  useErpRefetchOnActivate(() => {
    if (!showSalesResults) return
    loadAllAnalytics({ silent: true })
  })

  const online = useOnlineStatus()
  const prevOnlineRef = React.useRef(online)
  React.useEffect(() => {
    if (offlineAware && showSalesResults && !prevOnlineRef.current && online) {
      prevOnlineRef.current = true
      loadAllAnalytics()
    }
    prevOnlineRef.current = online
  }, [online, offlineAware, showSalesResults, loadAllAnalytics])

  /** 필터는 같고 하위 메뉴·주제만 바꾼 경우 「조회」 없이 해당 리포트 재집계 */
  React.useEffect(() => {
    if (isHoursPanel) return
    if (!lastFetchedDataFilterKeyRef.current) return
    if (lastFetchedDataFilterKeyRef.current !== dataFilterKey) return
    if (fetchedAnalyticsKey === analyticsParamKey) return
    loadAllAnalytics()
  }, [
    isHoursPanel,
    dataFilterKey,
    analyticsParamKey,
    fetchedAnalyticsKey,
    loadAllAnalytics,
  ])

  React.useEffect(() => {
    if (selectedView !== "forecast" || !showSalesResults) return
    if (forecastLookbackRows.length === 0 && forecastMonthActualTotal == null) return
    const next = computeSalesForecast({
      horizon: forecastHorizon,
      anchorYmd: endStr,
      lookbackDailyRows: forecastLookbackRows,
      actualDailyRows: forecastActualRows.length > 0 ? forecastActualRows : forecastLookbackRows,
      actualToDateOverride: forecastHorizon === "year" ? forecastMonthActualTotal ?? undefined : undefined,
    })
    setForecastSummary(next)
    setSummaryCards((prev) => ({ ...prev, current: next.expectedTotal }))
  }, [
    selectedView,
    showSalesResults,
    forecastHorizon,
    forecastLookbackRows,
    forecastActualRows,
    forecastMonthActualTotal,
    endStr,
  ])

  const setSalesAllOrderTypes = React.useCallback(() => {
    userSelectedRef.current.orderTypesKey = ""
    setOrderTypesKey("")
  }, [])

  const toggleOrderTypeChannel = React.useCallback((t: PosOrderTypeValue) => {
    setOrderTypesKey((prev) => {
      const normalized = normalizeOrderTypesQueryString(prev)
      const parts = normalized ? normalized.split(",") : []
      const nextSet = new Set(parts as PosOrderTypeValue[])
      if (nextSet.size === 0) {
        nextSet.add(t)
      } else if (nextSet.has(t)) {
        nextSet.delete(t)
      } else {
        nextSet.add(t)
      }
      const next = [...nextSet].sort().join(",")
      userSelectedRef.current.orderTypesKey = next
      return next
    })
  }, [])

  const setSalesAllDows = React.useCallback(() => {
    userSelectedRef.current.dowsKey = ""
    setDowsKey("")
  }, [])

  const toggleDowFilter = React.useCallback((d: PosSalesDowValue) => {
    setDowsKey((prev) => {
      const normalized = normalizeDowsQueryString(prev)
      const parts = normalized
        ? (normalized.split(",").map((x) => Number(x)) as PosSalesDowValue[])
        : []
      const nextSet = new Set(parts)
      if (nextSet.size === 0) {
        nextSet.add(d)
      } else if (nextSet.has(d)) {
        nextSet.delete(d)
      } else {
        nextSet.add(d)
      }
      const next = [...nextSet].sort((a, b) => a - b).join(",")
      // 7개 모두면 전체와 동일
      const normalizedNext = normalizeDowsQueryString(next)
      userSelectedRef.current.dowsKey = normalizedNext
      return normalizedNext
    })
  }, [])

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={!isHoursPanel ? "default" : "outline"}
              onClick={() => navigateToSalesReports()}
            >
              {tr("salesMainTabReports", "매출 리포트")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isHoursPanel ? "default" : "outline"}
              onClick={() => navigateToBusinessHours()}
            >
              {tr("salesMainTabBusinessHours", "영업시간 설정")}
            </Button>
          </div>
          {!isHoursPanel ? (
          <SalesManagementQueryBar
            startStr={startStr}
            userSelectedRef={userSelectedRef}
            endStr={endStr}
            setStartStr={setStartStr}
            setEndStr={setEndStr}
            tr={tr}
            canSearchAll={canSearchAll}
            canFranchiseeMultiStore={canFranchiseeMultiStore}
            storePickerBtnId={storePickerBtnId}
            storePickerListId={storePickerListId}
            storePickerOpen={storePickerOpen}
            setStorePickerOpen={setStorePickerOpen}
            storePickerRef={storePickerRef}
            storePickerPlaceholder={storePickerPlaceholder}
            selectedStores={selectedStores}
            posBizDayStoreChoices={posBizDayStoreChoices}
            applyStoreSelection={applyStoreSelection}
            posStoreDisplayName={posStoreDisplayName}
            filteredStoreOptions={filteredStoreOptions}
            storeSearch={storeSearch}
            setStoreSearch={setStoreSearch}
            canMultiStorePicker={canMultiStorePicker}
            auth={auth}
            loadAllAnalytics={loadAllAnalytics}
            canQuerySales={canQuerySales}
            loading={loading}
            saveCurrentPreset={saveCurrentPreset}
            showSalesResults={showSalesResults}
            canExportExcel={canExportExcel}
            handleExportExcel={handleExportExcel}
          />
          ) : null}

          {!isHoursPanel && canMultiStorePicker && selectedStores.length === 0 && posBizDayStoreChoices.length > 0 ? (
            <p className="mb-3 text-xs text-amber-800 dark:text-amber-300 leading-relaxed" role="status">
              {tr(
                "salesSelectStoreHint",
                "매장을 선택하지 않으면 집계되지 않습니다. 한 매장·여러 매장은 체크 후 「조회」, 전 매장은 「전체 선택」 후 「조회」하세요."
              )}
            </p>
          ) : null}

          {!isHoursPanel && savedPresets.length > 0 ? (
            <div className="mb-3 rounded-lg border bg-muted/20 p-3">
              <div className="mb-2 text-sm font-medium">
                {tr("salesPresetTitle", "저장된 조건")}
              </div>
              <div className="flex flex-wrap gap-2">
                {savedPresets.map((preset) => (
                  <div key={preset.id} className="inline-flex items-center gap-1 rounded-md border bg-background p-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={ADMIN_BTN_XS_CN}
                      onClick={() => applyPreset(preset)}
                    >
                      {preset.name}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={`${ADMIN_BTN_XS_CN} text-muted-foreground hover:text-destructive`}
                      onClick={() => removePreset(preset.id)}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {!isHoursPanel ? (
          <>
          <SalesManagementNavPickerMobile
            salesNavPickerRef={salesNavPickerRef}
            salesNavPickerBtnId={salesNavPickerBtnId}
            salesNavPickerOpen={salesNavPickerOpen}
            salesNavPickerListId={salesNavPickerListId}
            setOrderTypesPickerOpen={setOrderTypesPickerOpen}
            setPeriodPickerOpen={setPeriodPickerOpen}
            setSalesNavPickerOpen={setSalesNavPickerOpen}
            setSalesNavQuery={setSalesNavQuery}
            tr={tr}
            currentSubMenu={currentSubMenu}
            selectedTopic={selectedTopic}
            salesNavQuery={salesNavQuery}
            filteredSalesNavRows={filteredSalesNavRows}
            activeSubMenuId={activeSubMenuId}
            selectedTopicId={selectedTopicId}
            userSelectedRef={userSelectedRef}
            setActiveSubMenuId={setActiveSubMenuId}
            setSelectedTopicBySubMenu={setSelectedTopicBySubMenu}
          />

          <div className="mb-3 hidden flex-wrap gap-2 md:flex">
            {SALES_IA.map((menu) => (
              <Button
                key={menu.id}
                type="button"
                variant={menu.id === currentSubMenu.id ? "default" : "outline"}
                onClick={() => {
                  userSelectedRef.current.subMenu = menu.id
                  setActiveSubMenuId(menu.id)
                }}
              >
                {tr(menu.labelKey, menu.fallbackLabel)}
              </Button>
            ))}
          </div>

          <div className="mb-3 hidden rounded-lg border bg-muted/20 p-3 md:block">
            <div className="mb-2 text-sm font-medium">
              {tr("salesReportTopicLabel", "리포트(주제)")}
            </div>
            <div className="flex flex-wrap gap-2">
              {currentSubMenu.topics.map((topic) => (
                <Button
                  key={topic.id}
                  size="sm"
                  type="button"
                  variant={topic.id === selectedTopic.id ? "default" : "outline"}
                  onClick={() => {
                    userSelectedRef.current.topic = topic.id
                    setSelectedTopicBySubMenu((prev) => ({
                      ...prev,
                      [currentSubMenu.id]: topic.id,
                    }))
                  }}
                >
                  {tr(topic.labelKey, I18N_KO[topic.labelKey] ?? topic.labelKey)}
                </Button>
              ))}
            </div>
          </div>

          {selectedTopic.hintKey ? (
            <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">
                {tr("salesTopicHintLabel", "이 리포트")}:{" "}
              </span>
              {tr(
                selectedTopic.hintKey,
                I18N_KO[selectedTopic.hintKey] ?? selectedTopic.hintKey
              )}
            </p>
          ) : null}

            {!hideOrderTypeFilter || needsPeriodGroup || showDowFilter ? (
            <SalesManagementFiltersMobile
              hideOrderTypeFilter={hideOrderTypeFilter}
              tr={tr}
              orderTypesPickerRef={orderTypesPickerRef}
              orderTypesPickerBtnId={orderTypesPickerBtnId}
              orderTypesPickerOpen={orderTypesPickerOpen}
              orderTypesPickerListId={orderTypesPickerListId}
              setSalesNavPickerOpen={setSalesNavPickerOpen}
              setOrderTypesPickerOpen={setOrderTypesPickerOpen}
              setOrderTypesQuery={setOrderTypesQuery}
              setPeriodPickerOpen={setPeriodPickerOpen}
              orderTypesSummaryLabel={orderTypesSummaryLabel}
              orderTypesQuery={orderTypesQuery}
              filteredOrderTypesPickerRows={filteredOrderTypesPickerRows}
              orderTypesKey={orderTypesKey}
              setSalesAllOrderTypes={setSalesAllOrderTypes}
              toggleOrderTypeChannel={toggleOrderTypeChannel}
              needsPeriodGroup={needsPeriodGroup}
              periodPickerRef={periodPickerRef}
              periodPickerBtnId={periodPickerBtnId}
              periodPickerOpen={periodPickerOpen}
              periodPickerListId={periodPickerListId}
              setPeriodQuery={setPeriodQuery}
              periodPickerFlatRows={periodPickerFlatRows}
              periodGroupUi={periodGroupUi}
              periodQuery={periodQuery}
              filteredPeriodPickerRows={filteredPeriodPickerRows}
              userSelectedRef={userSelectedRef}
              setPeriodGroup={setPeriodGroup}
              showDowFilter={showDowFilter}
              dowsKey={dowsKey}
              setSalesAllDows={setSalesAllDows}
              toggleDowFilter={toggleDowFilter}
            />
            ) : null}

            {!hideOrderTypeFilter || needsPeriodGroup || showDowFilter ? (
            <SalesManagementFiltersDesktop
              hideOrderTypeFilter={hideOrderTypeFilter}
              tr={tr}
              orderTypesKey={orderTypesKey}
              setSalesAllOrderTypes={setSalesAllOrderTypes}
              toggleOrderTypeChannel={toggleOrderTypeChannel}
              needsPeriodGroup={needsPeriodGroup}
              periodGroupUi={periodGroupUi}
              userSelectedRef={userSelectedRef}
              setPeriodGroup={setPeriodGroup}
              showDowFilter={showDowFilter}
              dowsKey={dowsKey}
              setSalesAllDows={setSalesAllDows}
              toggleDowFilter={toggleDowFilter}
            />
            ) : null}
          </>
          ) : null}

          {showSalesResults && isLongRangeSalesQuery ? (
            <p className={`mb-3 ${ADMIN_PANEL_WARNING_CN}`} role="status">
              {tr(
                "salesLongRangeFastQueryHint",
                "31일을 넘는 조회는 직전 동일기간·전주 동기간 비교를 생략합니다. 메뉴·채널 확인은 기간을 한 달 이내로 나눠 주세요."
              )}
            </p>
          ) : null}

          {showSalesResults &&
          periodTruncated &&
          selectedView !== "channel-reconcile" &&
          selectedView !== "app-reconcile" ? (
            <p className={`mb-3 ${ADMIN_PANEL_WARNING_CN}`} role="status">
              {tr(
                "salesDataTruncatedDailyWarning",
                "주문 조회 상한에 걸려 일부만 반영되었습니다. 기간을 나누어 조회하지 않으면 같은 날짜도 금액이 달라 보일 수 있습니다."
              )}
            </p>
          ) : null}

          {salesQueryError ? null : (
          <SalesManagementSummaryInsights
            tr={tr}
            summaryRowShowFull={summaryRowShowFull}
            summaryRowShowCurrentOnly={summaryRowShowCurrentOnly}
            summaryCardsCurrentDisplay={summaryCardsCurrentDisplay}
            summaryCards={summaryCards}
            activeSummaryCurrent={activeSummaryCurrent}
            insightShowTotals={insightShowTotals}
            insightShowMenu={insightShowMenu}
            insightShowChannel={insightShowChannel}
            activeTotalsSummary={activeTotalsSummary}
            insightTopMenus={insightTopMenus}
            insightBottomMenus={insightBottomMenus}
            insightTopChannels={insightTopChannels}
            showInsightPanel={showInsightPanel}
          />
          )}

          <div className="mt-6 max-h-[calc(100dvh-380px)] min-h-[200px] overflow-auto rounded-lg border p-4">
            {isHoursPanel ? (
              <SalesPosBusinessDaySettings
                tr={tr}
                canEditGlobal={canSearchAll}
                canEditStore={canSearchAll || canEditPosBizDayStore}
                storeChoices={posBizDayStoreChoices}
              />
            ) : salesQueryError ? (
              <p className={ADMIN_PANEL_WARNING_CN} role="alert">
                {salesQueryError}
              </p>
            ) : (
            <>
            {selectedView === "period" && (
              salesAnalyticsPlaceholder ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {salesAnalyticsPlaceholder}
                </p>
              ) : (
                <SalesPeriodView
                  periodTruncated={periodTruncated}
                  tr={tr}
                  showComparePeriodChart={showComparePeriodChart}
                  periodPaymentTenderGaps={periodPaymentTenderGaps}
                  canSearchAll={canSearchAll}
                  selectedStoresParam={selectedStoresParam}
                  compareStores={compareStores}
                  userSelectedRef={userSelectedRef}
                  setCompareStores={setCompareStores}
                  comparePeriodChartRows={comparePeriodChartRows}
                  periodChartRows={periodChartRows}
                  periodBarXAxisProps={periodBarXAxisProps}
                  periodChartYAxisProps={periodChartYAxisProps}
                  storesForCompareChart={storesForCompareChart}
                  posStoreDisplayName={posStoreDisplayName}
                  periodGroupUi={periodGroupUi}
                />
              )
            )}

            {selectedView === "store-period" && (
              salesAnalyticsPlaceholder ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {salesAnalyticsPlaceholder}
                </p>
              ) : (
                <SalesStorePeriodView
                  periodTruncated={periodTruncated}
                  tr={tr}
                  storePeriodPaymentTenderGaps={storePeriodPaymentTenderGaps}
                  storeByPeriodFlatRows={storeByPeriodFlatRows}
                  periodGroupUi={periodGroupUi}
                />
              )
            )}

            {selectedView === "delivery" && (
              salesAnalyticsPlaceholder ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {salesAnalyticsPlaceholder}
                </p>
              ) : deliveryAppData.items.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr("salesDataNone", "데이터 없음")}
                </p>
              ) : (
                <SalesDeliveryView
                  periodChartRows={periodChartRows}
                  periodBarXAxisProps={periodBarXAxisProps}
                  periodChartYAxisProps={periodChartYAxisProps}
                  tr={tr}
                  deliveryPieRows={deliveryPieRows}
                  deliveryAppData={deliveryAppData}
                  deliveryPlatformBreakdown={deliveryPlatformBreakdown}
                  deliveryPlatformPieRows={deliveryPlatformPieRows}
                />
              )
            )}

            {(selectedView === "channel-reconcile" || selectedView === "app-reconcile") && (
              <SalesChannelReconcilePanel
                section={channelReconcileSection}
                onSectionChange={setChannelReconcileSection}
                deliveryData={deliveryAppReconcileData}
                kbankQrData={kbankQrReconcileData}
                cardData={cardReconcileData}
                cashData={cashReconcileData}
                placeholder={salesAnalyticsPlaceholder}
                tr={tr}
                formatAmount={formatSalesAmount}
                storeDisplayName={posStoreDisplayName}
                onCashDrill={openCashDrill}
              />
            )}

            {selectedView === "overview" && (
              salesAnalyticsPlaceholder ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {salesAnalyticsPlaceholder}
                </p>
              ) : (
                <SalesOverviewPanel
                  startStr={startStr}
                  endStr={endStr}
                  storesQuery={selectedStoresKey || undefined}
                  showCompareCards={!isLongRangeSalesQuery}
                  currentTotal={summaryCards.current}
                  prevRangeTotal={summaryCards.prevRange}
                  prevWeekTotal={summaryCards.prevWeek}
                  channelRows={channelChartRows}
                  storeRows={storeChartRows}
                  paymentBreakdown={paymentBreakdownData}
                  periodDayRows={periodChartRows.map((r) => ({
                    axisLabel: r.axisLabel,
                    sales: Number(r.total ?? r.sales ?? 0) || 0,
                  }))}
                  posStoreDisplayName={posStoreDisplayName}
                  tr={tr}
                  formatAmount={formatSalesAmount}
                  loading={loading}
                />
              )
            )}

            {selectedView === "channel" && (
              salesAnalyticsPlaceholder ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {salesAnalyticsPlaceholder}
                </p>
              ) : (
                <SalesChannelView
                  periodChartRows={periodChartRows}
                  periodBarXAxisProps={periodBarXAxisProps}
                  periodChartYAxisProps={periodChartYAxisProps}
                  tr={tr}
                  channelChartRows={channelChartRows}
                />
              )
            )}

            {selectedView === "menu" && (
              salesAnalyticsPlaceholder ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {salesAnalyticsPlaceholder}
                </p>
              ) : (
                <SalesMenuView
                  periodChartRows={periodChartRows}
                  periodBarXAxisProps={periodBarXAxisProps}
                  periodChartYAxisProps={periodChartYAxisProps}
                  tr={tr}
                  menuSearch={menuSearch}
                  setMenuSearch={setMenuSearch}
                  menuSearchAnd={menuSearchAnd}
                  setMenuSearchAnd={setMenuSearchAnd}
                  startStr={startStr}
                  endStr={endStr}
                  selectedStoresKey={selectedStoresKey}
                  menuData={menuData}
                />
              )
            )}

            {(selectedView === "promo-bundle" ||
              selectedView === "payment-discount" ||
              selectedView === "discount-all") &&
              (salesAnalyticsPlaceholder ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {salesAnalyticsPlaceholder}
                </p>
              ) : (
                <SalesDiscountAnalyticsShell truncated={promoBundleData.truncated} tr={tr}>
                  {selectedView === "promo-bundle" ? (
                    <SalesPromoBundleDiscountPanel
                      data={promoBundleData}
                      menuSearch={menuSearch}
                      setMenuSearch={setMenuSearch}
                      menuSearchAnd={menuSearchAnd}
                      setMenuSearchAnd={setMenuSearchAnd}
                      tr={tr}
                      onDrill={openDiscountDrill}
                      drillHint={discountDrillHint}
                    />
                  ) : null}
                  {selectedView === "payment-discount" ? (
                    <SalesPaymentDiscountPanel
                      data={promoBundleData}
                      menuSearch={menuSearch}
                      setMenuSearch={setMenuSearch}
                      menuSearchAnd={menuSearchAnd}
                      setMenuSearchAnd={setMenuSearchAnd}
                      tr={tr}
                      onDrill={openDiscountDrill}
                      drillHint={discountDrillHint}
                    />
                  ) : null}
                  {selectedView === "discount-all" ? (
                    <SalesCombinedDiscountPanel
                      data={promoBundleData}
                      tr={tr}
                      onDrill={openDiscountDrill}
                      drillHint={discountDrillHint}
                    />
                  ) : null}
                </SalesDiscountAnalyticsShell>
              ))}
            {discountDrillSheet}
            {cashDrillSheet}

            {selectedView === "store" && (
              salesAnalyticsPlaceholder ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {salesAnalyticsPlaceholder}
                </p>
              ) : (
                <SalesStoreView
                  storeChartRows={storeChartRows}
                  periodBarXAxisProps={periodBarXAxisProps}
                  periodChartYAxisProps={periodChartYAxisProps}
                  tr={tr}
                  scopedStoreData={scopedStoreData}
                  posStoreDisplayName={posStoreDisplayName}
                />
              )
            )}

            {selectedView === "store-category" && (
              salesAnalyticsPlaceholder ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {salesAnalyticsPlaceholder}
                </p>
              ) : (
                <SalesStoreCategoryView
                  periodChartRows={periodChartRows}
                  periodBarXAxisProps={periodBarXAxisProps}
                  periodChartYAxisProps={periodChartYAxisProps}
                  tr={tr}
                  storeChartRows={storeChartRows}
                  channelChartRows={channelChartRows}
                  storeChannelRows={storeChannelCompareRows}
                  storeDeliveryPlatformRows={scopedStoreDeliveryPlatformRows}
                  posStoreDisplayName={posStoreDisplayName}
                />
              )
            )}

            {selectedView === "payment" && (
              salesAnalyticsPlaceholder ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {salesAnalyticsPlaceholder}
                </p>
              ) : deliveryPaymentChannelRows.length === 0 &&
                creditPaymentChannelRows.length === 0 &&
                paymentChartRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr("salesDataNone", "데이터 없음")}
                </p>
              ) : (
                <SalesPaymentView
                  periodChartRows={periodChartRows}
                  periodBarXAxisProps={periodBarXAxisProps}
                  periodChartYAxisProps={periodChartYAxisProps}
                  tr={tr}
                  paymentBreakdownData={paymentBreakdownData}
                  paymentChartRows={paymentChartRows}
                  deliveryPaymentChannelRows={deliveryPaymentChannelRows}
                  creditPaymentChannelRows={creditPaymentChannelRows}
                />
              )
            )}

            {selectedView === "yoy-compare" && (
              salesAnalyticsPlaceholder ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{salesAnalyticsPlaceholder}</p>
              ) : yoyCompareRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{tr("salesDataNone", "데이터 없음")}</p>
              ) : (
                <SalesYoyComparePanel
                  rows={yoyCompareRows}
                  year={parseYearFromYmd(endStr)}
                  storeLabel={compareStoreLabel}
                  tr={tr}
                  formatAmount={formatSalesAmount}
                />
              )
            )}

            {selectedView === "mom-compare" && (
              salesAnalyticsPlaceholder ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{salesAnalyticsPlaceholder}</p>
              ) : momCompareRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{tr("salesDataNone", "데이터 없음")}</p>
              ) : (
                <SalesMomComparePanel
                  rows={momCompareRows}
                  year={parseYearMonthFromYmd(endStr).year}
                  month={parseYearMonthFromYmd(endStr).month}
                  storeLabel={compareStoreLabel}
                  tr={tr}
                  formatAmount={formatSalesAmount}
                />
              )
            )}

            {selectedView === "forecast" && (
              salesAnalyticsPlaceholder ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{salesAnalyticsPlaceholder}</p>
              ) : (
                <SalesForecastPanel
                  summary={forecastSummary}
                  horizon={forecastHorizon}
                  onHorizonChange={setForecastHorizon}
                  tr={tr}
                  formatAmount={formatSalesAmount}
                />
              )
            )}

            {selectedView === null && (
              <div className="py-10 text-center">
                <p className="text-base font-medium">
                  {tr(selectedTopic.labelKey, I18N_KO[selectedTopic.labelKey] ?? selectedTopic.labelKey)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {tr("salesManagementComingSoon", "해당 리포트는 현재 준비중입니다.")}
                </p>
              </div>
            )}
            </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
