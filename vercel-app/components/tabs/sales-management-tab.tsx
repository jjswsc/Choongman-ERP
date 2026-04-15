"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import {
  parseOrderTypesParam,
  normalizeOrderTypesQueryString,
  type PosOrderTypeValue,
} from "@/lib/pos-sales-order-type-filter"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useLang } from "@/lib/lang-context"
import { useOnlineStatus } from "@/lib/offline"
import { useT, i18n } from "@/lib/i18n"
import {
  translatePeriodAxisLabel,
  translateChannelKey,
  translatePaymentKey,
  translateDeliveryAppCode,
} from "@/lib/sales-analytics-labels"
import {
  getAdminVendors,
  getPosSalesFilterOptions,
  getPosSalesByPeriod,
  getPosSalesByDeliveryApp,
  getPosSalesByChannel,
  getPosSalesByMenu,
  getPosSalesByPayment,
  getPosSalesByStore,
  type PosSalesPeriodRow,
} from "@/lib/api-client"
import { mergePeriodSeriesToAggregated } from "@/lib/pos-sales-period-aggregate"
import { buildPosStoreDisplayNameLookup, resolvePosStoreDisplayName } from "@/lib/pos-store-display-name"
import {
  getPosSalesFilterOptionsWithCache,
  getPosSalesByPeriodWithCache,
  getPosSalesByDeliveryAppWithCache,
  getPosSalesByMenuWithCache,
  getPosSalesByPaymentWithCache,
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

/** 번역 누락 시 주제·힌트 라벨 폴백 (ko 기준) */
const I18N_KO = i18n.ko as Record<string, string>

const PERIOD_GROUP = [
  { value: "year", labelKey: "salesPeriodYear" },
  { value: "month", labelKey: "salesPeriodMonth" },
  { value: "week", labelKey: "salesPeriodWeek" },
  { value: "day", labelKey: "salesPeriodDay" },
  { value: "hour", labelKey: "salesPeriodHour" },
  { value: "dow", labelKey: "salesPeriodDow" },
] as const
const PERIOD_GROUP_VALUES = new Set(PERIOD_GROUP.map((g) => g.value))
type PeriodGroupValue = (typeof PERIOD_GROUP)[number]["value"]

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"]

function formatSalesAmount(n: number) {
  return (n ?? 0).toLocaleString()
}

/** API·캐시 행에 집계 필드가 일부 누락될 수 있음 — 본문에서 ?? 로 보정 */
function mapPosSalesPeriodRowToChartRow(
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
    total,
    guestSum,
    hallGuestSum,
    dineInOrderCount,
    dineInTotal,
    dineInGuestSum,
    salesPerDineInOrder,
    salesPerGuestHall,
    salesPerOrder,
    axisLabel: translatePeriodAxisLabel(r, periodGroup, tr),
  }
}

function normalizeStoreCodes(values: string[]): string[] {
  return [...new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  )
}

function parseYmdDate(value: string): Date {
  const [y, m, d] = value.split("-").map((x) => parseInt(x, 10))
  return new Date(y, (m || 1) - 1, d || 1)
}

function formatYmdDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function addDaysYmd(value: string, delta: number): string {
  const d = parseYmdDate(value)
  d.setDate(d.getDate() + delta)
  return formatYmdDate(d)
}

function diffDaysInclusive(startStr: string, endStr: string): number {
  const start = parseYmdDate(startStr).getTime()
  const end = parseYmdDate(endStr).getTime()
  const raw = Math.floor((end - start) / 86400000) + 1
  return Number.isFinite(raw) && raw > 0 ? raw : 1
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

type AnalyticsView =
  | "period"
  | "delivery"
  | "channel"
  | "menu"
  | "payment"
  | "store"
  | "store-category"
  | "store-period"
  | null

const SALES_ORDER_TYPE_TOGGLES: { type: PosOrderTypeValue; labelKey: string; fallback: string }[] = [
  { type: "dine_in", labelKey: "salesAmountKindDineIn", fallback: "홀" },
  { type: "takeout", labelKey: "salesAmountKindTakeout", fallback: "포장" },
  { type: "delivery", labelKey: "salesAmountKindDelivery", fallback: "배달" },
]

type SalesTopicConfig = {
  id: string
  labelKey: string
  hintKey?: string
  view: AnalyticsView
}

type SalesSubMenuConfig = {
  id: string
  labelKey: string
  fallbackLabel: string
  topics: SalesTopicConfig[]
}

const SALES_IA: SalesSubMenuConfig[] = [
  {
    id: "sales-analysis",
    labelKey: "salesManagementSubmenuQuickSales",
    fallbackLabel: "실적 분석",
    topics: [
      { id: "analysis-period", labelKey: "salesTopicExplorePeriod", hintKey: "salesTopicExplorePeriodHint", view: "period" },
      { id: "analysis-channel", labelKey: "salesTopicExploreChannel", hintKey: "salesTopicExploreChannelHint", view: "channel" },
      { id: "analysis-payment", labelKey: "salesTopicExplorePayment", hintKey: "salesTopicExplorePaymentHint", view: "payment" },
      { id: "analysis-menu", labelKey: "salesTopicExploreMenu", hintKey: "salesTopicExploreMenuHint", view: "menu" },
      { id: "analysis-delivery", labelKey: "salesTopicExploreDelivery", hintKey: "salesTopicExploreDeliveryHint", view: "delivery" },
    ],
  },
  {
    id: "sales-compare",
    labelKey: "salesManagementSubmenuAggregateInfo",
    fallbackLabel: "매장 비교",
    topics: [
      { id: "compare-store-summary", labelKey: "salesTopicPivotStoreSummary", hintKey: "salesTopicPivotStoreSummaryHint", view: "store" },
      {
        id: "compare-store-by-period",
        labelKey: "salesTopicPivotStoreByPeriod",
        hintKey: "salesTopicPivotStoreByPeriodHint",
        view: "store-period",
      },
      { id: "compare-store-category", labelKey: "salesTopicPivotStoreCategory", hintKey: "salesTopicPivotStoreCategoryHint", view: "store-category" },
    ],
  },
  {
    id: "sales-forecast-report",
    labelKey: "salesManagementTabForecast",
    fallbackLabel: "예측·리포트",
    topics: [
      { id: "report-month-year", labelKey: "salesTopicCompareMonthYear", hintKey: "salesTopicCompareMonthYearHint", view: "period" },
      { id: "report-month-mom", labelKey: "salesTopicCompareMonthMom", hintKey: "salesTopicCompareMonthMomHint", view: "period" },
      { id: "report-forecast-monthly", labelKey: "salesTopicForecastMonthly", hintKey: "salesTopicForecastMonthlyHint", view: "period" },
      { id: "report-overview", labelKey: "salesTopicOverviewReport", hintKey: "salesTopicOverviewReportHint", view: "channel" },
    ],
  },
]

type SalesFilterPreset = {
  id: string
  name: string
  startStr: string
  endStr: string
  stores: string[]
  periodGroup: PeriodGroupValue
  orderTypesKey: string
  activeSubMenuId: string
  selectedTopicId: string
  menuSearch: string
  menuSearchAnd: boolean
  compareStores: boolean
}

const SALES_FILTER_PRESET_STORAGE_KEY = "cm-sales-filter-presets-v1"

export interface SalesManagementTabProps {
  /** POS용: 오프라인 시 캐시 사용, 온라인 시 API 호출 후 캐시 저장 */
  offlineAware?: boolean
}

function resolveDefaultSalesLanding(pathname: string): {
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

export function SalesManagementTab(props: SalesManagementTabProps = {}) {
  const { offlineAware = false } = props
  const { lang } = useLang()
  const t = useT(lang)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { auth } = useAuth()
  const canSearchAll = isOfficeRole(auth?.role || "")
  const defaultLanding = React.useMemo(() => resolveDefaultSalesLanding(pathname), [pathname])
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), [])
  const monthStart = React.useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
  }, [])

  const [startStr, setStartStr] = React.useState(monthStart)
  const [endStr, setEndStr] = React.useState(today)
  const [selectedStores, setSelectedStores] = React.useState<string[]>([])
  const [posOptions, setPosOptions] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(false)
  /** 마지막으로「조회」로 성공 적용된 필터 키(자동 로드 없음; 키가 바뀌면 결과 비움) */
  const [fetchedAnalyticsKey, setFetchedAnalyticsKey] = React.useState("")
  const [periodGroup, setPeriodGroup] = React.useState<PeriodGroupValue>(defaultLanding.periodGroup)
  const [menuSearch, setMenuSearch] = React.useState("")
  const [storeSearch, setStoreSearch] = React.useState("")
  const [storePickerOpen, setStorePickerOpen] = React.useState(false)
  const storePickerRef = React.useRef<HTMLDivElement | null>(null)
  /** 빈 문자열 = 매출액 종류 전체(필터 없음) */
  const [orderTypesKey, setOrderTypesKey] = React.useState("")
  const [compareStores, setCompareStores] = React.useState(false)
  const [periodSplitSeries, setPeriodSplitSeries] = React.useState<Record<string, PosSalesPeriodRow[]> | null>(null)
  const [periodTruncated, setPeriodTruncated] = React.useState(false)
  const [menuSearchAnd, setMenuSearchAnd] = React.useState(false)
  const storePickerListId = React.useId()
  const storePickerBtnId = React.useId()

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
      total?: number
      guestSum?: number
      dineInOrderCount?: number
      dineInTotal?: number
      dineInGuestSum?: number
      salesPerDineInOrder?: number
      salesPerGuest?: number
      salesPerOrder?: number
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
  const [paymentData, setPaymentData] = React.useState<{ paymentKey: string; sales: number }[]>([])
  const [storeData, setStoreData] = React.useState<
    {
      storeName: string
      count: number
      subtotal: number
      vat: number
      discount?: number
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
  const [summaryCards, setSummaryCards] = React.useState<{
    current: number
    prevRange: number
    prevWeek: number
  }>({ current: 0, prevRange: 0, prevWeek: 0 })

  const tr = React.useCallback(
    (key: string, fallback: string) => {
      const value = t(key as never)
      return value === key ? fallback : value
    },
    [t]
  )

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

  const storeChartRows = React.useMemo(
    () =>
      storeData.map((r) => ({
        ...r,
        storeDisplayName: posStoreDisplayName(r.storeName),
      })),
    [storeData, posStoreDisplayName]
  )

  const selectedStoresKey = React.useMemo(
    () => normalizeStoreCodes(selectedStores).join(","),
    [selectedStores]
  )
  const selectedStoresParam = React.useMemo(
    () => (selectedStoresKey ? selectedStoresKey.split(",") : undefined),
    [selectedStoresKey]
  )
  const filteredStoreOptions = React.useMemo(() => {
    const q = storeSearch.trim().toLowerCase()
    if (!q) return posOptions
    return posOptions.filter((p) => {
      const pl = p.toLowerCase()
      if (pl.includes(q)) return true
      return posStoreDisplayName(p).toLowerCase().includes(q)
    })
  }, [posOptions, storeSearch, posStoreDisplayName])

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
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [storePickerOpen])

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
            tick: { fontSize: 9 },
            height: 72,
            interval: 0,
          }
        : { tick: { fontSize: 11 } },
    [periodGroup]
  )

  const currentSubMenu = SALES_IA.find((menu) => menu.id === activeSubMenuId) ?? SALES_IA[0]
  const selectedTopicId = selectedTopicBySubMenu[currentSubMenu.id] ?? currentSubMenu.topics[0].id
  const selectedTopic = currentSubMenu.topics.find((topic) => topic.id === selectedTopicId) ?? currentSubMenu.topics[0]
  const selectedView = selectedTopic?.view ?? null
  const needsPeriodGroup = selectedView === "period" || selectedView === "store-period"

  const storesForCompareChart = React.useMemo(
    () => selectedStoresParam ?? [],
    [selectedStoresParam]
  )

  const comparePeriodChartRows = React.useMemo(() => {
    if (!periodSplitSeries || storesForCompareChart.length < 2) return []
    const first = storesForCompareChart[0]
    const base = periodSplitSeries[first]
    if (!base?.length) return []
    return base.map((r) => {
      const row: Record<string, string | number> = {
        key: r.key,
        axisLabel: translatePeriodAxisLabel({ key: r.key, label: r.label }, periodGroup, tr),
      }
      for (const s of storesForCompareChart) {
        const hit = periodSplitSeries[s]?.find((x) => x.key === r.key)
        row[`sales_${s}`] = hit?.sales ?? 0
      }
      return row
    })
  }, [periodSplitSeries, storesForCompareChart, periodGroup, tr])

  /** 매장·기간 목록: split 시리즈 → (매장 × 기간) 행 */
  const storeByPeriodFlatRows = React.useMemo(() => {
    if (selectedView !== "store-period" || !periodSplitSeries) return []
    const codes = Object.keys(periodSplitSeries).sort((a, b) =>
      posStoreDisplayName(a).localeCompare(posStoreDisplayName(b), undefined, { sensitivity: "base" })
    )
    const out: Array<
      ReturnType<typeof mapPosSalesPeriodRowToChartRow> & { storeCode: string; storeDisplay: string }
    > = []
    for (const code of codes) {
      for (const pr of periodSplitSeries[code] ?? []) {
        out.push({
          storeCode: code,
          storeDisplay: posStoreDisplayName(code),
          ...mapPosSalesPeriodRowToChartRow(pr, periodGroup, tr),
        })
      }
    }
    return out.sort((a, b) => {
      const c = a.storeDisplay.localeCompare(b.storeDisplay, undefined, { sensitivity: "base" })
      if (c !== 0) return c
      return a.key.localeCompare(b.key)
    })
  }, [selectedView, periodSplitSeries, periodGroup, tr, posStoreDisplayName])

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
      paymentData.map((r) => ({
        ...r,
        axisLabel: translatePaymentKey(r.paymentKey, tr),
      })),
    [paymentData, tr]
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

  const analyticsParamKey = React.useMemo(
    () =>
      [
        startStr,
        endStr,
        selectedStoresKey,
        periodGroup,
        orderTypesKey,
        compareStores ? "1" : "0",
        activeSubMenuId,
        selectedTopicId,
        menuSearch.trim(),
        menuSearchAnd ? "1" : "0",
      ].join("|"),
    [
      startStr,
      endStr,
      selectedStoresKey,
      periodGroup,
      orderTypesKey,
      compareStores,
      activeSubMenuId,
      selectedTopicId,
      menuSearch,
      menuSearchAnd,
    ]
  )

  const showSalesResults = fetchedAnalyticsKey !== "" && fetchedAnalyticsKey === analyticsParamKey

  const totalsSummary = React.useMemo(() => {
    const subtotal = periodChartRows.reduce((a, x) => a + Number(x.subtotal ?? 0), 0)
    const vat = periodChartRows.reduce((a, x) => a + Number(x.vat ?? 0), 0)
    const discount = periodChartRows.reduce((a, x) => a + Number(x.discount ?? 0), 0)
    const total = periodChartRows.reduce((a, x) => a + Number(x.total ?? x.sales ?? 0), 0)
    return { subtotal, vat, discount, total, gross: subtotal + vat }
  }, [periodChartRows])

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

  const exportCurrentCsv = React.useCallback(() => {
    if (!showSalesResults || selectedView == null) return
    let headers: string[] = []
    let rows: string[][] = []
    if (selectedView === "period") {
      headers = ["기간", "주문건수", "손님수(홀)", "공급가액", "세금", "할인", "매출액"]
      rows = periodChartRows.map((r) => [
        String(r.axisLabel),
        String(r.count ?? 0),
        String(r.hallGuestSum ?? 0),
        String(r.subtotal ?? 0),
        String(r.vat ?? 0),
        String(r.discount ?? 0),
        String(r.total ?? 0),
      ])
    } else if (selectedView === "store-period") {
      headers = ["매장", "기간", "주문건수", "손님수(홀)", "공급가액", "세금", "할인", "매출액"]
      rows = storeByPeriodFlatRows.map((r) => [
        r.storeDisplay,
        String(r.axisLabel),
        String(r.count ?? 0),
        String(r.hallGuestSum ?? 0),
        String(r.subtotal ?? 0),
        String(r.vat ?? 0),
        String(r.discount ?? 0),
        String(r.total ?? 0),
      ])
    } else if (selectedView === "channel") {
      headers = ["채널", "매출액"]
      rows = channelChartRows.map((r) => [r.axisLabel, String(r.sales)])
    } else if (selectedView === "payment") {
      headers = ["결제수단", "매출액"]
      rows = paymentChartRows.map((r) => [r.axisLabel, String(r.sales)])
    } else if (selectedView === "menu") {
      headers = ["메뉴", "수량", "매출액"]
      rows = menuData.map((r) => [r.name, String(r.qty), String(r.sales)])
    } else if (selectedView === "store" || selectedView === "store-category") {
      headers = ["매장", "주문건수", "손님수(홀)", "공급가액", "세금", "할인", "매출액"]
      rows = storeChartRows.map((r) => [
        r.storeDisplayName,
        String(r.count ?? 0),
        String(r.guestSum ?? 0),
        String(r.subtotal ?? 0),
        String(r.vat ?? 0),
        String(r.discount ?? 0),
        String(r.total ?? 0),
      ])
    } else if (selectedView === "delivery") {
      headers = ["채널", "매출액", "비중(%)"]
      rows = deliveryPieRows.map((r) => [String(r.axisLabel), String(r.sales), String((r.pct ?? 0).toFixed(2))])
    }
    if (rows.length === 0) return
    const csv = [headers, ...rows]
      .map((line) => line.map((cell) => csvEscape(String(cell ?? ""))).join(","))
      .join("\n")
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `sales-report-${selectedView}-${startStr}-${endStr}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [
    showSalesResults,
    selectedView,
    periodChartRows,
    storeByPeriodFlatRows,
    channelChartRows,
    paymentChartRows,
    menuData,
    storeChartRows,
    deliveryPieRows,
    startStr,
    endStr,
  ])

  React.useEffect(() => {
    setPeriodData([])
    setPeriodSplitSeries(null)
    setPeriodTruncated(false)
    setDeliveryAppData({ items: [], total: 0 })
    setChannelData([])
    setMenuData([])
    setPaymentData([])
    setStoreData([])
    setSummaryCards({ current: 0, prevRange: 0, prevWeek: 0 })
    setFetchedAnalyticsKey("")
  }, [analyticsParamKey])

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
    compare?: boolean
  }>({})

  const saveCurrentPreset = React.useCallback(() => {
    const name = window.prompt(tr("salesPresetPrompt", "프리셋 이름을 입력하세요."), "")
    const trimmed = String(name || "").trim()
    if (!trimmed) return
    const currentTopic = selectedTopic?.id ?? ""
    const preset: SalesFilterPreset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      startStr,
      endStr,
      stores: selectedStores,
      periodGroup,
      orderTypesKey,
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
    activeSubMenuId,
    menuSearch,
    menuSearchAnd,
    compareStores,
    persistPresets,
    savedPresets,
  ])

  const applyPreset = React.useCallback((preset: SalesFilterPreset) => {
    userSelectedRef.current = {
      subMenu: preset.activeSubMenuId,
      topic: preset.selectedTopicId,
      storesKey: normalizeStoreCodes(preset.stores).join(","),
      periodGroup: preset.periodGroup,
      dateRange: `${preset.startStr}~${preset.endStr}`,
      orderTypesKey: preset.orderTypesKey,
      compare: preset.compareStores,
    }
    setStartStr(preset.startStr)
    setEndStr(preset.endStr)
    setSelectedStores(normalizeStoreCodes(preset.stores))
    setPeriodGroup(preset.periodGroup)
    setOrderTypesKey(normalizeOrderTypesQueryString(preset.orderTypesKey))
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
  }, [])

  const removePreset = React.useCallback((id: string) => {
    persistPresets(savedPresets.filter((p) => p.id !== id))
  }, [persistPresets, savedPresets])

  React.useEffect(() => {
    if ((selectedStoresParam?.length ?? 0) < 2 && compareStores) setCompareStores(false)
  }, [selectedStoresParam, compareStores])

  React.useEffect(() => {
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
  }, [searchParams, defaultLanding, activeSubMenuId, periodGroup])

  React.useEffect(() => {
    const qMenu = searchParams.get("menu")
    const qTopic = searchParams.get("topic")
    const qGroup = searchParams.get("group")
    const qCompare = searchParams.get("compare") === "1"
    const qStores = normalizeStoreCodes(
      (searchParams.get("stores") ?? searchParams.get("pos") ?? "").split(",")
    )
    const qStoresKey = qStores.join(",")
    const qOrderTypes = normalizeOrderTypesQueryString(searchParams.get("orderTypes"))
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

    if (qStoresKey !== selectedStoresKey && userSelectedRef.current.storesKey !== selectedStoresKey) {
      setSelectedStores(qStores)
    }
    if (qOrderTypes !== orderTypesKey && userSelectedRef.current.orderTypesKey !== orderTypesKey) {
      setOrderTypesKey(qOrderTypes)
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
      qCompare === compareStores
    ) {
      userSelectedRef.current = {}
    }
  }, [
    searchParams,
    activeSubMenuId,
    selectedStoresKey,
    periodGroup,
    startStr,
    endStr,
    orderTypesKey,
    compareStores,
    validTopicByMenu,
    selectedTopicBySubMenu,
  ])

  React.useEffect(() => {
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
    const qStart = searchParams.get("start")
    const qEnd = searchParams.get("end")
    if (
      qMenu === activeSubMenuId &&
      qTopic === currentTopic &&
      qGroup === periodGroup &&
      qStoresKey === selectedStoresKey &&
      qOrderTypes === orderTypesKey &&
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
    const expectedStr = expected.toString()
    const currentStr = [
      searchParams.get("menu"),
      searchParams.get("topic"),
      searchParams.get("group"),
      searchParams.get("start"),
      searchParams.get("end"),
      normalizeStoreCodes((searchParams.get("stores") ?? searchParams.get("pos") ?? "").split(",")).join(","),
      normalizeOrderTypesQueryString(searchParams.get("orderTypes")),
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
      compareStores ? "1" : "",
    ].join("|")
    if (currentStr === expectedValues) return
    /** 같은 틱에 라우터·서스펜스 경계와 겹치면 "마운트 전 setState" 경고가 날 수 있어 지연 */
    const tid = window.setTimeout(() => {
      router.replace(`${pathname}?${expectedStr}`, { scroll: false })
    }, 0)
    return () => clearTimeout(tid)
  }, [
    activeSubMenuId,
    pathname,
    periodGroup,
    selectedStoresKey,
    orderTypesKey,
    compareStores,
    startStr,
    endStr,
    router,
    searchParams,
    selectedTopic?.id,
  ])

  const loadPosOptions = React.useCallback(() => {
    if (!startStr || !endStr) return
    if (!canSearchAll && auth?.store) {
      setPosOptions([auth.store])
      return
    }
    const fetcher = offlineAware ? getPosSalesFilterOptionsWithCache : getPosSalesFilterOptions
    fetcher({ startStr, endStr }).then((r) =>
      setPosOptions(r.posOptions || [])
    )
  }, [startStr, endStr, offlineAware, canSearchAll, auth?.store])

  React.useEffect(() => {
    loadPosOptions()
  }, [loadPosOptions])

  React.useEffect(() => {
    if (!canSearchAll && auth?.store) {
      const fixed = normalizeStoreCodes([auth.store])
      if (selectedStoresKey !== fixed.join(",")) setSelectedStores(fixed)
    }
  }, [canSearchAll, auth?.store, selectedStoresKey])

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
    if (!startStr || !endStr) return
    const keySnapshot = analyticsParamKey
    const id = ++loadIdRef.current
    const dateSpan = diffDaysInclusive(startStr, endStr)
    const prevStart = addDaysYmd(startStr, -dateSpan)
    const prevEnd = addDaysYmd(endStr, -dateSpan)
    const weekStart = addDaysYmd(startStr, -7)
    const weekEnd = addDaysYmd(endStr, -7)
    const needSplit =
      (compareStores && (selectedStoresParam?.length ?? 0) >= 2 && selectedView === "period") ||
      selectedView === "store-period"
    const periodRun = offlineAware ? getPosSalesByPeriodWithCache : getPosSalesByPeriod
    const menuFetcher = offlineAware ? getPosSalesByMenuWithCache : getPosSalesByMenu
    const guarded =
      <T,>(setter: React.Dispatch<React.SetStateAction<T>>) =>
      (v: T) => {
        if (loadIdRef.current === id) setter(v)
      }
    const gDelivery = guarded(setDeliveryAppData)
    const gChannel = guarded(setChannelData)
    const gPayment = guarded(setPaymentData)
    const gStore = guarded(setStoreData)
    const gMenu = guarded(setMenuData)
    const gSummary = guarded(setSummaryCards)
    setLoading(true)
    Promise.all([
      periodRun({
        startStr,
        endStr,
        groupBy: periodGroup,
        stores: selectedStoresParam,
        orderTypes: orderTypesParam,
        splitByStore: needSplit,
      })
        .then((res) => {
          if (loadIdRef.current !== id) return
          if (res.kind === "split") {
            setPeriodSplitSeries(res.series)
            setPeriodData(mergePeriodSeriesToAggregated(res.series, selectedStoresParam))
            setPeriodTruncated(res.truncated)
          } else {
            setPeriodSplitSeries(null)
            setPeriodData(res.rows)
            setPeriodTruncated(res.truncated)
          }
        })
        .catch(() => {
          if (loadIdRef.current !== id) return
          setPeriodSplitSeries(null)
          setPeriodData([])
          setPeriodTruncated(false)
        }),
      (offlineAware ? getPosSalesByDeliveryAppWithCache : getPosSalesByDeliveryApp)({
        startStr,
        endStr,
        stores: selectedStoresParam,
        orderTypes: orderTypesParam,
      })
        .then(gDelivery)
        .catch(() => gDelivery({ items: [], total: 0 })),
      getPosSalesByChannel({
        startStr,
        endStr,
        stores: selectedStoresParam,
        orderTypes: orderTypesParam,
      })
        .then(gChannel)
        .catch(() => gChannel([])),
      (offlineAware ? getPosSalesByPaymentWithCache : getPosSalesByPayment)({
        startStr,
        endStr,
        stores: selectedStoresParam,
        orderTypes: orderTypesParam,
      })
        .then(gPayment)
        .catch(() => gPayment([])),
      (offlineAware ? getPosSalesByStoreWithCache : getPosSalesByStore)({
        startStr,
        endStr,
        stores: selectedStoresParam,
        orderTypes: orderTypesParam,
      })
        .then(gStore)
        .catch(() => gStore([])),
      menuFetcher({
        startStr,
        endStr,
        stores: selectedStoresParam,
        search: menuSearch || undefined,
        searchMode: menuSearchAnd ? "and" : "or",
        orderTypes: orderTypesParam,
      })
        .then(gMenu)
        .catch(() => gMenu([])),
      Promise.all([
        periodRun({
          startStr,
          endStr,
          groupBy: "day",
          stores: selectedStoresParam,
          orderTypes: orderTypesParam,
        }),
        periodRun({
          startStr: prevStart,
          endStr: prevEnd,
          groupBy: "day",
          stores: selectedStoresParam,
          orderTypes: orderTypesParam,
        }),
        periodRun({
          startStr: weekStart,
          endStr: weekEnd,
          groupBy: "day",
          stores: selectedStoresParam,
          orderTypes: orderTypesParam,
        }),
      ])
        .then(([currentRes, prevRes, weekRes]) => {
          gSummary({
            current: sumPeriodTotal(currentRes as Awaited<ReturnType<typeof getPosSalesByPeriod>>),
            prevRange: sumPeriodTotal(prevRes as Awaited<ReturnType<typeof getPosSalesByPeriod>>),
            prevWeek: sumPeriodTotal(weekRes as Awaited<ReturnType<typeof getPosSalesByPeriod>>),
          })
        })
        .catch(() => gSummary({ current: 0, prevRange: 0, prevWeek: 0 })),
    ]).finally(() => {
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
    selectedStoresParam,
    orderTypesParam,
    compareStores,
    selectedView,
    offlineAware,
    menuSearch,
    menuSearchAnd,
    sumPeriodTotal,
  ])

  const online = useOnlineStatus()
  const prevOnlineRef = React.useRef(online)
  React.useEffect(() => {
    if (offlineAware && showSalesResults && !prevOnlineRef.current && online) {
      prevOnlineRef.current = true
      loadAllAnalytics()
    }
    prevOnlineRef.current = online
  }, [online, offlineAware, showSalesResults, loadAllAnalytics])

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

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Input
              type="date"
              value={startStr}
              onChange={(e) => {
                const v = e.target.value
                userSelectedRef.current.dateRange = `${v}~${endStr}`
                setStartStr(v)
              }}
              className="h-9 w-[140px]"
            />
            <span className="text-slate-500">~</span>
            <Input
              type="date"
              value={endStr}
              onChange={(e) => {
                const v = e.target.value
                userSelectedRef.current.dateRange = `${startStr}~${v}`
                setEndStr(v)
              }}
              className="h-9 w-[140px]"
            />
            <div className="flex flex-wrap items-center gap-2">
              {canSearchAll ? (
                <div className="relative" ref={storePickerRef}>
                  <Button
                    id={storePickerBtnId}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-w-[220px] justify-between"
                    aria-expanded={storePickerOpen}
                    aria-controls={storePickerListId}
                    aria-haspopup="dialog"
                    onClick={() => setStorePickerOpen((prev) => !prev)}
                  >
                    <span className="truncate text-left">
                      {selectedStores.length === 0
                        ? tr("salesSelectStoreAll", "매장(전체)")
                        : selectedStores.length === 1
                          ? posStoreDisplayName(selectedStores[0])
                          : `${selectedStores.length}${tr("selected", "개 선택")}`}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">{storePickerOpen ? "▲" : "▼"}</span>
                  </Button>
                  {storePickerOpen ? (
                    <div
                      id={storePickerListId}
                      role="dialog"
                      aria-modal="false"
                      aria-labelledby={storePickerBtnId}
                      className="absolute z-20 mt-2 w-[320px] rounded-md border bg-background p-2 shadow-lg"
                    >
                      <Input
                        value={storeSearch}
                        onChange={(e) => setStoreSearch(e.target.value)}
                        placeholder={tr("salesStoreSearch", "매장 검색")}
                        className="mb-2 h-8"
                      />
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={selectedStoresKey === "" ? "default" : "outline"}
                          onClick={() => {
                            userSelectedRef.current.storesKey = ""
                            setSelectedStores([])
                          }}
                        >
                          {tr("all", "전체")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const all = normalizeStoreCodes([...posOptions])
                            userSelectedRef.current.storesKey = all.join(",")
                            setSelectedStores(all)
                          }}
                        >
                          {tr("salesStoreSelectAll", "전체 선택")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            userSelectedRef.current.storesKey = ""
                            setSelectedStores([])
                          }}
                        >
                          {tr("salesStoreDeselectAll", "전체 해제")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setStorePickerOpen(false)}
                        >
                          {tr("close", "닫기")}
                        </Button>
                      </div>
                      <div className="max-h-56 overflow-auto rounded border p-1">
                        {filteredStoreOptions.map((p) => {
                          const active = selectedStores.includes(p)
                          return (
                            <label
                              key={p}
                              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40"
                            >
                              <Checkbox
                                checked={active}
                                onCheckedChange={() => {
                                  setSelectedStores((prev) => {
                                    const exists = prev.includes(p)
                                    const next = exists ? prev.filter((v) => v !== p) : [...prev, p]
                                    const normalized = normalizeStoreCodes(next)
                                    userSelectedRef.current.storesKey = normalized.join(",")
                                    return normalized
                                  })
                                }}
                              />
                              <span className="text-sm">{posStoreDisplayName(p)}</span>
                            </label>
                          )
                        })}
                        {filteredStoreOptions.length === 0 && (
                          <p className="px-2 py-3 text-sm text-muted-foreground">
                            {tr("salesNoStoreResult", "검색 결과 없음")}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <Button type="button" size="sm" variant="default" disabled>
                  {posStoreDisplayName(selectedStores[0] ?? auth?.store ?? "") ||
                    tr("salesSelectStoreAll", "매장(전체)")}
                </Button>
              )}
            </div>
            <Button size="sm" onClick={loadAllAnalytics} disabled={!hasData || loading}>
              {tr("salesQuery", "조회")}
            </Button>
            <Button size="sm" variant="outline" onClick={saveCurrentPreset}>
              {tr("salesPresetSave", "현재 조건 저장")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={exportCurrentCsv}
              disabled={!showSalesResults}
            >
              {tr("salesExportCsv", "CSV 내보내기")}
            </Button>
          </div>

          {savedPresets.length > 0 ? (
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
                      className="h-7 px-2"
                      onClick={() => applyPreset(preset)}
                    >
                      {preset.name}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-muted-foreground hover:text-destructive"
                      onClick={() => removePreset(preset.id)}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mb-3 flex flex-wrap gap-2">
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

          <div className="mb-3 rounded-lg border bg-muted/20 p-3">
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
            <p className="mt-2 text-xs text-muted-foreground">
              {tr("salesManagementSelectedReport", "선택된 리포트")}:{" "}
              {tr(selectedTopic.labelKey, I18N_KO[selectedTopic.labelKey] ?? selectedTopic.labelKey)}
              {selectedTopic.hintKey
                ? ` · ${tr(selectedTopic.hintKey, I18N_KO[selectedTopic.hintKey] ?? "")}`
                : ""}
            </p>
          </div>

          <div className="mb-3 rounded-lg border bg-muted/20 p-3">
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
            </div>
          </div>

          {showSalesResults ? (
            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">{tr("salesSummaryCurrent", "현재 기간 매출")}</p>
                <p className="mt-1 text-base font-semibold tabular-nums">{formatSalesAmount(summaryCards.current)}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">{tr("salesSummaryPrevRange", "직전 동일기간")}</p>
                <p className="mt-1 text-base font-semibold tabular-nums">{formatSalesAmount(summaryCards.prevRange)}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">{tr("salesSummaryPrevWeek", "전주 동기간")}</p>
                <p className="mt-1 text-base font-semibold tabular-nums">{formatSalesAmount(summaryCards.prevWeek)}</p>
              </div>
            </div>
          ) : null}

          {showSalesResults ? (
            <div className="mb-3 grid grid-cols-1 gap-2 xl:grid-cols-3">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">{tr("salesNetGross", "총액(공급+세금)")}</p>
                <p className="mt-1 text-sm font-semibold tabular-nums">{formatSalesAmount(totalsSummary.gross)}</p>
                <p className="mt-2 text-xs text-muted-foreground">{tr("salesNetDiscount", "할인")}</p>
                <p className="mt-1 text-sm font-semibold tabular-nums">-{formatSalesAmount(totalsSummary.discount)}</p>
                <p className="mt-2 text-xs text-muted-foreground">{tr("salesNetResult", "순매출")}</p>
                <p className="mt-1 text-base font-bold tabular-nums">{formatSalesAmount(totalsSummary.total)}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="mb-2 text-xs text-muted-foreground">{tr("salesInsightTopMenu", "TOP 메뉴")}</p>
                {insightTopMenus.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{tr("salesDataNone", "데이터 없음")}</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {insightTopMenus.map((row) => (
                      <li key={`top-${row.name}`} className="flex items-center justify-between gap-2">
                        <span className="truncate">{row.name}</span>
                        <span className="shrink-0 tabular-nums font-medium">{formatSalesAmount(row.sales)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mb-2 mt-3 text-xs text-muted-foreground">{tr("salesInsightBottomMenu", "LOW 메뉴")}</p>
                {insightBottomMenus.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{tr("salesDataNone", "데이터 없음")}</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {insightBottomMenus.map((row) => (
                      <li key={`low-${row.name}`} className="flex items-center justify-between gap-2">
                        <span className="truncate">{row.name}</span>
                        <span className="shrink-0 tabular-nums font-medium">{formatSalesAmount(row.sales)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="mb-2 text-xs text-muted-foreground">{tr("salesInsightTopChannel", "TOP 채널")}</p>
                {insightTopChannels.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{tr("salesDataNone", "데이터 없음")}</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {insightTopChannels.map((row) => (
                      <li key={`ch-${row.channelKey}`} className="flex items-center justify-between gap-2">
                        <span className="truncate">{row.axisLabel}</span>
                        <span className="shrink-0 tabular-nums font-medium">{formatSalesAmount(row.sales)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}

          <div className="mt-6 overflow-auto max-h-[calc(100vh-380px)] min-h-[200px] rounded-lg border p-4">
            {selectedView === "period" && (
              !hasData ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr("salesSelectPeriod", "기간을 선택해 주세요.")}
                </p>
              ) : !showSalesResults ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr(
                    "salesPressQueryToLoad",
                    "위에서 조건을 맞춘 뒤「조회」를 누르면 집계가 표시됩니다."
                  )}
                </p>
              ) : (
                <>
                  {periodTruncated ? (
                    <p
                      className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
                      role="status"
                    >
                      {tr(
                        "salesDataTruncatedWarning",
                        "조회 기간 내 주문이 많아 일부만 반영했을 수 있습니다. 기간을 나누어 조회해 보세요."
                      )}
                    </p>
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
                        <YAxis tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
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
                  <table className="mt-4 w-full min-w-[1120px] text-sm">
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
                        <th className="py-2 text-right">{tr("salesAmount", "매출액")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodChartRows.map((r) => (
                        <tr key={r.key} className="border-b">
                          <td className="py-1.5">{r.axisLabel}</td>
                          <td className="py-1.5 text-right font-mono">{r.count.toLocaleString()}</td>
                          <td className="py-1.5 text-right font-mono">{r.hallGuestSum.toLocaleString()}</td>
                          <td className="py-1.5 text-right font-mono">
                            {r.dineInOrderCount > 0 ? formatSalesAmount(r.salesPerDineInOrder) : "—"}
                          </td>
                          <td className="py-1.5 text-right font-mono">
                            {r.hallGuestSum > 0 ? formatSalesAmount(r.salesPerGuestHall) : "—"}
                          </td>
                          <td className="py-1.5 text-right font-mono">
                            {r.count > 0 ? formatSalesAmount(r.salesPerOrder) : "—"}
                          </td>
                          <td className="py-1.5 text-right font-mono">{formatSalesAmount(r.subtotal)}</td>
                          <td className="py-1.5 text-right font-mono">{formatSalesAmount(r.vat)}</td>
                          <td className="py-1.5 text-right font-mono">{formatSalesAmount(r.discount)}</td>
                          <td className="py-1.5 text-right font-mono font-medium">{formatSalesAmount(r.total)}</td>
                        </tr>
                      ))}
                      {periodChartRows.length > 0 && (
                        <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                          <td className="py-2">{tr("salesTotalLabel", "합계")}</td>
                          <td className="py-2 text-right font-mono">
                            {periodChartRows.reduce((a, x) => a + x.count, 0).toLocaleString()}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {periodChartRows.reduce((a, x) => a + x.hallGuestSum, 0).toLocaleString()}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {(() => {
                              const c = periodChartRows.reduce((a, x) => a + x.dineInOrderCount, 0)
                              const t = periodChartRows.reduce((a, x) => a + x.dineInTotal, 0)
                              return c > 0 ? formatSalesAmount(Math.round((t / c) * 100) / 100) : "—"
                            })()}
                          </td>
                          <td className="py-2 text-right font-mono">
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
                          <td className="py-2 text-right font-mono">
                            {(() => {
                              const c = periodChartRows.reduce((a, x) => a + x.count, 0)
                              const t = periodChartRows.reduce((a, x) => a + x.total, 0)
                              return c > 0 ? formatSalesAmount(Math.round((t / c) * 100) / 100) : "—"
                            })()}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {formatSalesAmount(periodChartRows.reduce((a, x) => a + x.subtotal, 0))}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {formatSalesAmount(periodChartRows.reduce((a, x) => a + x.vat, 0))}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {formatSalesAmount(periodChartRows.reduce((a, x) => a + x.discount, 0))}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {formatSalesAmount(periodChartRows.reduce((a, x) => a + x.total, 0))}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                    {tr(
                      "salesAmountBreakdownFootnote",
                      "공급가액은 품목 합계(할인 전)입니다. 세금·매출액은 POS 요금·부가세 계산 규칙이 반영된 값입니다. 할인 금액은 수동 할인과 쿠폰 할인의 합입니다."
                    )}{" "}
                    {tr(
                      "salesGuestMetricsFootnote",
                      "손님 수(홀)·홀 건당·홀 1인당은 dine_in 주문과 POS guest_count만 사용합니다. 건당은 현재 매출액 종류 필터에 포함된 주문 전체의 매출÷건수입니다. 포장·배달은 인원 미입력이므로 홀 지표와 섞지 않습니다."
                    )}
                  </p>
                </>
              )
            )}

            {selectedView === "store-period" && (
              !hasData ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr("salesSelectPeriod", "기간을 선택해 주세요.")}
                </p>
              ) : !showSalesResults ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr(
                    "salesPressQueryToLoad",
                    "위에서 조건을 맞춘 뒤「조회」를 누르면 집계가 표시됩니다."
                  )}
                </p>
              ) : (
                <>
                  {periodTruncated ? (
                    <p
                      className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
                      role="status"
                    >
                      {tr(
                        "salesDataTruncatedWarning",
                        "조회 기간 내 주문이 많아 일부만 반영했을 수 있습니다. 기간을 나누어 조회해 보세요."
                      )}
                    </p>
                  ) : null}
                  {storeByPeriodFlatRows.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {tr("salesDataNone", "데이터 없음")}
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full min-w-[1180px] text-sm">
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
                            <th className="px-3 py-2 text-right">{tr("salesAmount", "매출액")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {storeByPeriodFlatRows.map((r) => (
                            <tr key={`${r.storeCode}\t${r.key}`} className="border-b border-border/60">
                              <td className="px-3 py-1.5 font-medium">{r.storeDisplay}</td>
                              <td className="px-3 py-1.5">{r.axisLabel}</td>
                              <td className="px-3 py-1.5 text-right font-mono">{r.count.toLocaleString()}</td>
                              <td className="px-3 py-1.5 text-right font-mono">{r.hallGuestSum.toLocaleString()}</td>
                              <td className="px-3 py-1.5 text-right font-mono">
                                {r.dineInOrderCount > 0 ? formatSalesAmount(r.salesPerDineInOrder) : "—"}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono">
                                {r.hallGuestSum > 0 ? formatSalesAmount(r.salesPerGuestHall) : "—"}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono">
                                {r.count > 0 ? formatSalesAmount(r.salesPerOrder) : "—"}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono">{formatSalesAmount(r.subtotal)}</td>
                              <td className="px-3 py-1.5 text-right font-mono">{formatSalesAmount(r.vat)}</td>
                              <td className="px-3 py-1.5 text-right font-mono">{formatSalesAmount(r.discount)}</td>
                              <td className="px-3 py-1.5 text-right font-mono font-medium">
                                {formatSalesAmount(r.total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
                      "공급가액은 품목 합계(할인 전)입니다. 세금·매출액은 POS 요금·부가세 계산 규칙이 반영된 값입니다. 할인 금액은 수동 할인과 쿠폰 할인의 합입니다."
                    )}{" "}
                    {tr(
                      "salesGuestMetricsFootnote",
                      "손님 수(홀)·홀 건당·홀 1인당은 dine_in 주문과 POS guest_count만 사용합니다. 건당은 현재 매출액 종류 필터에 포함된 주문 전체의 매출÷건수입니다. 포장·배달은 인원 미입력이므로 홀 지표와 섞지 않습니다."
                    )}
                  </p>
                </>
              )
            )}

            {selectedView === "delivery" && (
              !hasData ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr("salesSelectPeriod", "기간을 선택해 주세요.")}
                </p>
              ) : !showSalesResults ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr(
                    "salesPressQueryToLoad",
                    "위에서 조건을 맞춘 뒤「조회」를 누르면 집계가 표시됩니다."
                  )}
                </p>
              ) : deliveryAppData.items.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr("salesDataNone", "데이터 없음")}
                </p>
              ) : (
                <>
                  <div className="mb-4 h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={periodChartRows}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="axisLabel" {...periodBarXAxisProps} />
                        <YAxis tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                        <Tooltip formatter={(v: number) => [formatSalesAmount(v), tr("pL_sales", "매출")]} />
                        <Bar dataKey="sales" fill="#3b82f6" name={tr("pL_sales", "매출")} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
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
                          <th className="py-2 text-left">{tr("salesDeliveryChannel", "배달앱/채널")}</th>
                          <th className="py-2 text-right">{tr("pL_sales", "매출")}</th>
                          <th className="py-2 text-right">{tr("salesRatio", "비율")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deliveryPieRows.map((r) => (
                          <tr key={r.channelKey} className="border-b">
                            <td className="py-1.5">{r.axisLabel}</td>
                            <td className="py-1.5 text-right font-mono">
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
                                    <th className="py-2 text-left">
                                      {tr("salesDeliveryPlatformBreakdown", "배달 플랫폼별")}
                                    </th>
                                    <th className="py-2 text-right">{tr("pL_sales", "매출")}</th>
                                    <th className="py-2 text-right">{tr("salesRatio", "비율")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {deliveryPlatformPieRows.map((r) => (
                                    <tr key={r.code} className="border-b">
                                      <td className="py-1.5">{r.axisLabel}</td>
                                      <td className="py-1.5 text-right font-mono">
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

            {selectedView === "channel" && (
              !hasData ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr("salesSelectPeriod", "기간을 선택해 주세요.")}
                </p>
              ) : !showSalesResults ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr(
                    "salesPressQueryToLoad",
                    "위에서 조건을 맞춘 뒤「조회」를 누르면 집계가 표시됩니다."
                  )}
                </p>
              ) : (
                <>
                  <div className="mb-4 h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={periodChartRows}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="axisLabel" {...periodBarXAxisProps} />
                        <YAxis tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                        <Tooltip formatter={(v: number) => [formatSalesAmount(v), tr("pL_sales", "매출")]} />
                        <Bar dataKey="sales" fill="#3b82f6" name={tr("pL_sales", "매출")} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mb-4 h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={channelChartRows} layout="vertical" margin={{ left: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                        <YAxis dataKey="axisLabel" type="category" width={80} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => [formatSalesAmount(v), tr("pL_sales", "매출")]} />
                        <Bar dataKey="sales" fill="#22c55e" name={tr("pL_sales", "매출")} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 text-left">{tr("salesChannel", "채널")}</th>
                        <th className="py-2 text-right">{tr("pL_sales", "매출")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channelChartRows.slice(0, 30).map((r) => (
                        <tr key={r.channelKey} className="border-b">
                          <td className="py-1.5">{r.axisLabel}</td>
                          <td className="py-1.5 text-right font-mono">
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
              !hasData ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr("salesSelectPeriod", "기간을 선택해 주세요.")}
                </p>
              ) : !showSalesResults ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr(
                    "salesPressQueryToLoad",
                    "위에서 조건을 맞춘 뒤「조회」를 누르면 집계가 표시됩니다."
                  )}
                </p>
              ) : (
                <>
                  <div className="mb-4 h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={periodChartRows}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="axisLabel" {...periodBarXAxisProps} />
                        <YAxis tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                        <Tooltip formatter={(v: number) => [formatSalesAmount(v), tr("pL_sales", "매출")]} />
                        <Bar dataKey="sales" fill="#3b82f6" name={tr("pL_sales", "매출")} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
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
                          <td className="py-1.5 text-right font-mono">
                            {r.qty.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right font-mono">
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

            {selectedView === "store" && (
              !hasData ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr("salesSelectPeriod", "기간을 선택해 주세요.")}
                </p>
              ) : !showSalesResults ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr(
                    "salesPressQueryToLoad",
                    "위에서 조건을 맞춘 뒤「조회」를 누르면 집계가 표시됩니다."
                  )}
                </p>
              ) : (
                <>
                  <div className="mb-4 h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={periodChartRows}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="axisLabel" {...periodBarXAxisProps} />
                        <YAxis tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                        <Tooltip formatter={(v: number) => [formatSalesAmount(v), tr("pL_sales", "매출")]} />
                        <Bar dataKey="sales" fill="#3b82f6" name={tr("pL_sales", "매출")} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-x-auto rounded-lg border">
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
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">{tr("salesAmount", "매출액")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {storeData.map((r) => {
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
                            <td className="px-4 py-2.5 text-right font-mono">{r.count.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{hallGuestSum.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right font-mono">
                              {dineInOrderCount > 0 ? formatSalesAmount(salesPerDineInOrder) : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono">
                              {hallGuestSum > 0 ? formatSalesAmount(salesPerGuestHall) : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono">
                              {r.count > 0 ? formatSalesAmount(salesPerOrder) : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono">{formatSalesAmount(r.subtotal)}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{formatSalesAmount(r.vat)}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{formatSalesAmount(r.discount ?? 0)}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-semibold">{formatSalesAmount(r.total)}</td>
                          </tr>
                          )
                        })}
                        {storeData.length > 0 && (
                          <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                            <td className="px-4 py-3">{tr("salesTotalLabel", "합계")}</td>
                            <td className="px-4 py-3 text-right font-mono">
                              {storeData.reduce((a, r) => a + r.count, 0).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {storeData.reduce((a, r) => {
                                const g = r.guestSum ?? 0
                                const legacy =
                                  r.dineInGuestSum === undefined &&
                                  r.dineInOrderCount === undefined &&
                                  r.dineInTotal === undefined
                                const hall = legacy ? g : (r.dineInGuestSum ?? 0)
                                return a + hall
                              }, 0).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {(() => {
                                const c = storeData.reduce((a, r) => a + (r.dineInOrderCount ?? 0), 0)
                                const t = storeData.reduce((a, r) => a + (r.dineInTotal ?? 0), 0)
                                return c > 0 ? formatSalesAmount(Math.round((t / c) * 100) / 100) : "—"
                              })()}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {(() => {
                                const gD = storeData.reduce((a, r) => a + (r.dineInGuestSum ?? 0), 0)
                                const tD = storeData.reduce((a, r) => a + (r.dineInTotal ?? 0), 0)
                                const gH = storeData.reduce((a, r) => {
                                  const g = r.guestSum ?? 0
                                  const legacy =
                                    r.dineInGuestSum === undefined &&
                                    r.dineInOrderCount === undefined &&
                                    r.dineInTotal === undefined
                                  return a + (legacy ? g : (r.dineInGuestSum ?? 0))
                                }, 0)
                                const tAll = storeData.reduce((a, r) => a + r.total, 0)
                                if (gD > 0 && tD > 0)
                                  return formatSalesAmount(Math.round((tD / gD) * 100) / 100)
                                if (gH > 0 && tAll > 0)
                                  return formatSalesAmount(Math.round((tAll / gH) * 100) / 100)
                                return "—"
                              })()}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {(() => {
                                const c = storeData.reduce((a, r) => a + r.count, 0)
                                const t = storeData.reduce((a, r) => a + r.total, 0)
                                return c > 0 ? formatSalesAmount(Math.round((t / c) * 100) / 100) : "—"
                              })()}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {formatSalesAmount(storeData.reduce((a, r) => a + r.subtotal, 0))}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {formatSalesAmount(storeData.reduce((a, r) => a + r.vat, 0))}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {formatSalesAmount(storeData.reduce((a, r) => a + (r.discount ?? 0), 0))}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {formatSalesAmount(storeData.reduce((a, r) => a + r.total, 0))}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                    {tr(
                      "salesAmountBreakdownFootnote",
                      "공급가액은 품목 합계(할인 전)입니다. 세금·매출액은 POS 요금·부가세 계산 규칙이 반영된 값입니다. 할인 금액은 수동 할인과 쿠폰 할인의 합입니다."
                    )}{" "}
                    {tr(
                      "salesGuestMetricsFootnote",
                      "손님 수(홀)·홀 건당·홀 1인당은 dine_in 주문과 POS guest_count만 사용합니다. 건당은 현재 매출액 종류 필터에 포함된 주문 전체의 매출÷건수입니다. 포장·배달은 인원 미입력이므로 홀 지표와 섞지 않습니다."
                    )}
                  </p>
                  {storeData.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {tr("salesNoSalesData", "해당 기간 매출 데이터가 없습니다.")}
                    </p>
                  )}
                </>
              )
            )}

            {selectedView === "store-category" && (
              !hasData ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr("salesSelectPeriod", "기간을 선택해 주세요.")}
                </p>
              ) : !showSalesResults ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr(
                    "salesPressQueryToLoad",
                    "위에서 조건을 맞춘 뒤「조회」를 누르면 집계가 표시됩니다."
                  )}
                </p>
              ) : (
                <>
                  <div className="mb-4 h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={periodChartRows}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="axisLabel" {...periodBarXAxisProps} />
                        <YAxis tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                        <Tooltip formatter={(v: number) => [formatSalesAmount(v), tr("pL_sales", "매출")]} />
                        <Bar dataKey="sales" fill="#3b82f6" name={tr("pL_sales", "매출")} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
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
                    <div className="overflow-x-auto rounded-lg border">
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
                              <td className="px-3 py-1.5 text-right font-mono">{r.count.toLocaleString()}</td>
                              <td className="px-3 py-1.5 text-right font-mono">{formatSalesAmount(r.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-3 text-sm font-semibold">{tr("salesByCategory", "분류별 (채널)")}</h3>
                    <div className="mb-4 h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={channelChartRows} layout="vertical" margin={{ left: 60 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                          <YAxis dataKey="axisLabel" type="category" width={60} tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v: number) => [formatSalesAmount(v), tr("pL_sales", "매출")]} />
                          <Bar dataKey="sales" fill="#f59e0b" name={tr("salesSalesAmount", "판매 금액")} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-left">{tr("salesCategoryName", "분류명")}</th>
                            <th className="px-3 py-2 text-right">{tr("salesSalesAmount", "판매 금액")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {channelChartRows.map((r) => (
                            <tr key={r.channelKey} className="border-t">
                              <td className="px-3 py-1.5">{r.axisLabel}</td>
                              <td className="px-3 py-1.5 text-right font-mono">{formatSalesAmount(r.sales)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                </>
              )
            )}

            {selectedView === "payment" && (
              !hasData ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr("salesSelectPeriod", "기간을 선택해 주세요.")}
                </p>
              ) : !showSalesResults ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr(
                    "salesPressQueryToLoad",
                    "위에서 조건을 맞춘 뒤「조회」를 누르면 집계가 표시됩니다."
                  )}
                </p>
              ) : paymentData.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr("salesDataNone", "데이터 없음")}
                </p>
              ) : (
                <>
                  <div className="mb-4 h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={periodChartRows}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="axisLabel" {...periodBarXAxisProps} />
                        <YAxis tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                        <Tooltip formatter={(v: number) => [formatSalesAmount(v), tr("pL_sales", "매출")]} />
                        <Bar dataKey="sales" fill="#3b82f6" name={tr("pL_sales", "매출")} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                <div className="flex flex-wrap gap-6">
                  <div className="h-[260px] w-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paymentChartRows}
                          dataKey="sales"
                          nameKey="axisLabel"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                        >
                          {paymentChartRows.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatSalesAmount(v)} />
                        <Legend />
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
                          <td className="py-1.5 text-right font-mono">
                            {formatSalesAmount(r.sales)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
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
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
