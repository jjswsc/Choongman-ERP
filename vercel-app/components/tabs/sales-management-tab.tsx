"use client"

import * as React from "react"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
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
  POS_SALES_DOW_TOGGLE_ORDER,
  POS_SALES_DOW_LABEL_KEYS,
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
  combinedKindLabel,
  combinedLayerLabel,
  paymentDiscountRowLabel,
  paymentKindLabel,
  promoKindLabel,
} from "@/lib/sales-discount-analytics-labels"
import {
  downloadSalesManagementXlsx,
  salesExcelCol,
  type SalesExcelSheet,
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
  getPosSalesByChannel,
  getPosSalesByMenu,
  getPosSalesByPromo,
  type PosSalesByPromoResult,
  type PosSalesPromoAggregateTotals,
  getPosSalesByPaymentBreakdown,
  type PosSalesPaymentBreakdown,
  getPosSalesByStore,
  getPosCancelReasonSummary,
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
import { ADMIN_BTN_XS_CN, ADMIN_PANEL_WARNING_CN, ERP_NUMERIC_CHART_TICK } from "@/lib/admin-ui-standards"
import {
  periodRowsForStoreSelection,
  resolvePeriodSeriesStoreKey,
} from "@/lib/pos-sales-period-aggregate"
import {
  collectPosSalesPaymentTenderGaps,
  posSalesPeriodPaymentTenderGap,
  type PosSalesPaymentTenderGapItem,
} from "@/lib/pos-sales-payment-tender-gap"
import { rowMatchesSalesStoreSelection } from "@/lib/pos-sales-store-filter"
import { filterPosSalesStoreOptionsForManagement } from "@/lib/pos-sales-test-office"
import { todayStrBangkok, diffDaysInclusiveBangkok } from "@/lib/attendance-utils"
import { addBangkokCalendarDays } from "@/lib/bangkok-time"
import { addDaysYmd } from "@/lib/pos-business-day"
import {
  buildMomDayCompareRows,
  buildYoyMonthCompareRows,
  computeSalesForecast,
  monthRangeYmd,
  parseYearFromYmd,
  parseYearMonthFromYmd,
  prevCalendarMonth,
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
  type AnalyticsView,
  type PeriodGroupValue,
} from "@/components/tabs/sales-management-ia"
import { SalesOverviewPanel } from "@/components/tabs/sales-overview-panel"
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
  PERIOD_PAYMENT_COLUMNS,
  periodPaymentAmount,
  resolveDefaultSalesLanding,
  SALES_FILTER_PRESET_STORAGE_KEY,
  SALES_ORDER_TYPE_TOGGLES,
  salesWaterfallGross,
  sumStoreSalesTotals,
  type SalesFilterPreset,
  type StoreSalesAggregateRow,
} from "@/components/tabs/sales-management-shared"
import {
  SalesPaymentTenderGapAlert,
  SalesPeriodTrendChartBlock,
  SALES_CHART_COLORS,
} from "@/components/tabs/sales-management-charts"
import { SalesStorePicker } from "@/components/tabs/sales-management-store-picker"
import { SalesManagementSummaryInsights } from "@/components/tabs/sales-management-summary-insights"
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
} from "@/lib/offline/sales-analytics-offline"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"

const COLORS = [...SALES_CHART_COLORS]

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
  /** 마지막으로「조회」로 성공 적용된 필터 키(자동 로드 없음; 키가 바뀌면 결과 비움) */
  const [fetchedAnalyticsKey, setFetchedAnalyticsKey] = React.useState("")
  const [periodGroup, setPeriodGroup] = React.useState<PeriodGroupValue>(defaultLanding.periodGroup)
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
  const [channelData, setChannelData] = React.useState<{ channelKey: string; sales: number }[]>([])
  const [menuData, setMenuData] = React.useState<{ name: string; qty: number; sales: number }[]>([])
  const [promoBundleData, setPromoBundleData] = React.useState<PosSalesByPromoResult>(EMPTY_POS_SALES_BY_PROMO)
  const [paymentData, setPaymentData] = React.useState<{ paymentKey: string; sales: number }[]>([])
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
  const [summaryCards, setSummaryCards] = React.useState<{
    current: number
    prevRange: number
    prevWeek: number
  }>({ current: 0, prevRange: 0, prevWeek: 0 })
  const [cancelReasonSummary, setCancelReasonSummary] = React.useState<{
    lineRows: { reason: string; count: number; amount: number }[]
    orderRows: { reason: string; count: number; amount: number }[]
    lineTotalCount: number
    lineTotalAmount: number
    orderTotalCount: number
    orderTotalAmount: number
    truncated: boolean
  }>({
    lineRows: [],
    orderRows: [],
    lineTotalCount: 0,
    lineTotalAmount: 0,
    orderTotalCount: 0,
    orderTotalAmount: 0,
    truncated: false,
  })
  const [cancelReasonLoading, setCancelReasonLoading] = React.useState(false)

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
    () => periodData.map((r) => mapPosSalesPeriodRowToChartRow(r, periodGroup, tr)),
    [periodData, periodGroup, tr]
  )

  /** 기간 막대차트가 시간대(24슬롯)일 때 라벨 겹침 완화 */
  const periodBarXAxisProps = React.useMemo(
    () =>
      periodGroup === "hour"
        ? {
            angle: -55,
            textAnchor: "end" as const,
            tick: { fontSize: 9, ...ERP_NUMERIC_CHART_TICK },
            height: 72,
            interval: 0,
          }
        : { tick: { fontSize: 11, ...ERP_NUMERIC_CHART_TICK } },
    [periodGroup]
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
  const insightShowMenu = selectedView === "menu"
  const insightShowChannel = selectedView === "channel"
  const needsPeriodGroup =
    selectedView != null &&
    PERIOD_GROUP_TOPIC_VIEWS.includes(selectedView) &&
    selectedView !== "overview"

  const storesForCompareChart = React.useMemo(
    () => selectedStoresParam ?? [],
    [selectedStoresParam]
  )

  const comparePeriodChartRows = React.useMemo(() => {
    if (!periodSplitSeries || storesForCompareChart.length < 2) return []
    const firstKey = resolvePeriodSeriesStoreKey(periodSplitSeries, storesForCompareChart[0]!)
    const base = firstKey ? periodSplitSeries[firstKey] : undefined
    if (!base?.length) return []
    return base.map((r) => {
      const row: Record<string, string | number> = {
        key: r.key,
        axisLabel: translatePeriodAxisLabel({ key: r.key, label: r.label }, periodGroup, tr),
      }
      for (const s of storesForCompareChart) {
        const sk = resolvePeriodSeriesStoreKey(periodSplitSeries, s)
        const hit = sk ? periodSplitSeries[sk]?.find((x) => x.key === r.key) : undefined
        row[`sales_${s}`] = hit?.sales ?? 0
      }
      return row
    })
  }, [periodSplitSeries, storesForCompareChart, periodGroup, tr])

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
          ...mapPosSalesPeriodRowToChartRow(pr, periodGroup, tr),
        })
      }
    }
    return sortRows(out)
  }, [
    selectedView,
    selectedStoresParam,
    periodChartRows,
    periodSplitSeries,
    periodGroup,
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

  const paymentChartRows = React.useMemo(
    () =>
      (paymentBreakdownData.summary.length > 0 ? paymentBreakdownData.summary : paymentData).map((r) => ({
        ...r,
        axisLabel: translatePaymentKey(r.paymentKey, tr),
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

  const handleCancelReasonDrilldown = React.useCallback(
    (reason: string, scope: "line" | "order") => {
      const q = new URLSearchParams()
      q.set("start", startStr)
      q.set("end", endStr)
      q.set("cancelScope", scope)
      q.set("cancelReason", reason)
      router.push(`/admin/pos-orders?${q.toString()}`)
    },
    [router, startStr, endStr]
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

  React.useEffect(() => {
    if (!fetchedAnalyticsKey || fetchedAnalyticsKey !== analyticsParamKey) return
    saveSalesManagementViewCache({
      analyticsParamKey: fetchedAnalyticsKey,
      periodData,
      periodSplitSeries,
      periodTruncated,
      deliveryAppData,
      channelData,
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
      cancelReasonSummary,
    })
  }, [
    fetchedAnalyticsKey,
    analyticsParamKey,
    periodData,
    periodSplitSeries,
    periodTruncated,
    deliveryAppData,
    channelData,
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
    cancelReasonSummary,
  ])

  const salesAnalyticsPlaceholder = React.useMemo(() => {
    if (!hasData) return tr("salesSelectPeriod", "기간을 선택해 주세요.")
    if (canMultiStorePicker && selectedStores.length === 0) {
      return tr(
        "salesSelectStoreBeforeQuery",
        "매장을 하나 이상 선택한 뒤「조회」를 눌러 주세요. 「전체 선택」으로 여러 매장·전체를 볼 수 있습니다."
      )
    }
    if (loading) {
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

  /** 상단(현재·직전동일·전주) — 기간/매장×기간 탐색 주제만 3칸 비교, 그 외 금액 위주는 현재만, 메뉴·채널·배달은 생략 */
  const summaryRowShowFull =
    showSalesResults &&
    !isHoursPanel &&
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
      selectedView === "forecast")

  const showInsightPanel =
    !isHoursPanel &&
    showSalesResults &&
    (insightShowTotals ||
      insightShowMenu ||
      insightShowChannel ||
      cancelReasonLoading ||
      cancelReasonSummary.lineRows.length > 0 ||
      cancelReasonSummary.orderRows.length > 0)

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
    scopedStoreData,
    selectedStoresParam,
    selectedView,
    storeTotalsSummary,
    paymentTotalsSummary,
    totalsSummary,
  ])

  const activeSummaryCurrent = React.useMemo(() => {
    if (scopedStoreSalesTotal != null && (selectedStoresParam?.length ?? 0) > 0) {
      return scopedStoreSalesTotal
    }
    if (
      selectedView === "store" ||
      selectedView === "store-category" ||
      selectedView === "store-period"
    )
      return storeTotalsSummary.total
    if (selectedView === "payment") return paymentTotalsSummary.total
    if (selectedView === "promo-bundle") return promoBundleData.totals.saleAmount
    if (selectedView === "payment-discount") return promoBundleData.payment?.totals.discountAmount ?? 0
    if (selectedView === "discount-all") return promoBundleData.combined?.totals.totalDiscount ?? 0
    if (selectedView === "forecast" && forecastSummary) return forecastSummary.expectedTotal
    return summaryCards.current
  }, [
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
    if (scopedStoreSalesTotal != null && (selectedStoresParam?.length ?? 0) > 0) {
      return scopedStoreSalesTotal
    }
    return summaryCards.current
  }, [scopedStoreSalesTotal, selectedStoresParam, summaryCards.current])

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
    if (!pageActiveRef.current) return
    setPeriodData([])
    setPeriodSplitSeries(null)
    setPeriodTruncated(false)
    setDeliveryAppData({ items: [], total: 0 })
    setChannelData([])
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
    setSummaryCards({ current: 0, prevRange: 0, prevWeek: 0 })
    setFetchedAnalyticsKey("")
    viewCacheRestoreKeyRef.current = null
  }, [dataFilterKey, pageActiveRef])

  // clear effect 이후에 복구 — 같은 틱에서 초기화 후 스냅샷으로 다시 채움
  React.useEffect(() => {
    if (fetchedAnalyticsKey) return
    if (!analyticsParamKey || isHoursPanel) return
    if (viewCacheRestoreKeyRef.current === analyticsParamKey) return
    const snap = readSalesManagementViewCache(analyticsParamKey)
    if (!snap) return
    viewCacheRestoreKeyRef.current = analyticsParamKey
    setPeriodData(snap.periodData)
    setPeriodSplitSeries(snap.periodSplitSeries)
    setPeriodTruncated(snap.periodTruncated)
    setDeliveryAppData(snap.deliveryAppData)
    setChannelData(snap.channelData)
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
    setSummaryCards(snap.summaryCards)
    setCancelReasonSummary(snap.cancelReasonSummary)
    setFetchedAnalyticsKey(snap.analyticsParamKey)
  }, [analyticsParamKey, fetchedAnalyticsKey, isHoursPanel])

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
      case "payment":
        return (
          deliveryPaymentChannelRows.length > 0 ||
          creditPaymentChannelRows.length > 0 ||
          paymentChartRows.length > 0
        )
      case "store-category":
        return storeChartRows.length > 0 || channelChartRows.length > 0
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
    deliveryPaymentChannelRows.length,
    creditPaymentChannelRows.length,
    paymentChartRows.length,
    storeChartRows.length,
    yoyCompareRows.length,
    momCompareRows.length,
    forecastSummary,
  ])

  const handleExportExcel = React.useCallback(async () => {
    if (!canExportExcel) return
    const numCell = (n: number) => Math.round(Number(n || 0) * 100) / 100
    const periodCol =
      periodGroup === "hour" ? tr("salesPeriodHourColumn", "시간대") : tr("salesPeriod", "기간")
    const paymentColFormats = PERIOD_PAYMENT_COLUMNS.map(() => salesExcelCol.money)
    const sheets: SalesExcelSheet[] = []

    if (selectedView === "period" && periodChartRows.length > 0) {
      sheets.push({
        name: tr("salesExportSheetSummary", "매출 요약"),
        headers: [
          periodCol,
          tr("salesAmount", "매출액"),
          ...PERIOD_PAYMENT_COLUMNS.map((c) => tr(c.labelKey, c.fallback)),
        ],
        rows: periodChartRows.map((r) => [
          r.axisLabel,
          numCell(r.total),
          ...PERIOD_PAYMENT_COLUMNS.map((c) => numCell(periodPaymentAmount(r, c.field))),
        ]),
        colFormats: [salesExcelCol.text, salesExcelCol.money, ...paymentColFormats],
      })
      sheets.push({
        name: tr("salesExportSheetDetail", "상세"),
        headers: [
          periodCol,
          tr("salesOccupancy", "주문건수"),
          tr("salesGuestCount", "손님 수(홀)"),
          tr("salesHallPerOrder", "홀 건당"),
          tr("salesHallPerGuest", "홀 1인당"),
          tr("salesPerOrderInScope", "건당"),
          tr("salesSupplyAmount", "공급가액"),
          tr("salesTax", "세금"),
          tr("salesDiscountAmount", "할인 금액"),
          tr("salesServiceAmount", "서비스처리 금액"),
          tr("salesAmount", "매출액"),
          ...PERIOD_PAYMENT_COLUMNS.map((c) => tr(c.labelKey, c.fallback)),
        ],
        rows: periodChartRows.map((r) => [
          r.axisLabel,
          r.count,
          r.hallGuestSum,
          r.dineInOrderCount > 0 ? numCell(r.salesPerDineInOrder) : "",
          r.hallGuestSum > 0 ? numCell(r.salesPerGuestHall) : "",
          r.count > 0 ? numCell(r.salesPerOrder) : "",
          numCell(r.subtotal),
          numCell(r.vat),
          numCell(r.discount),
          numCell(r.service ?? 0),
          numCell(r.total),
          ...PERIOD_PAYMENT_COLUMNS.map((c) => numCell(periodPaymentAmount(r, c.field))),
        ]),
        colFormats: [
          salesExcelCol.text,
          salesExcelCol.int,
          salesExcelCol.int,
          salesExcelCol.money,
          salesExcelCol.money,
          salesExcelCol.money,
          salesExcelCol.money,
          salesExcelCol.money,
          salesExcelCol.money,
          salesExcelCol.money,
          salesExcelCol.money,
          ...paymentColFormats,
        ],
      })
    } else if (selectedView === "store-period" && storeByPeriodFlatRows.length > 0) {
      sheets.push({
        name: tr("salesExportSheetDetail", "상세"),
        headers: [
          tr("salesStoreName", "매장명"),
          periodCol,
          tr("salesOccupancy", "주문건수"),
          tr("salesAmount", "매출액"),
          ...PERIOD_PAYMENT_COLUMNS.map((c) => tr(c.labelKey, c.fallback)),
        ],
        rows: storeByPeriodFlatRows.map((r) => [
          r.storeDisplay,
          r.axisLabel,
          r.count,
          numCell(r.total),
          ...PERIOD_PAYMENT_COLUMNS.map((c) => numCell(periodPaymentAmount(r, c.field))),
        ]),
        colFormats: [
          salesExcelCol.text,
          salesExcelCol.text,
          salesExcelCol.int,
          salesExcelCol.money,
          ...paymentColFormats,
        ],
      })
    } else if (selectedView === "store" && scopedStoreData.length > 0) {
      sheets.push({
        name: tr("salesByStore", "매장별"),
        headers: [
          tr("salesStoreName", "매장명"),
          tr("salesOccupancy", "주문건수"),
          tr("salesSupplyAmount", "공급가액"),
          tr("salesTax", "세금"),
          tr("salesDiscountAmount", "할인 금액"),
          tr("salesServiceAmount", "서비스처리 금액"),
          tr("salesAmount", "매출액"),
        ],
        rows: scopedStoreData.map((r) => [
          posStoreDisplayName(r.storeName),
          r.count,
          numCell(r.subtotal),
          numCell(r.vat),
          numCell(r.discount ?? 0),
          numCell(r.service ?? 0),
          numCell(r.total),
        ]),
        colFormats: [
          salesExcelCol.text,
          salesExcelCol.int,
          salesExcelCol.money,
          salesExcelCol.money,
          salesExcelCol.money,
          salesExcelCol.money,
          salesExcelCol.money,
        ],
      })
    } else if (selectedView === "channel" && channelChartRows.length > 0) {
      sheets.push({
        name: tr("salesChannel", "채널"),
        headers: [tr("salesChannel", "채널"), tr("pL_sales", "매출")],
        rows: channelChartRows.map((r) => [r.axisLabel, numCell(r.sales)]),
        colFormats: [salesExcelCol.text, salesExcelCol.money],
      })
    } else if (selectedView === "menu" && menuData.length > 0) {
      sheets.push({
        name: tr("salesMenu", "메뉴"),
        headers: [tr("salesMenu", "메뉴"), tr("salesQuantity", "수량"), tr("pL_sales", "매출")],
        rows: menuData.map((r) => [r.name, r.qty, numCell(r.sales)]),
        colFormats: [salesExcelCol.text, salesExcelCol.int, salesExcelCol.money],
      })
    } else if (
      (selectedView === "promo-bundle" ||
        selectedView === "payment-discount" ||
        selectedView === "discount-all") &&
      (promoBundleData.rows.length > 0 ||
        (promoBundleData.payment?.rows.length ?? 0) > 0 ||
        (promoBundleData.combined?.byKind.length ?? 0) > 0)
    ) {
      if (selectedView === "promo-bundle") {
        const t = promoBundleData.totals
        sheets.push({
          name: tr("salesBundleDiscountAnalyticsTitle", "세트 할인 영향 분석"),
          headers: [tr("salesMenu", "메뉴"), tr("pL_sales", "매출")],
          rows: [
            [tr("salesPromoPeriodGrossSales", "기간 총매출"), numCell(t.periodGrossSales)],
            [tr("salesPromoLineSaleShare", "세트 판매 비중"), t.promoLineSaleSharePct / 100],
            [tr("salesPromoSaleAmount", "판매액"), numCell(t.saleAmount)],
            [tr("salesPromoBundleDiscount", "세트 할인"), numCell(t.bundleDiscount)],
            [tr("salesPromoDiscountPctOfGross", "총매출 대비 할인"), t.bundleDiscountPctOfGross / 100],
            [tr("salesPromoSaleQty", "세트 판매 수량"), t.qty],
            [tr("salesPromoRegularAmount", "정가 합계"), numCell(t.regularAmount)],
          ],
          colFormats: [salesExcelCol.text, salesExcelCol.money],
        })
        if ((promoBundleData.byKind ?? []).length > 0) {
          sheets.push({
            name: tr("salesPromoKindBreakdown", "유형별 분석"),
            headers: [
              tr("salesPromoKindBreakdown", "유형별 분석"),
              tr("salesQuantity", "수량"),
              tr("salesPromoSaleAmount", "판매액"),
              tr("salesPromoBundleDiscount", "세트 내재 할인"),
              tr("salesPromoDiscountPctOfGross", "총매출 대비 할인"),
              tr("salesPromoBundleDiscountShare", "내재 할인 비중"),
            ],
            rows: (promoBundleData.byKind ?? []).map((k) => [
              promoKindLabel(k.kind, tr),
              k.qty,
              numCell(k.saleAmount),
              numCell(k.bundleDiscount),
              k.bundleDiscountPctOfGross / 100,
              k.bundleDiscountSharePct / 100,
            ]),
            colFormats: [
              salesExcelCol.text,
              salesExcelCol.int,
              salesExcelCol.money,
              salesExcelCol.money,
              salesExcelCol.pct,
              salesExcelCol.pct,
            ],
          })
        }
      }
      if (selectedView === "promo-bundle" && promoBundleData.rows.length > 0) {
        sheets.push({
          name: tr("salesTopicPromoBundleReport", "세트 할인"),
          headers: [
            tr("salesMenu", "메뉴"),
            tr("salesPromoCode", "프로모 코드"),
            tr("salesDiscountKindColumn", "유형"),
            tr("salesQuantity", "수량"),
            tr("salesPromoRegularAmount", "정가 합계"),
            tr("salesPromoSaleAmount", "판매액"),
            tr("salesPromoBundleDiscount", "세트 내재 할인"),
            tr("salesPromoDiscountPct", "할인율"),
            tr("salesPromoDiscountPctOfGross", "총매출 대비 할인"),
            tr("salesPromoLineSaleShare", "세트·프로모 판매 비중"),
          ],
          rows: promoBundleData.rows.map((r) => [
            r.name,
            r.promoCode || r.promoId,
            promoKindLabel(r.kind, tr),
            r.qty,
            numCell(r.regularAmount),
            numCell(r.saleAmount),
            numCell(r.bundleDiscount),
            r.discountPct / 100,
            r.discountPctOfGross / 100,
            r.saleSharePctOfGross / 100,
          ]),
          colFormats: [
            salesExcelCol.text,
            salesExcelCol.text,
            salesExcelCol.text,
            salesExcelCol.int,
            salesExcelCol.money,
            salesExcelCol.money,
            salesExcelCol.money,
            salesExcelCol.pct,
            salesExcelCol.pct,
            salesExcelCol.pct,
          ],
        })
      }
      if (selectedView === "payment-discount" && (promoBundleData.payment?.rows.length ?? 0) > 0) {
        const pt = promoBundleData.payment!.totals
        sheets.push({
          name: tr("salesPaymentDiscountAnalyticsTitle", "결제 할인 영향 분석"),
          headers: [tr("salesMenu", "메뉴"), tr("pL_sales", "매출")],
          rows: [
            [tr("salesPromoPeriodGrossSales", "기간 총매출"), numCell(pt.periodGrossSales)],
            [tr("salesPromoPaymentDiscount", "결제 할인(기간)"), numCell(pt.discountAmount)],
            [tr("salesPromoDiscountPctOfGross", "총매출 대비 할인"), pt.discountPctOfGross / 100],
          ],
          colFormats: [salesExcelCol.text, salesExcelCol.money],
        })
        sheets.push({
          name: tr("salesTopicPaymentDiscountReport", "결제 할인"),
          headers: [
            tr("salesPaymentDiscountReason", "할인 사유"),
            tr("salesPromoCode", "프로모 코드"),
            tr("salesDiscountKindColumn", "유형"),
            tr("salesOccupancy", "주문건수"),
            tr("salesPromoPaymentDiscount", "결제 할인(기간)"),
            tr("salesPromoDiscountPctOfGross", "총매출 대비 할인"),
          ],
          rows: (promoBundleData.payment?.rows ?? []).map((r) => [
            paymentDiscountRowLabel(r, tr),
            r.code,
            paymentKindLabel(r.kind, tr),
            r.orderCount,
            numCell(r.discountAmount),
            r.discountPctOfGross / 100,
          ]),
          colFormats: [
            salesExcelCol.text,
            salesExcelCol.text,
            salesExcelCol.text,
            salesExcelCol.int,
            salesExcelCol.money,
            salesExcelCol.pct,
          ],
        })
      }
      if (selectedView === "discount-all" && (promoBundleData.combined?.byKind.length ?? 0) > 0) {
        const ct = promoBundleData.combined!.totals
        sheets.push({
          name: tr("salesCombinedDiscountAnalyticsTitle", "통합 할인 영향 분석"),
          headers: [tr("salesMenu", "메뉴"), tr("pL_sales", "매출")],
          rows: [
            [tr("salesPromoPeriodGrossSales", "기간 총매출"), numCell(ct.periodGrossSales)],
            [tr("salesPromoBundleDiscount", "세트 내재 할인"), numCell(ct.bundleDiscount)],
            [tr("salesPromoPaymentDiscount", "결제 할인(기간)"), numCell(ct.paymentDiscount)],
            [tr("salesPromoTotalDiscount", "할인 합계"), numCell(ct.totalDiscount)],
            [tr("salesPromoDiscountPctOfGross", "총매출 대비 할인"), ct.totalDiscountPctOfGross / 100],
          ],
          colFormats: [salesExcelCol.text, salesExcelCol.money],
        })
        sheets.push({
          name: tr("salesTopicCombinedDiscountReport", "통합 할인"),
          headers: [
            tr("salesCombinedDiscountLayer", "할인 층"),
            tr("salesPromoKindBreakdown", "유형별 분석"),
            tr("salesPromoTotalDiscount", "할인 합계"),
            tr("salesPromoDiscountPctOfGross", "총매출 대비 할인"),
          ],
          rows: (promoBundleData.combined?.byKind ?? []).map((k) => [
            combinedLayerLabel(k.layer, tr),
            combinedKindLabel(k, tr),
            numCell(k.discountAmount),
            k.discountPctOfGross / 100,
          ]),
          colFormats: [salesExcelCol.text, salesExcelCol.text, salesExcelCol.money, salesExcelCol.pct],
        })
      }
    } else if (selectedView === "delivery" && deliveryPieRows.length > 0) {
      sheets.push({
        name: tr("salesDeliveryChannel", "배달앱/채널"),
        headers: [tr("salesDeliveryChannel", "배달앱/채널"), tr("pL_sales", "매출"), tr("salesRatio", "비율")],
        rows: deliveryPieRows.map((r) => [r.axisLabel, numCell(r.sales), r.pct / 100]),
        colFormats: [salesExcelCol.text, salesExcelCol.money, salesExcelCol.pct],
      })
    } else if (selectedView === "payment") {
      if (deliveryPaymentChannelRows.length > 0) {
        sheets.push({
          name: tr("salesPaymentBreakdownDeliveryTitle", "결제수단별 매출 — 배달"),
          headers: [tr("salesPaymentMethod", "결제수단"), tr("pL_sales", "매출")],
          rows: deliveryPaymentChannelRows.map((r) => [r.axisLabel, numCell(r.sales)]),
          colFormats: [salesExcelCol.text, salesExcelCol.money],
        })
      }
      if (creditPaymentChannelRows.length > 0) {
        sheets.push({
          name: tr("salesPaymentBreakdownCreditTitle", "결제수단별 매출 — 카드/지갑"),
          headers: [tr("salesPaymentMethod", "결제수단"), tr("pL_sales", "매출")],
          rows: creditPaymentChannelRows.map((r) => [r.axisLabel, numCell(r.sales)]),
          colFormats: [salesExcelCol.text, salesExcelCol.money],
        })
      }
    } else if (selectedView === "store-category") {
      if (storeChartRows.length > 0) {
        sheets.push({
          name: tr("salesByStore", "매장별"),
          headers: [tr("salesStoreName", "매장명"), tr("salesQuantity", "수량"), tr("salesSalesAmount", "판매 금액")],
          rows: storeChartRows.map((r) => [r.storeDisplayName, r.count, numCell(r.total)]),
          colFormats: [salesExcelCol.text, salesExcelCol.int, salesExcelCol.money],
        })
      }
      if (channelChartRows.length > 0) {
        sheets.push({
          name: tr("salesByCategory", "분류별 (채널)"),
          headers: [tr("salesCategoryName", "분류명"), tr("salesSalesAmount", "판매 금액")],
          rows: channelChartRows.map((r) => [r.axisLabel, numCell(r.sales)]),
          colFormats: [salesExcelCol.text, salesExcelCol.money],
        })
      }
    } else if (selectedView === "yoy-compare" && yoyCompareRows.length > 0) {
      sheets.push({
        name: tr("salesTopicCompareMonthYear", "전년대비표"),
        headers: [
          tr("salesCompareMonthColumn", "월"),
          tr("salesAmount", "매출액") + ` (${parseYearFromYmd(endStr) - 1})`,
          tr("salesAmount", "매출액") + ` (${parseYearFromYmd(endStr)})`,
          tr("salesCompareYoyPct", "전년대비(%)"),
        ],
        rows: yoyCompareRows.map((r) => [
          r.month,
          numCell(r.prevYear.total),
          numCell(r.currYear.total),
          r.changePct.total ?? "",
        ]),
        colFormats: [salesExcelCol.int, salesExcelCol.money, salesExcelCol.money, salesExcelCol.money],
      })
    } else if (selectedView === "mom-compare" && momCompareRows.length > 0) {
      sheets.push({
        name: tr("salesTopicCompareMonthMom", "전월대비표"),
        headers: [
          tr("salesCompareDayColumn", "일자"),
          `${tr("salesAmount", "매출액")} (${tr("salesCompareExcelPrevMonth", "전월")})`,
          `${tr("salesAmount", "매출액")} (${tr("salesCompareExcelCurrMonth", "당월")})`,
          tr("salesCompareMomPct", "전월대비(%)"),
        ],
        rows: momCompareRows.map((r) => [
          r.dayLabel,
          numCell(r.prevMonth.total),
          numCell(r.currMonth.total),
          r.changePct.total ?? "",
        ]),
        colFormats: [salesExcelCol.text, salesExcelCol.money, salesExcelCol.money, salesExcelCol.money],
      })
    } else if (selectedView === "forecast" && forecastSummary) {
      sheets.push({
        name: tr("salesTopicForecastMonthly", "예상 매출"),
        headers: [tr("salesCompareWeekdayColumn", "요일"), tr("salesForecastDowAvgSales", "요일 평균 매출")],
        rows: [0, 1, 2, 3, 4, 5, 6].map((dow) => [
          tr(
            ["salesWeekdaySun", "salesWeekdayMon", "salesWeekdayTue", "salesWeekdayWed", "salesWeekdayThu", "salesWeekdayFri", "salesWeekdaySat"][dow]!,
            "—"
          ),
          numCell(forecastSummary.dowAverages[dow] ?? 0),
        ]),
        colFormats: [salesExcelCol.text, salesExcelCol.money],
      })
    }

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
    deliveryPaymentChannelRows,
    creditPaymentChannelRows,
    storeChartRows,
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
    const qMenu = searchParams.get("menu")
    const qTopic = searchParams.get("topic")
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
    if (!allowSalesUrlSync) return
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

  const loadAllAnalytics = React.useCallback(() => {
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
    const needChannel = selectedView === "channel" || selectedView === "overview"
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
      (PERIOD_GROUP_TOPIC_VIEWS.includes(selectedView) || selectedView === "overview")
    const effectivePeriodGroup: PeriodGroupValue =
      selectedView === "overview" ? "day" : periodGroup
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
    const needCancelReason =
      selectedView === "period" ||
      selectedView === "store-period" ||
      selectedView === "store" ||
      selectedView === "store-category" ||
      selectedView === "payment"
    const guarded =
      <T,>(setter: React.Dispatch<React.SetStateAction<T>>) =>
      (v: T) => {
        if (loadIdRef.current === id) setter(v)
      }
    const gDelivery = guarded(setDeliveryAppData)
    const gChannel = guarded(setChannelData)
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
    const gSummary = guarded(setSummaryCards)
    const gCancelReasonSummary = guarded(setCancelReasonSummary)
    setLoading(true)
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
          .catch(() => {
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
          .catch(() => {
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
          .catch(() => {
            gMom([])
            gSummary({ current: 0, prevRange: 0, prevWeek: 0 })
          })
      )
    }

    if (needForecast) {
      const anchor = endStr
      const lookbackStart = addBangkokCalendarDays(anchor, -83)
      const yearR = yearRangeYmd(parseYearFromYmd(anchor))
      tasks.push(
        Promise.all([
          periodRun({
            startStr: lookbackStart,
            endStr: anchor,
            groupBy: "day",
            stores: salesFetchStoresParam,
            orderTypes: orderTypesParam,
          }),
          periodRun({
            startStr: yearR.startStr,
            endStr: anchor,
            groupBy: "day",
            stores: salesFetchStoresParam,
            orderTypes: orderTypesParam,
          }),
        ])
          .then(([lookbackRes, actualRes]) => {
            if (loadIdRef.current !== id) return
            const lbRows = periodRowsFromResult(lookbackRes)
            const actRows = periodRowsFromResult(actualRes)
            gForecastLookback(lbRows)
            gForecastActual(actRows)
            const forecast = computeSalesForecast({
              horizon: forecastHorizon,
              anchorYmd: anchor,
              lookbackDailyRows: lbRows,
              actualDailyRows: actRows,
            })
            gForecast(forecast)
            gSummary({
              current: forecast.expectedTotal,
              prevRange: 0,
              prevWeek: 0,
            })
          })
          .catch(() => {
            gForecast(null)
            gForecastLookback([])
            gForecastActual([])
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
          .catch(() => gDelivery({ items: [], total: 0 }))
      )
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
          .catch(() => gChannel([]))
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
          .catch(() => {
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
          .catch(() => {
            gStore([])
            if (needCurrentSummaryOnly) gSummary({ current: 0, prevRange: 0, prevWeek: 0 })
          })
      )
    }
    if (needMenu) {
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
          .catch(() => gMenu([]))
      )
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
          .catch(() => gPromoBundle(EMPTY_POS_SALES_BY_PROMO))
      )
    }
    if (needFullSummary && (selectedView === "period" || selectedView === "store-period" || selectedView === "overview")) {
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
    // 취소사유는 스피너를 막지 않음 — 메인 집계와 병렬이지만 Promise.all 밖
    if (needCancelReason) {
      setCancelReasonLoading(true)
      gCancelReasonSummary({
        lineRows: [],
        orderRows: [],
        lineTotalCount: 0,
        lineTotalAmount: 0,
        orderTotalCount: 0,
        orderTotalAmount: 0,
        truncated: false,
      })
      void getPosCancelReasonSummary({
        startStr,
        endStr,
        stores: salesFetchStoresParam,
        orderTypes: orderTypesParam,
      })
        .then((res) => {
          if (loadIdRef.current !== id) return
          gCancelReasonSummary({
            lineRows: res.lineRows,
            orderRows: res.orderRows,
            lineTotalCount: res.lineTotalCount,
            lineTotalAmount: res.lineTotalAmount,
            orderTotalCount: res.orderTotalCount,
            orderTotalAmount: res.orderTotalAmount,
            truncated: res.truncated === true,
          })
        })
        .catch(() => {
          if (loadIdRef.current !== id) return
          gCancelReasonSummary({
            lineRows: [],
            orderRows: [],
            lineTotalCount: 0,
            lineTotalAmount: 0,
            orderTotalCount: 0,
            orderTotalAmount: 0,
            truncated: false,
          })
        })
        .finally(() => {
          if (loadIdRef.current === id) setCancelReasonLoading(false)
        })
    } else {
      setCancelReasonLoading(false)
      gCancelReasonSummary({
        lineRows: [],
        orderRows: [],
        lineTotalCount: 0,
        lineTotalAmount: 0,
        orderTotalCount: 0,
        orderTotalAmount: 0,
        truncated: false,
      })
    }
    Promise.all(tasks).finally(() => {
      if (loadIdRef.current === id) {
        setLoading(false)
        setFetchedAnalyticsKey(keySnapshot)
      }
    })
  }, [
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
  ])

  useErpRefetchOnActivate(() => {
    if (!showSalesResults) return
    loadAllAnalytics()
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

  React.useEffect(() => {
    if (selectedView !== "forecast" || !showSalesResults) return
    if (forecastLookbackRows.length === 0 && forecastActualRows.length === 0) return
    const next = computeSalesForecast({
      horizon: forecastHorizon,
      anchorYmd: endStr,
      lookbackDailyRows: forecastLookbackRows,
      actualDailyRows: forecastActualRows,
    })
    setForecastSummary(next)
    setSummaryCards((prev) => ({ ...prev, current: next.expectedTotal }))
  }, [
    selectedView,
    showSalesResults,
    forecastHorizon,
    forecastLookbackRows,
    forecastActualRows,
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
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Input
                type="date"
                value={startStr}
                onChange={(e) => {
                  const v = e.target.value
                  userSelectedRef.current.dateRange = `${v}~${endStr}`
                  setStartStr(v)
                }}
                className="h-9 w-full text-[13px] sm:w-[172px]"
              />
              <span className="hidden text-slate-500 sm:inline">~</span>
              <Input
                type="date"
                value={endStr}
                onChange={(e) => {
                  const v = e.target.value
                  userSelectedRef.current.dateRange = `${startStr}~${v}`
                  setEndStr(v)
                }}
                className="h-9 w-full text-[13px] sm:w-[172px]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SalesStorePicker
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
                allStoreOptions={posBizDayStoreChoices}
                onStoresChange={applyStoreSelection}
                posBizDayStoreChoices={posBizDayStoreChoices}
                posStoreDisplayName={posStoreDisplayName}
                filteredStoreOptions={filteredStoreOptions}
                storeSearch={storeSearch}
                setStoreSearch={setStoreSearch}
                singleStoreLabel={
                  canMultiStorePicker
                    ? undefined
                    : posStoreDisplayName(selectedStores[0] ?? auth?.store ?? "") ||
                      tr("salesSelectStoreAll", "매장(전체)")
                }
              />
            </div>
            <Button
              size="sm"
              onClick={loadAllAnalytics}
              disabled={!canQuerySales || loading}
              title={
                canMultiStorePicker && selectedStores.length === 0
                  ? tr("salesQueryNeedStore", "매장을 선택해 주세요.")
                  : undefined
              }
            >
              {tr("salesQuery", "조회")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={saveCurrentPreset}>
              {tr("salesSavePreset", "조건 저장")}
            </Button>
            {showSalesResults ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canExportExcel || loading}
                onClick={() => void handleExportExcel()}
              >
                {tr("salesExportExcel", "엑셀 다운로드")}
              </Button>
            ) : null}
          </div>
          ) : null}

          {!isHoursPanel ? (
            <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
              {tr(
                "salesExcludeTestOfficePosNote",
                "본사·오피스 POS 주문은 테스트용이라 매출 관리 집계·매장 목록에 포함되지 않습니다. 본사 매출은 손익(물류 출고)에서 확인하세요."
              )}
            </p>
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
          <div className="relative mb-3 md:hidden" ref={salesNavPickerRef}>
            <Button
              id={salesNavPickerBtnId}
              type="button"
              variant="outline"
              className="h-10 w-full justify-between gap-2"
              aria-expanded={salesNavPickerOpen}
              aria-controls={salesNavPickerListId}
              aria-haspopup="dialog"
              onClick={() => {
                setOrderTypesPickerOpen(false)
                setPeriodPickerOpen(false)
                setSalesNavPickerOpen((prev) => {
                  const next = !prev
                  if (next) setSalesNavQuery("")
                  return next
                })
              }}
            >
              <span className="min-w-0 truncate text-left text-sm font-medium">
                <span className="text-muted-foreground">
                  {tr(currentSubMenu.labelKey, currentSubMenu.fallbackLabel)}
                </span>
                <span className="mx-1 text-muted-foreground">·</span>
                <span>{tr(selectedTopic.labelKey, I18N_KO[selectedTopic.labelKey] ?? selectedTopic.labelKey)}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{salesNavPickerOpen ? "▲" : "▼"}</span>
            </Button>
            {salesNavPickerOpen ? (
              <div
                id={salesNavPickerListId}
                role="dialog"
                aria-modal="false"
                aria-labelledby={salesNavPickerBtnId}
                className="absolute z-30 mt-1 w-full rounded-lg border bg-background shadow-lg"
              >
                <div className="border-b p-2">
                  <Input
                    value={salesNavQuery}
                    onChange={(e) => setSalesNavQuery(e.target.value)}
                    placeholder={tr("salesReportMenuSearchPh", "메뉴·주제 검색…")}
                    className="h-9"
                    autoFocus
                  />
                </div>
                <ul className="max-h-[min(60vh,320px)] overflow-y-auto py-1" role="listbox">
                  {filteredSalesNavRows.length === 0 ? (
                    <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                      {tr("salesDataNone", "데이터 없음")}
                    </li>
                  ) : (
                    filteredSalesNavRows.map((row) => {
                      const activeRow = row.subMenuId === activeSubMenuId && row.topicId === selectedTopicId
                      return (
                        <li key={`${row.subMenuId}-${row.topicId}`} role="presentation">
                          <button
                            type="button"
                            role="option"
                            aria-selected={activeRow}
                            className={
                              "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm hover:bg-muted/80 " +
                              (activeRow ? "bg-muted" : "")
                            }
                            onClick={() => {
                              userSelectedRef.current.subMenu = row.subMenuId
                              userSelectedRef.current.topic = row.topicId
                              setActiveSubMenuId(row.subMenuId)
                              setSelectedTopicBySubMenu((prev) => ({
                                ...prev,
                                [row.subMenuId]: row.topicId,
                              }))
                              setSalesNavPickerOpen(false)
                              setSalesNavQuery("")
                            }}
                          >
                            <span className="text-xs text-muted-foreground">{row.menuLabel}</span>
                            <span className="font-medium">{row.topicLabel}</span>
                          </button>
                        </li>
                      )
                    })
                  )}
                </ul>
              </div>
            ) : null}
          </div>

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

            <div className="mb-3 space-y-4 rounded-lg border bg-muted/20 p-3 md:hidden">
              <div className="space-y-2">
                <span className="text-sm font-medium">{tr("salesAmountKindLabel", "매출액 종류")}</span>
                <div className="relative" ref={orderTypesPickerRef}>
                  <Button
                    id={orderTypesPickerBtnId}
                    type="button"
                    variant="outline"
                    className="h-10 w-full justify-between gap-2"
                    aria-expanded={orderTypesPickerOpen}
                    aria-controls={orderTypesPickerListId}
                    aria-haspopup="dialog"
                    onClick={() => {
                      setSalesNavPickerOpen(false)
                      setOrderTypesPickerOpen((prev) => {
                        const next = !prev
                        if (next) setOrderTypesQuery("")
                        return next
                      })
                      setPeriodPickerOpen(false)
                    }}
                  >
                    <span className="min-w-0 truncate text-left text-sm font-medium">{orderTypesSummaryLabel}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{orderTypesPickerOpen ? "▲" : "▼"}</span>
                  </Button>
                  {orderTypesPickerOpen ? (
                    <div
                      id={orderTypesPickerListId}
                      role="dialog"
                      aria-modal="false"
                      aria-labelledby={orderTypesPickerBtnId}
                      className="absolute z-30 mt-1 w-full rounded-lg border bg-background shadow-lg"
                    >
                      <div className="border-b p-2">
                        <Input
                          value={orderTypesQuery}
                          onChange={(e) => setOrderTypesQuery(e.target.value)}
                          placeholder={tr("salesFilterOrderTypeSearchPh", "매출액 종류 검색…")}
                          className="h-9"
                          autoFocus
                        />
                      </div>
                      <ul className="max-h-[min(50vh,280px)] overflow-y-auto py-1" role="listbox">
                        {filteredOrderTypesPickerRows.length === 0 ? (
                          <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                            {tr("salesDataNone", "데이터 없음")}
                          </li>
                        ) : (
                          filteredOrderTypesPickerRows.map((row) => {
                            if (row.kind === "all") {
                              const activeAll = orderTypesKey === ""
                              return (
                                <li key="all" role="presentation">
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={activeAll}
                                    className={
                                      "flex w-full px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/80 " +
                                      (activeAll ? "bg-muted" : "")
                                    }
                                    onClick={() => {
                                      setSalesAllOrderTypes()
                                    }}
                                  >
                                    {row.label}
                                  </button>
                                </li>
                              )
                            }
                            const type = row.type!
                            const active = orderTypesKey !== "" && orderTypesKey.split(",").includes(type)
                            return (
                              <li key={type} role="presentation">
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={active}
                                  className={
                                    "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted/80 " +
                                    (active ? "bg-muted" : "")
                                  }
                                  onClick={() => toggleOrderTypeChannel(type)}
                                >
                                  <span className="font-medium">{row.label}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {active ? "✓" : ""}
                                  </span>
                                </button>
                              </li>
                            )
                          })
                        )}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
              {needsPeriodGroup ? (
                <div className="space-y-2">
                  <span className="text-sm font-medium">{tr("salesPeriodGranularityLabel", "집계 기간")}</span>
                  <div className="relative" ref={periodPickerRef}>
                    <Button
                      id={periodPickerBtnId}
                      type="button"
                      variant="outline"
                      className="h-10 w-full justify-between gap-2"
                      aria-expanded={periodPickerOpen}
                      aria-controls={periodPickerListId}
                      aria-haspopup="dialog"
                      onClick={() => {
                        setSalesNavPickerOpen(false)
                        setPeriodPickerOpen((prev) => {
                          const next = !prev
                          if (next) setPeriodQuery("")
                          return next
                        })
                        setOrderTypesPickerOpen(false)
                      }}
                    >
                      <span className="min-w-0 truncate text-left text-sm font-medium">
                        {periodPickerFlatRows.find((r) => r.value === periodGroup)?.label ?? periodGroup}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{periodPickerOpen ? "▲" : "▼"}</span>
                    </Button>
                    {periodPickerOpen ? (
                      <div
                        id={periodPickerListId}
                        role="dialog"
                        aria-modal="false"
                        aria-labelledby={periodPickerBtnId}
                        className="absolute z-30 mt-1 w-full rounded-lg border bg-background shadow-lg"
                      >
                        <div className="border-b p-2">
                          <Input
                            value={periodQuery}
                            onChange={(e) => setPeriodQuery(e.target.value)}
                            placeholder={tr("salesFilterPeriodSearchPh", "집계 기간 검색…")}
                            className="h-9"
                            autoFocus
                          />
                        </div>
                        <ul className="max-h-[min(50vh,280px)] overflow-y-auto py-1" role="listbox">
                          {filteredPeriodPickerRows.length === 0 ? (
                            <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                              {tr("salesDataNone", "데이터 없음")}
                            </li>
                          ) : (
                            filteredPeriodPickerRows.map((row) => {
                              const active = periodGroup === row.value
                              return (
                                <li key={row.value} role="presentation">
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={active}
                                    className={
                                      "flex w-full px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/80 " +
                                      (active ? "bg-muted" : "")
                                    }
                                    onClick={() => {
                                      userSelectedRef.current.periodGroup = row.value
                                      setPeriodGroup(row.value)
                                      setPeriodPickerOpen(false)
                                      setPeriodQuery("")
                                    }}
                                  >
                                    {row.label}
                                  </button>
                                </li>
                              )
                            })
                          )}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {showDowFilter ? (
                <div className="space-y-2">
                  <span className="text-sm font-medium">{tr("salesDowFilterLabel", "요일")}</span>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={dowsKey === "" ? "default" : "outline"}
                      onClick={setSalesAllDows}
                    >
                      {tr("salesDowFilterAll", "전체")}
                    </Button>
                    {POS_SALES_DOW_TOGGLE_ORDER.map((d) => {
                      const active = dowsKey !== "" && dowsKey.split(",").includes(String(d))
                      const labelKey = POS_SALES_DOW_LABEL_KEYS[d]
                      return (
                        <Button
                          key={d}
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          onClick={() => toggleDowFilter(d)}
                        >
                          {tr(labelKey, I18N_KO[labelKey] ?? String(d))}
                        </Button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mb-3 hidden rounded-lg border bg-muted/20 p-3 md:block">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="shrink-0 text-sm font-medium">
                    {tr("salesAmountKindLabel", "매출액 종류")}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={orderTypesKey === "" ? "default" : "outline"}
                      onClick={setSalesAllOrderTypes}
                    >
                      {tr("salesAmountKindAll", "전체")}
                    </Button>
                    {SALES_ORDER_TYPE_TOGGLES.map(({ type, labelKey, fallback }) => {
                      const active = orderTypesKey !== "" && orderTypesKey.split(",").includes(type)
                      return (
                        <Button
                          key={type}
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          onClick={() => toggleOrderTypeChannel(type)}
                        >
                          {tr(labelKey, fallback)}
                        </Button>
                      )
                    })}
                  </div>
                </div>
                {needsPeriodGroup ? (
                  <>
                    <span className="hidden h-4 w-px shrink-0 bg-border sm:inline-block" aria-hidden />
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="shrink-0 text-sm font-medium">
                        {tr("salesPeriodGranularityLabel", "집계 기간")}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {PERIOD_GROUP.map((g) => (
                          <Button
                            key={g.value}
                            size="sm"
                            variant={periodGroup === g.value ? "default" : "outline"}
                            onClick={() => {
                              userSelectedRef.current.periodGroup = g.value
                              setPeriodGroup(g.value)
                            }}
                          >
                            {tr(g.labelKey, I18N_KO[g.labelKey] ?? g.labelKey)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}
                {showDowFilter ? (
                  <>
                    <span className="hidden h-4 w-px shrink-0 bg-border sm:inline-block" aria-hidden />
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="shrink-0 text-sm font-medium">
                        {tr("salesDowFilterLabel", "요일")}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={dowsKey === "" ? "default" : "outline"}
                          onClick={setSalesAllDows}
                        >
                          {tr("salesDowFilterAll", "전체")}
                        </Button>
                        {POS_SALES_DOW_TOGGLE_ORDER.map((d) => {
                          const active = dowsKey !== "" && dowsKey.split(",").includes(String(d))
                          const labelKey = POS_SALES_DOW_LABEL_KEYS[d]
                          return (
                            <Button
                              key={d}
                              type="button"
                              size="sm"
                              variant={active ? "default" : "outline"}
                              onClick={() => toggleDowFilter(d)}
                            >
                              {tr(labelKey, I18N_KO[labelKey] ?? String(d))}
                            </Button>
                          )
                        })}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </>
          ) : null}

          {showSalesResults && periodTruncated ? (
            <p className={`mb-3 ${ADMIN_PANEL_WARNING_CN}`} role="status">
              {tr(
                "salesDataTruncatedDailyWarning",
                "주문 조회 상한에 걸려 일부만 반영되었습니다. 기간을 나누어 조회하지 않으면 같은 날짜도 금액이 달라 보일 수 있습니다."
              )}
            </p>
          ) : null}

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
            cancelReasonSummary={cancelReasonSummary}
            cancelReasonLoading={cancelReasonLoading}
            showInsightPanel={showInsightPanel}
            onCancelReasonDrilldown={handleCancelReasonDrilldown}
          />

          <div className="mt-6 overflow-auto max-h-[calc(100vh-380px)] min-h-[200px] rounded-lg border p-4">
            {isHoursPanel ? (
              <SalesPosBusinessDaySettings
                tr={tr}
                canEditGlobal={canSearchAll}
                canEditStore={canSearchAll || canEditPosBizDayStore}
                storeChoices={posBizDayStoreChoices}
              />
            ) : (
            <>
            {selectedView === "period" && (
              salesAnalyticsPlaceholder ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {salesAnalyticsPlaceholder}
                </p>
              ) : (
                <>
                  {periodTruncated ? (
                    <p
                      className={`mb-3 ${ADMIN_PANEL_WARNING_CN}`}
                      role="status"
                    >
                      {tr(
                        "salesDataTruncatedWarning",
                        "조회 기간 내 주문이 많아 일부만 반영했을 수 있습니다. 기간을 나누어 조회해 보세요."
                      )}
                    </p>
                  ) : null}
                  {!showComparePeriodChart ? (
                    <SalesPaymentTenderGapAlert gaps={periodPaymentTenderGaps} tr={tr} />
                  ) : null}
                  {canSearchAll && (selectedStoresParam?.length ?? 0) >= 2 ? (
                    <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={compareStores}
                        onCheckedChange={(c) => {
                          const on = c === true
                          userSelectedRef.current.compare = on
                          setCompareStores(on)
                        }}
                      />
                      <span>{tr("salesCompareByStorePeriod", "기간 차트를 매장별로 비교")}</span>
                    </label>
                  ) : null}
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={showComparePeriodChart ? comparePeriodChartRows : periodChartRows}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="axisLabel" {...periodBarXAxisProps} />
                        <YAxis {...periodChartYAxisProps} />
                        <Tooltip
                          formatter={(v: number, name: string) => [formatSalesAmount(v), name]}
                        />
                        {showComparePeriodChart ? (
                          <>
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            {storesForCompareChart.map((s, i) => (
                              <Bar
                                key={s}
                                dataKey={`sales_${s}`}
                                fill={COLORS[i % COLORS.length]}
                                name={posStoreDisplayName(s)}
                              />
                            ))}
                          </>
                        ) : (
                          <Bar dataKey="sales" fill="#3b82f6" name={tr("pL_sales", "매출")} />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="mt-4 w-full min-w-[1480px] text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 text-left">
                          {periodGroup === "hour"
                            ? tr("salesPeriodHourColumn", "시간대")
                            : tr("salesPeriod", "기간")}
                        </th>
                        <th className="py-2 text-right">{tr("salesOccupancy", "주문건수")}</th>
                        <th className="py-2 text-right">{tr("salesGuestCount", "손님 수(홀)")}</th>
                        <th className="py-2 text-right">{tr("salesHallPerOrder", "홀 건당")}</th>
                        <th className="py-2 text-right">{tr("salesHallPerGuest", "홀 1인당")}</th>
                        <th className="py-2 text-right">{tr("salesPerOrderInScope", "건당")}</th>
                        <th className="py-2 text-right">{tr("salesSupplyAmount", "공급가액")}</th>
                        <th className="py-2 text-right">{tr("salesTax", "세금")}</th>
                        <th className="py-2 text-right">{tr("salesDiscountAmount", "할인 금액")}</th>
                        <th className="py-2 text-right">{tr("salesServiceAmount", "서비스처리 금액")}</th>
                        <th className="py-2 text-right">{tr("salesAmount", "매출액")}</th>
                        {PERIOD_PAYMENT_COLUMNS.map((c) => (
                          <th key={c.field} className="py-2 text-right">
                            {tr(c.labelKey, c.fallback)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {periodChartRows.map((r) => {
                        const tenderGap = posSalesPeriodPaymentTenderGap(r)
                        return (
                        <tr
                          key={r.key}
                          className={`border-b ${tenderGap !== 0 ? "bg-amber-50/80 dark:bg-amber-950/20" : ""}`}
                          title={
                            tenderGap !== 0
                              ? tr(
                                  "salesPaymentTenderGapRowTitle",
                                  "매출액과 결제수단 합계 불일치"
                                )
                              : undefined
                          }
                        >
                          <td className="py-1.5">{r.axisLabel}</td>
                          <td className="py-1.5 text-right font-erp-numeric">{r.count.toLocaleString()}</td>
                          <td className="py-1.5 text-right font-erp-numeric">{r.hallGuestSum.toLocaleString()}</td>
                          <td className="py-1.5 text-right font-erp-numeric">
                            {r.dineInOrderCount > 0 ? formatSalesAmount(r.salesPerDineInOrder) : "—"}
                          </td>
                          <td className="py-1.5 text-right font-erp-numeric">
                            {r.hallGuestSum > 0 ? formatSalesAmount(r.salesPerGuestHall) : "—"}
                          </td>
                          <td className="py-1.5 text-right font-erp-numeric">
                            {r.count > 0 ? formatSalesAmount(r.salesPerOrder) : "—"}
                          </td>
                          <td className="py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.subtotal)}</td>
                          <td className="py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.vat)}</td>
                          <td className="py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.discount)}</td>
                          <td className="py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.service ?? 0)}</td>
                          <td className="py-1.5 text-right font-erp-numeric font-medium">{formatSalesAmount(r.total)}</td>
                          {PERIOD_PAYMENT_COLUMNS.map((c) => (
                            <td key={c.field} className="py-1.5 text-right font-erp-numeric">
                              {formatSalesAmount(periodPaymentAmount(r, c.field))}
                            </td>
                          ))}
                        </tr>
                        )
                      })}
                      {periodChartRows.length > 0 && (
                        <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                          <td className="py-2">{tr("salesTotalLabel", "합계")}</td>
                          <td className="py-2 text-right font-erp-numeric">
                            {periodChartRows.reduce((a, x) => a + x.count, 0).toLocaleString()}
                          </td>
                          <td className="py-2 text-right font-erp-numeric">
                            {periodChartRows.reduce((a, x) => a + x.hallGuestSum, 0).toLocaleString()}
                          </td>
                          <td className="py-2 text-right font-erp-numeric">
                            {(() => {
                              const c = periodChartRows.reduce((a, x) => a + x.dineInOrderCount, 0)
                              const t = periodChartRows.reduce((a, x) => a + x.dineInTotal, 0)
                              return c > 0 ? formatSalesAmount(Math.round((t / c) * 100) / 100) : "—"
                            })()}
                          </td>
                          <td className="py-2 text-right font-erp-numeric">
                            {(() => {
                              const gD = periodChartRows.reduce((a, x) => a + x.dineInGuestSum, 0)
                              const tD = periodChartRows.reduce((a, x) => a + x.dineInTotal, 0)
                              const gH = periodChartRows.reduce((a, x) => a + x.hallGuestSum, 0)
                              const tAll = periodChartRows.reduce((a, x) => a + x.total, 0)
                              if (gD > 0 && tD > 0)
                                return formatSalesAmount(Math.round((tD / gD) * 100) / 100)
                              if (gH > 0 && tAll > 0)
                                return formatSalesAmount(Math.round((tAll / gH) * 100) / 100)
                              return "—"
                            })()}
                          </td>
                          <td className="py-2 text-right font-erp-numeric">
                            {(() => {
                              const c = periodChartRows.reduce((a, x) => a + x.count, 0)
                              const t = periodChartRows.reduce((a, x) => a + x.total, 0)
                              return c > 0 ? formatSalesAmount(Math.round((t / c) * 100) / 100) : "—"
                            })()}
                          </td>
                          <td className="py-2 text-right font-erp-numeric">
                            {formatSalesAmount(periodChartRows.reduce((a, x) => a + x.subtotal, 0))}
                          </td>
                          <td className="py-2 text-right font-erp-numeric">
                            {formatSalesAmount(periodChartRows.reduce((a, x) => a + x.vat, 0))}
                          </td>
                          <td className="py-2 text-right font-erp-numeric">
                            {formatSalesAmount(periodChartRows.reduce((a, x) => a + x.discount, 0))}
                          </td>
                          <td className="py-2 text-right font-erp-numeric">
                            {formatSalesAmount(periodChartRows.reduce((a, x) => a + (x.service ?? 0), 0))}
                          </td>
                          <td className="py-2 text-right font-erp-numeric">
                            {formatSalesAmount(periodChartRows.reduce((a, x) => a + x.total, 0))}
                          </td>
                          {PERIOD_PAYMENT_COLUMNS.map((c) => (
                            <td key={c.field} className="py-2 text-right font-erp-numeric">
                              {formatSalesAmount(
                                periodChartRows.reduce((a, x) => a + periodPaymentAmount(x, c.field), 0)
                              )}
                            </td>
                          ))}
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                    {tr(
                      "salesAmountBreakdownFootnote",
                      "공급가액은 품목 합계(할인 전)입니다. 세금·매출액은 POS 요금·부가세 계산 규칙이 반영된 값입니다. 할인 금액은 수동 할인과 쿠폰 할인의 합이며, 서비스처리 금액은 별도 집계됩니다."
                    )}{" "}
                    {tr(
                      "salesGuestMetricsFootnote",
                      "손님 수(홀)·홀 건당·홀 1인당은 dine_in 주문과 POS guest_count만 사용합니다. 건당은 현재 매출액 종류 필터에 포함된 주문 전체의 매출÷건수입니다. 포장·배달은 인원 미입력이므로 홀 지표와 섞지 않습니다."
                    )}{" "}
                    {tr(
                      "salesPeriodTenderFootnote",
                      "결제수단별 열은 POS 주문 payment_cash·payment_card·payment_qr·payment_delivery_app·payment_other 합계입니다. 매출액과 다르면 상단 경고·노란 행으로 표시됩니다."
                    )}
                  </p>
                </>
              )
            )}

            {selectedView === "store-period" && (
              salesAnalyticsPlaceholder ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {salesAnalyticsPlaceholder}
                </p>
              ) : (
                <>
                  {periodTruncated ? (
                    <p
                      className={`mb-3 ${ADMIN_PANEL_WARNING_CN}`}
                      role="status"
                    >
                      {tr(
                        "salesDataTruncatedWarning",
                        "조회 기간 내 주문이 많아 일부만 반영했을 수 있습니다. 기간을 나누어 조회해 보세요."
                      )}
                    </p>
                  ) : null}
                  <SalesPaymentTenderGapAlert gaps={storePeriodPaymentTenderGaps} tr={tr} />
                  {storeByPeriodFlatRows.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {tr("salesDataNone", "데이터 없음")}
                    </p>
                  ) : (
                    <AdminTableScroll className="rounded-md border" hint={false}>
                      <table className="w-full min-w-[1480px] text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40 text-muted-foreground">
                            <th className="px-3 py-2 text-left">{tr("salesStoreName", "매장명")}</th>
                            <th className="px-3 py-2 text-left">
                              {periodGroup === "hour"
                                ? tr("salesPeriodHourColumn", "시간대")
                                : tr("salesPeriod", "기간")}
                            </th>
                            <th className="px-3 py-2 text-right">{tr("salesOccupancy", "주문건수")}</th>
                            <th className="px-3 py-2 text-right">{tr("salesGuestCount", "손님 수(홀)")}</th>
                            <th className="px-3 py-2 text-right">{tr("salesHallPerOrder", "홀 건당")}</th>
                            <th className="px-3 py-2 text-right">{tr("salesHallPerGuest", "홀 1인당")}</th>
                            <th className="px-3 py-2 text-right">{tr("salesPerOrderInScope", "건당")}</th>
                            <th className="px-3 py-2 text-right">{tr("salesSupplyAmount", "공급가액")}</th>
                            <th className="px-3 py-2 text-right">{tr("salesTax", "세금")}</th>
                            <th className="px-3 py-2 text-right">{tr("salesDiscountAmount", "할인 금액")}</th>
                            <th className="px-3 py-2 text-right">{tr("salesServiceAmount", "서비스처리 금액")}</th>
                            <th className="px-3 py-2 text-right">{tr("salesAmount", "매출액")}</th>
                            {PERIOD_PAYMENT_COLUMNS.map((c) => (
                              <th key={c.field} className="px-3 py-2 text-right">
                                {tr(c.labelKey, c.fallback)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {storeByPeriodFlatRows.map((r) => {
                            const tenderGap = posSalesPeriodPaymentTenderGap(r)
                            return (
                            <tr
                              key={`${r.storeCode}\t${r.key}`}
                              className={`border-b border-border/60 ${tenderGap !== 0 ? "bg-amber-50/80 dark:bg-amber-950/20" : ""}`}
                              title={
                                tenderGap !== 0
                                  ? tr(
                                      "salesPaymentTenderGapRowTitle",
                                      "매출액과 결제수단 합계 불일치"
                                    )
                                  : undefined
                              }
                            >
                              <td className="px-3 py-1.5 font-medium">{r.storeDisplay}</td>
                              <td className="px-3 py-1.5">{r.axisLabel}</td>
                              <td className="px-3 py-1.5 text-right font-erp-numeric">{r.count.toLocaleString()}</td>
                              <td className="px-3 py-1.5 text-right font-erp-numeric">{r.hallGuestSum.toLocaleString()}</td>
                              <td className="px-3 py-1.5 text-right font-erp-numeric">
                                {r.dineInOrderCount > 0 ? formatSalesAmount(r.salesPerDineInOrder) : "—"}
                              </td>
                              <td className="px-3 py-1.5 text-right font-erp-numeric">
                                {r.hallGuestSum > 0 ? formatSalesAmount(r.salesPerGuestHall) : "—"}
                              </td>
                              <td className="px-3 py-1.5 text-right font-erp-numeric">
                                {r.count > 0 ? formatSalesAmount(r.salesPerOrder) : "—"}
                              </td>
                              <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.subtotal)}</td>
                              <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.vat)}</td>
                              <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.discount)}</td>
                              <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.service ?? 0)}</td>
                              <td className="px-3 py-1.5 text-right font-erp-numeric font-medium">
                                {formatSalesAmount(r.total)}
                              </td>
                              {PERIOD_PAYMENT_COLUMNS.map((c) => (
                                <td key={c.field} className="px-3 py-1.5 text-right font-erp-numeric">
                                  {formatSalesAmount(periodPaymentAmount(r, c.field))}
                                </td>
                              ))}
                            </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </AdminTableScroll>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                    {tr(
                      "salesStorePeriodFootnote",
                      "매장을 전체로 두면 이 기간에 주문이 있는 매장만 행으로 나옵니다. 위쪽「집계 기간」으로 년·월·주·일·요일·시간대를 바꿀 수 있습니다."
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {tr(
                      "salesAmountBreakdownFootnote",
                      "공급가액은 품목 합계(할인 전)입니다. 세금·매출액은 POS 요금·부가세 계산 규칙이 반영된 값입니다. 할인 금액은 수동 할인과 쿠폰 할인의 합이며, 서비스처리 금액은 별도 집계됩니다."
                    )}{" "}
                    {tr(
                      "salesGuestMetricsFootnote",
                      "손님 수(홀)·홀 건당·홀 1인당은 dine_in 주문과 POS guest_count만 사용합니다. 건당은 현재 매출액 종류 필터에 포함된 주문 전체의 매출÷건수입니다. 포장·배달은 인원 미입력이므로 홀 지표와 섞지 않습니다."
                    )}{" "}
                    {tr(
                      "salesPeriodTenderFootnote",
                      "결제수단별 열은 POS 주문 payment_cash·payment_card·payment_qr·payment_delivery_app·payment_other 합계입니다. 매출액과 다르면 상단 경고·노란 행으로 표시됩니다."
                    )}
                  </p>
                </>
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
                <>
                  <SalesPeriodTrendChartBlock
                    rows={periodChartRows}
                    periodBarXAxisProps={periodBarXAxisProps}
                    periodChartYAxisProps={periodChartYAxisProps}
                    tr={tr}
                  />
                <div className="flex flex-wrap gap-6">
                  <div className="h-[280px] w-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={deliveryPieRows}
                          dataKey="sales"
                          nameKey="axisLabel"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ name, percent }) =>
                            `${String(name ?? "")} ${((percent ?? 0) * 100).toFixed(1)}%`
                          }
                        >
                          {deliveryPieRows.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatSalesAmount(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="min-w-[200px] flex-1">
                    <p className="mb-2 text-lg font-bold">
                      {tr("salesTotal", "총")} {tr("pL_sales", "매출")} {formatSalesAmount(deliveryAppData.total)}
                    </p>
                    <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 text-center">{tr("salesDeliveryChannel", "배달앱/채널")}</th>
                        <th className="py-2 text-right">{tr("pL_sales", "매출")}</th>
                        <th className="py-2 text-right">{tr("salesRatio", "비율")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveryPieRows.map((r) => (
                        <tr key={r.channelKey} className="border-b">
                          <td className="py-1.5 text-center">{r.axisLabel}</td>
                          <td className="py-1.5 text-right font-erp-numeric">
                            {formatSalesAmount(r.sales)}
                          </td>
                          <td className="py-1.5 text-right text-muted-foreground">
                            {r.pct.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    </table>
                    {deliveryPlatformBreakdown.length > 0 ? (
                      <Collapsible defaultOpen className="mt-4 rounded-md border bg-muted/10">
                        <CollapsibleTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="flex w-full justify-between px-3 py-2 font-medium"
                          >
                            <span>{tr("salesDeliveryPlatformBreakdown", "배달 플랫폼별")}</span>
                            <span className="text-xs text-muted-foreground">▼</span>
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="flex flex-wrap gap-4 border-t px-3 pb-3 pt-2">
                            <div className="h-[220px] w-[220px] shrink-0">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={deliveryPlatformPieRows}
                                    dataKey="sales"
                                    nameKey="axisLabel"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={78}
                                    label={({ name, percent }) =>
                                      `${String(name ?? "")} ${((percent ?? 0) * 100).toFixed(0)}%`
                                    }
                                  >
                                    {deliveryPlatformPieRows.map((_, i) => (
                                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                    ))}
                                  </Pie>
                                  <Tooltip formatter={(v: number) => formatSalesAmount(v)} />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="min-w-[200px] flex-1">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b text-muted-foreground">
                                    <th className="py-2 text-center">
                                      {tr("salesDeliveryPlatformBreakdown", "배달 플랫폼별")}
                                    </th>
                                    <th className="py-2 text-right">{tr("pL_sales", "매출")}</th>
                                    <th className="py-2 text-right">{tr("salesRatio", "비율")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {deliveryPlatformPieRows.map((r) => (
                                    <tr key={r.code} className="border-b">
                                      <td className="py-1.5 text-center">{r.axisLabel}</td>
                                      <td className="py-1.5 text-right font-erp-numeric">
                                        {formatSalesAmount(r.sales)}
                                      </td>
                                      <td className="py-1.5 text-right text-muted-foreground">
                                        {r.pct.toFixed(1)}%
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <p className="mt-2 text-xs text-muted-foreground">
                                {tr(
                                  "salesDeliveryPlatformFootnote",
                                  "비율은 배달 매출 합계 대비입니다. 과거 주문은 품목에 저장된 배달앱 코드로 추정할 수 있습니다."
                                )}
                              </p>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ) : null}
                  </div>
                </div>
                </>
              )
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
                <>
                  <SalesPeriodTrendChartBlock
                    rows={periodChartRows}
                    periodBarXAxisProps={periodBarXAxisProps}
                    periodChartYAxisProps={periodChartYAxisProps}
                    tr={tr}
                  />
                  <div className="mb-4 h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={channelChartRows} layout="vertical" margin={{ left: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" {...periodChartYAxisProps} />
                        <YAxis dataKey="axisLabel" type="category" width={80} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => [formatSalesAmount(v), tr("pL_sales", "매출")]} />
                        <Bar dataKey="sales" fill="#22c55e" name={tr("pL_sales", "매출")} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 text-center">{tr("salesChannel", "채널")}</th>
                        <th className="py-2 text-right">{tr("pL_sales", "매출")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channelChartRows.slice(0, 30).map((r) => (
                        <tr key={r.channelKey} className="border-b">
                          <td className="py-1.5 text-center">{r.axisLabel}</td>
                          <td className="py-1.5 text-right font-erp-numeric">
                            {formatSalesAmount(r.sales)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )
            )}

            {selectedView === "menu" && (
              salesAnalyticsPlaceholder ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {salesAnalyticsPlaceholder}
                </p>
              ) : (
                <>
                  <SalesPeriodTrendChartBlock
                    rows={periodChartRows}
                    periodBarXAxisProps={periodBarXAxisProps}
                    periodChartYAxisProps={periodChartYAxisProps}
                    tr={tr}
                  />
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <Input
                      placeholder={tr("salesMenuSearch", "메뉴 검색")}
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      className="w-48 min-w-[12rem]"
                    />
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={menuSearchAnd}
                        onCheckedChange={(c) => setMenuSearchAnd(c === true)}
                      />
                      <span>{tr("salesMenuSearchAndMode", "검색어 모두 포함 (AND)")}</span>
                    </label>
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/admin/total-sales?start=${encodeURIComponent(startStr)}&end=${encodeURIComponent(endStr)}${selectedStoresKey ? `&stores=${encodeURIComponent(selectedStoresKey)}` : ""}`}
                      >
                        {tr("salesOverviewLinkTotalSales", "메뉴별 상세 (Total Sales)")}
                      </Link>
                    </Button>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 text-left">{tr("salesMenu", "메뉴")}</th>
                        <th className="py-2 text-right">{tr("salesQuantity", "수량")}</th>
                        <th className="py-2 text-right">{tr("pL_sales", "매출")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {menuData.slice(0, 100).map((r) => (
                        <tr key={r.name} className="border-b">
                          <td className="py-1.5">{r.name}</td>
                          <td className="py-1.5 text-right font-erp-numeric">
                            {r.qty.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right font-erp-numeric">
                            {formatSalesAmount(r.sales)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {menuData.length > 100 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {tr("salesTop100Only", "상위 100개만 표시")}
                    </p>
                  )}
                </>
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

            {selectedView === "store" && (
              salesAnalyticsPlaceholder ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {salesAnalyticsPlaceholder}
                </p>
              ) : (
                <>
                  <div className="mb-4 h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={storeChartRows}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="axisLabel" {...periodBarXAxisProps} />
                        <YAxis {...periodChartYAxisProps} />
                        <Tooltip formatter={(v: number) => [formatSalesAmount(v), tr("pL_sales", "매출")]} />
                        <Bar dataKey="sales" fill="#3b82f6" name={tr("pL_sales", "매출")} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <AdminTableScroll className="rounded-lg border" hint={false}>
                    <table className="w-full min-w-[1120px] text-sm">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">{tr("salesStoreName", "매장명")}</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">{tr("salesOccupancy", "주문건수")}</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">{tr("salesGuestCount", "손님 수(홀)")}</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">{tr("salesHallPerOrder", "홀 건당")}</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">{tr("salesHallPerGuest", "홀 1인당")}</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">{tr("salesPerOrderInScope", "건당")}</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">{tr("salesSupplyAmount", "공급가액")}</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">{tr("salesTax", "세금")}</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">{tr("salesDiscountAmount", "할인 금액")}</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">{tr("salesServiceAmount", "서비스처리 금액")}</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">{tr("salesAmount", "매출액")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scopedStoreData.map((r) => {
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
                          } else if (legacyBreakdown && hallGuestSum > 0 && r.total > 0) {
                            salesPerGuestHall =
                              r.salesPerGuest != null && r.salesPerGuest > 0
                                ? r.salesPerGuest
                                : Math.round((r.total / hallGuestSum) * 100) / 100
                          }

                          const salesPerOrder =
                            r.count > 0
                              ? r.salesPerOrder != null
                                ? r.salesPerOrder
                                : Math.round((r.total / r.count) * 100) / 100
                              : 0

                          return (
                          <tr key={r.storeName} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-medium">{posStoreDisplayName(r.storeName)}</td>
                            <td className="px-4 py-2.5 text-right font-erp-numeric">{r.count.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right font-erp-numeric">{hallGuestSum.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right font-erp-numeric">
                              {dineInOrderCount > 0 ? formatSalesAmount(salesPerDineInOrder) : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right font-erp-numeric">
                              {hallGuestSum > 0 ? formatSalesAmount(salesPerGuestHall) : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right font-erp-numeric">
                              {r.count > 0 ? formatSalesAmount(salesPerOrder) : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right font-erp-numeric">{formatSalesAmount(r.subtotal)}</td>
                            <td className="px-4 py-2.5 text-right font-erp-numeric">{formatSalesAmount(r.vat)}</td>
                            <td className="px-4 py-2.5 text-right font-erp-numeric">{formatSalesAmount(r.discount ?? 0)}</td>
                            <td className="px-4 py-2.5 text-right font-erp-numeric">{formatSalesAmount(r.service ?? 0)}</td>
                            <td className="px-4 py-2.5 text-right font-erp-numeric font-semibold">{formatSalesAmount(r.total)}</td>
                          </tr>
                          )
                        })}
                        {scopedStoreData.length > 0 && (
                          <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                            <td className="px-4 py-3">{tr("salesTotalLabel", "합계")}</td>
                            <td className="px-4 py-3 text-right font-erp-numeric">
                              {scopedStoreData.reduce((a, r) => a + r.count, 0).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right font-erp-numeric">
                              {scopedStoreData.reduce((a, r) => {
                                const g = r.guestSum ?? 0
                                const legacy =
                                  r.dineInGuestSum === undefined &&
                                  r.dineInOrderCount === undefined &&
                                  r.dineInTotal === undefined
                                const hall = legacy ? g : (r.dineInGuestSum ?? 0)
                                return a + hall
                              }, 0).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right font-erp-numeric">
                              {(() => {
                                const c = scopedStoreData.reduce((a, r) => a + (r.dineInOrderCount ?? 0), 0)
                                const t = scopedStoreData.reduce((a, r) => a + (r.dineInTotal ?? 0), 0)
                                return c > 0 ? formatSalesAmount(Math.round((t / c) * 100) / 100) : "—"
                              })()}
                            </td>
                            <td className="px-4 py-3 text-right font-erp-numeric">
                              {(() => {
                                const gD = scopedStoreData.reduce((a, r) => a + (r.dineInGuestSum ?? 0), 0)
                                const tD = scopedStoreData.reduce((a, r) => a + (r.dineInTotal ?? 0), 0)
                                const gH = scopedStoreData.reduce((a, r) => {
                                  const g = r.guestSum ?? 0
                                  const legacy =
                                    r.dineInGuestSum === undefined &&
                                    r.dineInOrderCount === undefined &&
                                    r.dineInTotal === undefined
                                  return a + (legacy ? g : (r.dineInGuestSum ?? 0))
                                }, 0)
                                const tAll = scopedStoreData.reduce((a, r) => a + r.total, 0)
                                if (gD > 0 && tD > 0)
                                  return formatSalesAmount(Math.round((tD / gD) * 100) / 100)
                                if (gH > 0 && tAll > 0)
                                  return formatSalesAmount(Math.round((tAll / gH) * 100) / 100)
                                return "—"
                              })()}
                            </td>
                            <td className="px-4 py-3 text-right font-erp-numeric">
                              {(() => {
                                const c = scopedStoreData.reduce((a, r) => a + r.count, 0)
                                const t = scopedStoreData.reduce((a, r) => a + r.total, 0)
                                return c > 0 ? formatSalesAmount(Math.round((t / c) * 100) / 100) : "—"
                              })()}
                            </td>
                            <td className="px-4 py-3 text-right font-erp-numeric">
                              {formatSalesAmount(scopedStoreData.reduce((a, r) => a + r.subtotal, 0))}
                            </td>
                            <td className="px-4 py-3 text-right font-erp-numeric">
                              {formatSalesAmount(scopedStoreData.reduce((a, r) => a + r.vat, 0))}
                            </td>
                            <td className="px-4 py-3 text-right font-erp-numeric">
                              {formatSalesAmount(scopedStoreData.reduce((a, r) => a + (r.discount ?? 0), 0))}
                            </td>
                            <td className="px-4 py-3 text-right font-erp-numeric">
                              {formatSalesAmount(scopedStoreData.reduce((a, r) => a + (r.service ?? 0), 0))}
                            </td>
                            <td className="px-4 py-3 text-right font-erp-numeric">
                              {formatSalesAmount(scopedStoreData.reduce((a, r) => a + r.total, 0))}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </AdminTableScroll>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                    {tr(
                      "salesAmountBreakdownFootnote",
                      "공급가액은 품목 합계(할인 전)입니다. 세금·매출액은 POS 요금·부가세 계산 규칙이 반영된 값입니다. 할인 금액은 수동 할인과 쿠폰 할인의 합이며, 서비스처리 금액은 별도 집계됩니다."
                    )}{" "}
                    {tr(
                      "salesGuestMetricsFootnote",
                      "손님 수(홀)·홀 건당·홀 1인당은 dine_in 주문과 POS guest_count만 사용합니다. 건당은 현재 매출액 종류 필터에 포함된 주문 전체의 매출÷건수입니다. 포장·배달은 인원 미입력이므로 홀 지표와 섞지 않습니다."
                    )}
                  </p>
                  {scopedStoreData.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {tr("salesNoSalesData", "해당 기간 매출 데이터가 없습니다.")}
                    </p>
                  )}
                </>
              )
            )}

            {selectedView === "store-category" && (
              salesAnalyticsPlaceholder ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {salesAnalyticsPlaceholder}
                </p>
              ) : (
                <>
                  <SalesPeriodTrendChartBlock
                    rows={periodChartRows}
                    periodBarXAxisProps={periodBarXAxisProps}
                    periodChartYAxisProps={periodChartYAxisProps}
                    tr={tr}
                  />
                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <h3 className="mb-3 text-sm font-semibold">{tr("salesByStore", "매장별")}</h3>
                    <div className="mb-4 h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={storeChartRows}
                            dataKey="total"
                            nameKey="storeDisplayName"
                            cx="50%"
                            cy="50%"
                            outerRadius={90}
                            label={({ storeDisplayName, percent }) =>
                              `${storeDisplayName} ${(percent * 100).toFixed(1)}%`
                            }
                          >
                            {storeChartRows.map((r, i) => (
                              <Cell key={r.storeName} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => formatSalesAmount(v)} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <AdminTableScroll className="rounded-lg border" hint={false}>
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-left">{tr("salesStoreName", "매장명")}</th>
                            <th className="px-3 py-2 text-right">{tr("salesQuantity", "수량")}</th>
                            <th className="px-3 py-2 text-right">{tr("salesSalesAmount", "판매 금액")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {storeChartRows.slice(0, 12).map((r) => (
                            <tr key={r.storeName} className="border-t">
                              <td className="px-3 py-1.5">{r.storeDisplayName}</td>
                              <td className="px-3 py-1.5 text-right font-erp-numeric">{r.count.toLocaleString()}</td>
                              <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </AdminTableScroll>
                  </div>
                  <div>
                    <h3 className="mb-3 text-sm font-semibold">{tr("salesByCategory", "분류별 (채널)")}</h3>
                    <div className="mb-4 h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={channelChartRows} layout="vertical" margin={{ left: 60 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" {...periodChartYAxisProps} />
                          <YAxis dataKey="axisLabel" type="category" width={60} tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v: number) => [formatSalesAmount(v), tr("pL_sales", "매출")]} />
                          <Bar dataKey="sales" fill="#f59e0b" name={tr("salesSalesAmount", "판매 금액")} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <AdminTableScroll className="rounded-lg border" hint={false}>
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-center">{tr("salesCategoryName", "분류명")}</th>
                            <th className="px-3 py-2 text-right">{tr("salesSalesAmount", "판매 금액")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {channelChartRows.map((r) => (
                            <tr key={r.channelKey} className="border-t">
                              <td className="px-3 py-1.5 text-center">{r.axisLabel}</td>
                              <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.sales)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </AdminTableScroll>
                  </div>
                </div>
                </>
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
                <>
                  <SalesPeriodTrendChartBlock
                    rows={periodChartRows}
                    periodBarXAxisProps={periodBarXAxisProps}
                    periodChartYAxisProps={periodChartYAxisProps}
                    tr={tr}
                  />
                  <p className="mb-4 text-xs text-muted-foreground">
                    {tr(
                      "salesPaymentBreakdownFootnote",
                      "배달·카드 표는 POS 결산에 저장한 breakdown(Visa/Grab 등)을 합산합니다. 결산 전 매장·미연동 건만 LINKPOS 또는 주문 배달액으로 보조합니다."
                    )}
                  </p>
                  {paymentBreakdownData.cashReconcile?.mismatch ? (
                    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                      {tr(
                        "salesPaymentCashReconcileMismatch",
                        "결산 현금({settlement})과 완료 주문 현금 합({live})이 {diff} 다릅니다. POS에서 결제 정정 후 결산을 열면 자동으로 맞춥니다."
                      )
                        .replace(
                          "{settlement}",
                          formatSalesAmount(paymentBreakdownData.cashReconcile.settlementCash)
                        )
                        .replace(
                          "{live}",
                          formatSalesAmount(paymentBreakdownData.cashReconcile.liveCash)
                        )
                        .replace(
                          "{diff}",
                          formatSalesAmount(Math.abs(paymentBreakdownData.cashReconcile.diff))
                        )}
                    </div>
                  ) : null}
                  <div className="mb-6 grid gap-6 lg:grid-cols-2">
                    <div className="rounded-lg border bg-card p-4">
                      <h3 className="mb-3 text-sm font-semibold">
                        {tr("salesPaymentBreakdownDeliveryTitle", "Sales Report by Card Type — Delivery")}
                      </h3>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="py-2 pr-4 text-left">{tr("salesPaymentMethod", "결제수단")}</th>
                            <th className="py-2 text-right">{tr("pL_sales", "매출")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deliveryPaymentChannelRows.map((r) => (
                            <tr key={r.channelKey} className="border-b">
                              <td className="py-1.5 pr-4">{r.axisLabel}</td>
                              <td className="py-1.5 text-right font-erp-numeric">
                                {formatSalesAmount(r.sales)}
                              </td>
                            </tr>
                          ))}
                          <tr className="font-semibold">
                            <td className="py-2 pr-4">{tr("salesTotalLabel", "합계")}</td>
                            <td className="py-2 text-right font-erp-numeric">
                              {formatSalesAmount(paymentBreakdownData.deliveryTotal)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="rounded-lg border bg-card p-4">
                      <h3 className="mb-3 text-sm font-semibold">
                        {tr("salesPaymentBreakdownCreditTitle", "Sales Report by Card Type — Credit Card")}
                      </h3>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="py-2 pr-4 text-left">{tr("salesPaymentMethod", "결제수단")}</th>
                            <th className="py-2 text-right">{tr("pL_sales", "매출")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {creditPaymentChannelRows.map((r) => (
                            <tr key={r.channelKey} className="border-b">
                              <td className="py-1.5 pr-4">{r.axisLabel}</td>
                              <td className="py-1.5 text-right font-erp-numeric">
                                {formatSalesAmount(r.sales)}
                              </td>
                            </tr>
                          ))}
                          <tr className="font-semibold">
                            <td className="py-2 pr-4">{tr("salesTotalLabel", "합계")}</td>
                            <td className="py-2 text-right font-erp-numeric">
                              {formatSalesAmount(paymentBreakdownData.creditTotal)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {paymentChartRows.length > 0 ? (
                    <Collapsible defaultOpen={false} className="rounded-md border bg-muted/10">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-between px-4">
                          {tr("salesTopicExplorePaymentHint", "결제 종류, 카드 관련 관점")}
                          <span className="text-xs text-muted-foreground">{tr("salesPaymentMethod", "결제수단")}</span>
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="px-4 pb-4">
                        <div className="flex flex-wrap gap-6 pt-2">
                          <div className="h-[220px] w-[220px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={paymentChartRows}
                                  dataKey="sales"
                                  nameKey="axisLabel"
                                  cx="50%"
                                  cy="50%"
                                  outerRadius={80}
                                >
                                  {paymentChartRows.map((_, i) => (
                                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip formatter={(v: number) => formatSalesAmount(v)} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <table className="text-sm">
                            <thead>
                              <tr className="border-b text-muted-foreground">
                                <th className="py-2 pr-4 text-left">{tr("salesPaymentMethod", "결제수단")}</th>
                                <th className="py-2 text-right">{tr("pL_sales", "매출")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paymentChartRows.map((r) => (
                                <tr key={r.paymentKey} className="border-b">
                                  <td className="py-1.5 pr-4">{r.axisLabel}</td>
                                  <td className="py-1.5 text-right font-erp-numeric">
                                    {formatSalesAmount(r.sales)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ) : null}
                </>
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
