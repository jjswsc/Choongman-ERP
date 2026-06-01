"use client"

import * as React from "react"
import Link from "next/link"
import { BarChart3, RefreshCw } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/lang-context"
import { useT, tOr } from "@/lib/i18n"
import {
  getAdminVendors,
  getPosSalesByChannel,
  getPosSalesByDeliveryApp,
  getPosSalesByPeriod,
  getPosSalesByStore,
} from "@/lib/api-client"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { ERP_NUMERIC_CHART_TICK } from "@/lib/admin-ui-standards"
import {
  translateChannelKey,
  translateDeliveryAppCode,
} from "@/lib/sales-analytics-labels"
import {
  buildPosStoreDisplayNameLookup,
  resolvePosStoreDisplayName,
} from "@/lib/pos-store-display-name"
import { rowMatchesSalesStoreSelection } from "@/lib/pos-sales-store-filter"

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"]

function formatSalesAmount(n: number) {
  const v = Number(n ?? 0)
  if (!Number.isFinite(v)) return "0"
  return Math.round(v).toLocaleString()
}

const periodChartYAxisProps = {
  tick: { fontSize: 11, ...ERP_NUMERIC_CHART_TICK },
  tickFormatter: (v: number) => `${(v / 1000).toFixed(0)}k`,
}

export type AdminSalesDashboardChartsProps = {
  effectiveStoreCode: string
  isOfficeSelector: boolean
  /** 가맹 「내 매장 전체」등 — 명시 매장 코드(본사 All=undefined 와 구분) */
  salesStoreCodes?: string[]
}

function resolveStoresParam(storeCode: string): string[] | undefined {
  const code = String(storeCode || "").trim()
  if (!code || code === "All") return undefined
  return [code]
}

export function AdminSalesDashboardCharts({
  effectiveStoreCode,
  isOfficeSelector,
  salesStoreCodes,
}: AdminSalesDashboardChartsProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const tr = React.useCallback((key: string, fallback: string) => tOr(t, key, fallback), [t])

  const today = React.useMemo(() => getBangkokTodayDateString(), [])
  const storesParam = React.useMemo(() => {
    if (salesStoreCodes?.length) return salesStoreCodes
    return resolveStoresParam(effectiveStoreCode)
  }, [effectiveStoreCode, salesStoreCodes])
  const isAllStores =
    effectiveStoreCode === "All" && !salesStoreCodes?.length ? true : (salesStoreCodes?.length ?? 0) > 1

  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const [storeRows, setStoreRows] = React.useState<
    Awaited<ReturnType<typeof getPosSalesByStore>>
  >([])
  const [channelRows, setChannelRows] = React.useState<
    Awaited<ReturnType<typeof getPosSalesByChannel>>
  >([])
  const [deliveryData, setDeliveryData] = React.useState<
    Awaited<ReturnType<typeof getPosSalesByDeliveryApp>>
  >({ items: [], total: 0 })
  const [hourRows, setHourRows] = React.useState<{ axisLabel: string; sales: number }[]>([])
  const [vendorLookup, setVendorLookup] = React.useState(() => new Map<string, string>())

  React.useEffect(() => {
    let cancelled = false
    getAdminVendors()
      .then((rows) => {
        if (!cancelled) setVendorLookup(buildPosStoreDisplayNameLookup(rows))
      })
      .catch(() => {
        if (!cancelled) setVendorLookup(new Map())
      })
    return () => {
      cancelled = true
    }
  }, [])

  const posStoreDisplayName = React.useCallback(
    (code: string) => resolvePosStoreDisplayName(code, vendorLookup),
    [vendorLookup]
  )

  const loadCharts = React.useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [stores, channels, delivery, periodRes] = await Promise.all([
        getPosSalesByStore({ startStr: today, endStr: today, stores: storesParam }),
        getPosSalesByChannel({ startStr: today, endStr: today, stores: storesParam }),
        getPosSalesByDeliveryApp({ startStr: today, endStr: today, stores: storesParam }),
        getPosSalesByPeriod({
          startStr: today,
          endStr: today,
          groupBy: "hour",
          stores: storesParam,
        }),
      ])
      const scopedStores = storesParam?.length
        ? stores.filter((r) =>
            storesParam.some((code) => rowMatchesSalesStoreSelection(r.storeName, code))
          )
        : stores
      setStoreRows(scopedStores)
      setChannelRows(channels)
      setDeliveryData(delivery)
      if (periodRes.kind === "aggregate") {
        setHourRows(
          periodRes.rows.map((r) => ({
            axisLabel: `${String(r.key).padStart(2, "0")}:00`,
            sales: Number(r.total ?? r.sales ?? 0) || 0,
          }))
        )
      } else {
        setHourRows([])
      }
    } catch {
      setError(tr("errorOccurred", "오류가 발생했습니다."))
      setStoreRows([])
      setChannelRows([])
      setDeliveryData({ items: [], total: 0 })
      setHourRows([])
    } finally {
      setLoading(false)
    }
  }, [today, storesParam, tr])

  /** 첫 화면·매장 변경 시 자동 조회. 이후 갱신은 검색 버튼만(60초 폴링 없음) */
  React.useEffect(() => {
    void loadCharts()
  }, [loadCharts])

  const handleSearch = React.useCallback(() => {
    void loadCharts()
  }, [loadCharts])

  const storeChartRows = React.useMemo(
    () =>
      [...storeRows]
        .map((r) => ({
          storeName: r.storeName,
          storeDisplayName: posStoreDisplayName(r.storeName),
          sales: Number(r.total ?? 0) || 0,
          dineInTotal: Number(r.dineInTotal ?? 0) || 0,
          count: Number(r.count ?? 0) || 0,
        }))
        .sort((a, b) => b.sales - a.sales),
    [storeRows, posStoreDisplayName]
  )

  const channelChartRows = React.useMemo(
    () =>
      [...channelRows]
        .map((r) => ({
          channelKey: r.channelKey,
          axisLabel: translateChannelKey(r.channelKey, tr),
          sales: Number(r.sales ?? 0) || 0,
        }))
        .sort((a, b) => b.sales - a.sales),
    [channelRows, tr]
  )

  const deliveryPlatformRows = React.useMemo(() => {
    const deliveryItem = deliveryData.items.find((x) => x.channelKey === "delivery")
    const platforms = deliveryItem?.platforms ?? []
    return platforms
      .map((p) => ({
        code: p.code,
        axisLabel: translateDeliveryAppCode(p.code, tr),
        sales: Number(p.sales ?? 0) || 0,
        pct: Number(p.pct ?? 0) || 0,
      }))
      .sort((a, b) => b.sales - a.sales)
  }, [deliveryData.items, tr])

  const salesMgmtHref = React.useMemo(() => {
    const q = new URLSearchParams()
    q.set("menu", "sales-compare")
    q.set("topic", "compare-store-category")
    q.set("start", today)
    q.set("end", today)
    if (storesParam?.length) q.set("stores", storesParam.join(","))
    return `/admin/sales-management?${q.toString()}`
  }, [today, storesParam])

  const showStoreBar = isOfficeSelector && isAllStores && storeChartRows.length > 0
  const hasAnyChart =
    storeChartRows.length > 0 ||
    channelChartRows.length > 0 ||
    deliveryPlatformRows.length > 0 ||
    hourRows.some((r) => r.sales > 0)

  return (
    <section className="space-y-4 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              {tr("adminDashboardChartsTitle", "당일 매출 차트")}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {tr("adminDashboardChartsSub", "POS 영업일 기준 — 매장·홀/포장/배달·배달앱별 매출을 도표로 확인합니다.")}{" "}
            <span className="font-medium text-foreground">{today}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={handleSearch} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {tr("search", "검색")}
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link href={salesMgmtHref}>{tr("adminSalesManagement", "매출 관리")}</Link>
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {loading && !hasAnyChart ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{tr("loading", "로딩 중…")}</p>
      ) : null}

      {!loading && !hasAnyChart ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {tr("salesNoSalesData", "해당 기간 매출 데이터가 없습니다.")}
        </p>
      ) : null}

      {hourRows.some((r) => r.sales > 0) ? (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
            {tr("salesPeriodHour", "시간대별")}
          </h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="axisLabel" tick={{ fontSize: 9, ...ERP_NUMERIC_CHART_TICK }} interval={1} />
                <YAxis {...periodChartYAxisProps} />
                <Tooltip formatter={(v: number) => [formatSalesAmount(v), tr("pL_sales", "매출")]} />
                <Bar dataKey="sales" fill="#3b82f6" name={tr("pL_sales", "매출")} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      <div className={`grid gap-6 ${showStoreBar ? "lg:grid-cols-2" : ""}`}>
        {showStoreBar ? (
          <div className="lg:col-span-2">
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
              {tr("salesByStore", "매장별")}
            </h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="min-w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left">{tr("salesStoreName", "매장명")}</th>
                    <th className="px-3 py-2 text-right">{tr("salesAmountKindDineIn", "홀")}</th>
                    <th className="px-3 py-2 text-right">{tr("salesAmount", "매출액")}</th>
                  </tr>
                </thead>
                <tbody>
                  {storeChartRows.map((r) => (
                    <tr key={r.storeName} className="border-t">
                      <td className="px-3 py-1.5 font-medium">{r.storeDisplayName}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatSalesAmount(r.dineInTotal)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                        {formatSalesAmount(r.sales)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {channelChartRows.length > 0 ? (
          <div>
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
              {tr("salesByCategory", "분류별 (홀·포장·배달)")}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={channelChartRows}
                      dataKey="sales"
                      nameKey="axisLabel"
                      cx="50%"
                      cy="50%"
                      outerRadius={88}
                      label={({ name, percent }) =>
                        `${String(name ?? "")} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                    >
                      {channelChartRows.map((r, i) => (
                        <Cell key={r.channelKey} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatSalesAmount(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelChartRows} layout="vertical" margin={{ left: 56 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" {...periodChartYAxisProps} />
                    <YAxis dataKey="axisLabel" type="category" width={56} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => [formatSalesAmount(v), tr("pL_sales", "매출")]} />
                    <Bar dataKey="sales" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ) : null}

        {deliveryPlatformRows.length > 0 ? (
          <div>
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
              {tr("salesDeliveryPlatformBreakdown", "배달 플랫폼별")}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={deliveryPlatformRows}
                      dataKey="sales"
                      nameKey="axisLabel"
                      cx="50%"
                      cy="50%"
                      outerRadius={88}
                      label={({ name, percent }) =>
                        `${String(name ?? "")} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                    >
                      {deliveryPlatformRows.map((r, i) => (
                        <Cell key={r.code} fill={COLORS[(i + 2) % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatSalesAmount(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left">{tr("salesDeliveryChannel", "배달앱/채널")}</th>
                      <th className="px-3 py-2 text-right">{tr("pL_sales", "매출")}</th>
                      <th className="px-3 py-2 text-right">{tr("salesRatio", "비율")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveryPlatformRows.map((r) => (
                      <tr key={r.code} className="border-t">
                        <td className="px-3 py-1.5">{r.axisLabel}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{formatSalesAmount(r.sales)}</td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">{r.pct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
                  {tr("salesTotal", "총")} {formatSalesAmount(deliveryData.total)} ({tr("salesAmountKindDelivery", "배달")})
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {!showStoreBar && storeChartRows.length === 1 ? (
        <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm">
          <p className="text-xs text-muted-foreground">{tr("salesStoreName", "매장명")}</p>
          <p className="font-semibold">{storeChartRows[0].storeDisplayName}</p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[11px] text-muted-foreground">{tr("salesAmountKindDineIn", "홀")}</p>
              <p className="text-lg font-bold tabular-nums">{formatSalesAmount(storeChartRows[0].dineInTotal)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">{tr("salesAmount", "매출액")}</p>
              <p className="text-lg font-bold tabular-nums">{formatSalesAmount(storeChartRows[0].sales)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">{tr("salesOccupancy", "주문건수")}</p>
              <p className="text-lg font-bold tabular-nums">{storeChartRows[0].count.toLocaleString()}</p>
            </div>
          </div>
        </div>
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        {tr(
          "adminDashboardChartsRefreshHint",
          "최신 데이터는「검색」으로 갱신합니다. 기간·상세 분석은「매출 관리」를 이용하세요."
        )}
      </p>
    </section>
  )
}
