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
  getPosBusinessDaySettings,
  getPosSalesByChannel,
  getPosSalesByDeliveryApp,
  getPosSalesByPeriod,
  getPosSalesByStore,
  getPosSalesByStoreChannel,
} from "@/lib/api-client"
import {
  getPosBusinessDateStr,
  getPosBusinessDateStrFromConfig,
} from "@/lib/pos-business-day"
import { ERP_NUMERIC_CHART_TICK, ADMIN_CHART_COLORS } from "@/lib/admin-ui-standards"
import {
  translateChannelKey,
  translateDeliveryAppCode,
} from "@/lib/sales-analytics-labels"
import {
  buildPosStoreDisplayNameLookup,
  resolvePosStoreDisplayName,
} from "@/lib/pos-store-display-name"
import { rowMatchesSalesStoreSelection } from "@/lib/pos-sales-store-filter"

const COLORS = [...ADMIN_CHART_COLORS]

function formatSalesAmount(n: number) {
  const v = Number(n ?? 0)
  if (!Number.isFinite(v)) return "0"
  return Math.round(v).toLocaleString()
}

function formatSharePercent(value: number, total: number): string {
  if (!Number.isFinite(total) || total <= 0) return "0.0%"
  return `${((Number(value) / total) * 100).toFixed(1)}%`
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
  /** POS 테이블 스냅샷 — 매장 canonical 키별 진행 중 주문 합계 */
  tableTotalByStore?: Record<string, number>
  /** 부모 자동 갱신 토큰 */
  refreshToken?: number
}

function resolveStoresParam(storeCode: string): string[] | undefined {
  const code = String(storeCode || "").trim()
  if (!code || code === "All") return undefined
  return [code]
}

function resolveTableTotalForStore(
  storeName: string,
  tableTotalByStore: Record<string, number> | undefined
): number {
  if (!tableTotalByStore) return 0
  const direct = tableTotalByStore[storeName]
  if (direct != null && Number.isFinite(direct)) return Math.max(0, direct)
  const lower = storeName.toLowerCase()
  for (const [key, value] of Object.entries(tableTotalByStore)) {
    if (key.toLowerCase() === lower) return Math.max(0, Number(value) || 0)
  }
  return 0
}

export function AdminSalesDashboardCharts({
  effectiveStoreCode,
  isOfficeSelector: _isOfficeSelector,
  salesStoreCodes,
  tableTotalByStore,
  refreshToken,
}: AdminSalesDashboardChartsProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const tr = React.useCallback((key: string, fallback: string) => tOr(t, key, fallback), [t])

  const storesParam = React.useMemo(() => {
    if (salesStoreCodes?.length) return salesStoreCodes
    return resolveStoresParam(effectiveStoreCode)
  }, [effectiveStoreCode, salesStoreCodes])
  const isAllStores =
    effectiveStoreCode === "All" && !salesStoreCodes?.length ? true : (salesStoreCodes?.length ?? 0) > 1

  /** POS 영업일(설정 구간) — 달력 자정이 아니라 getPosTodaySales와 동일 기준 */
  const [businessDayYmd, setBusinessDayYmd] = React.useState(() => getPosBusinessDateStr())
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const [storeRows, setStoreRows] = React.useState<
    Awaited<ReturnType<typeof getPosSalesByStore>>
  >([])
  const [storeChannelRows, setStoreChannelRows] = React.useState<
    Awaited<ReturnType<typeof getPosSalesByStoreChannel>>
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
      const settingsStore =
        storesParam?.length === 1 ? storesParam[0] : null
      let today = getPosBusinessDateStr()
      try {
        const j = await getPosBusinessDaySettings(settingsStore)
        today = getPosBusinessDateStrFromConfig(new Date(), {
          start: { hour: j.hour, minute: j.minute },
          end: { hour: j.endHour, minute: j.endMinute },
        })
      } catch {
        /* 전사/기본 영업시간으로 폴백 */
      }
      setBusinessDayYmd(today)

      const [stores, storeChannels, channels, delivery, periodRes] = await Promise.all([
        getPosSalesByStore({ startStr: today, endStr: today, stores: storesParam, fresh: true }),
        getPosSalesByStoreChannel({
          startStr: today,
          endStr: today,
          stores: storesParam,
          fresh: true,
        }),
        getPosSalesByChannel({ startStr: today, endStr: today, stores: storesParam, fresh: true }),
        getPosSalesByDeliveryApp({
          startStr: today,
          endStr: today,
          stores: storesParam,
          fresh: true,
        }),
        getPosSalesByPeriod({
          startStr: today,
          endStr: today,
          groupBy: "hour",
          stores: storesParam,
          fresh: true,
        }),
      ])
      const scopedStores = storesParam?.length
        ? stores.filter((r) =>
            storesParam.some((code) => rowMatchesSalesStoreSelection(r.storeName, code))
          )
        : stores
      setStoreRows(scopedStores)
      setStoreChannelRows(
        storesParam?.length
          ? storeChannels.filter((r) =>
              storesParam.some((code) => rowMatchesSalesStoreSelection(r.storeName, code))
            )
          : storeChannels
      )
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
      setStoreChannelRows([])
      setChannelRows([])
      setDeliveryData({ items: [], total: 0 })
      setHourRows([])
    } finally {
      setLoading(false)
    }
  }, [storesParam, tr])

  /** 첫 화면·매장 변경 시 자동 조회. 이후 갱신은 검색 버튼만(60초 폴링 없음) */
  React.useEffect(() => {
    void loadCharts()
  }, [loadCharts])

  React.useEffect(() => {
    if (refreshToken == null || refreshToken <= 0) return
    void loadCharts()
  }, [refreshToken, loadCharts])

  const handleSearch = React.useCallback(() => {
    void loadCharts()
  }, [loadCharts])

  const storeChannelMap = React.useMemo(() => {
    const map = new Map<string, { dineIn: number; takeout: number; delivery: number }>()
    for (const r of storeChannelRows) {
      const key = String(r.storeName || "").trim()
      if (!key) continue
      map.set(key, {
        dineIn: Number(r.dineIn ?? 0) || 0,
        takeout: Number(r.takeout ?? 0) || 0,
        delivery: Number(r.delivery ?? 0) || 0,
      })
    }
    return map
  }, [storeChannelRows])

  const storeChartRows = React.useMemo(
    () =>
      [...storeRows]
        .map((r) => {
          const channel = storeChannelMap.get(r.storeName)
          const dineIn = channel?.dineIn ?? (Number(r.dineInTotal ?? 0) || 0)
          const takeout = channel?.takeout ?? 0
          const delivery = channel?.delivery ?? 0
          const completedTotal = Number(r.total ?? 0) || 0
          const tableTotal = resolveTableTotalForStore(r.storeName, tableTotalByStore)
          return {
            storeName: r.storeName,
            storeDisplayName: posStoreDisplayName(r.storeName),
            sales: completedTotal,
            dineInTotal: dineIn,
            takeoutTotal: takeout,
            deliveryTotal: delivery,
            tableTotal,
            count: Number(r.count ?? 0) || 0,
          }
        })
        .sort((a, b) => b.sales - a.sales),
    [storeRows, storeChannelMap, posStoreDisplayName, tableTotalByStore]
  )

  const storeTableTotals = React.useMemo(
    () =>
      storeChartRows.reduce(
        (acc, r) => {
          acc.dineIn += r.dineInTotal
          acc.takeout += r.takeoutTotal
          acc.delivery += r.deliveryTotal
          acc.table += r.tableTotal
          acc.sales += r.sales
          return acc
        },
        { dineIn: 0, takeout: 0, delivery: 0, table: 0, sales: 0 }
      ),
    [storeChartRows]
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

  const channelTotal = React.useMemo(
    () => channelChartRows.reduce((sum, r) => sum + r.sales, 0),
    [channelChartRows]
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
    q.set("start", businessDayYmd)
    q.set("end", businessDayYmd)
    if (storesParam?.length) q.set("stores", storesParam.join(","))
    return `/admin/sales-management?${q.toString()}`
  }, [businessDayYmd, storesParam])

  const showStoreTable = isAllStores && storeChartRows.length > 0
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
            <span className="font-medium text-foreground">{businessDayYmd}</span>
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

      <div className={`grid gap-6 ${showStoreTable ? "lg:grid-cols-2" : ""}`}>
        {showStoreTable ? (
          <div className="lg:col-span-2">
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
              {tr("salesByStore", "매장별")}
            </h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="min-w-[720px] w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left">{tr("salesStoreName", "매장명")}</th>
                    <th className="px-3 py-2 text-right">{tr("salesAmountKindDineIn", "홀")}</th>
                    <th className="px-3 py-2 text-right">{tr("salesAmountKindDelivery", "배달")}</th>
                    <th className="px-3 py-2 text-right">{tr("salesAmountKindTakeout", "포장")}</th>
                    <th className="px-3 py-2 text-right">{tr("mobileStoreSalesTableTotal", "테이블")}</th>
                    <th className="px-3 py-2 text-right">{tr("salesTotalLabel", "합계")}</th>
                  </tr>
                </thead>
                <tbody>
                  {storeChartRows.map((r) => (
                    <tr key={r.storeName} className="border-t">
                      <td className="px-3 py-1.5 font-medium">{r.storeDisplayName}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatSalesAmount(r.dineInTotal)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatSalesAmount(r.deliveryTotal)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatSalesAmount(r.takeoutTotal)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatSalesAmount(r.tableTotal)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                        {formatSalesAmount(r.sales)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 bg-muted/40 font-semibold">
                    <td className="px-3 py-2">{tr("salesTotalLabel", "합계")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatSalesAmount(storeTableTotals.dineIn)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatSalesAmount(storeTableTotals.delivery)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatSalesAmount(storeTableTotals.takeout)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatSalesAmount(storeTableTotals.table)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatSalesAmount(storeTableTotals.sales)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              {tr(
                "adminDashboardStoreTableFootnote",
                "홀·배달·포장·합계는 당일 완료 매출(POS 영업일)입니다. 테이블은 진행 중 주문 합계로 실시간 패널「검색」 시 갱신됩니다."
              )}
            </p>
          </div>
        ) : null}

        {channelChartRows.length > 0 ? (
          <div>
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
              {tr("salesByCategory", "분류별 (홀·포장·배달)")}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={channelChartRows}
                      dataKey="sales"
                      nameKey="axisLabel"
                      cx="50%"
                      cy="45%"
                      outerRadius={80}
                      paddingAngle={1}
                    >
                      {channelChartRows.map((r, i) => (
                        <Cell key={r.channelKey} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => [formatSharePercent(v, channelTotal), tr("salesRatio", "비율")]}
                    />
                    <Legend
                      verticalAlign="bottom"
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left">{tr("salesByCategory", "분류")}</th>
                      <th className="px-3 py-2 text-right">{tr("pL_sales", "매출")}</th>
                      <th className="px-3 py-2 text-right">{tr("salesRatio", "비율")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelChartRows.map((r) => (
                      <tr key={r.channelKey} className="border-t">
                        <td className="px-3 py-1.5">{r.axisLabel}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{formatSalesAmount(r.sales)}</td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">
                          {formatSharePercent(r.sales, channelTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
                  {tr("salesTotal", "총")} {formatSalesAmount(channelTotal)}
                </p>
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
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={deliveryPlatformRows}
                      dataKey="sales"
                      nameKey="axisLabel"
                      cx="50%"
                      cy="45%"
                      outerRadius={80}
                      paddingAngle={1}
                    >
                      {deliveryPlatformRows.map((r, i) => (
                        <Cell key={r.code} fill={COLORS[(i + 2) % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number, _name, item) => {
                        const payload = item?.payload as { pct?: number } | undefined
                        const pct =
                          payload?.pct != null && Number.isFinite(payload.pct)
                            ? `${Number(payload.pct).toFixed(1)}%`
                            : formatSharePercent(v, deliveryData.total)
                        return [pct, tr("salesRatio", "비율")]
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    />
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

      {!showStoreTable && storeChartRows.length === 1 ? (
        <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm">
          <p className="text-xs text-muted-foreground">{tr("salesStoreName", "매장명")}</p>
          <p className="font-semibold">{storeChartRows[0].storeDisplayName}</p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <p className="text-[11px] text-muted-foreground">{tr("salesAmountKindDineIn", "홀")}</p>
              <p className="text-lg font-bold tabular-nums">{formatSalesAmount(storeChartRows[0].dineInTotal)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">{tr("salesAmountKindDelivery", "배달")}</p>
              <p className="text-lg font-bold tabular-nums">{formatSalesAmount(storeChartRows[0].deliveryTotal)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">{tr("salesAmountKindTakeout", "포장")}</p>
              <p className="text-lg font-bold tabular-nums">{formatSalesAmount(storeChartRows[0].takeoutTotal)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">{tr("mobileStoreSalesTableTotal", "테이블")}</p>
              <p className="text-lg font-bold tabular-nums">{formatSalesAmount(storeChartRows[0].tableTotal)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">{tr("salesTotalLabel", "합계")}</p>
              <p className="text-lg font-bold tabular-nums">{formatSalesAmount(storeChartRows[0].sales)}</p>
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
