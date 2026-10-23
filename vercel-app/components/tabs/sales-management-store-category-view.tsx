"use client"

import * as React from "react"
import { SalesPeriodTrendChartBlock, SALES_CHART_COLORS } from "@/components/tabs/sales-management-charts"
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Bar,
} from "recharts"
import { formatSalesAmount } from "@/components/tabs/sales-management-shared"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { translateDeliveryAppCode } from "@/lib/sales-analytics-labels"
import { ADMIN_BTN_XS_CN } from "@/lib/admin-ui-standards"
import { cn } from "@/lib/utils"
import type { PosSalesStoreDeliveryPlatformRow } from "@/lib/api-client"
import type {
  SalesChannelChartRow,
  SalesPeriodBarXAxisProps,
  SalesPeriodChartRow,
  SalesPeriodChartYAxisProps,
  SalesStoreChartRow,
} from "@/components/tabs/sales-management-view-types"

const COLORS = [...SALES_CHART_COLORS]
const CHANNEL_STACK = {
  dineIn: "#3b82f6",
  delivery: "#f59e0b",
  takeout: "#10b981",
} as const
/** 배달앱 스택용 (상위 앱 + 기타) */
const PLATFORM_STACK_COLORS = [
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#64748b",
]
const MAX_PLATFORM_STACK = 5

export type StoreChannelCompareRow = {
  storeName: string
  storeDisplayName: string
  dineIn: number
  delivery: number
  takeout: number
  total: number
}

type CompareMode = "amount" | "share"

export interface SalesStoreCategoryViewProps {
  periodChartRows: SalesPeriodChartRow[]
  periodBarXAxisProps: SalesPeriodBarXAxisProps
  periodChartYAxisProps: SalesPeriodChartYAxisProps
  tr: (key: string, fallback: string) => string
  storeChartRows: SalesStoreChartRow[]
  channelChartRows: SalesChannelChartRow[]
  /** 매장×홀·배달·포장 (선택 기간) */
  storeChannelRows: StoreChannelCompareRow[]
  /** 매장×배달앱 */
  storeDeliveryPlatformRows: PosSalesStoreDeliveryPlatformRow[]
  posStoreDisplayName: (code: string) => string
}

function stackedChartHeight(rowCount: number): number {
  return Math.min(720, Math.max(220, rowCount * 28 + 48))
}

function ModeToggle({
  mode,
  onChange,
  tr,
}: {
  mode: CompareMode
  onChange: (m: CompareMode) => void
  tr: (key: string, fallback: string) => string
}) {
  return (
    <div className="inline-flex rounded-md border bg-muted/30 p-0.5 text-xs">
      <button
        type="button"
        className={cn(
          ADMIN_BTN_XS_CN,
          "rounded-sm",
          mode === "amount" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
        )}
        onClick={() => onChange("amount")}
      >
        {tr("salesCompareModeAmount", "금액")}
      </button>
      <button
        type="button"
        className={cn(
          ADMIN_BTN_XS_CN,
          "rounded-sm",
          mode === "share" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
        )}
        onClick={() => onChange("share")}
      >
        {tr("salesCompareModeShare", "비중 %")}
      </button>
    </div>
  )
}

export function SalesStoreCategoryView({
  periodChartRows,
  periodBarXAxisProps,
  periodChartYAxisProps,
  tr,
  storeChartRows,
  channelChartRows,
  storeChannelRows,
  storeDeliveryPlatformRows,
  posStoreDisplayName,
}: SalesStoreCategoryViewProps) {
  const [channelMode, setChannelMode] = React.useState<CompareMode>("share")
  const [deliveryMode, setDeliveryMode] = React.useState<CompareMode>("share")

  const storeChannelTotals = React.useMemo(
    () =>
      storeChannelRows.reduce(
        (acc, r) => ({
          dineIn: acc.dineIn + r.dineIn,
          delivery: acc.delivery + r.delivery,
          takeout: acc.takeout + r.takeout,
          total: acc.total + r.total,
        }),
        { dineIn: 0, delivery: 0, takeout: 0, total: 0 }
      ),
    [storeChannelRows]
  )

  const channelStackRows = React.useMemo(() => {
    return [...storeChannelRows]
      .sort((a, b) => b.total - a.total)
      .map((r) => {
        const t = r.total > 0 ? r.total : 1
        if (channelMode === "share") {
          return {
            storeLabel: r.storeDisplayName,
            dineIn: Math.round((r.dineIn / t) * 1000) / 10,
            delivery: Math.round((r.delivery / t) * 1000) / 10,
            takeout: Math.round((r.takeout / t) * 1000) / 10,
            total: r.total,
          }
        }
        return {
          storeLabel: r.storeDisplayName,
          dineIn: r.dineIn,
          delivery: r.delivery,
          takeout: r.takeout,
          total: r.total,
        }
      })
  }, [storeChannelRows, channelMode])

  const deliveryPlatformCodes = React.useMemo(() => {
    const totals = new Map<string, number>()
    for (const row of storeDeliveryPlatformRows) {
      for (const p of row.platforms) {
        totals.set(p.code, (totals.get(p.code) || 0) + p.sales)
      }
    }
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([code]) => code)
  }, [storeDeliveryPlatformRows])

  const topPlatformCodes = React.useMemo(
    () => deliveryPlatformCodes.slice(0, MAX_PLATFORM_STACK),
    [deliveryPlatformCodes]
  )
  const hasOtherPlatforms = deliveryPlatformCodes.length > MAX_PLATFORM_STACK

  const storeDeliveryMatrixRows = React.useMemo(() => {
    return storeDeliveryPlatformRows.map((r) => {
      const byCode = new Map(r.platforms.map((p) => [p.code, p.sales]))
      return {
        storeName: r.storeName,
        storeDisplayName: posStoreDisplayName(r.storeName),
        deliveryTotal: r.deliveryTotal,
        byCode,
      }
    })
  }, [storeDeliveryPlatformRows, posStoreDisplayName])

  const deliveryStackRows = React.useMemo(() => {
    return [...storeDeliveryMatrixRows]
      .sort((a, b) => b.deliveryTotal - a.deliveryTotal)
      .map((r) => {
        const t = r.deliveryTotal > 0 ? r.deliveryTotal : 1
        const row: Record<string, string | number> = {
          storeLabel: r.storeDisplayName,
          deliveryTotal: r.deliveryTotal,
        }
        let topSum = 0
        for (const code of topPlatformCodes) {
          const sales = r.byCode.get(code) || 0
          topSum += sales
          row[code] =
            deliveryMode === "share" ? Math.round((sales / t) * 1000) / 10 : sales
        }
        if (hasOtherPlatforms) {
          const other = Math.max(0, r.deliveryTotal - topSum)
          row._other =
            deliveryMode === "share" ? Math.round((other / t) * 1000) / 10 : other
        }
        return row
      })
  }, [storeDeliveryMatrixRows, topPlatformCodes, hasOtherPlatforms, deliveryMode])

  const storeDeliveryColumnTotals = React.useMemo(() => {
    const byCode = new Map<string, number>()
    let deliveryTotal = 0
    for (const row of storeDeliveryMatrixRows) {
      deliveryTotal += row.deliveryTotal
      for (const code of deliveryPlatformCodes) {
        byCode.set(code, (byCode.get(code) || 0) + (row.byCode.get(code) || 0))
      }
    }
    return { byCode, deliveryTotal }
  }, [storeDeliveryMatrixRows, deliveryPlatformCodes])

  const storeRankRows = React.useMemo(
    () =>
      [...storeChartRows]
        .sort((a, b) => b.total - a.total)
        .slice(0, 15)
        .map((r) => ({
          storeLabel: r.storeDisplayName,
          sales: r.total,
          count: r.count,
        })),
    [storeChartRows]
  )

  const formatStackValue = React.useCallback(
    (v: number, mode: CompareMode) =>
      mode === "share" ? `${Number(v || 0).toFixed(1)}%` : formatSalesAmount(v),
    []
  )

  const channelXDomain = channelMode === "share" ? ([0, 100] as const) : undefined
  const deliveryXDomain = deliveryMode === "share" ? ([0, 100] as const) : undefined

  return (
    <>
      <SalesPeriodTrendChartBlock
        rows={periodChartRows}
        periodBarXAxisProps={periodBarXAxisProps}
        periodChartYAxisProps={periodChartYAxisProps}
        tr={tr}
      />

      {storeChannelRows.length > 0 ? (
        <div className="mb-6 min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {tr("salesByStoreChannelMatrix", "매장별 홀·배달·포장")}
            </h3>
            <ModeToggle mode={channelMode} onChange={setChannelMode} tr={tr} />
          </div>
          <p className="mb-2 text-[11px] text-muted-foreground">
            {channelMode === "share"
              ? tr(
                  "salesStoreChannelShareHint",
                  "매장마다 합계를 100%로 두고 홀·배달·포장 비중을 비교합니다. 규모가 다른 매장끼리 채널 구성 비교에 유리합니다."
                )
              : tr(
                  "salesStoreChannelAmountHint",
                  "매출 금액(누적 막대)으로 매장 규모와 채널 구성을 함께 봅니다."
                )}
          </p>
          <div style={{ height: stackedChartHeight(channelStackRows.length) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={channelStackRows}
                layout="vertical"
                margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  domain={channelXDomain ? [...channelXDomain] : undefined}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) =>
                    channelMode === "share" ? `${v}%` : periodChartYAxisProps.tickFormatter(v)
                  }
                />
                <YAxis
                  dataKey="storeLabel"
                  type="category"
                  width={108}
                  tick={{ fontSize: 10 }}
                  interval={0}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [
                    formatStackValue(v, channelMode),
                    name,
                  ]}
                  labelFormatter={(label) => String(label)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="dineIn"
                  stackId="ch"
                  fill={CHANNEL_STACK.dineIn}
                  name={tr("salesAmountKindDineIn", "홀")}
                />
                <Bar
                  dataKey="delivery"
                  stackId="ch"
                  fill={CHANNEL_STACK.delivery}
                  name={tr("salesAmountKindDelivery", "배달")}
                />
                <Bar
                  dataKey="takeout"
                  stackId="ch"
                  fill={CHANNEL_STACK.takeout}
                  name={tr("salesAmountKindTakeout", "포장")}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs">
            <summary className="cursor-pointer select-none font-medium text-muted-foreground">
              {tr("salesStoreChannelTableToggle", "숫자 표 보기 (엑셀보내기와 동일)")}
            </summary>
            <div className="mt-2">
              <AdminTableScroll className="rounded-lg border bg-background" hint={false}>
                <table className="min-w-[560px] w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left">{tr("salesStoreName", "매장명")}</th>
                      <th className="px-3 py-2 text-right">{tr("salesAmountKindDineIn", "홀")}</th>
                      <th className="px-3 py-2 text-right">{tr("salesAmountKindDelivery", "배달")}</th>
                      <th className="px-3 py-2 text-right">{tr("salesAmountKindTakeout", "포장")}</th>
                      <th className="px-3 py-2 text-right">{tr("salesTotalLabel", "합계")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...storeChannelRows]
                      .sort((a, b) => b.total - a.total)
                      .map((r) => (
                        <tr key={r.storeName} className="border-t">
                          <td className="px-3 py-1.5 font-medium">{r.storeDisplayName}</td>
                          <td className="px-3 py-1.5 text-right font-erp-numeric">
                            {formatSalesAmount(r.dineIn)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-erp-numeric">
                            {formatSalesAmount(r.delivery)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-erp-numeric">
                            {formatSalesAmount(r.takeout)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-erp-numeric font-semibold">
                            {formatSalesAmount(r.total)}
                          </td>
                        </tr>
                      ))}
                    <tr className="border-t-2 bg-muted/40 font-semibold">
                      <td className="px-3 py-2">{tr("salesTotalLabel", "합계")}</td>
                      <td className="px-3 py-2 text-right font-erp-numeric">
                        {formatSalesAmount(storeChannelTotals.dineIn)}
                      </td>
                      <td className="px-3 py-2 text-right font-erp-numeric">
                        {formatSalesAmount(storeChannelTotals.delivery)}
                      </td>
                      <td className="px-3 py-2 text-right font-erp-numeric">
                        {formatSalesAmount(storeChannelTotals.takeout)}
                      </td>
                      <td className="px-3 py-2 text-right font-erp-numeric">
                        {formatSalesAmount(storeChannelTotals.total)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </AdminTableScroll>
            </div>
          </details>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            {tr(
              "salesStoreChannelMatrixFootnote",
              "선택 기간·매장의 완료 매출(POS 영업일)입니다. 당일 차트의 미결제 테이블은 기간 비교에 포함하지 않습니다."
            )}
          </p>
        </div>
      ) : null}

      {deliveryStackRows.length > 0 && topPlatformCodes.length > 0 ? (
        <div className="mb-6 min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {tr("salesByStoreDeliveryPlatform", "매장별 배달 플랫폼")}
            </h3>
            <ModeToggle mode={deliveryMode} onChange={setDeliveryMode} tr={tr} />
          </div>
          <p className="mb-2 text-[11px] text-muted-foreground">
            {hasOtherPlatforms
              ? tr(
                  "salesStoreDeliveryPlatformStackHint",
                  "상위 배달앱 {n}개 + 기타로 묶었습니다. 비중 %로 매장별 앱 의존도를 비교하세요."
                ).replace("{n}", String(MAX_PLATFORM_STACK))
              : tr(
                  "salesStoreDeliveryPlatformShareHint",
                  "매장별 배달 매출 안에서 앱 비중을 비교합니다."
                )}
          </p>
          <div style={{ height: stackedChartHeight(deliveryStackRows.length) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={deliveryStackRows}
                layout="vertical"
                margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  domain={deliveryXDomain ? [...deliveryXDomain] : undefined}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) =>
                    deliveryMode === "share" ? `${v}%` : periodChartYAxisProps.tickFormatter(v)
                  }
                />
                <YAxis
                  dataKey="storeLabel"
                  type="category"
                  width={108}
                  tick={{ fontSize: 10 }}
                  interval={0}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [
                    formatStackValue(v, deliveryMode),
                    name,
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {topPlatformCodes.map((code, i) => (
                  <Bar
                    key={code}
                    dataKey={code}
                    stackId="plat"
                    fill={PLATFORM_STACK_COLORS[i % PLATFORM_STACK_COLORS.length]}
                    name={translateDeliveryAppCode(code, tr)}
                  />
                ))}
                {hasOtherPlatforms ? (
                  <Bar
                    dataKey="_other"
                    stackId="plat"
                    fill={PLATFORM_STACK_COLORS[PLATFORM_STACK_COLORS.length - 1]}
                    name={tr("salesPayOther", "기타")}
                  />
                ) : null}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs">
            <summary className="cursor-pointer select-none font-medium text-muted-foreground">
              {tr("salesStoreDeliveryTableToggle", "배달앱 숫자 표 보기")}
            </summary>
            <div className="mt-2">
              <AdminTableScroll className="rounded-lg border bg-background" hint={false}>
                <table className="min-w-[640px] w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left">{tr("salesStoreName", "매장명")}</th>
                      {deliveryPlatformCodes.map((code) => (
                        <th key={code} className="px-3 py-2 text-right">
                          {translateDeliveryAppCode(code, tr)}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right">{tr("salesAmountKindDelivery", "배달")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...storeDeliveryMatrixRows]
                      .sort((a, b) => b.deliveryTotal - a.deliveryTotal)
                      .map((r) => (
                        <tr key={r.storeName} className="border-t">
                          <td className="px-3 py-1.5 font-medium">{r.storeDisplayName}</td>
                          {deliveryPlatformCodes.map((code) => (
                            <td key={code} className="px-3 py-1.5 text-right font-erp-numeric">
                              {formatSalesAmount(r.byCode.get(code) || 0)}
                            </td>
                          ))}
                          <td className="px-3 py-1.5 text-right font-erp-numeric font-semibold">
                            {formatSalesAmount(r.deliveryTotal)}
                          </td>
                        </tr>
                      ))}
                    <tr className="border-t-2 bg-muted/40 font-semibold">
                      <td className="px-3 py-2">{tr("salesTotalLabel", "합계")}</td>
                      {deliveryPlatformCodes.map((code) => (
                        <td key={code} className="px-3 py-2 text-right font-erp-numeric">
                          {formatSalesAmount(storeDeliveryColumnTotals.byCode.get(code) || 0)}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-erp-numeric">
                        {formatSalesAmount(storeDeliveryColumnTotals.deliveryTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </AdminTableScroll>
            </div>
          </details>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            {tr(
              "salesStoreDeliveryPlatformFootnote",
              "배달 주문만 집계합니다. 앱 코드가 없는 건은「앱 미지정」입니다."
            )}
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold">
            {tr("salesByStoreRank", "매장별 매출 순위")}
          </h3>
          {storeRankRows.length > 0 ? (
            <div
              className="mb-4"
              style={{ height: stackedChartHeight(Math.min(storeRankRows.length, 15)) }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={storeRankRows}
                  layout="vertical"
                  margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" {...periodChartYAxisProps} />
                  <YAxis
                    dataKey="storeLabel"
                    type="category"
                    width={108}
                    tick={{ fontSize: 10 }}
                    interval={0}
                  />
                  <Tooltip
                    formatter={(v: number) => [
                      formatSalesAmount(v),
                      tr("salesSalesAmount", "판매 금액"),
                    ]}
                  />
                  <Bar dataKey="sales" fill="#6366f1" name={tr("salesSalesAmount", "판매 금액")} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}
          {storeChartRows.length > 8 ? (
            <p className="mb-2 text-[10px] text-muted-foreground">
              {tr("salesByStoreRankTopHint", "상위 15개 매장만 막대로 표시합니다. 전체는 아래 표·엑셀을 이용하세요.")}
            </p>
          ) : null}
          <details className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
            <summary className="cursor-pointer select-none font-medium text-muted-foreground">
              {tr("salesByStoreTableToggle", "매장별 수량·금액 표")}
            </summary>
            <div className="mt-2">
              <AdminTableScroll className="rounded-lg border bg-background" hint={false}>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left">{tr("salesStoreName", "매장명")}</th>
                      <th className="px-3 py-2 text-right">{tr("salesQuantity", "수량")}</th>
                      <th className="px-3 py-2 text-right">{tr("salesSalesAmount", "판매 금액")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storeChartRows.map((r) => (
                      <tr key={r.storeName} className="border-t">
                        <td className="px-3 py-1.5">{r.storeDisplayName}</td>
                        <td className="px-3 py-1.5 text-right font-erp-numeric">
                          {r.count.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-right font-erp-numeric">
                          {formatSalesAmount(r.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTableScroll>
            </div>
          </details>
          {storeChartRows.length > 0 && storeChartRows.length <= 8 ? (
            <div className="mt-4 h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={storeChartRows}
                    dataKey="total"
                    nameKey="storeDisplayName"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    label={({ storeDisplayName, percent }) =>
                      `${storeDisplayName} ${(percent * 100).toFixed(0)}%`
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
          ) : null}
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
}
