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
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useLang } from "@/lib/lang-context"
import { useOnlineStatus } from "@/lib/offline"
import { useT } from "@/lib/i18n"
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

const PERIOD_GROUP = [
  { value: "month", labelKey: "salesPeriodMonth" },
  { value: "week", labelKey: "salesPeriodWeek" },
  { value: "day", labelKey: "salesPeriodDay" },
  { value: "dow", labelKey: "salesPeriodDow" },
] as const
const PERIOD_GROUP_VALUES = new Set(PERIOD_GROUP.map((g) => g.value))

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"]

function formatBath(n: number) {
  return `฿${(n ?? 0).toLocaleString()}`
}

type AnalyticsView = "period" | "delivery" | "channel" | "menu" | "payment" | "store" | "store-category" | null

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
    fallbackLabel: "집계 피벗",
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
  const [periodGroup, setPeriodGroup] = React.useState<"month" | "week" | "day" | "dow">("day")
  const [menuSearch, setMenuSearch] = React.useState("")

  const [activeSubMenuId, setActiveSubMenuId] = React.useState<string>(SALES_IA[0].id)
  const [selectedTopicBySubMenu, setSelectedTopicBySubMenu] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(SALES_IA.map((menu) => [menu.id, menu.topics[0]?.id ?? ""]))
  )

  const [periodData, setPeriodData] = React.useState<
    { label: string; key: string; sales: number }[]
  >([])
  const [deliveryAppData, setDeliveryAppData] = React.useState<{
    items: { label: string; sales: number; pct: number }[]
    total: number
  }>({ items: [], total: 0 })
  const [channelData, setChannelData] = React.useState<{ label: string; sales: number }[]>([])
  const [menuData, setMenuData] = React.useState<{ name: string; qty: number; sales: number }[]>([])
  const [paymentData, setPaymentData] = React.useState<{ label: string; sales: number }[]>([])
  const [storeData, setStoreData] = React.useState<
    { storeName: string; count: number; subtotal: number; vat: number; total: number }[]
  >([])

  const tr = React.useCallback(
    (key: string, fallback: string) => {
      const value = t(key as never)
      return value === key ? fallback : value
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t 의존 시 무한 루프
    []
  )

  const currentSubMenu = SALES_IA.find((menu) => menu.id === activeSubMenuId) ?? SALES_IA[0]
  const selectedTopicId = selectedTopicBySubMenu[currentSubMenu.id] ?? currentSubMenu.topics[0].id
  const selectedTopic = currentSubMenu.topics.find((topic) => topic.id === selectedTopicId) ?? currentSubMenu.topics[0]
  const selectedView = selectedTopic?.view ?? null
  const hasData = !!(startStr && endStr)

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
  }>({})

  React.useEffect(() => {
    const qMenu = searchParams.get("menu")
    const qTopic = searchParams.get("topic")
    const qGroup = searchParams.get("group")
    const qPos = searchParams.get("pos")
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

    if (qGroup && PERIOD_GROUP_VALUES.has(qGroup as "month" | "week" | "day" | "dow")) {
      if (periodGroup !== qGroup && userSelectedRef.current.periodGroup !== periodGroup) {
        setPeriodGroup(qGroup as "month" | "week" | "day" | "dow")
      }
    }

    const nextPos = qPos ?? ""
    if (nextPos !== posFilter && userSelectedRef.current.pos !== posFilter) {
      setPosFilter(nextPos)
    }
    if (
      qMenu === activeSubMenuId &&
      (qPos ?? "") === posFilter &&
      qGroup === periodGroup &&
      qStart === startStr &&
      qEnd === endStr
    ) {
      userSelectedRef.current = {}
    }
  }, [searchParams, activeSubMenuId, posFilter, periodGroup, startStr, endStr, validTopicByMenu, selectedTopicBySubMenu])

  React.useEffect(() => {
    const currentTopic = selectedTopic?.id
    if (!currentTopic) return

    const qMenu = searchParams.get("menu")
    const qTopic = searchParams.get("topic")
    const qGroup = searchParams.get("group")
    const qPos = searchParams.get("pos") ?? ""
    const qStart = searchParams.get("start")
    const qEnd = searchParams.get("end")
    if (
      qMenu === activeSubMenuId &&
      qTopic === currentTopic &&
      qGroup === periodGroup &&
      qPos === posFilter &&
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
    const expectedStr = expected.toString()
    const currentStr = [
      searchParams.get("menu"),
      searchParams.get("topic"),
      searchParams.get("group"),
      searchParams.get("start"),
      searchParams.get("end"),
      searchParams.get("pos") ?? "",
    ].join("|")
    const expectedValues = [activeSubMenuId, currentTopic, periodGroup, startStr, endStr, posFilter].join("|")
    if (currentStr === expectedValues) return
    router.replace(`${pathname}?${expectedStr}`, { scroll: false })
  }, [activeSubMenuId, pathname, periodGroup, posFilter, startStr, endStr, router, searchParams, selectedTopic?.id])

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
    })
      .then(setPeriodData)
      .catch(() => setPeriodData([]))
      .finally(() => setLoading(false))
  }, [startStr, endStr, periodGroup, posFilter])

  const loadDeliveryAppData = React.useCallback(() => {
    if (!startStr || !endStr) return
    const fetcher = offlineAware ? getPosSalesByDeliveryAppWithCache : getPosSalesByDeliveryApp
    fetcher({
      startStr,
      endStr,
      pos: posFilter || undefined,
    })
      .then(setDeliveryAppData)
      .catch(() => setDeliveryAppData({ items: [], total: 0 }))
  }, [startStr, endStr, posFilter, offlineAware])

  const loadChannelData = React.useCallback(() => {
    if (!startStr || !endStr) return
    getPosSalesByChannel({
      startStr,
      endStr,
      pos: posFilter || undefined,
    })
      .then(setChannelData)
      .catch(() => setChannelData([]))
  }, [startStr, endStr, posFilter])

  const loadMenuData = React.useCallback(() => {
    if (!startStr || !endStr) return
    const fetcher = offlineAware ? getPosSalesByMenuWithCache : getPosSalesByMenu
    fetcher({
      startStr,
      endStr,
      pos: posFilter || undefined,
      search: menuSearch || undefined,
    })
      .then(setMenuData)
      .catch(() => setMenuData([]))
  }, [startStr, endStr, posFilter, menuSearch, offlineAware])

  const loadPaymentData = React.useCallback(() => {
    if (!startStr || !endStr) return
    const fetcher = offlineAware ? getPosSalesByPaymentWithCache : getPosSalesByPayment
    fetcher({
      startStr,
      endStr,
      pos: posFilter || undefined,
    })
      .then(setPaymentData)
      .catch(() => setPaymentData([]))
  }, [startStr, endStr, posFilter, offlineAware])

  const loadStoreData = React.useCallback(() => {
    if (!startStr || !endStr) return
    const fetcher = offlineAware ? getPosSalesByStoreWithCache : getPosSalesByStore
    fetcher({
      startStr,
      endStr,
      pos: posFilter || undefined,
    })
      .then(setStoreData)
      .catch(() => setStoreData([]))
  }, [startStr, endStr, posFilter, offlineAware])

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
        getPosSalesByPeriod({ startStr, endStr, groupBy: periodGroup, pos: posFilter || undefined }).then(gPeriod).catch(() => gPeriod([])),
        (offlineAware ? getPosSalesByDeliveryAppWithCache : getPosSalesByDeliveryApp)({
          startStr,
          endStr,
          pos: posFilter || undefined,
        }).then(gDelivery).catch(() => gDelivery({ items: [], total: 0 })),
        getPosSalesByChannel({ startStr, endStr, pos: posFilter || undefined }).then(gChannel).catch(() => gChannel([])),
        (offlineAware ? getPosSalesByPaymentWithCache : getPosSalesByPayment)({
          startStr,
          endStr,
          pos: posFilter || undefined,
        }).then(gPayment).catch(() => gPayment([])),
        (offlineAware ? getPosSalesByStoreWithCache : getPosSalesByStore)({
          startStr,
          endStr,
          pos: posFilter || undefined,
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
  }, [startStr, endStr, posFilter, periodGroup, offlineAware])

  React.useEffect(() => {
    if (!startStr || !endStr) return
    const id = ++menuLoadIdRef.current
    const fetcher = offlineAware ? getPosSalesByMenuWithCache : getPosSalesByMenu
    fetcher({ startStr, endStr, pos: posFilter || undefined, search: menuSearch || undefined })
      .then((data) => {
        if (menuLoadIdRef.current === id) setMenuData(data)
      })
      .catch(() => {
        if (menuLoadIdRef.current === id) setMenuData([])
      })
  }, [startStr, endStr, posFilter, menuSearch, offlineAware])

  const online = useOnlineStatus()
  const prevOnlineRef = React.useRef(online)
  React.useEffect(() => {
    if (offlineAware && hasData && !prevOnlineRef.current && online) {
      prevOnlineRef.current = true
      loadAllAnalytics()
    }
    prevOnlineRef.current = online
  }, [online, offlineAware, hasData, loadAllAnalytics])

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

          <div className="mb-4 rounded-lg border bg-muted/20 p-3">
            <div className="mb-2 text-sm font-medium">{tr("salesSelectTopic", "주제 선택")}</div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={selectedTopic.id}
                onValueChange={(topicId) => {
                  userSelectedRef.current.topic = topicId
                  setSelectedTopicBySubMenu((prev) => ({
                    ...prev,
                    [currentSubMenu.id]: topicId,
                  }))
                }}
              >
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder={tr("salesSelectTopic", "주제 선택")} />
                </SelectTrigger>
                <SelectContent>
                  {currentSubMenu.topics.map((topic) => (
                    <SelectItem key={topic.id} value={topic.id}>
                      {tr(topic.labelKey, topic.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  {tr(topic.labelKey, topic.labelKey)}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {tr("salesManagementSelectedReport", "선택된 리포트")}: {tr(selectedTopic.labelKey, selectedTopic.labelKey)}
              {selectedTopic.hintKey ? ` · ${tr(selectedTopic.hintKey, "")}` : ""}
            </p>
          </div>

          <div className="mt-6 rounded-lg border p-4">
            {selectedView === "period" && (
              !hasData ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr("salesSelectPeriod", "기간을 선택해 주세요.")}
                </p>
              ) : (
                <>
                  <div className="mb-4 flex gap-2">
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
                        {tr(g.labelKey, g.labelKey)}
                      </Button>
                    ))}
                  </div>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={periodData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                        <Tooltip formatter={(v: number) => [formatBath(v), tr("pL_sales", "매출")]} />
                        <Bar dataKey="sales" fill="#3b82f6" name={tr("pL_sales", "매출")} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="mt-4 w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 text-left">{tr("salesPeriod", "기간")}</th>
                        <th className="py-2 text-right">{tr("pL_sales", "매출")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodData.map((r) => (
                        <tr key={r.key} className="border-b">
                          <td className="py-1.5">{r.label}</td>
                          <td className="py-1.5 text-right font-mono">
                            {formatBath(r.sales)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )
            )}

            {selectedView === "delivery" && (
              !hasData ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  기간을 선택해 주세요.
                </p>
              ) : deliveryAppData.items.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr("salesDataNone", "데이터 없음")}
                </p>
              ) : (
                <>
                  <div className="mb-4 flex gap-2">
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
                        {tr(g.labelKey, g.labelKey)}
                      </Button>
                    ))}
                  </div>
                  <div className="mb-4 h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={periodData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                        <Tooltip formatter={(v: number) => [formatBath(v), tr("pL_sales", "매출")]} />
                        <Bar dataKey="sales" fill="#3b82f6" name={tr("pL_sales", "매출")} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                <div className="flex flex-wrap gap-6">
                  <div className="h-[280px] w-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={deliveryAppData.items}
                          dataKey="sales"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ label, pct }) => `${label} ${pct.toFixed(1)}%`}
                        >
                          {deliveryAppData.items.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatBath(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="min-w-[200px] flex-1">
                    <p className="mb-2 text-lg font-bold">
                      {tr("salesTotal", "총")} {tr("pL_sales", "매출")} {formatBath(deliveryAppData.total)}
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
                        {deliveryAppData.items.map((r) => (
                          <tr key={r.label} className="border-b">
                            <td className="py-1.5">{r.label}</td>
                            <td className="py-1.5 text-right font-mono">
                              {formatBath(r.sales)}
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
                  <div className="mb-4 flex gap-2">
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
                        {tr(g.labelKey, g.labelKey)}
                      </Button>
                    ))}
                  </div>
                  <div className="mb-4 h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={periodData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                        <Tooltip formatter={(v: number) => [formatBath(v), tr("pL_sales", "매출")]} />
                        <Bar dataKey="sales" fill="#3b82f6" name={tr("pL_sales", "매출")} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mb-4 h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={channelData} layout="vertical" margin={{ left: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                        <YAxis dataKey="label" type="category" width={80} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => [formatBath(v), tr("pL_sales", "매출")]} />
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
                      {channelData.slice(0, 30).map((r) => (
                        <tr key={r.label} className="border-b">
                          <td className="py-1.5">{r.label}</td>
                          <td className="py-1.5 text-right font-mono">
                            {formatBath(r.sales)}
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
                  <div className="mb-4 flex gap-2">
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
                        {tr(g.labelKey, g.labelKey)}
                      </Button>
                    ))}
                  </div>
                  <div className="mb-4 h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={periodData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                        <Tooltip formatter={(v: number) => [formatBath(v), tr("pL_sales", "매출")]} />
                        <Bar dataKey="sales" fill="#3b82f6" name={tr("pL_sales", "매출")} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mb-4">
                    <Input
                      placeholder="메뉴 검색"
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      className="w-48"
                    />
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 text-left">메뉴</th>
                        <th className="py-2 text-right">수량</th>
                        <th className="py-2 text-right">매출</th>
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
                            {formatBath(r.sales)}
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
                  <div className="mb-4 flex gap-2">
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
                        {tr(g.labelKey, g.labelKey)}
                      </Button>
                    ))}
                  </div>
                  <div className="mb-4 h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={periodData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                        <Tooltip formatter={(v: number) => [formatBath(v), tr("pL_sales", "매출")]} />
                        <Bar dataKey="sales" fill="#3b82f6" name={tr("pL_sales", "매출")} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[500px] text-sm">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">{tr("salesStoreName", "매장명")}</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">{tr("salesOccupancy", "점유수")}</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">{tr("salesSupplyAmount", "공급가액")}</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">{tr("salesTax", "세금")}</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">{tr("salesAmount", "매출액")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {storeData.map((r) => (
                          <tr key={r.storeName} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-medium">{r.storeName}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{r.count.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{formatBath(r.subtotal)}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{formatBath(r.vat)}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-semibold">{formatBath(r.total)}</td>
                          </tr>
                        ))}
                        {storeData.length > 0 && (
                          <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                            <td className="px-4 py-3">{tr("salesTotalLabel", "합계")}</td>
                            <td className="px-4 py-3 text-right font-mono">
                              {storeData.reduce((a, r) => a + r.count, 0).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {formatBath(storeData.reduce((a, r) => a + r.subtotal, 0))}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {formatBath(storeData.reduce((a, r) => a + r.vat, 0))}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {formatBath(storeData.reduce((a, r) => a + r.total, 0))}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
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
                  <div className="mb-4 flex gap-2">
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
                        {tr(g.labelKey, g.labelKey)}
                      </Button>
                    ))}
                  </div>
                  <div className="mb-4 h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={periodData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                        <Tooltip formatter={(v: number) => [formatBath(v), tr("pL_sales", "매출")]} />
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
                          <Tooltip formatter={(v: number) => formatBath(v)} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-left">매장명</th>
                            <th className="px-3 py-2 text-right">수량</th>
                            <th className="px-3 py-2 text-right">판매 금액</th>
                          </tr>
                        </thead>
                        <tbody>
                          {storeData.slice(0, 12).map((r) => (
                            <tr key={r.storeName} className="border-t">
                              <td className="px-3 py-1.5">{r.storeName}</td>
                              <td className="px-3 py-1.5 text-right font-mono">{r.count.toLocaleString()}</td>
                              <td className="px-3 py-1.5 text-right font-mono">{formatBath(r.total)}</td>
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
                        <BarChart data={channelData} layout="vertical" margin={{ left: 60 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                          <YAxis dataKey="label" type="category" width={60} tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v: number) => [formatBath(v), tr("pL_sales", "매출")]} />
                          <Bar dataKey="sales" fill="#f59e0b" name={tr("salesSalesAmount", "판매 금액")} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-left">분류명</th>
                            <th className="px-3 py-2 text-right">판매 금액</th>
                          </tr>
                        </thead>
                        <tbody>
                          {channelData.map((r) => (
                            <tr key={r.label} className="border-t">
                              <td className="px-3 py-1.5">{r.label}</td>
                              <td className="px-3 py-1.5 text-right font-mono">{formatBath(r.sales)}</td>
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
                  기간을 선택해 주세요.
                </p>
              ) : paymentData.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr("salesDataNone", "데이터 없음")}
                </p>
              ) : (
                <>
                  <div className="mb-4 flex gap-2">
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
                        {tr(g.labelKey, g.labelKey)}
                      </Button>
                    ))}
                  </div>
                  <div className="mb-4 h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={periodData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                        <Tooltip formatter={(v: number) => [formatBath(v), tr("pL_sales", "매출")]} />
                        <Bar dataKey="sales" fill="#3b82f6" name={tr("pL_sales", "매출")} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                <div className="flex flex-wrap gap-6">
                  <div className="h-[260px] w-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paymentData}
                          dataKey="sales"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                        >
                          {paymentData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatBath(v)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 pr-4 text-left">결제수단</th>
                        <th className="py-2 text-right">매출</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentData.map((r) => (
                        <tr key={r.label} className="border-b">
                          <td className="py-1.5 pr-4">{r.label}</td>
                          <td className="py-1.5 text-right font-mono">
                            {formatBath(r.sales)}
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
                <p className="text-base font-medium">{tr(selectedTopic.labelKey, selectedTopic.labelKey)}</p>
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
