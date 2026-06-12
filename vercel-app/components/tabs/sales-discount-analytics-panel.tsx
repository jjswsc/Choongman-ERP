"use client"

import * as React from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { ADMIN_PANEL_WARNING_CN } from "@/lib/admin-ui-standards"
import {
  combinedKindLabel,
  combinedLayerLabel,
  paymentDiscountRowLabel,
  paymentKindLabel,
  promoKindLabel,
} from "@/lib/sales-discount-analytics-labels"
import type {
  PosSalesByPromoResult,
  PosSalesCombinedDiscountResult,
  PosSalesCombinedKindTotals,
  PosSalesPaymentDiscountRow,
  PosSalesPromoRow,
} from "@/lib/api-client"

type TrFn = (key: string, fallback: string) => string

function formatSalesAmount(n: number) {
  const v = Number(n ?? 0)
  if (!Number.isFinite(v)) return "0"
  return Math.round(v).toLocaleString()
}

function formatSalesPct(n: number) {
  const v = Number(n ?? 0)
  if (!Number.isFinite(v)) return "0.0%"
  return `${v.toFixed(1)}%`
}

type SearchProps = {
  menuSearch: string
  setMenuSearch: (v: string) => void
  menuSearchAnd: boolean
  setMenuSearchAnd: (v: boolean) => void
  tr: TrFn
}

function DiscountSearchBar({
  menuSearch,
  setMenuSearch,
  menuSearchAnd,
  setMenuSearchAnd,
  tr,
  placeholderKey,
  placeholderFallback,
}: SearchProps & { placeholderKey: string; placeholderFallback: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Input
        placeholder={tr(placeholderKey, placeholderFallback)}
        value={menuSearch}
        onChange={(e) => setMenuSearch(e.target.value)}
        className="w-48 min-w-[12rem]"
      />
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox checked={menuSearchAnd} onCheckedChange={(c) => setMenuSearchAnd(c === true)} />
        <span>{tr("salesMenuSearchAndMode", "검색어 모두 포함 (AND)")}</span>
      </label>
    </div>
  )
}

function KindBreakdownChart({
  data,
  tr,
  valueKey,
  valueLabelKey,
  valueLabelFallback,
}: {
  data: { axisLabel: string; value: number }[]
  tr: TrFn
  valueKey?: string
  valueLabelKey: string
  valueLabelFallback: string
}) {
  if (data.length === 0) return null
  return (
    <div className="h-[220px] rounded-md border p-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="axisLabel" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatSalesAmount(v)} />
          <Tooltip
            formatter={(v: number) => [
              formatSalesAmount(v),
              tr(valueLabelKey, valueLabelFallback),
            ]}
          />
          <Bar dataKey={valueKey ?? "value"} fill="#e11d48" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function SalesPromoBundleDiscountPanel({
  data,
  menuSearch,
  setMenuSearch,
  menuSearchAnd,
  setMenuSearchAnd,
  tr,
}: {
  data: PosSalesByPromoResult
  menuSearch: string
  setMenuSearch: (v: string) => void
  menuSearchAnd: boolean
  setMenuSearchAnd: (v: boolean) => void
  tr: TrFn
}) {
  const totals = data.totals
  return (
    <>
      <div className="mb-4 rounded-lg border bg-muted/20 p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">
            {tr("salesBundleDiscountAnalyticsTitle", "세트 할인 영향 분석")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {tr("salesPromoOrderCount", "완료 주문")}: {totals.periodOrderCount.toLocaleString()}
          </p>
        </div>
        <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
          {tr(
            "salesBundleDiscountAnalyticsHint",
            "세트·프로모 줄의 정가 대비 판매가 차이(세트 할인)만 집계합니다. 결제 할인은 「결제 할인」리포트를 보세요."
          )}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label={tr("salesPromoPeriodGrossSales", "기간 총매출")} value={formatSalesAmount(totals.periodGrossSales)} />
          <MetricCard
            label={tr("salesPromoLineSaleShare", "세트 판매 비중")}
            value={formatSalesPct(totals.promoLineSaleSharePct)}
            sub={formatSalesAmount(totals.saleAmount)}
          />
          <MetricCard
            label={tr("salesPromoBundleDiscount", "세트 할인")}
            value={`-${formatSalesAmount(totals.bundleDiscount)}`}
            sub={`${tr("salesPromoDiscountPctOfGross", "총매출 대비 할인")}: ${formatSalesPct(totals.bundleDiscountPctOfGross)}`}
            accent="rose"
            highlight
          />
          <MetricCard
            label={tr("salesPromoSaleQty", "세트 판매 수량")}
            value={totals.qty.toLocaleString()}
            sub={`${tr("salesPromoRegularAmount", "정가 합계")}: ${formatSalesAmount(totals.regularAmount)}`}
          />
        </div>
      </div>
      {(data.byKind ?? []).length > 0 ? (
        <KindTableChart
          tr={tr}
          rows={(data.byKind ?? []).map((k) => ({
            key: k.kind,
            label: promoKindLabel(k.kind, tr),
            col2: formatSalesAmount(k.saleAmount),
            col2Sub: formatSalesPct(k.saleSharePctOfGross),
            discount: k.bundleDiscount,
            pctGross: k.bundleDiscountPctOfGross,
            share: k.bundleDiscountSharePct,
          }))}
          chartData={(data.byKind ?? []).map((k) => ({
            axisLabel: promoKindLabel(k.kind, tr),
            value: k.bundleDiscount,
          }))}
          col2Header={tr("salesPromoSaleAmount", "판매액")}
          discountHeader={tr("salesPromoBundleDiscount", "세트 할인")}
          shareHeaderKey="salesPromoBundleDiscountShare"
          shareHeaderFallback="세트 할인 비중"
        />
      ) : null}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label={tr("salesPromoRegularAmount", "정가 합계")} value={formatSalesAmount(totals.regularAmount)} compact />
        <MetricCard label={tr("salesPromoSaleAmount", "판매액")} value={formatSalesAmount(totals.saleAmount)} compact />
        <MetricCard
          label={tr("salesPromoDiscountPct", "할인율")}
          value={
            totals.regularAmount > 0
              ? formatSalesPct((totals.bundleDiscount / totals.regularAmount) * 100)
              : "—"
          }
          sub={`${tr("salesPromoBundleDiscount", "세트 할인")} / ${tr("salesPromoRegularAmount", "정가 합계")}`}
          compact
        />
      </div>
      {(totals.estimatedLineQty > 0 || totals.unresolvedLineQty > 0) && (
        <p className="mb-3 text-xs text-muted-foreground">
          {totals.estimatedLineQty > 0
            ? `${tr("salesPromoEstimatedQty", "추정 정가 줄")}: ${totals.estimatedLineQty.toLocaleString()} · `
            : ""}
          {totals.unresolvedLineQty > 0
            ? `${tr("salesPromoUnresolvedQty", "정가 미산출")}: ${totals.unresolvedLineQty.toLocaleString()}`
            : ""}
        </p>
      )}
      <DiscountSearchBar
        menuSearch={menuSearch}
        setMenuSearch={setMenuSearch}
        menuSearchAnd={menuSearchAnd}
        setMenuSearchAnd={setMenuSearchAnd}
        tr={tr}
        placeholderKey="salesPromoMenuSearch"
        placeholderFallback="메뉴·프로모 검색"
      />
      {data.rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {tr("salesNoSalesData", "해당 기간 매출 데이터가 없습니다.")}
        </p>
      ) : (
        <PromoDetailTable rows={data.rows} totals={totals} tr={tr} />
      )}
      <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
        {tr(
          "salesPromoBundleFootnote",
          "정가는 주문 promoRegularPrice 스냅샷(신규 주문) 또는 promoItems·DB 구성 역산(과거 주문)입니다."
        )}
      </p>
    </>
  )
}

export function SalesPaymentDiscountPanel({
  data,
  menuSearch,
  setMenuSearch,
  menuSearchAnd,
  setMenuSearchAnd,
  tr,
}: {
  data: PosSalesByPromoResult
  menuSearch: string
  setMenuSearch: (v: string) => void
  menuSearchAnd: boolean
  setMenuSearchAnd: (v: boolean) => void
  tr: TrFn
}) {
  const payment = data.payment!
  const totals = payment.totals
  return (
    <>
      <div className="mb-4 rounded-lg border bg-muted/20 p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">
            {tr("salesPaymentDiscountAnalyticsTitle", "결제 할인 영향 분석")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {tr("salesPromoOrderCount", "완료 주문")}: {totals.periodOrderCount.toLocaleString()}
          </p>
        </div>
        <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
          {tr(
            "salesPaymentDiscountAnalyticsHint",
            "수동·협업·쿠폰·배달앱 할인 등 결제 시점 할인입니다. 세트 내재 할인(정가 대비 판매가)과는 별도 층입니다."
          )}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label={tr("salesPromoPeriodGrossSales", "기간 총매출")} value={formatSalesAmount(totals.periodGrossSales)} />
          <MetricCard
            label={tr("salesPaymentDiscountOrderShare", "할인 주문 비중")}
            value={formatSalesPct(
              totals.periodOrderCount > 0
                ? (totals.orderCountWithDiscount / totals.periodOrderCount) * 100
                : 0
            )}
            sub={`${totals.orderCountWithDiscount.toLocaleString()} ${tr("salesOccupancy", "주문건수")}`}
          />
          <MetricCard
            label={tr("salesPromoPaymentDiscount", "결제 할인")}
            value={`-${formatSalesAmount(totals.discountAmount)}`}
            sub={`${tr("salesPromoDiscountPctOfGross", "총매출 대비 할인")}: ${formatSalesPct(totals.discountPctOfGross)}`}
            accent="rose"
            highlight
          />
          <MetricCard
            label={tr("salesPaymentDiscountKindCount", "할인 유형")}
            value={String(payment.byKind.length)}
            sub={tr("salesPaymentDiscountKindCountHint", "수동·협업·쿠폰·플랫폼 등")}
          />
        </div>
      </div>
      {payment.byKind.length > 0 ? (
        <KindTableChart
          tr={tr}
          rows={payment.byKind.map((k) => ({
            key: k.kind,
            label: paymentKindLabel(k.kind, tr),
            col2: `${k.orderCount.toLocaleString()} ${tr("salesOccupancy", "주문건수")}`,
            discount: k.discountAmount,
            pctGross: k.discountPctOfGross,
            share: k.discountSharePct,
          }))}
          chartData={payment.byKind.map((k) => ({
            axisLabel: paymentKindLabel(k.kind, tr),
            value: k.discountAmount,
          }))}
          col2Header={tr("salesOccupancy", "주문건수")}
          discountHeader={tr("salesPromoPaymentDiscount", "결제 할인")}
          shareHeaderKey="salesPaymentDiscountShare"
          shareHeaderFallback="할인 비중"
        />
      ) : null}
      <DiscountSearchBar
        menuSearch={menuSearch}
        setMenuSearch={setMenuSearch}
        menuSearchAnd={menuSearchAnd}
        setMenuSearchAnd={setMenuSearchAnd}
        tr={tr}
        placeholderKey="salesPaymentDiscountSearch"
        placeholderFallback="사유·쿠폰 코드 검색"
      />
      {payment.rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {tr("salesPaymentDiscountEmpty", "해당 기간 결제 할인 데이터가 없습니다.")}
        </p>
      ) : (
        <PaymentDetailTable rows={payment.rows} totals={totals} tr={tr} />
      )}
    </>
  )
}

export function SalesCombinedDiscountPanel({
  data,
  tr,
}: {
  data: PosSalesByPromoResult
  tr: TrFn
}) {
  const combined = data.combined!
  const totals = combined.totals
  return (
    <>
      <div className="mb-4 rounded-lg border bg-muted/20 p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">
            {tr("salesCombinedDiscountAnalyticsTitle", "통합 할인 영향 분석")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {tr("salesPromoOrderCount", "완료 주문")}: {totals.periodOrderCount.toLocaleString()}
          </p>
        </div>
        <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
          {tr(
            "salesCombinedDiscountAnalyticsHint",
            "세트 할인과 결제 할인을 한 화면에서 비교합니다. 합산 %는 참고 지표이며, 두 할인은 서로 다른 층입니다."
          )}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label={tr("salesPromoPeriodGrossSales", "기간 총매출")} value={formatSalesAmount(totals.periodGrossSales)} />
          <MetricCard
            label={tr("salesPromoBundleDiscount", "세트 할인")}
            value={`-${formatSalesAmount(totals.bundleDiscount)}`}
            sub={formatSalesPct(totals.bundleDiscountPctOfGross)}
            accent="rose"
          />
          <MetricCard
            label={tr("salesPromoPaymentDiscount", "결제 할인")}
            value={`-${formatSalesAmount(totals.paymentDiscount)}`}
            sub={formatSalesPct(totals.paymentDiscountPctOfGross)}
            accent="rose"
          />
          <MetricCard
            label={tr("salesPromoTotalDiscount", "할인 합계")}
            value={`-${formatSalesAmount(totals.totalDiscount)}`}
            sub={formatSalesPct(totals.totalDiscountPctOfGross)}
            highlight
          />
        </div>
      </div>
      {combined.byKind.length > 0 ? (
        <CombinedKindSection byKind={combined.byKind} tr={tr} />
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {tr("salesNoSalesData", "해당 기간 매출 데이터가 없습니다.")}
        </p>
      )}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <MetricCard
          label={tr("salesPromoLineSaleShare", "세트 판매 비중")}
          value={formatSalesPct(totals.promoLineSaleSharePct)}
          sub={formatSalesAmount(totals.promoLineSaleAmount)}
          compact
        />
        <MetricCard
          label={tr("salesPaymentDiscountOrderShare", "할인 주문 비중")}
          value={formatSalesPct(totals.paymentOrderSharePct)}
          compact
        />
      </div>
    </>
  )
}

function MetricCard({
  label,
  value,
  sub,
  foot,
  accent,
  highlight,
  compact,
}: {
  label: string
  value: string
  sub?: string
  foot?: string
  accent?: "rose"
  highlight?: boolean
  compact?: boolean
}) {
  const cn = highlight
    ? "rounded-lg border-2 border-rose-200 bg-rose-50/50 p-3 dark:border-rose-900 dark:bg-rose-950/20"
    : "rounded-lg border bg-card p-3"
  const valueCn =
    accent === "rose"
      ? `mt-1 ${compact ? "text-base" : "text-lg"} font-bold font-erp-numeric text-rose-700 dark:text-rose-300`
      : `mt-1 ${compact ? "text-base" : "text-lg"} font-bold font-erp-numeric`
  return (
    <div className={cn}>
      <p className={`text-xs ${highlight ? "font-medium text-rose-800 dark:text-rose-200" : "text-muted-foreground"}`}>
        {label}
      </p>
      <p className={valueCn}>{value}</p>
      {sub ? <p className="mt-1 text-[10px] text-muted-foreground font-erp-numeric">{sub}</p> : null}
      {foot ? <p className="mt-1 text-[10px] text-muted-foreground leading-snug">{foot}</p> : null}
    </div>
  )
}

function KindTableChart({
  tr,
  rows,
  chartData,
  col2Header,
  discountHeader,
  shareHeaderKey,
  shareHeaderFallback,
}: {
  tr: TrFn
  rows: {
    key: string
    label: string
    col2: string
    col2Sub?: string
    discount: number
    pctGross: number
    share: number
  }[]
  chartData: { axisLabel: string; value: number }[]
  col2Header: string
  discountHeader: string
  shareHeaderKey: string
  shareHeaderFallback: string
}) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <th className="px-3 py-2 text-left">{tr("salesPromoKindBreakdown", "유형별 분석")}</th>
              <th className="px-3 py-2 text-right">{col2Header}</th>
              <th className="px-3 py-2 text-right">{discountHeader}</th>
              <th className="px-3 py-2 text-right">{tr("salesPromoDiscountPctOfGross", "총매출 대비 할인")}</th>
              <th className="px-3 py-2 text-right">
                {tr(shareHeaderKey, shareHeaderFallback)}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((k) => (
              <tr key={k.key} className="border-b border-border/60">
                <td className="px-3 py-1.5 font-medium">{k.label}</td>
                <td className="px-3 py-1.5 text-right font-erp-numeric">
                  {k.col2}
                  {k.col2Sub ? (
                    <span className="ml-1 text-[10px] text-muted-foreground">({k.col2Sub})</span>
                  ) : null}
                </td>
                <td className="px-3 py-1.5 text-right font-erp-numeric text-rose-700 dark:text-rose-300">
                  -{formatSalesAmount(k.discount)}
                </td>
                <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesPct(k.pctGross)}</td>
                <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesPct(k.share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <KindBreakdownChart
        data={chartData}
        tr={tr}
        valueLabelKey="salesPromoBundleDiscount"
        valueLabelFallback="할인"
      />
    </div>
  )
}

function PromoDetailTable({
  rows,
  totals,
  tr,
}: {
  rows: PosSalesPromoRow[]
  totals: PosSalesByPromoResult["totals"]
  tr: TrFn
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[1040px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-muted-foreground">
            <th className="px-3 py-2 text-left">{tr("salesMenu", "메뉴")}</th>
            <th className="px-3 py-2 text-left">{tr("salesPromoCode", "프로모 코드")}</th>
            <th className="px-3 py-2 text-left">{tr("salesDiscountKindColumn", "유형")}</th>
            <th className="px-3 py-2 text-right">{tr("salesQuantity", "수량")}</th>
            <th className="px-3 py-2 text-right">{tr("salesPromoRegularAmount", "정가 합계")}</th>
            <th className="px-3 py-2 text-right">{tr("salesPromoSaleAmount", "판매액")}</th>
            <th className="px-3 py-2 text-right">{tr("salesPromoBundleDiscount", "세트 할인")}</th>
            <th className="px-3 py-2 text-right">{tr("salesPromoDiscountPct", "할인율")}</th>
            <th className="px-3 py-2 text-right">{tr("salesPromoDiscountPctOfGross", "총매출 대비 할인")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border/60">
              <td className="px-3 py-1.5">{r.name}</td>
              <td className="px-3 py-1.5 font-mono text-xs">{r.promoCode || r.promoId || "—"}</td>
              <td className="px-3 py-1.5 text-xs">{promoKindLabel(r.kind, tr)}</td>
              <td className="px-3 py-1.5 text-right font-erp-numeric">{r.qty.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.regularAmount)}</td>
              <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.saleAmount)}</td>
              <td className="px-3 py-1.5 text-right font-erp-numeric text-rose-700 dark:text-rose-300">
                {formatSalesAmount(r.bundleDiscount)}
              </td>
              <td className="px-3 py-1.5 text-right font-erp-numeric">
                {r.regularAmount > 0 ? `${r.discountPct.toFixed(1)}%` : "—"}
              </td>
              <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesPct(r.discountPctOfGross)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/20 font-medium">
            <td className="px-3 py-2" colSpan={3}>
              {tr("salesTotal", "합계")}
            </td>
            <td className="px-3 py-2 text-right font-erp-numeric">{totals.qty.toLocaleString()}</td>
            <td className="px-3 py-2 text-right font-erp-numeric">{formatSalesAmount(totals.regularAmount)}</td>
            <td className="px-3 py-2 text-right font-erp-numeric">{formatSalesAmount(totals.saleAmount)}</td>
            <td className="px-3 py-2 text-right font-erp-numeric">{formatSalesAmount(totals.bundleDiscount)}</td>
            <td className="px-3 py-2 text-right font-erp-numeric">
              {totals.regularAmount > 0
                ? formatSalesPct((totals.bundleDiscount / totals.regularAmount) * 100)
                : "—"}
            </td>
            <td className="px-3 py-2 text-right font-erp-numeric">
              {formatSalesPct(totals.bundleDiscountPctOfGross)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function PaymentDetailTable({
  rows,
  totals,
  tr,
}: {
  rows: PosSalesPaymentDiscountRow[]
  totals: NonNullable<PosSalesByPromoResult["payment"]>["totals"]
  tr: TrFn
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[920px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-muted-foreground">
            <th className="px-3 py-2 text-left">{tr("salesPaymentDiscountReason", "할인 사유")}</th>
            <th className="px-3 py-2 text-left">{tr("salesPromoCode", "프로모 코드")}</th>
            <th className="px-3 py-2 text-left">{tr("salesDiscountKindColumn", "유형")}</th>
            <th className="px-3 py-2 text-right">{tr("salesOccupancy", "주문건수")}</th>
            <th className="px-3 py-2 text-right">{tr("salesPromoPaymentDiscount", "결제 할인")}</th>
            <th className="px-3 py-2 text-right">{tr("salesPromoDiscountPctOfGross", "총매출 대비 할인")}</th>
            <th className="px-3 py-2 text-right">{tr("salesPaymentDiscountShare", "할인 비중")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border/60">
              <td className="px-3 py-1.5">{paymentDiscountRowLabel(r, tr)}</td>
              <td className="px-3 py-1.5 font-mono text-xs">{r.code || "—"}</td>
              <td className="px-3 py-1.5 text-xs">{paymentKindLabel(r.kind, tr)}</td>
              <td className="px-3 py-1.5 text-right font-erp-numeric">{r.orderCount.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right font-erp-numeric text-rose-700 dark:text-rose-300">
                -{formatSalesAmount(r.discountAmount)}
              </td>
              <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesPct(r.discountPctOfGross)}</td>
              <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesPct(r.discountSharePct)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/20 font-medium">
            <td className="px-3 py-2" colSpan={3}>
              {tr("salesTotal", "합계")}
            </td>
            <td className="px-3 py-2 text-right font-erp-numeric">
              {totals.orderCountWithDiscount.toLocaleString()}
            </td>
            <td className="px-3 py-2 text-right font-erp-numeric">-{formatSalesAmount(totals.discountAmount)}</td>
            <td className="px-3 py-2 text-right font-erp-numeric">{formatSalesPct(totals.discountPctOfGross)}</td>
            <td className="px-3 py-2" />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export function CombinedKindSection({
  byKind,
  tr,
}: {
  byKind: PosSalesCombinedKindTotals[]
  tr: TrFn
}) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <th className="px-3 py-2 text-left">{tr("salesCombinedDiscountLayer", "할인 층")}</th>
              <th className="px-3 py-2 text-left">{tr("salesPromoKindBreakdown", "유형별 분석")}</th>
              <th className="px-3 py-2 text-right">{tr("salesPromoTotalDiscount", "할인 합계")}</th>
              <th className="px-3 py-2 text-right">{tr("salesPromoDiscountPctOfGross", "총매출 대비 할인")}</th>
              <th className="px-3 py-2 text-right">{tr("salesPaymentDiscountShare", "할인 비중")}</th>
            </tr>
          </thead>
          <tbody>
            {byKind.map((k, idx) => (
              <tr key={`${k.layer}-${k.kind}-${idx}`} className="border-b border-border/60">
                <td className="px-3 py-1.5 text-xs">{combinedLayerLabel(k.layer, tr)}</td>
                <td className="px-3 py-1.5 font-medium">{combinedKindLabel(k, tr)}</td>
                <td className="px-3 py-1.5 text-right font-erp-numeric text-rose-700 dark:text-rose-300">
                  -{formatSalesAmount(k.discountAmount)}
                </td>
                <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesPct(k.discountPctOfGross)}</td>
                <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesPct(k.discountSharePct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <KindBreakdownChart
        data={byKind.map((k) => ({
          axisLabel: `${combinedLayerLabel(k.layer, tr)} · ${combinedKindLabel(k, tr)}`,
          value: k.discountAmount,
        }))}
        tr={tr}
        valueLabelKey="salesPromoTotalDiscount"
        valueLabelFallback="할인"
      />
    </div>
  )
}

/** 경영 손익 분석 등 — 통합 할인 byKind 테이블·차트만 embed */
export function SalesCombinedDiscountEmbed({
  combined,
  tr,
}: {
  combined: PosSalesCombinedDiscountResult
  tr: TrFn
}) {
  if (!combined.byKind.length) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        {tr("salesNoSalesData", "해당 기간 매출 데이터가 없습니다.")}
      </p>
    )
  }
  return <CombinedKindSection byKind={combined.byKind} tr={tr} />
}

export function SalesDiscountAnalyticsShell({
  truncated,
  tr,
  children,
}: {
  truncated?: boolean
  tr: TrFn
  children: React.ReactNode
}) {
  return (
    <>
      {truncated ? (
        <p className={`mb-3 ${ADMIN_PANEL_WARNING_CN}`} role="status">
          {tr(
            "salesDataTruncatedWarning",
            "조회 기간 내 주문이 많아 일부만 반영했을 수 있습니다. 기간을 나누어 조회해 보세요."
          )}
        </p>
      ) : null}
      {children}
    </>
  )
}
