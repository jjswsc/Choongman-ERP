"use client"

import * as React from "react"
import { SalesPeriodTrendChartBlock } from "@/components/tabs/sales-management-charts"
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from "recharts"
import { formatSalesAmount } from "@/components/tabs/sales-management-shared"
import {
  SalesSortableTh,
  sortSalesRows,
  useSalesTableSort,
} from "@/components/tabs/sales-management-sortable"
import type {
  SalesChannelChartRow,
  SalesPeriodBarXAxisProps,
  SalesPeriodChartRow,
  SalesPeriodChartYAxisProps,
} from "@/components/tabs/sales-management-view-types"

type ChannelSortKey = "channel" | "sales"

export interface SalesChannelViewProps {
  periodChartRows: SalesPeriodChartRow[]
  periodBarXAxisProps: SalesPeriodBarXAxisProps
  periodChartYAxisProps: SalesPeriodChartYAxisProps
  tr: (key: string, fallback: string) => string
  channelChartRows: SalesChannelChartRow[]
}

export function SalesChannelView({
  periodChartRows,
  periodBarXAxisProps,
  periodChartYAxisProps,
  tr,
  channelChartRows,
}: SalesChannelViewProps) {
  const { sortKey, sortDir, toggleSort } = useSalesTableSort<ChannelSortKey>("sales", "desc")

  const sortedRows = React.useMemo(
    () =>
      sortSalesRows(
        channelChartRows,
        sortDir,
        (r) => (sortKey === "channel" ? r.axisLabel : r.sales),
        (a, b) => a.axisLabel.localeCompare(b.axisLabel, undefined, { sensitivity: "base" })
      ),
    [channelChartRows, sortKey, sortDir]
  )

  return (
    <>
      <SalesPeriodTrendChartBlock
        rows={periodChartRows}
        periodBarXAxisProps={periodBarXAxisProps}
        periodChartYAxisProps={periodChartYAxisProps}
        tr={tr}
      />
      <div className="mb-4 h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={channelChartRows} layout="vertical" margin={{ left: 80 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" {...periodChartYAxisProps} />
            <YAxis dataKey="axisLabel" type="category" width={80} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: number) => [formatSalesAmount(v), tr("pL_sales", "매출")]} />
            <Bar dataKey="sales" fill="#22c55e" name={tr("pL_sales", "매출")} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <SalesSortableTh
              label={tr("salesChannel", "채널")}
              active={sortKey === "channel"}
              dir={sortDir}
              align="center"
              onClick={() => toggleSort("channel")}
            />
            <SalesSortableTh
              label={tr("pL_sales", "매출")}
              active={sortKey === "sales"}
              dir={sortDir}
              onClick={() => toggleSort("sales")}
            />
          </tr>
        </thead>
        <tbody>
          {sortedRows.slice(0, 30).map((r) => (
            <tr key={r.channelKey} className="border-b">
              <td className="py-1.5 text-center">{r.axisLabel}</td>
              <td className="py-1.5 text-right font-erp-numeric">
                {formatSalesAmount(r.sales)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
