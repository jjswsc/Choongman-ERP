"use client"

import * as React from "react"
import { Building2, RefreshCw } from "lucide-react"
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
import { ERP_NUMERIC_CHART_TICK, ADMIN_CHART_COLORS } from "@/lib/admin-ui-standards"

const CHART_COLORS = [...ADMIN_CHART_COLORS]

type StoreRow = {
  storeCode: string
  grossAmount: number
  orderCount: number
  completedRevenue: number
  completedCount: number
  waitingRevenue: number
  waitingOrders: number
  avgCookingMinutes: number
  revenueWeightedCookingMinutes: number
  delayedRevenue: number
  delayedOrders: number
  cancelAmount: number
  cancelCount: number
  cancelRate: number
  stockoutCancelAmount: number
  stockoutCancelCount: number
  stockoutRate: number
  peakHour: number
  peakHourRevenue: number
}

type DashboardResponse = {
  success: boolean
  startStr: string
  endStr: string
  delayThresholdMin: number
  store: StoreRow
  office: {
    stores: StoreRow[]
    totals: StoreRow
  }
  generatedAt: string
  truncated: boolean
}

type PosRevenueRealtimeDashboardProps = {
  effectiveStoreCode: string
  isOfficeSelector: boolean
  /** 가맹 허용 매장 합산 — stores 쿼리에 명시 */
  salesStoreCodes?: string[]
  /** POS 테이블 스냅샷 기준 진행 중 주문 합계 */
  tableTotal?: number
  tableTotalLoading?: boolean
  /** 부모 자동 갱신 토큰 */
  refreshToken?: number
}

function formatBaht(value: number): string {
  return Math.round(Number(value || 0)).toLocaleString()
}

function formatPeakHour(hour: number): string {
  const h = Number(hour)
  if (!Number.isFinite(h) || h < 0 || h > 23) return "-"
  const next = (h + 1) % 24
  return `${String(h).padStart(2, "0")}:00-${String(next).padStart(2, "0")}:00`
}

const revenueYAxis = {
  tick: { fontSize: 11, ...ERP_NUMERIC_CHART_TICK },
  tickFormatter: (v: number) => `${(Number(v) / 1000).toFixed(0)}k`,
}

export function PosRevenueRealtimeDashboard({
  effectiveStoreCode,
  isOfficeSelector,
  salesStoreCodes,
  tableTotal,
  tableTotalLoading = false,
  refreshToken,
}: PosRevenueRealtimeDashboardProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const tr = React.useCallback((key: string, fallback: string) => tOr(t, key, fallback), [t])
  const [data, setData] = React.useState<DashboardResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string>("")
  const storeCode = String(effectiveStoreCode || "").trim()

  const loadDashboard = React.useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const q = new URLSearchParams()
      if (salesStoreCodes?.length) q.set("stores", salesStoreCodes.join(","))
      else if (storeCode && storeCode !== "All") q.set("stores", storeCode)
      const res = await fetch(`/api/posRealtimeRevenueDashboard?${q.toString()}`, { cache: "no-store" })
      const json = (await res.json()) as DashboardResponse
      if (!res.ok || !json?.success) {
        throw new Error("dashboard fetch failed")
      }
      setData(json)
    } catch {
      setError(tr("errorOccurred", "오류가 발생했습니다."))
    } finally {
      setLoading(false)
    }
  }, [storeCode, salesStoreCodes, tr])

  /** 첫 화면·매장 변경 시 자동 조회. 이후 갱신은 검색 버튼만(60초 폴링 없음) */
  React.useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  React.useEffect(() => {
    if (refreshToken == null || refreshToken <= 0) return
    void loadDashboard()
  }, [refreshToken, loadDashboard])

  const handleSearch = React.useCallback(() => {
    void loadDashboard()
  }, [loadDashboard])

  const store = data?.store
  const officeRows = data?.office?.stores || []

  const storeRevenueBarRows = React.useMemo(() => {
    if (!store) return []
    return [
      {
        key: "completed",
        label: tr("salesManagementTabSalesStatus", "실매출"),
        value: Number(store.completedRevenue ?? 0),
      },
      {
        key: "waiting",
        label: tr("adminLiveStoreSalesWaitingRevenue", "대기매출"),
        value: Number(store.waitingRevenue ?? 0),
      },
      {
        key: "delayed",
        label: tr("adminLiveStoreSalesDelayedRevenue", "지연매출"),
        value: Number(store.delayedRevenue ?? 0),
      },
    ]
  }, [store, tr])

  const storeOpsCountRows = React.useMemo(() => {
    if (!store) return []
    return [
      {
        key: "waitingOrders",
        label: tr("adminLiveStoreSalesWaitingRevenue", "대기"),
        count: Number(store.waitingOrders ?? 0),
      },
      {
        key: "delayedOrders",
        label: tr("adminLiveStoreSalesDelayedOrders", "지연"),
        count: Number(store.delayedOrders ?? 0),
      },
      {
        key: "completedOrders",
        label: tr("mobileStoreSalesCompletedOrders", "완료"),
        count: Number(store.completedCount ?? 0),
      },
    ]
  }, [store, tr])

  const storeRevenuePieRows = React.useMemo(() => {
    return storeRevenueBarRows.filter((r) => r.value > 0)
  }, [storeRevenueBarRows])

  const officeCompletedPieRows = React.useMemo(
    () =>
      officeRows
        .map((r) => ({
          storeCode: r.storeCode,
          value: Number(r.completedRevenue ?? 0),
        }))
        .filter((r) => r.value > 0),
    [officeRows]
  )

  const officeRateBarRows = React.useMemo(
    () =>
      officeRows.map((r) => ({
        storeCode: r.storeCode,
        cancelPct: Math.round(Number(r.cancelRate ?? 0) * 1000) / 10,
        stockoutPct: Math.round(Number(r.stockoutRate ?? 0) * 1000) / 10,
        peakLabel: formatPeakHour(r.peakHour),
        peakRevenue: Number(r.peakHourRevenue ?? 0),
      })),
    [officeRows]
  )

  return (
    <section className="space-y-4 rounded-xl border border-border/70 bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">
            {tr("adminLiveStoreSalesRevenueOpsDashTitle", "매출 중심 실시간 운영 대시보드")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {tr(
              "adminLiveStoreSalesRevenueOpsDashSub",
              "매장 즉시 대응 지표와 본사 비교 지표를 같은 기준으로 확인합니다."
            )}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={handleSearch} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {tr("search", "검색")}
        </Button>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {typeof tableTotal === "number" || tableTotalLoading ? (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            {tr("mobileStoreSalesTableTotal", "테이블 총액")}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {tableTotalLoading ? "—" : formatBaht(tableTotal ?? 0)}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {tr(
              "adminRealtimeTableTotalHint",
              "진행 중 테이블 주문 합계입니다. 아래 실시간 매출 패널「검색」으로 갱신합니다."
            )}
          </p>
        </div>
      ) : null}

      {loading && !store && !officeRows.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{tr("loading", "로딩 중…")}</p>
      ) : null}

      {!loading && !error && !store && !isOfficeSelector ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {tr("mobileStoreSalesByStoreEmpty", "표시할 매장 데이터가 없습니다.")}
        </p>
      ) : null}

      {store ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-card p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              {tr("adminRealtimeOpsRevenueBars", "실시간 매출액 (막대)")}
            </p>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={storeRevenueBarRows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis {...revenueYAxis} />
                  <Tooltip formatter={(v: number) => formatBaht(v)} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {storeRevenueBarRows.map((r, i) => (
                      <Cell key={r.key} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-center text-lg font-bold tabular-nums text-foreground">
              {formatBaht(store.completedRevenue)}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                ({tr("salesManagementTabSalesStatus", "실매출")})
              </span>
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {storeRevenuePieRows.length > 0 ? (
              <div className="rounded-lg border border-border/60 bg-card p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  {tr("adminRealtimeOpsRevenuePie", "매출 구성 (원형)")}
                </p>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={storeRevenuePieRows}
                        dataKey="value"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        outerRadius={64}
                        label={({ name, percent }) =>
                          `${String(name ?? "")} ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                      >
                        {storeRevenuePieRows.map((r, i) => (
                          <Cell key={r.key} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatBaht(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}
            <div className="rounded-lg border border-border/60 bg-card p-3 sm:col-span-2 lg:col-span-1">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                {tr("adminRealtimeOpsOrderBars", "주문·조리 (건수/분)")}
              </p>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={storeOpsCountRows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, ...ERP_NUMERIC_CHART_TICK }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                {tr("adminLiveStoreSalesAvgCookingMins", "평균 조리시간(분)")}{" "}
                <span className="font-semibold text-foreground">
                  {store.revenueWeightedCookingMinutes.toFixed(1)}m
                </span>
                <span className="mx-1">·</span>
                {tr("adminLiveStoreSalesAvgCookingRaw", "단순")} {store.avgCookingMinutes.toFixed(1)}m
                {data ? (
                  <>
                    <span className="mx-1">·</span>
                    {data.delayThresholdMin}
                    {tr("minute", "분")} {tr("adminLiveStoreSalesDelayedRule", "초과 기준")}
                  </>
                ) : null}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {isOfficeSelector ? (
        <div className="space-y-4 rounded-lg border border-border/60 bg-card p-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-foreground">
              {tr("adminLiveStoreSalesOfficeCompareTitle", "본사 매장 비교 (매출 중심)")}
            </p>
          </div>
          {officeRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {tr("mobileStoreSalesByStoreEmpty", "표시할 매장 데이터가 없습니다.")}
            </p>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                {officeCompletedPieRows.length > 0 ? (
                  <div className="h-[260px]">
                    <p className="mb-2 text-[11px] text-muted-foreground">
                      {tr("adminRealtimeOfficeCompletedShare", "매장별 실매출 비중")}
                    </p>
                    <ResponsiveContainer width="100%" height="88%">
                      <PieChart>
                        <Pie
                          data={officeCompletedPieRows}
                          dataKey="value"
                          nameKey="storeCode"
                          cx="50%"
                          cy="50%"
                          outerRadius={88}
                          label={({ name, percent }) =>
                            `${String(name ?? "")} ${((percent ?? 0) * 100).toFixed(0)}%`
                          }
                        >
                          {officeCompletedPieRows.map((r, i) => (
                            <Cell key={r.storeCode} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatBaht(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : null}

                <div className="h-[260px]">
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    {tr("adminRealtimeOfficeCancelStockout", "품절·취소율 (%)")}
                  </p>
                  <ResponsiveContainer width="100%" height="88%">
                    <BarChart data={officeRateBarRows}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="storeCode" tick={{ fontSize: 9 }} interval={0} angle={-28} textAnchor="end" height={56} />
                      <YAxis tick={{ fontSize: 10 }} unit="%" />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="stockoutPct" fill="#f59e0b" name={tr("adminLiveStoreSalesStockoutRate", "품절률")} />
                      <Bar dataKey="cancelPct" fill="#ef4444" name={tr("adminLiveStoreSalesCancelRate", "취소율")} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="overflow-x-auto rounded-md border">
                <table className="min-w-[640px] w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40 text-muted-foreground">
                      <th className="px-2 py-2 text-left">{tr("store", "매장")}</th>
                      <th className="px-2 py-2 text-right">{tr("adminLiveStoreSalesPeakHour", "피크타임")}</th>
                      <th className="px-2 py-2 text-right">{tr("salesManagementTabSalesStatus", "실매출")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {officeRows.map((row) => (
                      <tr key={row.storeCode} className="border-b border-border/50">
                        <td className="px-2 py-2 font-medium">{row.storeCode}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatPeakHour(row.peakHour)} ({formatBaht(row.peakHourRevenue)})
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatBaht(row.completedRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="text-[11px] text-muted-foreground">
            {data?.truncated
              ? tr("adminLiveStoreSalesDataTruncated", "집계 행 제한으로 일부 데이터가 생략될 수 있습니다.")
              : tr("adminLiveStoreSalesDataRealtimeHint", "최신 집계는「검색」으로 갱신합니다.")}
          </p>
        </div>
      ) : null}
    </section>
  )
}
