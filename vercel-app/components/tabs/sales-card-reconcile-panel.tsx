"use client"

import * as React from "react"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { Card, CardContent } from "@/components/ui/card"
import type { PosCardReconcileResult } from "@/lib/api-client"
import {
  channelReconcileMismatchDates,
  isChannelReconcileDayMismatch,
} from "@/lib/pos-channel-reconcile-match"

export const EMPTY_POS_CARD_RECONCILE: PosCardReconcileResult = {
  rows: [],
  kpi: { orderCount: 0, cardSales: 0, bankDepositAmt: 0, storeCount: 0 },
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

function cardMismatchDates(days: PosCardReconcileResult["rows"][number]["days"]): string[] {
  return channelReconcileMismatchDates(
    days.map((d) => ({ date: d.date, posAmt: d.cardSales, bankAmt: d.bankDepositAmt }))
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

export function SalesCardReconcilePanel(props: {
  data: PosCardReconcileResult
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
  const kpiDiff = hasBank ? Math.round((kpi.bankDepositAmt - kpi.cardSales) * 100) / 100 : null
  const mismatchDayCount = data.rows.reduce((n, r) => n + cardMismatchDates(r.days).length, 0)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {tr(
          "salesCardReconcileIntro",
          "당일 마감은 POS 카드 합계를 기준으로 하세요. 통장 카드는 해당 매장 통장 계정과목 4120~4124 합계입니다. 행을 펼치면 방콕 달력일과 통장 인식일(익일 입금)을 맞춰 틀린 날을 찾습니다."
        )}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          title={tr("salesCardKpiSales", "POS 카드 합계")}
          hint={tr("salesCardKpiSalesHint", "완료 주문의 payment_card (방콕 달력일)")}
        >
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatAmount(kpi.cardSales)}</p>
        </KpiCard>
        <KpiCard
          title={tr("salesCardKpiCount", "카드 결제 건수")}
          hint={tr("salesCardKpiCountHint", "payment_card > 0 인 완료 주문")}
        >
          <p className="mt-1 text-2xl font-semibold tabular-nums">{kpi.orderCount.toLocaleString()}</p>
        </KpiCard>
        <KpiCard
          title={tr("salesCardKpiBank", "통장 카드입금")}
          hint={tr("salesCardKpiBankHint", "매장 통장 계정과목 4120~4124")}
        >
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {hasBank ? formatAmount(kpi.bankDepositAmt) : "—"}
          </p>
        </KpiCard>
        <KpiCard
          title={tr("salesCardKpiDiff", "차이 (통장−POS)")}
          hint={tr("salesCardKpiDiffHint", "1바트 미만은 일치로 봅니다")}
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
          "salesCardReconcileNextDayNote",
          "카드 정산은 익일 입금이 많습니다. 통장 4120~4124는 통장 인식일(없으면 입금일 전날)로 비교합니다. POS는 방콕 달력일이라 자정 이후 매출은 영업일 마감과 날짜가 하루 다를 수 있습니다. Visa·Master 등 세부 계정은 합쳐서 봅니다."
        )}
      </p>

      {data.rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {tr("salesCardReconcileEmpty", "선택 기간에 POS 카드 결제·통장 카드입금이 없습니다.")}
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
                <th className="py-2 text-right">{tr("salesCardColCount", "건수")}</th>
                <th className="py-2 text-right">{tr("salesCardColSales", "POS 카드")}</th>
                <th className="py-2 text-right">{tr("salesCardColBank", "통장 카드")}</th>
                <th className="py-2 text-right">{tr("salesCardColDiff", "차이")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const open = expanded === r.storeCode
                const dates = cardMismatchDates(r.days)
                const visibleDays = mismatchOnly
                  ? r.days.filter((d) => isChannelReconcileDayMismatch(d.cardSales, d.bankDepositAmt))
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
                      <td className="py-2 text-right font-erp-numeric">{formatAmount(r.cardSales)}</td>
                      <td className="py-2 text-right font-erp-numeric">
                        {r.bankDepositAmt == null ? "—" : formatAmount(r.bankDepositAmt)}
                      </td>
                      <td className="py-2 text-right font-erp-numeric">
                        <DiffAmount bank={r.bankDepositAmt} pos={r.cardSales} formatAmount={formatAmount} />
                      </td>
                    </tr>
                    {open
                      ? visibleDays.map((d) => {
                          const mismatch = isChannelReconcileDayMismatch(d.cardSales, d.bankDepositAmt)
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
                              <td className="py-1.5 text-right font-erp-numeric">{formatAmount(d.cardSales)}</td>
                              <td className="py-1.5 text-right font-erp-numeric">
                                {d.bankDepositAmt == null ? "—" : formatAmount(d.bankDepositAmt)}
                              </td>
                              <td className="py-1.5 text-right font-erp-numeric">
                                <DiffAmount
                                  bank={d.bankDepositAmt}
                                  pos={d.cardSales}
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
