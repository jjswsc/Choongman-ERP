"use client"

import * as React from "react"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import type {
  ForecastHorizon,
  MomDayCompareRow,
  SalesForecastSummary,
  YoyMonthCompareRow,
} from "@/lib/pos-sales-forecast-compare"
import { sumMomDayMetrics, sumYoyMonthMetrics } from "@/lib/pos-sales-forecast-compare"
import { Button } from "@/components/ui/button"

type TrFn = (key: string, fallback: string) => string

function formatPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  const sign = v > 0 ? "+" : ""
  return `${sign}${v.toFixed(2)}%`
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
  const firstCn = sectionStart ? "border-l px-2 py-1.5 text-right font-erp-numeric" : "px-2 py-1.5 text-right font-erp-numeric"
  return (
    <>
      <td className={firstCn}>{m.orderCount.toLocaleString()}</td>
      <td className="px-2 py-1.5 text-right font-erp-numeric">{formatAmount(m.total)}</td>
      <td className="px-2 py-1.5 text-right font-erp-numeric">{m.guestSum.toLocaleString()}</td>
      <td className="px-2 py-1.5 text-right font-erp-numeric">{formatAmount(m.salesPerGuest)}</td>
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
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {tr("salesYoyReportHint", "매출일자(종료일)의 연도 기준으로 전년 동월과 비교합니다.")}
      </p>
      <AdminTableScroll className="rounded-md border" hint={false}>
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-muted-foreground">
              <th className="px-2 py-2 text-left">{tr("salesStoreName", "매장명")}</th>
              <th className="px-2 py-2 text-center">{tr("salesCompareMonthColumn", "월")}</th>
              <th className="px-2 py-2 text-center">{tr("salesCompareBusinessDays", "영업일수")}</th>
              <th colSpan={4} className="border-l bg-slate-100/80 px-2 py-2 text-center dark:bg-slate-800/40">
                {year - 1}
              </th>
              <th colSpan={4} className="border-l bg-emerald-50/80 px-2 py-2 text-center dark:bg-emerald-950/30">
                {year}
              </th>
              <th colSpan={3} className="border-l bg-sky-50/80 px-2 py-2 text-center dark:bg-sky-950/30">
                {tr("salesCompareYoyPct", "전년대비(%)")}
              </th>
            </tr>
            <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
              <th colSpan={3} />
              <th className="px-2 py-1 text-right">{tr("salesOccupancy", "주문건수")}</th>
              <th className="px-2 py-1 text-right">{tr("salesAmount", "매출액")}</th>
              <th className="px-2 py-1 text-right">{tr("salesGuestCount", "손님 수(홀)")}</th>
              <th className="px-2 py-1 text-right">{tr("salesPerGuest", "객단가")}</th>
              <th className="border-l px-2 py-1 text-right">{tr("salesOccupancy", "주문건수")}</th>
              <th className="px-2 py-1 text-right">{tr("salesAmount", "매출액")}</th>
              <th className="px-2 py-1 text-right">{tr("salesGuestCount", "손님 수(홀)")}</th>
              <th className="px-2 py-1 text-right">{tr("salesPerGuest", "객단가")}</th>
              <th className="border-l px-2 py-1 text-right">{tr("salesAmount", "매출액")}</th>
              <th className="px-2 py-1 text-right">{tr("salesGuestCount", "손님 수(홀)")}</th>
              <th className="px-2 py-1 text-right">{tr("salesPerGuest", "객단가")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="border-b border-border/60">
                <td className="px-2 py-1.5">{storeLabel}</td>
                <td className="px-2 py-1.5 text-center font-erp-numeric">{r.month}</td>
                <td className="px-2 py-1.5 text-center font-erp-numeric">{r.calendarDays}</td>
                <CompareMetricsCells m={r.prevYear} formatAmount={formatAmount} />
                <CompareMetricsCells m={r.currYear} formatAmount={formatAmount} sectionStart />
                <td className="border-l px-2 py-1.5 text-right font-erp-numeric">{formatPct(r.changePct.total)}</td>
                <td className="px-2 py-1.5 text-right font-erp-numeric">{formatPct(r.changePct.guest)}</td>
                <td className="px-2 py-1.5 text-right font-erp-numeric">{formatPct(r.changePct.salesPerGuest)}</td>
              </tr>
            ))}
            <tr className="bg-muted/30 font-semibold">
              <td className="px-2 py-2">{tr("salesTotal", "합계")}</td>
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

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {tr("salesMomReportHint", "매출일자(종료일)의 월 기준으로 전월 같은 일자와 비교합니다.")}
      </p>
      <AdminTableScroll className="rounded-md border" hint={false}>
        <table className="w-full min-w-[1200px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-muted-foreground">
              <th className="px-2 py-2 text-left">{tr("salesStoreName", "매장명")}</th>
              <th className="px-2 py-2 text-center">{tr("salesCompareDayColumn", "일자")}</th>
              <th colSpan={5} className="border-l bg-slate-100/80 px-2 py-2 text-center dark:bg-slate-800/40">
                {prevYear}/{String(prevMonth).padStart(2, "0")}
              </th>
              <th colSpan={5} className="border-l bg-emerald-50/80 px-2 py-2 text-center dark:bg-emerald-950/30">
                {year}/{String(month).padStart(2, "0")}
              </th>
              <th colSpan={3} className="border-l bg-sky-50/80 px-2 py-2 text-center dark:bg-sky-950/30">
                {tr("salesCompareMomPct", "전월대비(%)")}
              </th>
            </tr>
            <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
              <th colSpan={2} />
              <th className="px-2 py-1 text-right">{tr("salesOccupancy", "주문건수")}</th>
              <th className="px-2 py-1 text-right">{tr("salesAmount", "매출액")}</th>
              <th className="px-2 py-1 text-right">{tr("salesGuestCount", "손님 수(홀)")}</th>
              <th className="px-2 py-1 text-right">{tr("salesPerGuest", "객단가")}</th>
              <th className="px-2 py-1 text-center">{tr("salesCompareWeekdayColumn", "요일")}</th>
              <th className="border-l px-2 py-1 text-right">{tr("salesOccupancy", "주문건수")}</th>
              <th className="px-2 py-1 text-right">{tr("salesAmount", "매출액")}</th>
              <th className="px-2 py-1 text-right">{tr("salesGuestCount", "손님 수(홀)")}</th>
              <th className="px-2 py-1 text-right">{tr("salesPerGuest", "객단가")}</th>
              <th className="px-2 py-1 text-center">{tr("salesCompareWeekdayColumn", "요일")}</th>
              <th className="border-l px-2 py-1 text-right">{tr("salesAmount", "매출액")}</th>
              <th className="px-2 py-1 text-right">{tr("salesGuestCount", "손님 수(홀)")}</th>
              <th className="px-2 py-1 text-right">{tr("salesPerGuest", "객단가")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.day} className="border-b border-border/60">
                <td className="px-2 py-1.5">{storeLabel}</td>
                <td className="px-2 py-1.5 text-center font-erp-numeric">{r.dayLabel}</td>
                <CompareMetricsCells m={r.prevMonth} formatAmount={formatAmount} sectionStart />
                <td className="px-2 py-1.5 text-center text-xs text-muted-foreground">{dowLabel(r.prevMonth.dow)}</td>
                <CompareMetricsCells m={r.currMonth} formatAmount={formatAmount} sectionStart />
                <td className="px-2 py-1.5 text-center text-xs text-muted-foreground">{dowLabel(r.currMonth.dow)}</td>
                <td className="border-l px-2 py-1.5 text-right font-erp-numeric">{formatPct(r.changePct.total)}</td>
                <td className="px-2 py-1.5 text-right font-erp-numeric">{formatPct(r.changePct.guest)}</td>
                <td className="px-2 py-1.5 text-right font-erp-numeric">{formatPct(r.changePct.salesPerGuest)}</td>
              </tr>
            ))}
            <tr className="bg-muted/30 font-semibold">
              <td className="px-2 py-2">{tr("salesTotal", "합계")}</td>
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
                  <th className="px-3 py-2 text-left">{tr("salesCompareWeekdayColumn", "요일")}</th>
                  <th className="px-3 py-2 text-right">{tr("salesForecastDowAvgSales", "요일 평균 매출")}</th>
                </tr>
              </thead>
              <tbody>
                {DOW_KEYS.map((key, dow) => (
                  <tr key={key} className="border-b border-border/60">
                    <td className="px-3 py-1.5">{tr(key, "—")}</td>
                    <td className="px-3 py-1.5 text-right font-erp-numeric">
                      {formatAmount(summary.dowAverages[dow] ?? 0)}
                    </td>
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
