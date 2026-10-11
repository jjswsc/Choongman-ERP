"use client"

import * as React from "react"
import { SalesPeriodTrendChartBlock } from "@/components/tabs/sales-management-charts"
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from "recharts"
import { formatSalesAmount } from "@/components/tabs/sales-management-shared"
import type {
  SalesChannelChartRow,
  SalesPeriodBarXAxisProps,
  SalesPeriodChartRow,
  SalesPeriodChartYAxisProps,
} from "@/components/tabs/sales-management-view-types"

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
            <th className="py-2 text-center">{tr("salesChannel", "채널")}</th>
            <th className="py-2 text-right">{tr("pL_sales", "매출")}</th>
          </tr>
        </thead>
        <tbody>
          {channelChartRows.slice(0, 30).map((r) => (
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
