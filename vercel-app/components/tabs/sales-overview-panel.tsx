"use client"

import Link from "next/link"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ADMIN_CHART_COLORS, ADMIN_NUMERIC_CN, ERP_NUMERIC_CHART_TICK } from "@/lib/admin-ui-standards"
import type { PosSalesPaymentBreakdown } from "@/lib/api-client"
import { translateChannelKey, translatePaymentKey } from "@/lib/sales-analytics-labels"

type ChannelRow = { channelKey: string; sales: number; axisLabel?: string }
type StoreRow = { storeName: string; total: number; storeDisplayName?: string }
type PeriodRow = { axisLabel: string; sales: number }

export type SalesOverviewPanelProps = {
  startStr: string
  endStr: string
  storesQuery?: string
  currentTotal: number
  prevRangeTotal: number
  prevWeekTotal: number
  channelRows: ChannelRow[]
  storeRows: StoreRow[]
  paymentBreakdown: PosSalesPaymentBreakdown
  periodDayRows: PeriodRow[]
  posStoreDisplayName: (code: string) => string
  tr: (key: string, fallback: string) => string
  formatAmount: (n: number) => string
  loading?: boolean
}

const chartYAxis = {
  tick: { fontSize: 11, ...ERP_NUMERIC_CHART_TICK },
  tickFormatter: (v: number) => `${(Number(v) / 1000).toFixed(0)}k`,
}

function buildTotalSalesHref(startStr: string, endStr: string, stores?: string) {
  const q = new URLSearchParams()
  q.set("start", startStr)
  q.set("end", endStr)
  if (stores) q.set("stores", stores)
  return `/admin/total-sales?${q.toString()}`
}

function buildSalesMgmtHref(
  topic: string,
  startStr: string,
  endStr: string,
  stores?: string
) {
  const q = new URLSearchParams()
  q.set("menu", "sales-analysis")
  q.set("topic", topic)
  q.set("start", startStr)
  q.set("end", endStr)
  if (stores) q.set("stores", stores)
  return `/admin/sales-management?${q.toString()}`
}

export function SalesOverviewPanel({
  startStr,
  endStr,
  storesQuery,
  currentTotal,
  prevRangeTotal,
  prevWeekTotal,
  channelRows,
  storeRows,
  paymentBreakdown,
  periodDayRows,
  posStoreDisplayName,
  tr,
  formatAmount,
  loading,
}: SalesOverviewPanelProps) {
  const channelChart = channelRows
    .map((r) => ({
      channelKey: r.channelKey,
      axisLabel: r.axisLabel ?? translateChannelKey(r.channelKey, tr),
      sales: Number(r.sales ?? 0) || 0,
    }))
    .filter((r) => r.sales > 0)
    .sort((a, b) => b.sales - a.sales)

  const storeChart = [...storeRows]
    .map((r) => ({
      storeName: r.storeName,
      storeDisplayName: r.storeDisplayName ?? posStoreDisplayName(r.storeName),
      sales: Number(r.total ?? 0) || 0,
    }))
    .filter((r) => r.sales > 0)
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 8)

  const paymentChart = (paymentBreakdown.summary.length > 0
    ? paymentBreakdown.summary
    : []
  )
    .map((r) => ({
      key: r.paymentKey,
      label: translatePaymentKey(r.paymentKey, tr),
      sales: Number(r.sales ?? 0) || 0,
    }))
    .filter((r) => r.sales > 0)
    .sort((a, b) => b.sales - a.sales)

  const deltaPrev =
    prevRangeTotal > 0
      ? `${(((currentTotal - prevRangeTotal) / prevRangeTotal) * 100).toFixed(1)}%`
      : "—"

  if (loading) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {tr("loading", "불러오는 중…")}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        {tr(
          "salesOverviewIntro",
          "선택 기간·매장의 핵심 KPI와 채널·매장·결제·일별 추이를 한 화면에서 봅니다. 상세는 아래 링크로 이어집니다."
        )}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {tr("salesSummaryCurrent", "현재 기간 매출")}
            </CardTitle>
          </CardHeader>
          <CardContent className={`text-2xl font-semibold ${ADMIN_NUMERIC_CN}`}>
            {formatAmount(currentTotal)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {tr("salesSummaryPrevRange", "직전 동일기간")}
            </CardTitle>
          </CardHeader>
          <CardContent className={`text-lg font-semibold ${ADMIN_NUMERIC_CN}`}>
            {formatAmount(prevRangeTotal)}
            <p className="mt-1 text-xs text-muted-foreground">
              {tr("salesOverviewDelta", "대비")} {deltaPrev}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {tr("salesSummaryPrevWeek", "전주 동기간")}
            </CardTitle>
          </CardHeader>
          <CardContent className={`text-lg font-semibold ${ADMIN_NUMERIC_CN}`}>
            {formatAmount(prevWeekTotal)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {tr("salesOverviewTopChannel", "TOP 채널")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm font-medium">
            {channelChart[0]?.axisLabel ?? "—"}
            {channelChart[0] ? (
              <p className={`mt-1 text-lg font-semibold ${ADMIN_NUMERIC_CN}`}>
                {formatAmount(channelChart[0].sales)}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="secondary">
          <Link href={buildTotalSalesHref(startStr, endStr, storesQuery)}>
            {tr("salesOverviewLinkTotalSales", "메뉴별 상세 (Total Sales)")}
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={buildSalesMgmtHref("analysis-period", startStr, endStr, storesQuery)}>
            {tr("salesOverviewLinkPeriod", "기간별 분석")}
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={buildSalesMgmtHref("analysis-channel", startStr, endStr, storesQuery)}>
            {tr("salesOverviewLinkChannel", "채널 분석")}
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/admin/live-store-sales`}>
            {tr("salesOverviewLinkLive", "실시간 매출")}
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {periodDayRows.length > 0 ? (
          <div className="rounded-lg border p-3">
            <h3 className="mb-2 text-sm font-semibold">
              {tr("salesOverviewDailyTrend", "일별 매출 추이")}
            </h3>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={periodDayRows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="axisLabel" tick={{ fontSize: 9, ...ERP_NUMERIC_CHART_TICK }} />
                  <YAxis {...chartYAxis} />
                  <Tooltip formatter={(v: number) => [formatAmount(v), tr("pL_sales", "매출")]} />
                  <Bar dataKey="sales" fill={ADMIN_CHART_COLORS[0]} name={tr("pL_sales", "매출")} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}

        {channelChart.length > 0 ? (
          <div className="rounded-lg border p-3">
            <h3 className="mb-2 text-sm font-semibold">{tr("salesInsightTopChannel", "TOP 채널")}</h3>
            <div className="mx-auto h-[200px] max-w-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={channelChart}
                    dataKey="sales"
                    nameKey="axisLabel"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={72}
                    label={({ name, percent }) =>
                      `${String(name ?? "").slice(0, 8)} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                  >
                    {channelChart.map((_, i) => (
                      <Cell key={i} fill={ADMIN_CHART_COLORS[i % ADMIN_CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatAmount(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}

        {storeChart.length > 0 ? (
          <div className="rounded-lg border p-3 lg:col-span-2">
            <h3 className="mb-2 text-sm font-semibold">{tr("salesByStore", "매장별")}</h3>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={storeChart} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" {...chartYAxis} />
                  <YAxis
                    dataKey="storeDisplayName"
                    type="category"
                    width={100}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip formatter={(v: number) => formatAmount(v)} />
                  <Bar dataKey="sales" fill={ADMIN_CHART_COLORS[1]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}

        {paymentChart.length > 0 ? (
          <div className="rounded-lg border p-3 lg:col-span-2">
            <h3 className="mb-2 text-sm font-semibold">
              {tr("salesTopicExplorePayment", "결제수단")}
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {paymentChart.slice(0, 6).map((r) => (
                <li
                  key={r.key}
                  className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2 text-sm"
                >
                  <span className="truncate">{r.label}</span>
                  <span className={`ml-2 shrink-0 font-semibold ${ADMIN_NUMERIC_CN}`}>
                    {formatAmount(r.sales)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}
