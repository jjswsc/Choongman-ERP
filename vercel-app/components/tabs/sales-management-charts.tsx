"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ADMIN_CHART_COLORS, ADMIN_PANEL_WARNING_CN } from "@/lib/admin-ui-standards"
import type { PosSalesPaymentTenderGapItem } from "@/lib/pos-sales-payment-tender-gap"
import { formatSalesAmount } from "./sales-management-shared"

export type PeriodTrendChartRow = { axisLabel: string; sales: number }

export function SalesPaymentTenderGapAlert({
  gaps,
  tr,
  maxRows = 8,
}: {
  gaps: PosSalesPaymentTenderGapItem[]
  tr: (key: string, fallback: string) => string
  maxRows?: number
}) {
  if (gaps.length === 0) return null
  const shown = gaps.slice(0, maxRows)
  const rest = gaps.length - shown.length
  return (
    <div className={`mb-3 ${ADMIN_PANEL_WARNING_CN}`} role="status">
      <p className="font-medium">
        {tr(
          "salesPaymentTenderGapWarning",
          "매출액과 결제수단 합계가 맞지 않는 기간이 있습니다. POS 영수증 관리에서 결제 미기록·서비스(컴) 주문을 확인·정정하세요."
        )}
      </p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs leading-relaxed">
        {shown.map((g) => (
          <li key={`${g.storeCode ?? ""}\t${g.key}`}>
            {g.storeLabel ? `${g.storeLabel} · ` : ""}
            {g.label}: {tr("salesAmount", "매출액")} {formatSalesAmount(g.total)} −{" "}
            {tr("salesPaymentTenderSum", "결제 합계")} {formatSalesAmount(g.tenderSum)} ={" "}
            <span className="font-erp-numeric font-semibold">{formatSalesAmount(g.gap)}</span>
          </li>
        ))}
      </ul>
      {rest > 0 ? (
        <p className="mt-1 text-xs">
          {tr("salesPaymentTenderGapMore", "외 {n}건").replace("{n}", String(rest))}
        </p>
      ) : null}
      <p className="mt-1.5 text-[11px] opacity-90">
        {tr(
          "salesPaymentTenderGapHint",
          "진단 SQL: vercel-app/sql/pos_sales_payment_tender_gap_diagnostic.sql · API: POST /api/correctPosOrderPayment"
        )}
      </p>
    </div>
  )
}

export function SalesPeriodTrendChartBlock({
  rows,
  periodBarXAxisProps,
  periodChartYAxisProps,
  tr,
  showFootnote = true,
}: {
  rows: PeriodTrendChartRow[]
  periodBarXAxisProps: Record<string, unknown>
  periodChartYAxisProps: { tick: { fontSize: number }; tickFormatter: (v: number) => string }
  tr: (key: string, fallback: string) => string
  showFootnote?: boolean
}) {
  if (rows.length === 0) return null
  return (
    <div className="mb-4">
      <p className="mb-2 text-sm font-medium">{tr("salesPeriodTrendChartLabel", "매출 추이 (집계 기간)")}</p>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="axisLabel" {...periodBarXAxisProps} />
            <YAxis {...periodChartYAxisProps} />
            <Tooltip formatter={(v: number) => [formatSalesAmount(v), tr("pL_sales", "매출")]} />
            <Bar dataKey="sales" fill={ADMIN_CHART_COLORS[0]} name={tr("pL_sales", "매출")} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {showFootnote ? (
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          {tr(
            "salesTopicPeriodTrendFootnote",
            "상단 막대 차트는「집계 기간」기준 추이입니다. 아래 표·파이·상세는 선택한 날짜 범위 전체 합계입니다."
          )}
        </p>
      ) : null}
    </div>
  )
}

export const SALES_CHART_COLORS = [...ADMIN_CHART_COLORS]
