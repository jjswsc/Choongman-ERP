"use client"

import * as React from "react"
import { SalesPeriodTrendChartBlock, SALES_CHART_COLORS } from "@/components/tabs/sales-management-charts"
import {
  formatSalesAmount,
  sumDisplayedSalesAmounts,
} from "@/components/tabs/sales-management-shared"
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts"
import type { PosSalesPaymentBreakdown } from "@/lib/api-client"
import type {
  SalesChannelChartRow,
  SalesPaymentChartRow,
  SalesPeriodBarXAxisProps,
  SalesPeriodChartRow,
  SalesPeriodChartYAxisProps,
} from "@/components/tabs/sales-management-view-types"

const COLORS = [...SALES_CHART_COLORS]

export interface SalesPaymentViewProps {
  periodChartRows: SalesPeriodChartRow[]
  periodBarXAxisProps: SalesPeriodBarXAxisProps
  periodChartYAxisProps: SalesPeriodChartYAxisProps
  tr: (key: string, fallback: string) => string
  paymentBreakdownData: PosSalesPaymentBreakdown
  paymentChartRows: SalesPaymentChartRow[]
  deliveryPaymentChannelRows: SalesChannelChartRow[]
  creditPaymentChannelRows: SalesChannelChartRow[]
}

export function SalesPaymentView({
  periodChartRows,
  periodBarXAxisProps,
  periodChartYAxisProps,
  tr,
  paymentBreakdownData,
  paymentChartRows,
  deliveryPaymentChannelRows,
  creditPaymentChannelRows,
}: SalesPaymentViewProps) {
  return (
    <>
      <SalesPeriodTrendChartBlock
        rows={periodChartRows}
        periodBarXAxisProps={periodBarXAxisProps}
        periodChartYAxisProps={periodChartYAxisProps}
        tr={tr}
      />
      <p className="mb-4 text-xs text-muted-foreground">
        {tr(
          "salesPaymentMethodSummaryHint",
          "완료 주문 기준입니다. 현금, 신용카드, QR PromptPay, WeChat, Alipay, TrueMoney처럼 실제 받은 결제수단별로 나눕니다."
        )}
      </p>
      {paymentBreakdownData.cashReconcile?.mismatch ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          {tr(
            "salesPaymentCashReconcileMismatch",
            "결산 현금({settlement})과 완료 주문 현금 합({live})이 {diff} 다릅니다. POS 결산(마감)을 열면 주문 기준으로 맞춥니다(มัดจำ이 예전에 섞인 날은 경고하지 않음). 남으면 「현금 맞추기」."
          )
            .replace(
              "{settlement}",
              formatSalesAmount(paymentBreakdownData.cashReconcile.settlementCash)
            )
            .replace(
              "{live}",
              formatSalesAmount(paymentBreakdownData.cashReconcile.liveCash)
            )
            .replace(
              "{diff}",
              formatSalesAmount(Math.abs(paymentBreakdownData.cashReconcile.diff))
            )}
        </div>
      ) : null}
      {paymentChartRows.length > 0 ? (
        <div className="mb-6 rounded-lg border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">
            {tr("salesPaymentMethodSummaryTitle", "결제수단별 매출")}
          </h3>
          <div className="flex flex-wrap items-start gap-6">
            <div className="h-[220px] w-[220px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentChartRows}
                    dataKey="sales"
                    nameKey="axisLabel"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                  >
                    {paymentChartRows.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatSalesAmount(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <table className="min-w-[240px] flex-1 text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 pr-4 text-left">{tr("salesPaymentMethod", "결제수단")}</th>
                  <th className="py-2 text-right">{tr("pL_sales", "매출")}</th>
                </tr>
              </thead>
              <tbody>
                {paymentChartRows.map((r) => (
                  <tr key={r.paymentKey} className="border-b">
                    <td className="py-1.5 pr-4">{r.axisLabel}</td>
                    <td className="py-1.5 text-right font-erp-numeric">
                      {formatSalesAmount(r.sales)}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 pr-4">{tr("salesTotalLabel", "합계")}</td>
                  <td className="py-2 text-right font-erp-numeric">
                    {formatSalesAmount(sumDisplayedSalesAmounts(paymentChartRows))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {sumDisplayedSalesAmounts(deliveryPaymentChannelRows) > 0.005 ||
      sumDisplayedSalesAmounts(creditPaymentChannelRows) > 0.005 ? (
        <p className="mb-4 text-xs text-muted-foreground">
          {tr(
            "salesPaymentBreakdownFootnote",
            "배달·카드 표는 POS 결산에 저장한 breakdown(Visa/Grab 등)을 합산합니다. 결산 전 매장·미연동 건만 LINKPOS 또는 주문 배달액으로 보조합니다."
          )}
        </p>
      ) : null}
      {sumDisplayedSalesAmounts(deliveryPaymentChannelRows) > 0.005 ||
      sumDisplayedSalesAmounts(creditPaymentChannelRows) > 0.005 ? (
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {sumDisplayedSalesAmounts(deliveryPaymentChannelRows) > 0.005 ? (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">
            {tr("salesPaymentBreakdownDeliveryTitle", "Sales Report by Card Type — Delivery")}
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-4 text-left">{tr("salesPaymentMethod", "결제수단")}</th>
                <th className="py-2 text-right">{tr("pL_sales", "매출")}</th>
              </tr>
            </thead>
            <tbody>
              {deliveryPaymentChannelRows.map((r) => (
                <tr key={r.channelKey} className="border-b">
                  <td className="py-1.5 pr-4">{r.axisLabel}</td>
                  <td className="py-1.5 text-right font-erp-numeric">
                    {formatSalesAmount(r.sales)}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2 pr-4">{tr("salesTotalLabel", "합계")}</td>
                <td className="py-2 text-right font-erp-numeric">
                  {formatSalesAmount(sumDisplayedSalesAmounts(deliveryPaymentChannelRows))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        ) : null}
        {sumDisplayedSalesAmounts(creditPaymentChannelRows) > 0.005 ? (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">
            {tr("salesPaymentBreakdownCreditTitle", "Sales Report by Card Type — Credit Card")}
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-4 text-left">{tr("salesPaymentMethod", "결제수단")}</th>
                <th className="py-2 text-right">{tr("pL_sales", "매출")}</th>
              </tr>
            </thead>
            <tbody>
              {creditPaymentChannelRows.map((r) => (
                <tr key={r.channelKey} className="border-b">
                  <td className="py-1.5 pr-4">{r.axisLabel}</td>
                  <td className="py-1.5 text-right font-erp-numeric">
                    {formatSalesAmount(r.sales)}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2 pr-4">{tr("salesTotalLabel", "합계")}</td>
                <td className="py-2 text-right font-erp-numeric">
                  {formatSalesAmount(sumDisplayedSalesAmounts(creditPaymentChannelRows))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        ) : null}
      </div>
      ) : null}
    </>
  )
}
