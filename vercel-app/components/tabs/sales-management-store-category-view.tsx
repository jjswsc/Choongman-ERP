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
import type {
  SalesChannelChartRow,
  SalesPeriodBarXAxisProps,
  SalesPeriodChartRow,
  SalesPeriodChartYAxisProps,
  SalesStoreChartRow,
} from "@/components/tabs/sales-management-view-types"

const COLORS = [...SALES_CHART_COLORS]

export interface SalesStoreCategoryViewProps {
  periodChartRows: SalesPeriodChartRow[]
  periodBarXAxisProps: SalesPeriodBarXAxisProps
  periodChartYAxisProps: SalesPeriodChartYAxisProps
  tr: (key: string, fallback: string) => string
  storeChartRows: SalesStoreChartRow[]
  channelChartRows: SalesChannelChartRow[]
}

export function SalesStoreCategoryView({
  periodChartRows,
  periodBarXAxisProps,
  periodChartYAxisProps,
  tr,
  storeChartRows,
  channelChartRows,
}: SalesStoreCategoryViewProps) {
  return (
    <>
      <SalesPeriodTrendChartBlock
        rows={periodChartRows}
        periodBarXAxisProps={periodBarXAxisProps}
        periodChartYAxisProps={periodChartYAxisProps}
        tr={tr}
      />
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h3 className="mb-3 text-sm font-semibold">{tr("salesByStore", "매장별")}</h3>
        <div className="mb-4 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={storeChartRows}
                dataKey="total"
                nameKey="storeDisplayName"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ storeDisplayName, percent }) =>
                  `${storeDisplayName} ${(percent * 100).toFixed(1)}%`
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
        <AdminTableScroll className="rounded-lg border" hint={false}>
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">{tr("salesStoreName", "매장명")}</th>
                <th className="px-3 py-2 text-right">{tr("salesQuantity", "수량")}</th>
                <th className="px-3 py-2 text-right">{tr("salesSalesAmount", "판매 금액")}</th>
              </tr>
            </thead>
            <tbody>
              {storeChartRows.slice(0, 12).map((r) => (
                <tr key={r.storeName} className="border-t">
                  <td className="px-3 py-1.5">{r.storeDisplayName}</td>
                  <td className="px-3 py-1.5 text-right font-erp-numeric">{r.count.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableScroll>
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
