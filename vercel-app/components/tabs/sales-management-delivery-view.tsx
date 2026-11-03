"use client"

import * as React from "react"
import { SalesPeriodTrendChartBlock, SALES_CHART_COLORS } from "@/components/tabs/sales-management-charts"
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts"
import { formatSalesAmount } from "@/components/tabs/sales-management-shared"
import {
  SalesSortableTh,
  sortSalesRows,
  useSalesTableSort,
} from "@/components/tabs/sales-management-sortable"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import type {
  SalesDeliveryAppData,
  SalesDeliveryPieRow,
  SalesPeriodBarXAxisProps,
  SalesPeriodChartRow,
  SalesPeriodChartYAxisProps,
} from "@/components/tabs/sales-management-view-types"

const COLORS = [...SALES_CHART_COLORS]

type DeliverySortKey = "channel" | "sales" | "pct"
type PlatformSortKey = "platform" | "sales" | "pct"

export interface SalesDeliveryViewProps {
  periodChartRows: SalesPeriodChartRow[]
  periodBarXAxisProps: SalesPeriodBarXAxisProps
  periodChartYAxisProps: SalesPeriodChartYAxisProps
  tr: (key: string, fallback: string) => string
  deliveryPieRows: SalesDeliveryPieRow[]
  deliveryAppData: SalesDeliveryAppData
  deliveryPlatformBreakdown: { code: string; sales: number; pct: number }[]
  deliveryPlatformPieRows: { axisLabel: string; code: string; sales: number; pct: number }[]
}

export function SalesDeliveryView({
  periodChartRows,
  periodBarXAxisProps,
  periodChartYAxisProps,
  tr,
  deliveryPieRows,
  deliveryAppData,
  deliveryPlatformBreakdown,
  deliveryPlatformPieRows,
}: SalesDeliveryViewProps) {
  const {
    sortKey: channelSortKey,
    sortDir: channelSortDir,
    toggleSort: toggleChannelSort,
  } = useSalesTableSort<DeliverySortKey>("sales", "desc")
  const {
    sortKey: platformSortKey,
    sortDir: platformSortDir,
    toggleSort: togglePlatformSort,
  } = useSalesTableSort<PlatformSortKey>("sales", "desc")

  const sortedChannelRows = React.useMemo(
    () =>
      sortSalesRows(
        deliveryPieRows,
        channelSortDir,
        (r) => {
          if (channelSortKey === "channel") return r.axisLabel
          if (channelSortKey === "pct") return r.pct
          return r.sales
        },
        (a, b) => a.axisLabel.localeCompare(b.axisLabel, undefined, { sensitivity: "base" })
      ),
    [deliveryPieRows, channelSortKey, channelSortDir]
  )

  const sortedPlatformRows = React.useMemo(
    () =>
      sortSalesRows(
        deliveryPlatformPieRows,
        platformSortDir,
        (r) => {
          if (platformSortKey === "platform") return r.axisLabel
          if (platformSortKey === "pct") return r.pct
          return r.sales
        },
        (a, b) => a.axisLabel.localeCompare(b.axisLabel, undefined, { sensitivity: "base" })
      ),
    [deliveryPlatformPieRows, platformSortKey, platformSortDir]
  )

  return (
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
            <SalesSortableTh
              label={tr("salesDeliveryChannel", "배달앱/채널")}
              active={channelSortKey === "channel"}
              dir={channelSortDir}
              align="center"
              onClick={() => toggleChannelSort("channel")}
            />
            <SalesSortableTh
              label={tr("pL_sales", "매출")}
              active={channelSortKey === "sales"}
              dir={channelSortDir}
              onClick={() => toggleChannelSort("sales")}
            />
            <SalesSortableTh
              label={tr("salesRatio", "비율")}
              active={channelSortKey === "pct"}
              dir={channelSortDir}
              onClick={() => toggleChannelSort("pct")}
            />
          </tr>
        </thead>
        <tbody>
          {sortedChannelRows.map((r) => (
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
                        <SalesSortableTh
                          label={tr("salesDeliveryPlatformBreakdown", "배달 플랫폼별")}
                          active={platformSortKey === "platform"}
                          dir={platformSortDir}
                          align="center"
                          onClick={() => togglePlatformSort("platform")}
                        />
                        <SalesSortableTh
                          label={tr("pL_sales", "매출")}
                          active={platformSortKey === "sales"}
                          dir={platformSortDir}
                          onClick={() => togglePlatformSort("sales")}
                        />
                        <SalesSortableTh
                          label={tr("salesRatio", "비율")}
                          active={platformSortKey === "pct"}
                          dir={platformSortDir}
                          onClick={() => togglePlatformSort("pct")}
                        />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPlatformRows.map((r) => (
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
}
