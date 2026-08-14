"use client"

import * as React from "react"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { Card, CardContent } from "@/components/ui/card"
import type { PosCashReconcileResult } from "@/lib/api-client"
import {
  channelReconcileMismatchDates,
  isChannelReconcileDayMismatch,
} from "@/lib/pos-channel-reconcile-match"

export const EMPTY_POS_CASH_RECONCILE: PosCashReconcileResult = {
  rows: [],
  kpi: { orderCount: 0, cashSales: 0, bankDepositAmt: 0, storeCount: 0 },
}

function payoutDiffClass(diff: number): string {
  if (Math.abs(diff) < 1) return "text-emerald-700 dark:text-emerald-400"
  return "text-destructive"
}

function formatSignedAmount(n: number, formatAmount: (n: number) => string): string {
  if (n > 0.005) return `+${formatAmount(n)}`
  return formatAmount(n)
}

function DiffAmount(props: {
  bank: number | null
  pos: number
  formatAmount: (n: number) => string
}) {
  if (props.bank == null) return <span>—</span>
  const diff = Math.round((props.bank - props.pos) * 100) / 100
  return (
    <span className={payoutDiffClass(diff)}>{formatSignedAmount(diff, props.formatAmount)}</span>
  )
}

function cashMismatchDates(days: PosCashReconcileResult["rows"][number]["days"]): string[] {
  return channelReconcileMismatchDates(
    days.map((d) => ({ date: d.date, posAmt: d.cashSales, bankAmt: d.bankDepositAmt }))
  )
}

function KpiCard(props: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{props.title}</p>
        {props.children}
        {props.hint ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{props.hint}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function SalesCashReconcilePanel(props: {
  data: PosCashReconcileResult
  placeholder?: string | null
  tr: (key: string, fallback: string) => string
  formatAmount: (n: number) => string
  storeDisplayName: (code: string) => string
}) {
  const { data, placeholder, tr, formatAmount, storeDisplayName } = props
  const [expanded, setExpanded] = React.useState<string | null>(null)
  const [mismatchOnly, setMismatchOnly] = React.useState(true)

  if (placeholder) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{placeholder}</p>
  }

  const kpi = data.kpi
  const hasBank = data.rows.some((r) => r.bankDepositAmt != null)
  const kpiDiff = hasBank ? Math.round((kpi.bankDepositAmt - kpi.cashSales) * 100) / 100 : null
  const mismatchDayCount = data.rows.reduce((n, r) => n + cashMismatchDates(r.days).length, 0)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {tr(
          "salesCashReconcileIntro",
          "당일 마감은 POS 현금을 시재와 맞추세요. 통장 현금은 해당 매장 통장 계정과목 4140(매출일, 없으면 입금일)입니다. 행을 펼치면 같은 날짜끼리 POS와 통장을 맞춰 틀린 날을 찾습니다. 배달앱·QR·카드와 섞지 마세요."
        )}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          title={tr("salesCashKpiSales", "POS 현금 합계")}
          hint={tr("salesCashKpiSalesHint", "완료 주문의 payment_cash (영업일)")}
        >
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatAmount(kpi.cashSales)}</p>
        </KpiCard>
        <KpiCard
          title={tr("salesCashKpiCount", "현금 결제 건수")}
          hint={tr("salesCashKpiCountHint", "payment_cash > 0 인 완료 주문")}
        >
          <p className="mt-1 text-2xl font-semibold tabular-nums">{kpi.orderCount.toLocaleString()}</p>
        </KpiCard>
        <KpiCard
          title={tr("salesCashKpiBank", "통장 현금입금")}
          hint={tr("salesCashKpiBankHint", "통장 거래 용도 현금입금 (매출일)")}
        >
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {hasBank ? formatAmount(kpi.bankDepositAmt) : "—"}
          </p>
        </KpiCard>
        <KpiCard
          title={tr("salesCashKpiDiff", "차이 (통장−POS)")}
          hint={tr("salesCashKpiDiffHint", "1바트 미만은 일치로 봅니다")}
        >
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {kpiDiff == null ? (
              "—"
            ) : (
              <span className={payoutDiffClass(kpiDiff)}>
                {formatSignedAmount(kpiDiff, formatAmount)}
              </span>
            )}
          </p>
        </KpiCard>
        <KpiCard
          title={tr("salesChannelReconcileMismatchDays", "틀린 날")}
          hint={tr(
            "salesChannelReconcileMismatchDaysHint",
            "같은 날짜의 POS와 통장 차이가 1바트 이상인 날"
          )}
        >
          <p
            className={`mt-1 text-2xl font-semibold tabular-nums ${
              mismatchDayCount > 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"
            }`}
          >
            {mismatchDayCount.toLocaleString()}
          </p>
        </KpiCard>
      </div>

      <p className="rounded-md border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
        {tr(
          "salesCashReconcileNote",
          "시재(돈통) 점검과 통장 입금은 별개입니다. 통장에 현금입금이 없으면 칸이 비어 있습니다. 카드·QR은 이 탭에서 보지 않습니다."
        )}
      </p>

      {data.rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {tr("salesCashReconcileEmpty", "선택 기간에 POS 현금 결제·통장 현금입금이 없습니다.")}
        </p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={mismatchOnly}
              onChange={(e) => setMismatchOnly(e.target.checked)}
            />
            {tr("salesAppReconcileCsvMismatchOnly", "틀린 날짜만")}
          </label>
        <AdminTableScroll>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 text-left">{tr("store", "매장")}</th>
                <th className="py-2 text-right">{tr("salesCashColCount", "건수")}</th>
                <th className="py-2 text-right">{tr("salesCashColPos", "POS 현금")}</th>
                <th className="py-2 text-right">{tr("salesCashColBank", "통장 현금입금")}</th>
                <th className="py-2 text-right">{tr("salesCashColDiff", "차이")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const open = expanded === r.storeCode
                const dates = cashMismatchDates(r.days)
                const visibleDays = mismatchOnly
                  ? r.days.filter((d) => isChannelReconcileDayMismatch(d.cashSales, d.bankDepositAmt))
                  : r.days
                return (
                  <React.Fragment key={r.storeCode}>
                    <tr
                      className="cursor-pointer border-b hover:bg-muted/40"
                      onClick={() => setExpanded(open ? null : r.storeCode)}
                    >
                      <td className="py-2 text-left">
                        <span className="mr-1 text-muted-foreground">{open ? "▾" : "▸"}</span>
                        {storeDisplayName(r.storeCode) || r.storeCode}
                        {dates.length > 0 ? (
                          <span className="ml-1 text-[11px] font-normal text-destructive">
                            {tr("salesChannelReconcileMismatchDays", "틀린 날")} {dates.length}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 text-right tabular-nums">{r.orderCount.toLocaleString()}</td>
                      <td className="py-2 text-right font-erp-numeric">{formatAmount(r.cashSales)}</td>
                      <td className="py-2 text-right font-erp-numeric">
                        {r.bankDepositAmt == null ? "—" : formatAmount(r.bankDepositAmt)}
                      </td>
                      <td className="py-2 text-right font-erp-numeric">
                        <DiffAmount bank={r.bankDepositAmt} pos={r.cashSales} formatAmount={formatAmount} />
                      </td>
                    </tr>
                    {open
                      ? visibleDays.map((d) => {
                          const mismatch = isChannelReconcileDayMismatch(d.cashSales, d.bankDepositAmt)
                          return (
                            <tr
                              key={`${r.storeCode}-${d.date}`}
                              className={
                                mismatch
                                  ? "border-b bg-destructive/10 text-destructive"
                                  : "border-b bg-muted/20 text-muted-foreground"
                              }
                            >
                              <td className="py-1.5 pl-8 text-left font-erp-numeric">{d.date}</td>
                              <td className="py-1.5 text-right tabular-nums">{d.orderCount.toLocaleString()}</td>
                              <td className="py-1.5 text-right font-erp-numeric">{formatAmount(d.cashSales)}</td>
                              <td className="py-1.5 text-right font-erp-numeric">
                                {d.bankDepositAmt == null ? "—" : formatAmount(d.bankDepositAmt)}
                              </td>
                              <td className="py-1.5 text-right font-erp-numeric">
                                <DiffAmount
                                  bank={d.bankDepositAmt}
                                  pos={d.cashSales}
                                  formatAmount={formatAmount}
                                />
                              </td>
                            </tr>
                          )
                        })
                      : null}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </AdminTableScroll>
        </>
      )}
    </div>
  )
}
