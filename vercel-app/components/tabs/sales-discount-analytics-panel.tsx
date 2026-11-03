"use client"

import * as React from "react"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
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
import type { SalesDiscountDrillTarget } from "@/components/tabs/sales-discount-drill-sheet"
import {
  SalesSortableTh,
  sortSalesRows,
  useSalesTableSort,
  type SalesSortDir,
} from "@/components/tabs/sales-management-sortable"

type TrFn = (key: string, fallback: string) => string

/** 할인 분석 표 헤더 — 기존 px-3 py-2 유지, 열별 독립 정렬 훅 */
function DiscTh<K extends string>({
  sort,
  k,
  label,
  align = "right",
}: {
  sort: { sortKey: K; sortDir: SalesSortDir; toggleSort: (key: K) => void }
  k: K
  label: React.ReactNode
  align?: "left" | "right"
}) {
  return (
    <SalesSortableTh
      label={label}
      active={sort.sortKey === k}
      dir={sort.sortDir}
      align={align}
      className="!px-3 font-normal"
      onClick={() => sort.toggleSort(k)}
    />
  )
}

type DrillProps = {
  onDrill?: (target: SalesDiscountDrillTarget) => void
  drillHint?: string
}

const DRILLABLE_ROW_CN =
  "cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

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
  onDrill,
  drillHint,
}: {
  data: PosSalesByPromoResult
  menuSearch: string
  setMenuSearch: (v: string) => void
  menuSearchAnd: boolean
  setMenuSearchAnd: (v: boolean) => void
  tr: TrFn
} & DrillProps) {
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
          onDrill={onDrill}
          drillHint={drillHint}
          rows={(data.byKind ?? []).map((k) => ({
            key: k.kind,
            label: promoKindLabel(k.kind, tr),
            col2: formatSalesAmount(k.saleAmount),
            col2Num: k.saleAmount,
            col2Sub: formatSalesPct(k.saleSharePctOfGross),
            discount: k.bundleDiscount,
            pctGross: k.bundleDiscountPctOfGross,
            share: k.bundleDiscountSharePct,
            drillTarget: onDrill
              ? { layer: "bundle" as const, kind: k.kind, label: promoKindLabel(k.kind, tr) }
              : undefined,
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
        <PromoDetailTable rows={data.rows} totals={totals} tr={tr} onDrill={onDrill} drillHint={drillHint} />
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
  onDrill,
  drillHint,
}: {
  data: PosSalesByPromoResult
  menuSearch: string
  setMenuSearch: (v: string) => void
  menuSearchAnd: boolean
  setMenuSearchAnd: (v: boolean) => void
  tr: TrFn
} & DrillProps) {
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
          onDrill={onDrill}
          drillHint={drillHint}
          rows={payment.byKind.map((k) => ({
            key: k.kind,
            label: paymentKindLabel(k.kind, tr),
            col2: `${k.orderCount.toLocaleString()} ${tr("salesOccupancy", "주문건수")}`,
            col2Num: k.orderCount,
            discount: k.discountAmount,
            pctGross: k.discountPctOfGross,
            share: k.discountSharePct,
            drillTarget: onDrill
              ? { layer: "payment" as const, kind: k.kind, label: paymentKindLabel(k.kind, tr) }
              : undefined,
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
        <PaymentDetailTable rows={payment.rows} totals={totals} tr={tr} onDrill={onDrill} drillHint={drillHint} />
      )}
    </>
  )
}

export function SalesCombinedDiscountPanel({
  data,
  tr,
  onDrill,
  drillHint,
}: {
  data: PosSalesByPromoResult
  tr: TrFn
} & DrillProps) {
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
            "세트 할인(홀·포장 프로모·배달앱 플랫폼 세트)과 결제 할인(POS 수동·쿠폰 등)을 비교합니다. 배달앱 API 프로모는 세트 할인 › 배달·플랫폼에 집계됩니다."
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
        <CombinedKindSection byKind={combined.byKind} tr={tr} onDrill={onDrill} drillHint={drillHint} />
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
  onDrill,
  drillHint,
}: {
  tr: TrFn
  rows: {
    key: string
    label: string
    col2: string
    col2Num: number
    col2Sub?: string
    discount: number
    pctGross: number
    share: number
    drillTarget?: SalesDiscountDrillTarget
  }[]
  chartData: { axisLabel: string; value: number }[]
  col2Header: string
  discountHeader: string
  shareHeaderKey: string
  shareHeaderFallback: string
  onDrill?: (target: SalesDiscountDrillTarget) => void
  drillHint?: string
}) {
  const sort = useSalesTableSort<"label" | "col2" | "discount" | "pctGross" | "share">("discount", "desc")
  const sortedRows = sortSalesRows(rows, sort.sortDir, (k) => {
    switch (sort.sortKey) {
      case "label":
        return k.label
      case "col2":
        return k.col2Num
      case "pctGross":
        return k.pctGross
      case "share":
        return k.share
      default:
        return k.discount
    }
  })
  return (
    <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      {onDrill && drillHint ? (
        <p className="text-xs text-muted-foreground lg:col-span-2">{drillHint}</p>
      ) : null}
      <AdminTableScroll className="rounded-md border" hint={false}>
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <DiscTh sort={sort} k="label" align="left" label={tr("salesPromoKindBreakdown", "유형별 분석")} />
              <DiscTh sort={sort} k="col2" label={col2Header} />
              <DiscTh sort={sort} k="discount" label={discountHeader} />
              <DiscTh sort={sort} k="pctGross" label={tr("salesPromoDiscountPctOfGross", "총매출 대비 할인")} />
              <DiscTh sort={sort} k="share" label={tr(shareHeaderKey, shareHeaderFallback)} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((k) => (
              <tr
                key={k.key}
                className={`border-b border-border/60 ${k.drillTarget && onDrill ? DRILLABLE_ROW_CN : ""}`}
                tabIndex={k.drillTarget && onDrill ? 0 : undefined}
                role={k.drillTarget && onDrill ? "button" : undefined}
                onClick={() => {
                  if (k.drillTarget && onDrill) onDrill(k.drillTarget)
                }}
                onKeyDown={(e) => {
                  if (!k.drillTarget || !onDrill) return
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onDrill(k.drillTarget)
                  }
                }}
              >
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
      </AdminTableScroll>
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
  onDrill,
  drillHint,
}: {
  rows: PosSalesPromoRow[]
  totals: PosSalesByPromoResult["totals"]
  tr: TrFn
  onDrill?: (target: SalesDiscountDrillTarget) => void
  drillHint?: string
}) {
  const sort = useSalesTableSort<
    "name" | "code" | "kind" | "qty" | "regular" | "sale" | "discount" | "pct" | "pctGross"
  >("discount", "desc")
  const sortedRows = sortSalesRows(rows, sort.sortDir, (r) => {
    switch (sort.sortKey) {
      case "name":
        return r.name
      case "code":
        return r.promoCode || r.promoId || ""
      case "kind":
        return promoKindLabel(r.kind, tr)
      case "qty":
        return r.qty
      case "regular":
        return r.regularAmount
      case "sale":
        return r.saleAmount
      case "pct":
        // "—" 표시 행은 항상 맨 아래
        return r.regularAmount > 0
          ? r.discountPct
          : sort.sortDir === "asc"
            ? Number.MAX_VALUE
            : -Number.MAX_VALUE
      case "pctGross":
        return r.discountPctOfGross
      default:
        return r.bundleDiscount
    }
  })
  return (
    <div>
      {onDrill && drillHint ? (
        <p className="mb-2 text-xs text-muted-foreground">{drillHint}</p>
      ) : null}
      <AdminTableScroll className="rounded-md border" hint={false}>
      <table className="w-full min-w-[1040px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-muted-foreground">
            <DiscTh sort={sort} k="name" align="left" label={tr("salesMenu", "메뉴")} />
            <DiscTh sort={sort} k="code" align="left" label={tr("salesPromoCode", "프로모 코드")} />
            <DiscTh sort={sort} k="kind" align="left" label={tr("salesDiscountKindColumn", "유형")} />
            <DiscTh sort={sort} k="qty" label={tr("salesQuantity", "수량")} />
            <DiscTh sort={sort} k="regular" label={tr("salesPromoRegularAmount", "정가 합계")} />
            <DiscTh sort={sort} k="sale" label={tr("salesPromoSaleAmount", "판매액")} />
            <DiscTh sort={sort} k="discount" label={tr("salesPromoBundleDiscount", "세트 할인")} />
            <DiscTh sort={sort} k="pct" label={tr("salesPromoDiscountPct", "할인율")} />
            <DiscTh sort={sort} k="pctGross" label={tr("salesPromoDiscountPctOfGross", "총매출 대비 할인")} />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r) => (
            <tr
              key={r.key}
              className={`border-b border-border/60 ${onDrill ? DRILLABLE_ROW_CN : ""}`}
              tabIndex={onDrill ? 0 : undefined}
              role={onDrill ? "button" : undefined}
              onClick={() => {
                if (!onDrill) return
                onDrill({
                  layer: "bundle",
                  kind: r.kind,
                  rowKey: r.key,
                  label: r.name || r.promoCode || promoKindLabel(r.kind, tr),
                })
              }}
              onKeyDown={(e) => {
                if (!onDrill) return
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onDrill({
                    layer: "bundle",
                    kind: r.kind,
                    rowKey: r.key,
                    label: r.name || r.promoCode || promoKindLabel(r.kind, tr),
                  })
                }
              }}
            >
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
      </AdminTableScroll>
    </div>
  )
}

function PaymentDetailTable({
  rows,
  totals,
  tr,
  onDrill,
  drillHint,
}: {
  rows: PosSalesPaymentDiscountRow[]
  totals: NonNullable<PosSalesByPromoResult["payment"]>["totals"]
  tr: TrFn
  onDrill?: (target: SalesDiscountDrillTarget) => void
  drillHint?: string
}) {
  const sort = useSalesTableSort<"reason" | "code" | "kind" | "orders" | "discount" | "pctGross" | "share">(
    "discount",
    "desc"
  )
  const sortedRows = sortSalesRows(rows, sort.sortDir, (r) => {
    switch (sort.sortKey) {
      case "reason":
        return paymentDiscountRowLabel(r, tr)
      case "code":
        return r.code || ""
      case "kind":
        return paymentKindLabel(r.kind, tr)
      case "orders":
        return r.orderCount
      case "pctGross":
        return r.discountPctOfGross
      case "share":
        return r.discountSharePct
      default:
        return r.discountAmount
    }
  })
  return (
    <div>
      {onDrill && drillHint ? (
        <p className="mb-2 text-xs text-muted-foreground">{drillHint}</p>
      ) : null}
      <AdminTableScroll className="rounded-md border" hint={false}>
      <table className="w-full min-w-[920px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-muted-foreground">
            <DiscTh sort={sort} k="reason" align="left" label={tr("salesPaymentDiscountReason", "할인 사유")} />
            <DiscTh sort={sort} k="code" align="left" label={tr("salesPromoCode", "프로모 코드")} />
            <DiscTh sort={sort} k="kind" align="left" label={tr("salesDiscountKindColumn", "유형")} />
            <DiscTh sort={sort} k="orders" label={tr("salesOccupancy", "주문건수")} />
            <DiscTh sort={sort} k="discount" label={tr("salesPromoPaymentDiscount", "결제 할인")} />
            <DiscTh sort={sort} k="pctGross" label={tr("salesPromoDiscountPctOfGross", "총매출 대비 할인")} />
            <DiscTh sort={sort} k="share" label={tr("salesPaymentDiscountShare", "할인 비중")} />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r) => (
            <tr
              key={r.key}
              className={`border-b border-border/60 ${onDrill ? DRILLABLE_ROW_CN : ""}`}
              tabIndex={onDrill ? 0 : undefined}
              role={onDrill ? "button" : undefined}
              onClick={() => {
                if (!onDrill) return
                onDrill({
                  layer: "payment",
                  kind: r.kind,
                  rowKey: r.key,
                  label: paymentDiscountRowLabel(r, tr),
                })
              }}
              onKeyDown={(e) => {
                if (!onDrill) return
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onDrill({
                    layer: "payment",
                    kind: r.kind,
                    rowKey: r.key,
                    label: paymentDiscountRowLabel(r, tr),
                  })
                }
              }}
            >
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
      </AdminTableScroll>
    </div>
  )
}

export function CombinedKindSection({
  byKind,
  tr,
  onDrill,
  drillHint,
}: {
  byKind: PosSalesCombinedKindTotals[]
  tr: TrFn
  onDrill?: (target: SalesDiscountDrillTarget) => void
  drillHint?: string
}) {
  const sort = useSalesTableSort<"layer" | "kind" | "discount" | "pctGross" | "share">("discount", "desc")
  const sortedByKind = sortSalesRows(byKind, sort.sortDir, (k) => {
    switch (sort.sortKey) {
      case "layer":
        return combinedLayerLabel(k.layer, tr)
      case "kind":
        return combinedKindLabel(k, tr)
      case "pctGross":
        return k.discountPctOfGross
      case "share":
        return k.discountSharePct
      default:
        return k.discountAmount
    }
  })
  return (
    <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      {onDrill && drillHint ? (
        <p className="text-xs text-muted-foreground lg:col-span-2">{drillHint}</p>
      ) : null}
      <AdminTableScroll className="rounded-md border" hint={false}>
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <DiscTh sort={sort} k="layer" align="left" label={tr("salesCombinedDiscountLayer", "할인 층")} />
              <DiscTh sort={sort} k="kind" align="left" label={tr("salesPromoKindBreakdown", "유형별 분석")} />
              <DiscTh sort={sort} k="discount" label={tr("salesPromoTotalDiscount", "할인 합계")} />
              <DiscTh sort={sort} k="pctGross" label={tr("salesPromoDiscountPctOfGross", "총매출 대비 할인")} />
              <DiscTh sort={sort} k="share" label={tr("salesPaymentDiscountShare", "할인 비중")} />
            </tr>
          </thead>
          <tbody>
            {sortedByKind.map((k, idx) => (
              <tr
                key={`${k.layer}-${k.kind}-${idx}`}
                className={`border-b border-border/60 ${onDrill ? DRILLABLE_ROW_CN : ""}`}
                tabIndex={onDrill ? 0 : undefined}
                role={onDrill ? "button" : undefined}
                onClick={() => {
                  if (!onDrill) return
                  onDrill({
                    layer: k.layer === "payment" ? "payment" : "bundle",
                    kind: k.kind,
                    label: combinedKindLabel(k, tr),
                  })
                }}
                onKeyDown={(e) => {
                  if (!onDrill) return
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onDrill({
                      layer: k.layer === "payment" ? "payment" : "bundle",
                      kind: k.kind,
                      label: combinedKindLabel(k, tr),
                    })
                  }
                }}
              >
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
      </AdminTableScroll>
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
