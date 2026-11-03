"use client"

import * as React from "react"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import type {
  ForecastHorizon,
  MomDayCompareRow,
  MomStoreChannelCompareRow,
  MomStoreCompareRow,
  MomStoreDriver,
  SalesForecastSummary,
  YoyMonthCompareRow,
  YoyStoreCompareRow,
} from "@/lib/pos-sales-forecast-compare"
import {
  sumMomDayMetrics,
  sumMomStoreMetrics,
  sumYoyMonthMetrics,
  sumYoyStoreMetrics,
} from "@/lib/pos-sales-forecast-compare"
import { Button } from "@/components/ui/button"
import {
  SalesSortableTh,
  sortSalesRows,
  useSalesTableSort,
  type SalesSortDir,
} from "@/components/tabs/sales-management-sortable"

type TrFn = (key: string, fallback: string) => string

type CmpSort = {
  sortKey: string
  sortDir: SalesSortDir
  toggleSort: (key: string) => void
}

/** null/비유한 값은 정렬 방향과 무관하게 항상 맨 아래 */
function numOrLast(v: number | null | undefined, dir: SalesSortDir): number {
  if (v == null || !Number.isFinite(v)) return dir === "asc" ? Number.MAX_VALUE : -Number.MAX_VALUE
  return v
}

type MetricsLike = { orderCount: number; total: number; guestSum: number; salesPerGuest: number }

function pickMetric(m: MetricsLike, field: string): number {
  switch (field) {
    case "orders":
      return m.orderCount
    case "total":
      return m.total
    case "guests":
      return m.guestSum
    default:
      return m.salesPerGuest
  }
}

function pickChangePct(
  c: { total: number | null; guest: number | null; salesPerGuest: number | null },
  key: string,
  dir: SalesSortDir
): number | undefined {
  switch (key) {
    case "pct.total":
      return numOrLast(c.total, dir)
    case "pct.guest":
      return numOrLast(c.guest, dir)
    case "pct.perGuest":
      return numOrLast(c.salesPerGuest, dir)
    default:
      return undefined
  }
}

/** 비교 표 헤더 — 태국어 등 긴 라벨이 칸을 깨지 않도록 nowrap + 최소폭 */
const CMP_TH_L =
  "px-1.5 py-1 text-left align-bottom whitespace-nowrap text-[11px] leading-tight min-w-[6rem]"
const CMP_GROUP =
  "border-l px-2 py-1.5 text-center align-middle whitespace-nowrap text-xs font-medium"
const CMP_TD = "px-1.5 py-1.5 text-right font-erp-numeric whitespace-nowrap"
const CMP_TD_SEC = `border-l ${CMP_TD}`

function formatPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  const sign = v > 0 ? "+" : ""
  return `${sign}${v.toFixed(2)}%`
}

/** 정렬 가능 헤더 — CMP_TH 패딩/폭 유지 (SalesSortableTh 기본 px-2 py-2 덮어쓰기) */
const CMP_SORT_BASE = "!px-1.5 !py-1 align-bottom whitespace-nowrap leading-tight"

function CmpSortTh({
  sort,
  k,
  label,
  align = "right",
  section,
  className = "",
}: {
  sort: CmpSort
  k: string
  label: React.ReactNode
  align?: "left" | "right" | "center"
  section?: boolean
  className?: string
}) {
  const minW = align === "left" ? "min-w-[6rem]" : align === "center" ? "min-w-[3rem]" : "min-w-[4.5rem]"
  return (
    <SalesSortableTh
      label={label}
      active={sort.sortKey === k}
      dir={sort.sortDir}
      align={align}
      className={`${CMP_SORT_BASE} ${minW} ${section ? "border-l" : ""} ${className}`}
      onClick={() => sort.toggleSort(k)}
    />
  )
}

function CompareMetricsHeaderCells({
  tr,
  sectionStart,
  sort,
  prefix,
}: {
  tr: TrFn
  sectionStart?: boolean
  sort: CmpSort
  /** 정렬 키 접두사 (예: "prev" → "prev.orders") */
  prefix: string
}) {
  return (
    <>
      <CmpSortTh sort={sort} k={`${prefix}.orders`} section={sectionStart} label={tr("salesCompareColOrders", "건수")} />
      <CmpSortTh sort={sort} k={`${prefix}.total`} label={tr("salesCompareColSales", "매출")} />
      <CmpSortTh sort={sort} k={`${prefix}.guests`} label={tr("salesCompareColGuests", "손님(홀)")} />
      <CmpSortTh sort={sort} k={`${prefix}.perGuest`} label={tr("salesCompareColPerGuest", "객단가")} />
    </>
  )
}

function CompareMetricsCells({
  m,
  formatAmount,
  sectionStart,
}: {
  m: { orderCount: number; total: number; guestSum: number; salesPerGuest: number }
  formatAmount: (n: number) => string
  sectionStart?: boolean
}) {
  const firstCn = sectionStart ? CMP_TD_SEC : CMP_TD
  return (
    <>
      <td className={firstCn}>{m.orderCount.toLocaleString()}</td>
      <td className={CMP_TD}>{formatAmount(m.total)}</td>
      <td className={CMP_TD}>{m.guestSum.toLocaleString()}</td>
      <td className={CMP_TD}>{formatAmount(m.salesPerGuest)}</td>
    </>
  )
}

export function SalesYoyComparePanel({
  rows,
  year,
  storeLabel,
  tr,
  formatAmount,
}: {
  rows: YoyMonthCompareRow[]
  year: number
  storeLabel: string
  tr: TrFn
  formatAmount: (n: number) => string
}) {
  const prevTotal = sumYoyMonthMetrics(rows, "prevYear")
  const currTotal = sumYoyMonthMetrics(rows, "currYear")
  const sort = useSalesTableSort<string>("month", "asc")
  const sortedRows = React.useMemo(
    () =>
      sortSalesRows(rows, sort.sortDir, (r) => {
        const k = sort.sortKey
        if (k === "month") return r.month
        if (k === "days") return r.calendarDays
        if (k.startsWith("prev.")) return pickMetric(r.prevYear, k.slice(5))
        if (k.startsWith("curr.")) return pickMetric(r.currYear, k.slice(5))
        return pickChangePct(r.changePct, k, sort.sortDir) ?? r.month
      }),
    [rows, sort.sortKey, sort.sortDir]
  )
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {tr("salesYoyReportHint", "매출일자(종료일)의 연도 기준으로 전년 동월과 비교합니다.")}
      </p>
      <AdminTableScroll className="rounded-md border" hint={false}>
        <table className="w-full min-w-[1280px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-muted-foreground">
              <th className={CMP_TH_L}>{tr("salesStoreName", "매장명")}</th>
              <CmpSortTh sort={sort} k="month" align="center" label={tr("salesCompareMonthColumn", "월")} />
              <CmpSortTh sort={sort} k="days" align="center" label={tr("salesCompareBusinessDays", "영업일수")} />
              <th colSpan={4} className={`${CMP_GROUP} bg-slate-100/80 dark:bg-slate-800/40`}>
                {year - 1}
              </th>
              <th colSpan={4} className={`${CMP_GROUP} bg-emerald-50/80 dark:bg-emerald-950/30`}>
                {year}
              </th>
              <th colSpan={3} className={`${CMP_GROUP} bg-sky-50/80 dark:bg-sky-950/30`}>
                {tr("salesCompareColYoyPct", "전년%")}
              </th>
            </tr>
            <tr className="border-b bg-muted/30 text-muted-foreground">
              <th colSpan={3} />
              <CompareMetricsHeaderCells tr={tr} sort={sort} prefix="prev" />
              <CompareMetricsHeaderCells tr={tr} sort={sort} prefix="curr" sectionStart />
              <CmpSortTh sort={sort} k="pct.total" section label={tr("salesCompareColSales", "매출")} />
              <CmpSortTh sort={sort} k="pct.guest" label={tr("salesCompareColGuests", "손님(홀)")} />
              <CmpSortTh sort={sort} k="pct.perGuest" label={tr("salesCompareColPerGuest", "객단가")} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr key={r.month} className="border-b border-border/60">
                <td className="px-1.5 py-1.5 whitespace-nowrap">{storeLabel}</td>
                <td className={`${CMP_TD} text-center`}>{r.month}</td>
                <td className={`${CMP_TD} text-center`}>{r.calendarDays}</td>
                <CompareMetricsCells m={r.prevYear} formatAmount={formatAmount} />
                <CompareMetricsCells m={r.currYear} formatAmount={formatAmount} sectionStart />
                <td className={CMP_TD_SEC}>{formatPct(r.changePct.total)}</td>
                <td className={CMP_TD}>{formatPct(r.changePct.guest)}</td>
                <td className={CMP_TD}>{formatPct(r.changePct.salesPerGuest)}</td>
              </tr>
            ))}
            <tr className="bg-muted/30 font-semibold">
              <td className="px-1.5 py-2 whitespace-nowrap">{tr("salesTotal", "합계")}</td>
              <td colSpan={2} />
              <CompareMetricsCells m={prevTotal} formatAmount={formatAmount} />
              <CompareMetricsCells m={currTotal} formatAmount={formatAmount} sectionStart />
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      </AdminTableScroll>
    </div>
  )
}

const DOW_KEYS = [
  "salesWeekdaySun",
  "salesWeekdayMon",
  "salesWeekdayTue",
  "salesWeekdayWed",
  "salesWeekdayThu",
  "salesWeekdayFri",
  "salesWeekdaySat",
] as const

export function SalesMomComparePanel({
  rows,
  year,
  month,
  storeLabel,
  tr,
  formatAmount,
}: {
  rows: MomDayCompareRow[]
  year: number
  month: number
  storeLabel: string
  tr: TrFn
  formatAmount: (n: number) => string
}) {
  const prevMonth = month <= 1 ? 12 : month - 1
  const prevYear = month <= 1 ? year - 1 : year
  const prevTotal = sumMomDayMetrics(rows, "prevMonth")
  const currTotal = sumMomDayMetrics(rows, "currMonth")
  const dowLabel = (dow: number) => tr(DOW_KEYS[dow] ?? "salesWeekdaySun", "—")
  const sort = useSalesTableSort<string>("day", "asc")
  const sortedRows = React.useMemo(
    () =>
      sortSalesRows(rows, sort.sortDir, (r) => {
        const k = sort.sortKey
        if (k === "day") return r.day
        if (k === "prevDow") return r.prevMonth.dow
        if (k === "currDow") return r.currMonth.dow
        if (k.startsWith("prev.")) return pickMetric(r.prevMonth, k.slice(5))
        if (k.startsWith("curr.")) return pickMetric(r.currMonth, k.slice(5))
        return pickChangePct(r.changePct, k, sort.sortDir) ?? r.day
      }),
    [rows, sort.sortKey, sort.sortDir]
  )

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {tr("salesMomReportHint", "매출일자(종료일)의 월 기준으로 전월 같은 일자와 비교합니다.")}
      </p>
      <AdminTableScroll className="rounded-md border" hint={false}>
        <table className="w-full min-w-[1360px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-muted-foreground">
              <th className={CMP_TH_L}>{tr("salesStoreName", "매장명")}</th>
              <CmpSortTh sort={sort} k="day" align="center" label={tr("salesCompareDayColumn", "일자")} />
              <th colSpan={5} className={`${CMP_GROUP} bg-slate-100/80 dark:bg-slate-800/40`}>
                {prevYear}/{String(prevMonth).padStart(2, "0")}
              </th>
              <th colSpan={5} className={`${CMP_GROUP} bg-emerald-50/80 dark:bg-emerald-950/30`}>
                {year}/{String(month).padStart(2, "0")}
              </th>
              <th colSpan={3} className={`${CMP_GROUP} bg-sky-50/80 dark:bg-sky-950/30`}>
                {tr("salesCompareColMomPct", "전월%")}
              </th>
            </tr>
            <tr className="border-b bg-muted/30 text-muted-foreground">
              <th colSpan={2} />
              <CompareMetricsHeaderCells tr={tr} sort={sort} prefix="prev" sectionStart />
              <CmpSortTh sort={sort} k="prevDow" align="center" label={tr("salesCompareWeekdayColumn", "요일")} />
              <CompareMetricsHeaderCells tr={tr} sort={sort} prefix="curr" sectionStart />
              <CmpSortTh sort={sort} k="currDow" align="center" label={tr("salesCompareWeekdayColumn", "요일")} />
              <CmpSortTh sort={sort} k="pct.total" section label={tr("salesCompareColSales", "매출")} />
              <CmpSortTh sort={sort} k="pct.guest" label={tr("salesCompareColGuests", "손님(홀)")} />
              <CmpSortTh sort={sort} k="pct.perGuest" label={tr("salesCompareColPerGuest", "객단가")} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr key={r.day} className="border-b border-border/60">
                <td className="px-1.5 py-1.5 whitespace-nowrap">{storeLabel}</td>
                <td className={`${CMP_TD} text-center`}>{r.dayLabel}</td>
                <CompareMetricsCells m={r.prevMonth} formatAmount={formatAmount} sectionStart />
                <td className={`${CMP_TD} text-center text-xs text-muted-foreground`}>{dowLabel(r.prevMonth.dow)}</td>
                <CompareMetricsCells m={r.currMonth} formatAmount={formatAmount} sectionStart />
                <td className={`${CMP_TD} text-center text-xs text-muted-foreground`}>{dowLabel(r.currMonth.dow)}</td>
                <td className={CMP_TD_SEC}>{formatPct(r.changePct.total)}</td>
                <td className={CMP_TD}>{formatPct(r.changePct.guest)}</td>
                <td className={CMP_TD}>{formatPct(r.changePct.salesPerGuest)}</td>
              </tr>
            ))}
            <tr className="bg-muted/30 font-semibold">
              <td className="px-1.5 py-2 whitespace-nowrap">{tr("salesTotal", "합계")}</td>
              <td />
              <CompareMetricsCells m={prevTotal} formatAmount={formatAmount} sectionStart />
              <td />
              <CompareMetricsCells m={currTotal} formatAmount={formatAmount} sectionStart />
              <td />
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      </AdminTableScroll>
    </div>
  )
}

export function SalesMomStoreComparePanel({
  rows,
  year,
  month,
  storeDisplayName,
  tr,
  formatAmount,
}: {
  rows: MomStoreCompareRow[]
  year: number
  month: number
  storeDisplayName: (code: string) => string
  tr: TrFn
  formatAmount: (n: number) => string
}) {
  const prevMonth = month <= 1 ? 12 : month - 1
  const prevYear = month <= 1 ? year - 1 : year
  const prevTotal = sumMomStoreMetrics(rows, "prevMonth")
  const currTotal = sumMomStoreMetrics(rows, "currMonth")
  const totalDiff = Math.round((currTotal.total - prevTotal.total) * 100) / 100
  const formatDiff = (v: number): string => {
    const sign = v > 0 ? "+" : ""
    return `${sign}${formatAmount(v)}`
  }
  const sort = useSalesTableSort<string>("curr.total", "desc")
  const sortedRows = sortSalesRows(rows, sort.sortDir, (r) => {
    const k = sort.sortKey
    if (k === "store") return storeDisplayName(r.storeName)
    if (k === "diff") return r.changeAbs.total
    if (k === "pct") return numOrLast(r.changePct.total, sort.sortDir)
    if (k.startsWith("prev.")) return pickMetric(r.prevMonth, k.slice(5))
    return pickMetric(r.currMonth, k.startsWith("curr.") ? k.slice(5) : "total")
  })

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {tr(
          "salesMomStoreReportHint",
          "매출일자(종료일)의 월 기준으로 매장별 당월·전월 합계를 비교합니다."
        )}
      </p>
      <AdminTableScroll className="rounded-md border" hint={false}>
        <table className="w-full min-w-[1180px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-muted-foreground">
              <CmpSortTh sort={sort} k="store" align="left" label={tr("salesStoreName", "매장명")} />
              <th colSpan={4} className={`${CMP_GROUP} bg-slate-100/80 dark:bg-slate-800/40`}>
                {prevYear}/{String(prevMonth).padStart(2, "0")}
              </th>
              <th colSpan={4} className={`${CMP_GROUP} bg-emerald-50/80 dark:bg-emerald-950/30`}>
                {year}/{String(month).padStart(2, "0")}
              </th>
              <th colSpan={2} className={`${CMP_GROUP} bg-sky-50/80 dark:bg-sky-950/30`}>
                {tr("salesCompareColMomPct", "전월%")}
              </th>
            </tr>
            <tr className="border-b bg-muted/30 text-muted-foreground">
              <th />
              <CompareMetricsHeaderCells tr={tr} sort={sort} prefix="prev" sectionStart />
              <CompareMetricsHeaderCells tr={tr} sort={sort} prefix="curr" sectionStart />
              <CmpSortTh sort={sort} k="diff" section label={tr("salesCompareColDiff", "증감")} />
              <CmpSortTh sort={sort} k="pct" label={tr("salesCompareColMomPct", "전월%")} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr key={r.storeName} className="border-b border-border/60">
                <td className="px-1.5 py-1.5 font-medium whitespace-nowrap">{storeDisplayName(r.storeName)}</td>
                <CompareMetricsCells m={r.prevMonth} formatAmount={formatAmount} sectionStart />
                <CompareMetricsCells m={r.currMonth} formatAmount={formatAmount} sectionStart />
                <td className={CMP_TD_SEC}>{formatDiff(r.changeAbs.total)}</td>
                <td className={CMP_TD}>{formatPct(r.changePct.total)}</td>
              </tr>
            ))}
            <tr className="bg-muted/30 font-semibold">
              <td className="px-1.5 py-2 whitespace-nowrap">{tr("salesTotal", "합계")}</td>
              <CompareMetricsCells m={prevTotal} formatAmount={formatAmount} sectionStart />
              <CompareMetricsCells m={currTotal} formatAmount={formatAmount} sectionStart />
              <td className={`${CMP_TD_SEC} py-2`}>{formatDiff(totalDiff)}</td>
              <td className={`${CMP_TD} py-2`}>
                {formatPct(
                  prevTotal.total === 0
                    ? currTotal.total === 0
                      ? 0
                      : null
                    : Math.round(((currTotal.total - prevTotal.total) / prevTotal.total) * 10000) / 100
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </AdminTableScroll>
    </div>
  )
}

export function SalesYoyStoreComparePanel({
  rows,
  year,
  month,
  storeDisplayName,
  tr,
  formatAmount,
}: {
  rows: YoyStoreCompareRow[]
  year: number
  month: number
  storeDisplayName: (code: string) => string
  tr: TrFn
  formatAmount: (n: number) => string
}) {
  const prevTotal = sumYoyStoreMetrics(rows, "prevYear")
  const currTotal = sumYoyStoreMetrics(rows, "currYear")
  const totalDiff = Math.round((currTotal.total - prevTotal.total) * 100) / 100
  const formatDiff = (v: number): string => {
    const sign = v > 0 ? "+" : ""
    return `${sign}${formatAmount(v)}`
  }
  const mm = String(month).padStart(2, "0")
  const sort = useSalesTableSort<string>("curr.total", "desc")
  const sortedRows = sortSalesRows(rows, sort.sortDir, (r) => {
    const k = sort.sortKey
    if (k === "store") return storeDisplayName(r.storeName)
    if (k === "diff") return r.changeAbs.total
    if (k === "pct") return numOrLast(r.changePct.total, sort.sortDir)
    if (k.startsWith("prev.")) return pickMetric(r.prevYear, k.slice(5))
    return pickMetric(r.currYear, k.startsWith("curr.") ? k.slice(5) : "total")
  })

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {tr(
          "salesYoyStoreReportHint",
          "매출일자(종료일)의 월 기준으로 매장별 당해·전년 동월 합계를 비교합니다."
        )}
      </p>
      <AdminTableScroll className="rounded-md border" hint={false}>
        <table className="w-full min-w-[1180px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-muted-foreground">
              <CmpSortTh sort={sort} k="store" align="left" label={tr("salesStoreName", "매장명")} />
              <th colSpan={4} className={`${CMP_GROUP} bg-slate-100/80 dark:bg-slate-800/40`}>
                {year - 1}/{mm}
              </th>
              <th colSpan={4} className={`${CMP_GROUP} bg-emerald-50/80 dark:bg-emerald-950/30`}>
                {year}/{mm}
              </th>
              <th colSpan={2} className={`${CMP_GROUP} bg-sky-50/80 dark:bg-sky-950/30`}>
                {tr("salesCompareColYoyPct", "전년%")}
              </th>
            </tr>
            <tr className="border-b bg-muted/30 text-muted-foreground">
              <th />
              <CompareMetricsHeaderCells tr={tr} sort={sort} prefix="prev" sectionStart />
              <CompareMetricsHeaderCells tr={tr} sort={sort} prefix="curr" sectionStart />
              <CmpSortTh sort={sort} k="diff" section label={tr("salesCompareColDiff", "증감")} />
              <CmpSortTh sort={sort} k="pct" label={tr("salesCompareColYoyPct", "전년%")} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr key={r.storeName} className="border-b border-border/60">
                <td className="px-1.5 py-1.5 font-medium whitespace-nowrap">{storeDisplayName(r.storeName)}</td>
                <CompareMetricsCells m={r.prevYear} formatAmount={formatAmount} sectionStart />
                <CompareMetricsCells m={r.currYear} formatAmount={formatAmount} sectionStart />
                <td className={CMP_TD_SEC}>{formatDiff(r.changeAbs.total)}</td>
                <td className={CMP_TD}>{formatPct(r.changePct.total)}</td>
              </tr>
            ))}
            <tr className="bg-muted/30 font-semibold">
              <td className="px-1.5 py-2 whitespace-nowrap">{tr("salesTotal", "합계")}</td>
              <CompareMetricsCells m={prevTotal} formatAmount={formatAmount} sectionStart />
              <CompareMetricsCells m={currTotal} formatAmount={formatAmount} sectionStart />
              <td className={`${CMP_TD_SEC} py-2`}>{formatDiff(totalDiff)}</td>
              <td className={`${CMP_TD} py-2`}>
                {formatPct(
                  prevTotal.total === 0
                    ? currTotal.total === 0
                      ? 0
                      : null
                    : Math.round(((currTotal.total - prevTotal.total) / prevTotal.total) * 10000) / 100
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </AdminTableScroll>
    </div>
  )
}

function formatSharePct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return `${v.toFixed(1)}%`
}

function formatPp(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  const sign = v > 0 ? "+" : ""
  return `${sign}${v.toFixed(1)}p`
}

export function SalesMomStoreChannelComparePanel({
  rows,
  year,
  month,
  storeDisplayName,
  tr,
}: {
  rows: MomStoreChannelCompareRow[]
  year: number
  month: number
  storeDisplayName: (code: string) => string
  tr: TrFn
}) {
  const prevMonth = month <= 1 ? 12 : month - 1
  const prevYear = month <= 1 ? year - 1 : year
  const sort = useSalesTableSort<string>("diff", "desc")
  const sortedRows = sortSalesRows(rows, sort.sortDir, (r) => {
    const k = sort.sortKey
    switch (k) {
      case "store":
        return storeDisplayName(r.storeName)
      case "prev.dineIn":
        return numOrLast(r.prevMonth.dineInPct, sort.sortDir)
      case "prev.takeout":
        return numOrLast(r.prevMonth.takeoutPct, sort.sortDir)
      case "prev.delivery":
        return numOrLast(r.prevMonth.deliveryPct, sort.sortDir)
      case "curr.dineIn":
        return numOrLast(r.currMonth.dineInPct, sort.sortDir)
      case "curr.takeout":
        return numOrLast(r.currMonth.takeoutPct, sort.sortDir)
      case "curr.delivery":
        return numOrLast(r.currMonth.deliveryPct, sort.sortDir)
      default:
        return numOrLast(r.deliveryShareDiffPp, sort.sortDir)
    }
  })

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {tr(
          "salesMomStoreChannelReportHint",
          "매출일자(종료일)의 월 기준으로 매장별 홀·포장·배달 매출 비중을 전월과 비교합니다."
        )}
      </p>
      <AdminTableScroll className="rounded-md border" hint={false}>
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-muted-foreground">
              <CmpSortTh sort={sort} k="store" align="left" label={tr("salesStoreName", "매장명")} />
              <th colSpan={3} className={`${CMP_GROUP} bg-slate-100/80 dark:bg-slate-800/40`}>
                {prevYear}/{String(prevMonth).padStart(2, "0")}
              </th>
              <th colSpan={3} className={`${CMP_GROUP} bg-emerald-50/80 dark:bg-emerald-950/30`}>
                {year}/{String(month).padStart(2, "0")}
              </th>
              <th className={`${CMP_GROUP} bg-sky-50/80 dark:bg-sky-950/30`}>
                {tr("salesCompareColDeliveryDiff", "배달Δ")}
              </th>
            </tr>
            <tr className="border-b bg-muted/30 text-muted-foreground">
              <th />
              <CmpSortTh sort={sort} k="prev.dineIn" section label={tr("salesAmountKindDineIn", "홀")} />
              <CmpSortTh sort={sort} k="prev.takeout" label={tr("salesAmountKindTakeout", "포장")} />
              <CmpSortTh sort={sort} k="prev.delivery" label={tr("salesAmountKindDelivery", "배달")} />
              <CmpSortTh sort={sort} k="curr.dineIn" section label={tr("salesAmountKindDineIn", "홀")} />
              <CmpSortTh sort={sort} k="curr.takeout" label={tr("salesAmountKindTakeout", "포장")} />
              <CmpSortTh sort={sort} k="curr.delivery" label={tr("salesAmountKindDelivery", "배달")} />
              <CmpSortTh sort={sort} k="diff" section label={tr("salesCompareColDeliveryDiff", "배달Δ")} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr key={r.storeName} className="border-b border-border/60">
                <td className="px-1.5 py-1.5 font-medium whitespace-nowrap">{storeDisplayName(r.storeName)}</td>
                <td className={CMP_TD_SEC}>{formatSharePct(r.prevMonth.dineInPct)}</td>
                <td className={CMP_TD}>{formatSharePct(r.prevMonth.takeoutPct)}</td>
                <td className={CMP_TD}>{formatSharePct(r.prevMonth.deliveryPct)}</td>
                <td className={CMP_TD_SEC}>{formatSharePct(r.currMonth.dineInPct)}</td>
                <td className={CMP_TD}>{formatSharePct(r.currMonth.takeoutPct)}</td>
                <td className={CMP_TD}>{formatSharePct(r.currMonth.deliveryPct)}</td>
                <td className={CMP_TD_SEC}>{formatPp(r.deliveryShareDiffPp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableScroll>
    </div>
  )
}

function momStoreDriverLabel(driver: MomStoreDriver, tr: TrFn): string {
  switch (driver) {
    case "volume":
      return tr("salesMomStoreDriverVolume", "건수 주도")
    case "ticket":
      return tr("salesMomStoreDriverTicket", "객단가 주도")
    case "mixed":
      return tr("salesMomStoreDriverMixed", "혼합")
    case "new":
      return tr("salesMomStoreDriverNew", "신규(전월 없음)")
    case "closed":
      return tr("salesMomStoreDriverClosed", "당월 없음")
    case "flat":
    default:
      return tr("salesMomStoreDriverFlat", "변화 미미")
  }
}

export function SalesMomStoreDecompPanel({
  rows,
  year,
  month,
  storeDisplayName,
  tr,
  formatAmount,
}: {
  rows: MomStoreCompareRow[]
  year: number
  month: number
  storeDisplayName: (code: string) => string
  tr: TrFn
  formatAmount: (n: number) => string
}) {
  const prevMonth = month <= 1 ? 12 : month - 1
  const prevYear = month <= 1 ? year - 1 : year
  const formatDiff = (v: number): string => {
    const sign = v > 0 ? "+" : ""
    return `${sign}${formatAmount(v)}`
  }
  const sort = useSalesTableSort<string>("diff", "desc")
  const sortedRows = sortSalesRows(rows, sort.sortDir, (r) => {
    switch (sort.sortKey) {
      case "store":
        return storeDisplayName(r.storeName)
      case "prevTotal":
        return r.prevMonth.total
      case "currTotal":
        return r.currMonth.total
      case "pct":
        return numOrLast(r.changePct.total, sort.sortDir)
      case "orderPct":
        return numOrLast(r.changePct.orderCount, sort.sortDir)
      case "perOrderPct":
        return numOrLast(r.changePct.salesPerOrder, sort.sortDir)
      case "guestPct":
        return numOrLast(r.changePct.salesPerGuest, sort.sortDir)
      case "driver":
        return momStoreDriverLabel(r.driver, tr)
      default:
        return r.changeAbs.total
    }
  })

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {tr(
          "salesMomStoreDecompReportHint",
          "매장별 매출 전월대비를 주문건수·건당매출 변화로 나눠, 건수 주도인지 객단가 주도인지 봅니다."
        )}
      </p>
      <AdminTableScroll className="rounded-md border" hint={false}>
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-muted-foreground">
              <CmpSortTh sort={sort} k="store" align="left" label={tr("salesStoreName", "매장명")} />
              <CmpSortTh
                sort={sort}
                k="prevTotal"
                label={`${tr("salesCompareColSales", "매출")} ${prevYear}/${String(prevMonth).padStart(2, "0")}`}
              />
              <CmpSortTh
                sort={sort}
                k="currTotal"
                label={`${tr("salesCompareColSales", "매출")} ${year}/${String(month).padStart(2, "0")}`}
              />
              <CmpSortTh sort={sort} k="diff" label={tr("salesCompareColDiff", "증감")} />
              <CmpSortTh sort={sort} k="pct" label={tr("salesCompareColMomPct", "전월%")} />
              <CmpSortTh sort={sort} k="orderPct" label={tr("salesCompareOrderCountMomPct", "건수(%)")} />
              <CmpSortTh sort={sort} k="perOrderPct" label={tr("salesCompareSalesPerOrderMomPct", "건당(%)")} />
              <CmpSortTh sort={sort} k="guestPct" label={tr("salesCompareGuestMomPct", "객단가(%)")} />
              <CmpSortTh sort={sort} k="driver" align="left" label={tr("salesMomStoreDriver", "원인")} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr key={r.storeName} className="border-b border-border/60">
                <td className="px-1.5 py-1.5 font-medium whitespace-nowrap">{storeDisplayName(r.storeName)}</td>
                <td className={CMP_TD}>{formatAmount(r.prevMonth.total)}</td>
                <td className={CMP_TD}>{formatAmount(r.currMonth.total)}</td>
                <td className={CMP_TD}>{formatDiff(r.changeAbs.total)}</td>
                <td className={CMP_TD}>{formatPct(r.changePct.total)}</td>
                <td className={CMP_TD}>{formatPct(r.changePct.orderCount)}</td>
                <td className={CMP_TD}>{formatPct(r.changePct.salesPerOrder)}</td>
                <td className={CMP_TD}>{formatPct(r.changePct.salesPerGuest)}</td>
                <td className="px-1.5 py-1.5 whitespace-nowrap">{momStoreDriverLabel(r.driver, tr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableScroll>
    </div>
  )
}

export function SalesForecastPanel({
  summary,
  horizon,
  onHorizonChange,
  tr,
  formatAmount,
}: {
  summary: SalesForecastSummary | null
  horizon: ForecastHorizon
  onHorizonChange: (h: ForecastHorizon) => void
  tr: TrFn
  formatAmount: (n: number) => string
}) {
  const horizons: { id: ForecastHorizon; key: string; fallback: string }[] = [
    { id: "week", key: "salesForecastHorizonWeek", fallback: "주간" },
    { id: "month", key: "salesForecastHorizonMonth", fallback: "월간" },
    { id: "year", key: "salesForecastHorizonYear", fallback: "연간" },
  ]
  const dowSort = useSalesTableSort<"dow" | "avg">("dow", "asc")
  const dowRows = DOW_KEYS.map((key, dow) => ({ key, dow, avg: summary?.dowAverages[dow] ?? 0 }))
  const sortedDowRows = sortSalesRows(dowRows, dowSort.sortDir, (r) => (dowSort.sortKey === "avg" ? r.avg : r.dow))

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground leading-relaxed">
        {tr(
          "salesForecastReportHint",
          "최근 일별 매출로 요일별 평균을 구하고, 기준일 이후 남은 기간에 적용해 예상 매출을 산출합니다."
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {horizons.map((h) => (
          <Button
            key={h.id}
            type="button"
            size="sm"
            variant={horizon === h.id ? "default" : "outline"}
            onClick={() => onHorizonChange(h.id)}
          >
            {tr(h.key, h.fallback)}
          </Button>
        ))}
      </div>
      {summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">{tr("salesForecastActualToDate", "기간 내 실적")}</p>
              <p className="mt-1 text-2xl font-bold font-erp-numeric">{formatAmount(summary.actualToDate)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {summary.rangeStart} ~ {summary.rangeEnd}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">{tr("salesForecastProjectedRemaining", "잔여 예상")}</p>
              <p className="mt-1 text-2xl font-bold font-erp-numeric">{formatAmount(summary.projectedRemaining)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {summary.remainingDays}
                {tr("salesForecastDaysUnit", "일")} · {tr("salesForecastDowAvgBasis", "요일 평균")}
              </p>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <p className="text-xs text-muted-foreground">{tr("salesForecastExpectedTotal", "예상 매출 합계")}</p>
              <p className="mt-1 text-2xl font-bold font-erp-numeric text-primary">
                {formatAmount(summary.expectedTotal)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {tr("salesForecastLookback", "학습 구간")}: {summary.lookbackStart} ~ {summary.lookbackEnd}
              </p>
            </div>
          </div>
          <AdminTableScroll className="rounded-md border" hint={false}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <SalesSortableTh
                    label={tr("salesCompareWeekdayColumn", "요일")}
                    active={dowSort.sortKey === "dow"}
                    dir={dowSort.sortDir}
                    align="left"
                    className="!px-3"
                    onClick={() => dowSort.toggleSort("dow")}
                  />
                  <SalesSortableTh
                    label={tr("salesForecastDowAvgSales", "요일 평균 매출")}
                    active={dowSort.sortKey === "avg"}
                    dir={dowSort.sortDir}
                    className="!px-3"
                    onClick={() => dowSort.toggleSort("avg")}
                  />
                </tr>
              </thead>
              <tbody>
                {sortedDowRows.map(({ key, avg }) => (
                  <tr key={key} className="border-b border-border/60">
                    <td className="px-3 py-1.5">{tr(key, "—")}</td>
                    <td className="px-3 py-1.5 text-right font-erp-numeric">{formatAmount(avg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableScroll>
        </>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">{tr("salesDataNone", "데이터 없음")}</p>
      )}
    </div>
  )
}
