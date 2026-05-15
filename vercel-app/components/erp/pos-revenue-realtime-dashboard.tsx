"use client"

import * as React from "react"
import { AlertTriangle, Building2, Clock3, RefreshCw, Store, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/lang-context"
import { useT, tOr } from "@/lib/i18n"

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
}

function formatBaht(value: number): string {
  return Math.round(Number(value || 0)).toLocaleString()
}

function formatRate(value: number): string {
  return `${(Math.max(0, Number(value || 0)) * 100).toFixed(1)}%`
}

function formatPeakHour(hour: number): string {
  const h = Number(hour)
  if (!Number.isFinite(h) || h < 0 || h > 23) return "-"
  const next = (h + 1) % 24
  return `${String(h).padStart(2, "0")}:00-${String(next).padStart(2, "0")}:00`
}

function MetricCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string
  value: string
  hint: string
  icon: React.ReactNode
}) {
  return (
    <article className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </article>
  )
}

export function PosRevenueRealtimeDashboard({
  effectiveStoreCode,
  isOfficeSelector,
}: PosRevenueRealtimeDashboardProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [data, setData] = React.useState<DashboardResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string>("")
  const storeCode = String(effectiveStoreCode || "").trim()

  const loadDashboard = React.useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const q = new URLSearchParams()
      if (storeCode && storeCode !== "All") q.set("stores", storeCode)
      const res = await fetch(`/api/posRealtimeRevenueDashboard?${q.toString()}`, { cache: "no-store" })
      const json = (await res.json()) as DashboardResponse
      if (!res.ok || !json?.success) {
        throw new Error("dashboard fetch failed")
      }
      setData(json)
    } catch {
      setError(tOr(t, "errorOccurred", "오류가 발생했습니다."))
    } finally {
      setLoading(false)
    }
  }, [storeCode, t])

  React.useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  React.useEffect(() => {
    const timer = setInterval(() => {
      void loadDashboard()
    }, 60000)
    return () => clearInterval(timer)
  }, [loadDashboard])

  const store = data?.store
  const officeRows = data?.office?.stores || []

  return (
    <section className="space-y-3 rounded-xl border border-border/70 bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">
            {tOr(t, "adminLiveStoreSalesRevenueOpsDashTitle", "매출 중심 실시간 운영 대시보드")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {tOr(
              t,
              "adminLiveStoreSalesRevenueOpsDashSub",
              "매장 즉시 대응 지표와 본사 비교 지표를 같은 기준으로 확인합니다."
            )}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void loadDashboard()} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {tOr(t, "search", "검색")}
        </Button>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title={tOr(t, "adminLiveStoreSalesWaitingRevenue", "현재 대기 주문 매출액")}
          value={store ? formatBaht(store.waitingRevenue) : "-"}
          hint={
            store
              ? `${tOr(t, "orders", "주문")} ${store.waitingOrders}${tOr(t, "countUnitSuffix", "건")}`
              : "-"
          }
          icon={<Wallet className="h-4 w-4" />}
        />
        <MetricCard
          title={tOr(t, "adminLiveStoreSalesAvgCookingMins", "평균 조리시간(분)")}
          value={store ? `${store.revenueWeightedCookingMinutes.toFixed(1)}m` : "-"}
          hint={
            store
              ? `${tOr(t, "adminLiveStoreSalesAvgCookingRaw", "단순 평균")} ${store.avgCookingMinutes.toFixed(1)}m`
              : "-"
          }
          icon={<Clock3 className="h-4 w-4" />}
        />
        <MetricCard
          title={tOr(t, "adminLiveStoreSalesDelayedOrders", "지연 주문 카운트")}
          value={store ? String(store.delayedOrders) : "-"}
          hint={
            data
              ? `${data.delayThresholdMin}${tOr(t, "minute", "분")} ${tOr(t, "adminLiveStoreSalesDelayedRule", "초과 기준")}`
              : "-"
          }
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <MetricCard
          title={tOr(t, "adminLiveStoreSalesDelayedRevenue", "지연 주문 매출액")}
          value={store ? formatBaht(store.delayedRevenue) : "-"}
          hint={
            store
              ? `${tOr(t, "salesManagementTabSalesStatus", "실매출")} ${formatBaht(store.completedRevenue)}`
              : "-"
          }
          icon={<Store className="h-4 w-4" />}
        />
      </div>

      {isOfficeSelector ? (
        <div className="space-y-2 rounded-lg border border-border/60 bg-card p-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-foreground">
              {tOr(t, "adminLiveStoreSalesOfficeCompareTitle", "본사 매장 비교 (매출 중심)")}
            </p>
          </div>
          {officeRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {tOr(t, "mobileStoreSalesByStoreEmpty", "표시할 매장 데이터가 없습니다.")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[820px] w-full text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-muted-foreground">
                    <th className="px-2 py-2 text-left">{tOr(t, "store", "매장")}</th>
                    <th className="px-2 py-2 text-right">{tOr(t, "salesManagementTabSalesStatus", "실매출")}</th>
                    <th className="px-2 py-2 text-right">{tOr(t, "adminLiveStoreSalesWaitingRevenue", "대기매출")}</th>
                    <th className="px-2 py-2 text-right">{tOr(t, "adminLiveStoreSalesDelayedRevenue", "지연매출")}</th>
                    <th className="px-2 py-2 text-right">{tOr(t, "adminLiveStoreSalesPeakHour", "피크타임")}</th>
                    <th className="px-2 py-2 text-right">{tOr(t, "adminLiveStoreSalesStockoutRate", "품절률(금액)")}</th>
                    <th className="px-2 py-2 text-right">{tOr(t, "adminLiveStoreSalesCancelRate", "취소율(금액)")}</th>
                  </tr>
                </thead>
                <tbody>
                  {officeRows.map((row) => (
                    <tr key={row.storeCode} className="border-b border-border/50">
                      <td className="px-2 py-2 font-medium">{row.storeCode}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatBaht(row.completedRevenue)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatBaht(row.waitingRevenue)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatBaht(row.delayedRevenue)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {formatPeakHour(row.peakHour)} ({formatBaht(row.peakHourRevenue)})
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatRate(row.stockoutRate)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatRate(row.cancelRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            {data?.truncated
              ? tOr(t, "adminLiveStoreSalesDataTruncated", "집계 행 제한으로 일부 데이터가 생략될 수 있습니다.")
              : tOr(t, "adminLiveStoreSalesDataRealtimeHint", "집계는 60초마다 자동 갱신됩니다.")}
          </p>
        </div>
      ) : null}
    </section>
  )
}
