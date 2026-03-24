"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
} from "@/lib/sales-analytics-labels"
import {
  getPosSalesFilterOptions,
  getPosSalesByPeriod,
  getPosSalesByDeliveryApp,
  getPosSalesByChannel,
  getPosSalesByMenu,
  getPosSalesByPayment,
  getPosSalesByStore,
} from "@/lib/api-client"
import {
  getPosSalesFilterOptionsWithCache,
  getPosSalesByPeriodWithCache,
  getPosSalesByDeliveryAppWithCache,
  getPosSalesByChannelWithCache,
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

type AnalyticsView = "period" | "delivery" | "channel" | "menu" | "payment" | "store" | "store-category" | null

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
    id: "sales-explorer",
    labelKey: "salesManagementSubmenuQuickSales",
    fallbackLabel: "매출 탐색",
    topics: [
      { id: "explore-period", labelKey: "salesTopicExplorePeriod", hintKey: "salesTopicExplorePeriodHint", view: "period" },
      { id: "explore-channel", labelKey: "salesTopicExploreChannel", hintKey: "salesTopicExploreChannelHint", view: "channel" },
      { id: "explore-payment", labelKey: "salesTopicExplorePayment", hintKey: "salesTopicExplorePaymentHint", view: "payment" },
      { id: "explore-menu", labelKey: "salesTopicExploreMenu", hintKey: "salesTopicExploreMenuHint", view: "menu" },
      { id: "explore-delivery", labelKey: "salesTopicExploreDelivery", hintKey: "salesTopicExploreDeliveryHint", view: "delivery" },
    ],
  },
  {
    id: "sales-pivot",
    labelKey: "salesManagementSubmenuAggregateInfo",
    fallbackLabel: "집계 정보",
    topics: [
      { id: "pivot-store-summary", labelKey: "salesTopicPivotStoreSummary", hintKey: "salesTopicPivotStoreSummaryHint", view: "store" },
      { id: "pivot-store-category", labelKey: "salesTopicPivotStoreCategory", hintKey: "salesTopicPivotStoreCategoryHint", view: "store-category" },
      { id: "pivot-store-channel", labelKey: "salesTopicPivotStoreChannel", hintKey: "salesTopicPivotStoreChannelHint", view: "channel" },
      { id: "pivot-store-item", labelKey: "salesTopicPivotStoreItem", hintKey: "salesTopicPivotStoreItemHint", view: "menu" },
      { id: "pivot-time-item", labelKey: "salesTopicPivotTimeItem", hintKey: "salesTopicPivotTimeItemHint", view: "period" },
      { id: "pivot-delivery-store", labelKey: "salesTopicPivotDeliveryStore", hintKey: "salesTopicPivotDeliveryStoreHint", view: "delivery" },
      { id: "pivot-payment", labelKey: "salesTopicPivotPayment", hintKey: "salesTopicPivotPaymentHint", view: "payment" },
    ],
  },
  {
    id: "sales-compare-forecast",
    labelKey: "salesManagementTabForecast",
    fallbackLabel: "비교·예측",
    topics: [
      { id: "compare-month-year", labelKey: "salesTopicCompareMonthYear", hintKey: "salesTopicCompareMonthYearHint", view: "period" },
      { id: "compare-month-mom", labelKey: "salesTopicCompareMonthMom", hintKey: "salesTopicCompareMonthMomHint", view: "period" },
      { id: "forecast-monthly", labelKey: "salesTopicForecastMonthly", hintKey: "salesTopicForecastMonthlyHint", view: "period" },
      { id: "overview-report", labelKey: "salesTopicOverviewReport", hintKey: "salesTopicOverviewReportHint", view: "channel" },
    ],
  },
]

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
  const { auth } = useAuth()
  const canSearchAll = isOfficeRole(auth?.role || "")
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), [])
  const monthStart = React.useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
  }, [])

  const [startStr, setStartStr] = React.useState(monthStart)
  const [endStr, setEndStr] = React.useState(today)
  const [posFilter, setPosFilter] = React.useState<string>("")
  const [posOptions, setPosOptions] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(false)
  const [periodGroup, setPeriodGroup] = React.useState<PeriodGroupValue>("day")
  const [menuSearch, setMenuSearch] = React.useState("")
  /** 빈 문자열 = 매출액 종류 전체(필터 없음) */
  const [orderTypesKey, setOrderTypesKey] = React.useState("")

  const [activeSubMenuId, setActiveSubMenuId] = React.useState<string>(SALES_IA[0].id)
  const [selectedTopicBySubMenu, setSelectedTopicBySubMenu] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(SALES_IA.map((menu) => [menu.id, menu.topics[0]?.id ?? ""]))
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
    items: { channelKey: string; sales: number; pct: number }[]
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

  const tr = React.useCallback(
    (key: string, fallback: string) => {
      const value = t(key as never)
      return value === key ? fallback : value
    },
    [t]
  )

  /** 구버전·캐시 행에 누락된 집계 필드 보정 — 홀 전용 지표와 조회 건당 분리 */
  const periodChartRows = React.useMemo(
    () =>
      periodData.map((r) => {
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
      }),
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

  const currentSubMenu = SALES_IA.find((menu) => menu.id === activeSubMenuId) ?? SALES_IA[0]
  const selectedTopicId = selectedTopicBySubMenu[currentSubMenu.id] ?? currentSubMenu.topics[0].id
  const selectedTopic = currentSubMenu.topics.find((topic) => topic.id === selectedTopicId) ?? currentSubMenu.topics[0]
  const selectedView = selectedTopic?.view ?? null
  const hasData = !!(startStr && endStr)

  const orderTypesParam = React.useMemo(
    () => parseOrderTypesParam(orderTypesKey || null) ?? undefined,
    [orderTypesKey]
  )

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
    pos?: string
    periodGroup?: string
    dateRange?: string
    orderTypesKey?: string
  }>({})

  React.useEffect(() => {
    const qMenu = searchParams.get("menu")
    const qTopic = searchParams.get("topic")
    const qGroup = searchParams.get("group")
    const qPos = searchParams.get("pos")
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

    const nextPos = qPos ?? ""
    if (nextPos !== posFilter && userSelectedRef.current.pos !== posFilter) {
      setPosFilter(nextPos)
    }
    if (qOrderTypes !== orderTypesKey && userSelectedRef.current.orderTypesKey !== orderTypesKey) {
      setOrderTypesKey(qOrderTypes)
    }
    if (
      qMenu === activeSubMenuId &&
      (qPos ?? "") === posFilter &&
      qGroup === periodGroup &&
      qStart === startStr &&
      qEnd === endStr &&
      qOrderTypes === orderTypesKey
    ) {
      userSelectedRef.current = {}
    }
  }, [
    searchParams,
    activeSubMenuId,
    posFilter,
    periodGroup,
    startStr,
    endStr,
    orderTypesKey,
    validTopicByMenu,
    selectedTopicBySubMenu,
  ])

  React.useEffect(() => {
    const currentTopic = selectedTopic?.id
    if (!currentTopic) return

    const qMenu = searchParams.get("menu")
    const qTopic = searchParams.get("topic")
    const qGroup = searchParams.get("group")
    const qPos = searchParams.get("pos") ?? ""
    const qOrderTypes = normalizeOrderTypesQueryString(searchParams.get("orderTypes"))
    const qStart = searchParams.get("start")
    const qEnd = searchParams.get("end")
    if (
      qMenu === activeSubMenuId &&
      qTopic === currentTopic &&
      qGroup === periodGroup &&
      qPos === posFilter &&
      qOrderTypes === orderTypesKey &&
      qStart === startStr &&
      qEnd === endStr
    ) return

    const expected = new URLSearchParams()
    expected.set("menu", activeSubMenuId)
    expected.set("topic", currentTopic)
    expected.set("group", periodGroup)
    if (startStr) expected.set("start", startStr)
    if (endStr) expected.set("end", endStr)
    if (posFilter) expected.set("pos", posFilter)
    if (orderTypesKey) expected.set("orderTypes", orderTypesKey)
    const expectedStr = expected.toString()
    const currentStr = [
      searchParams.get("menu"),
      searchParams.get("topic"),
      searchParams.get("group"),
      searchParams.get("start"),
      searchParams.get("end"),
      searchParams.get("pos") ?? "",
      normalizeOrderTypesQueryString(searchParams.get("orderTypes")),
    ].join("|")
    const expectedValues = [
      activeSubMenuId,
      currentTopic,
      periodGroup,
      startStr,
      endStr,
      posFilter,
      orderTypesKey,
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
    posFilter,
    orderTypesKey,
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
    if (!canSearchAll && auth?.store && posFilter !== auth.store) setPosFilter(auth.store)
  }, [canSearchAll, auth?.store, posFilter])

  const loadPeriodData = React.useCallback(() => {
    if (!startStr || !endStr) return
    setLoading(true)
    getPosSalesByPeriod({
      startStr,
      endStr,
      groupBy: periodGroup,
      pos: posFilter || undefined,
      orderTypes: orderTypesParam,
    })
      .then(setPeriodData)
      .catch(() => setPeriodData([]))
      .finally(() => setLoading(false))
  }, [startStr, endStr, periodGroup, posFilter, orderTypesParam])

  const loadDeliveryAppData = React.useCallback(() => {
    if (!startStr || !endStr) return
    const fetcher = offlineAware ? getPosSalesByDeliveryAppWithCache : getPosSalesByDeliveryApp
    fetcher({
      startStr,
      endStr,
      pos: posFilter || undefined,
      orderTypes: orderTypesParam,
    })
      .then(setDeliveryAppData)
      .catch(() => setDeliveryAppData({ items: [], total: 0 }))
  }, [startStr, endStr, posFilter, offlineAware, orderTypesParam])

  const loadChannelData = React.useCallback(() => {
    if (!startStr || !endStr) return
    getPosSalesByChannel({
      startStr,
      endStr,
      pos: posFilter || undefined,
      orderTypes: orderTypesParam,
    })
      .then(setChannelData)
      .catch(() => setChannelData([]))
  }, [startStr, endStr, posFilter, orderTypesParam])

  const loadMenuData = React.useCallback(() => {
    if (!startStr || !endStr) return
    const fetcher = offlineAware ? getPosSalesByMenuWithCache : getPosSalesByMenu
    fetcher({
      startStr,
      endStr,
      pos: posFilter || undefined,
      search: menuSearch || undefined,
      orderTypes: orderTypesParam,
    })
      .then(setMenuData)
      .catch(() => setMenuData([]))
  }, [startStr, endStr, posFilter, menuSearch, offlineAware, orderTypesParam])

  const loadPaymentData = React.useCallback(() => {
    if (!startStr || !endStr) return
    const fetcher = offlineAware ? getPosSalesByPaymentWithCache : getPosSalesByPayment
    fetcher({
      startStr,
      endStr,
      pos: posFilter || undefined,
      orderTypes: orderTypesParam,
    })
      .then(setPaymentData)
      .catch(() => setPaymentData([]))
  }, [startStr, endStr, posFilter, offlineAware, orderTypesParam])

  const loadStoreData = React.useCallback(() => {
    if (!startStr || !endStr) return
    const fetcher = offlineAware ? getPosSalesByStoreWithCache : getPosSalesByStore
    fetcher({
      startStr,
      endStr,
      pos: posFilter || undefined,
      orderTypes: orderTypesParam,
    })
      .then(setStoreData)
      .catch(() => setStoreData([]))
  }, [startStr, endStr, posFilter, offlineAware, orderTypesParam])

  const loadAllAnalytics = React.useCallback(() => {
    loadPeriodData()
    loadDeliveryAppData()
    loadChannelData()
    loadMenuData()
    loadPaymentData()
    loadStoreData()
  }, [
    loadPeriodData,
    loadDeliveryAppData,
    loadChannelData,
    loadMenuData,
    loadPaymentData,
    loadStoreData,
  ])

  /** API 응답 race 방지: 최신 요청 ID와 일치할 때만 setState */
  const loadIdRef = React.useRef(0)
  const menuLoadIdRef = React.useRef(0)

  React.useEffect(() => {
    if (startStr && endStr) {
      const id = ++loadIdRef.current
      const guarded =
        <T,>(setter: React.Dispatch<React.SetStateAction<T>>) =>
        (v: T) => {
          if (loadIdRef.current === id) setter(v)
        }
      const gPeriod = guarded(setPeriodData)
      const gDelivery = guarded(setDeliveryAppData)
      const gChannel = guarded(setChannelData)
      const gPayment = guarded(setPaymentData)
      const gStore = guarded(setStoreData)
      setLoading(true)
      Promise.all([
        getPosSalesByPeriod({
          startStr,
          endStr,
          groupBy: periodGroup,
          pos: posFilter || undefined,
          orderTypes: orderTypesParam,
        })
          .then(gPeriod)
          .catch(() => gPeriod([])),
        (offlineAware ? getPosSalesByDeliveryAppWithCache : getPosSalesByDeliveryApp)({
          startStr,
          endStr,
          pos: posFilter || undefined,
          orderTypes: orderTypesParam,
        }).then(gDelivery).catch(() => gDelivery({ items: [], total: 0 })),
        getPosSalesByChannel({
          startStr,
          endStr,
          pos: posFilter || undefined,
          orderTypes: orderTypesParam,
        })
          .then(gChannel)
          .catch(() => gChannel([])),
        (offlineAware ? getPosSalesByPaymentWithCache : getPosSalesByPayment)({
          startStr,
          endStr,
          pos: posFilter || undefined,
          orderTypes: orderTypesParam,
        }).then(gPayment).catch(() => gPayment([])),
        (offlineAware ? getPosSalesByStoreWithCache : getPosSalesByStore)({
          startStr,
          endStr,
          pos: posFilter || undefined,
          orderTypes: orderTypesParam,
        }).then(gStore).catch(() => gStore([])),
      ]).finally(() => {
        if (loadIdRef.current === id) setLoading(false)
      })
    } else {
      setPeriodData([])
      setDeliveryAppData({ items: [], total: 0 })
      setChannelData([])
      setMenuData([])
      setPaymentData([])
      setStoreData([])
    }
  }, [startStr, endStr, posFilter, periodGroup, offlineAware, orderTypesParam])

  React.useEffect(() => {
    if (!startStr || !endStr) return
    const id = ++menuLoadIdRef.current
    const fetcher = offlineAware ? getPosSalesByMenuWithCache : getPosSalesByMenu
    fetcher({
      startStr,
      endStr,
      pos: posFilter || undefined,
      search: menuSearch || undefined,
      orderTypes: orderTypesParam,
    })
      .then((data) => {
        if (menuLoadIdRef.current === id) setMenuData(data)
      })
      .catch(() => {
        if (menuLoadIdRef.current === id) setMenuData([])
      })
  }, [startStr, endStr, posFilter, menuSearch, offlineAware, orderTypesParam])

  const online = useOnlineStatus()
  const prevOnlineRef = React.useRef(online)
  React.useEffect(() => {
    if (offlineAware && hasData && !prevOnlineRef.current && online) {
      prevOnlineRef.current = true
      loadAllAnalytics()
    }
    prevOnlineRef.current = online
  }, [online, offlineAware, hasData, loadAllAnalytics])

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
            <Select
              value={posFilter === "" ? "__all__" : posFilter}
              onValueChange={(v) => {
                const next = v === "__all__" ? "" : v
                userSelectedRef.current.pos = next
                setPosFilter(next)
              }}
              disabled={!canSearchAll}
            >
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder={tr("salesSelectStoreAll", "매장(전체)")} />
              </SelectTrigger>
              <SelectContent>
                {canSearchAll && <SelectItem value="__all__">{tr("all", "전체")}</SelectItem>}
                {posOptions.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={loadAllAnalytics} disabled={!hasData || loading}>
              {tr("salesQuery", "조회")}
            </Button>
          </div>

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
                    if (topic.id === "pivot-time-item" && topic.view === "period") {
                      userSelectedRef.current.periodGroup = "hour"
                      setPeriodGroup("hour")
                    }
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
              {selectedView !== null ? (
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

          <div className="mt-6 overflow-auto max-h-[calc(100vh-380px)] min-h-[200px] rounded-lg border p-4">
            {selectedView === "period" && (
              !hasData ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr("salesSelectPeriod", "기간을 선택해 주세요.")}
                </p>
              ) : (
                <>
                  <div className="h-[300px]">
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

            {selectedView === "delivery" && (
              !hasData ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr("salesSelectPeriod", "기간을 선택해 주세요.")}
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
                  <div className="mb-4">
                    <Input
                      placeholder={tr("salesMenuSearch", "메뉴 검색")}
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      className="w-48"
                    />
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
                            <td className="px-4 py-2.5 font-medium">{r.storeName}</td>
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
                            data={storeData}
                            dataKey="total"
                            nameKey="storeName"
                            cx="50%"
                            cy="50%"
                            outerRadius={90}
                            label={({ storeName, percent }) => `${storeName} ${(percent * 100).toFixed(1)}%`}
                          >
                            {storeData.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
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
                          {storeData.slice(0, 12).map((r) => (
                            <tr key={r.storeName} className="border-t">
                              <td className="px-3 py-1.5">{r.storeName}</td>
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
