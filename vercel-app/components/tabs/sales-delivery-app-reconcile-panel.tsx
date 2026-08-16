"use client"

import * as React from "react"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type {
  PosDeliveryAppReconcileResult,
  PosDeliveryAppReconcileRow,
} from "@/lib/api-client"
import { translateDeliveryAppCode } from "@/lib/sales-analytics-labels"
import { SalesDeliveryAppStatementCompare } from "@/components/tabs/sales-delivery-app-statement-compare"
import {
  channelReconcileMismatchDates,
  isChannelReconcileDayMismatch,
} from "@/lib/pos-channel-reconcile-match"

export const EMPTY_POS_DELIVERY_APP_RECONCILE: PosDeliveryAppReconcileResult = {
  rows: [],
  kpi: {
    appNetSales: 0,
    deliveryCount: 0,
    inStoreCount: 0,
    deliverySales: 0,
    inStoreSales: 0,
    suggestedFee: 0,
    suggestedPayout: 0,
    bankDepositAmt: 0,
  },
}

const APP_FILTERS = ["all", "grab", "lineman", "shopee"] as const
type AppFilter = (typeof APP_FILTERS)[number]
type TableLayout = "combined" | "split"

function matchesAppFilter(appCode: string, filter: AppFilter): boolean {
  if (filter === "all") return true
  return appCode === filter
}

function appName(filter: AppFilter, tr: (key: string, fallback: string) => string): string {
  if (filter === "all") return tr("salesAmountKindAll", "전체")
  return translateDeliveryAppCode(filter, tr)
}

function merchantHint(
  filter: AppFilter,
  kind: "net" | "orders" | "dine" | "payout",
  tr: (key: string, fallback: string) => string
): string {
  const name = appName(filter, tr)
  if (kind === "net") {
    return tr("salesAppReconcileHintNet", "{app} ยอดขายสุทธิ").replace("{app}", name)
  }
  if (kind === "orders") {
    return tr("salesAppReconcileHintOrders", "{app} คำสั่งซื้อ").replace("{app}", name)
  }
  if (kind === "dine") {
    if (filter === "grab") {
      return tr("salesAppReconcileHintDineGrab", "Grab รายการ GrabPay")
    }
    return tr("salesAppReconcileHintDine", "{app} ชำระในร้าน").replace("{app}", name)
  }
  return tr("salesAppReconcileHintPayout", "{app} รายได้").replace("{app}", name)
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
  suggested: number
  formatAmount: (n: number) => string
}) {
  if (props.bank == null) return <span>—</span>
  const diff = Math.round((props.bank - props.suggested) * 100) / 100
  return (
    <span className={payoutDiffClass(diff)}>{formatSignedAmount(diff, props.formatAmount)}</span>
  )
}

function deliveryMismatchDates(row: PosDeliveryAppReconcileRow): string[] {
  return channelReconcileMismatchDates(
    row.days.map((d) => ({
      date: d.date,
      posAmt: d.suggestedPayout ?? 0,
      bankAmt: d.bankDepositAmt,
    }))
  )
}

function MismatchCountLabel(props: {
  dates: string[]
  tr: (key: string, fallback: string) => string
}) {
  if (props.dates.length === 0) return null
  return (
    <span className="ml-1 text-[11px] font-normal text-destructive">
      {props.tr("salesChannelReconcileMismatchDays", "틀린 날")} {props.dates.length}
    </span>
  )
}

function KpiCard(props: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
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

export function SalesDeliveryAppReconcilePanel(props: {
  data: PosDeliveryAppReconcileResult
  placeholder: string | null
  tr: (key: string, fallback: string) => string
  formatAmount: (n: number) => string
  storeDisplayName: (code: string) => string
}) {
  const { data, placeholder, tr, formatAmount, storeDisplayName } = props
  const [appFilter, setAppFilter] = React.useState<AppFilter>("all")
  const [tableLayout, setTableLayout] = React.useState<TableLayout>("split")
  const [openKey, setOpenKey] = React.useState<string | null>(null)

  const filteredRows = React.useMemo(
    () => data.rows.filter((r) => matchesAppFilter(r.appCode, appFilter)),
    [data.rows, appFilter]
  )

  const kpi = React.useMemo(() => {
    if (appFilter === "all") return data.kpi
    return filteredRows.reduce(
      (acc, r) => ({
        appNetSales: acc.appNetSales + r.appNetSales,
        deliveryCount: acc.deliveryCount + r.deliveryCount,
        inStoreCount: acc.inStoreCount + r.inStoreCount,
        deliverySales: acc.deliverySales + r.deliverySales,
        inStoreSales: acc.inStoreSales + r.inStoreSales,
        suggestedFee: acc.suggestedFee + r.suggestedFee,
        suggestedPayout: acc.suggestedPayout + r.suggestedPayout,
        bankDepositAmt: acc.bankDepositAmt + (r.bankDepositAmt ?? 0),
      }),
      {
        appNetSales: 0,
        deliveryCount: 0,
        inStoreCount: 0,
        deliverySales: 0,
        inStoreSales: 0,
        suggestedFee: 0,
        suggestedPayout: 0,
        bankDepositAmt: 0,
      }
    )
  }, [appFilter, data.kpi, filteredRows])

  const deliveryPayout = Math.round((kpi.appNetSales - kpi.inStoreSales - kpi.suggestedFee) * 100) / 100
  const selectedApp = appName(appFilter, tr)
  const hasBank = filteredRows.some((r) => r.bankDepositAmt != null)
  const kpiBank = hasBank ? kpi.bankDepositAmt ?? 0 : null
  const kpiDiff =
    kpiBank == null ? null : Math.round((kpiBank - kpi.suggestedPayout) * 100) / 100
  const mismatchDayCount = React.useMemo(
    () => filteredRows.reduce((n, r) => n + deliveryMismatchDates(r).length, 0),
    [filteredRows]
  )

  if (placeholder) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{placeholder}</p>
  }

  const rowKey = (r: PosDeliveryAppReconcileRow) => `${r.storeCode}::${r.appCode}`
  const kindDelivery = tr("salesAppReconcileKindDelivery", "배달")
  const kindDine = tr("salesAppReconcileKindDine", "매장앱결제")
  const kindTotal = tr("salesAppReconcileKindTotal", "합계")

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground leading-relaxed">
        {tr(
          "salesAppReconcileIntro",
          "Grab·LINE MAN·Shopee를 같은 형식으로 봅니다. 합계는 배달+매장앱결제(dine)이고, 배달 건수에는 dine을 넣지 않습니다. 홀 현금·카드는 제외합니다. 예상 입금은 설정 수수료% 기준이며, 통장 입금은 해당 매장 통장 계정과목(4111 Grab·4112 LINE MAN·4113 Shopee)입니다. 행을 펼치면 방콕 달력일과 통장 인식일(익일 입금)을 맞춰 틀린 날을 찾습니다."
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        {APP_FILTERS.map((id) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={appFilter === id ? "default" : "outline"}
            onClick={() => setAppFilter(id)}
          >
            {id === "all" ? tr("salesAmountKindAll", "전체") : translateDeliveryAppCode(id, tr)}
          </Button>
        ))}
      </div>

      <SalesDeliveryAppStatementCompare
        erpRows={data.rows}
        onDetectedApp={(app) => setAppFilter(app)}
        tr={tr}
        formatAmount={formatAmount}
      />

      <div className="space-y-2">
        <p className="text-sm font-semibold">
          {tr("salesAppReconcileSectionCombined", "합계 (배달 + 매장앱결제)")}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{selectedApp}</span>
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            title={tr("salesAppReconcileKpiNet", "앱 순매출")}
            hint={merchantHint(appFilter, "net", tr)}
          >
            <p className="mt-1 text-lg font-semibold font-erp-numeric">
              {formatAmount(kpi.appNetSales)}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {kindDelivery} {formatAmount(kpi.deliverySales)} + {kindDine}{" "}
              {formatAmount(kpi.inStoreSales)}
            </p>
          </KpiCard>
          <KpiCard
            title={tr("salesAppReconcileKpiDeliveryCount", "배달 건수")}
            hint={merchantHint(appFilter, "orders", tr)}
          >
            <p className="mt-1 text-lg font-semibold font-erp-numeric">
              {kpi.deliveryCount.toLocaleString()}
            </p>
          </KpiCard>
          <KpiCard
            title={tr("salesAppReconcileKpiInStoreCount", "매장앱결제 건수")}
            hint={merchantHint(appFilter, "dine", tr)}
          >
            <p className="mt-1 text-lg font-semibold font-erp-numeric">
              {kpi.inStoreCount.toLocaleString()}
            </p>
          </KpiCard>
          <KpiCard
            title={tr("salesAppReconcileKpiPayout", "예상 입금")}
            hint={merchantHint(appFilter, "payout", tr)}
          >
            <p className="mt-1 text-lg font-semibold font-erp-numeric">
              {formatAmount(kpi.suggestedPayout)}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {tr("salesAppReconcileKpiBankDeposit", "통장 입금")}{" "}
              <span className="font-erp-numeric font-medium text-foreground">
                {kpiBank == null ? "—" : formatAmount(kpiBank)}
              </span>
              {kpiDiff != null ? (
                <>
                  {" · "}
                  {tr("salesAppReconcileCsvDiff", "차이")}{" "}
                  <span className={`font-erp-numeric font-medium ${payoutDiffClass(kpiDiff)}`}>
                    {formatSignedAmount(kpiDiff, formatAmount)}
                  </span>
                </>
              ) : null}
            </p>
          </KpiCard>
          <KpiCard
            title={tr("salesChannelReconcileMismatchDays", "틀린 날")}
            hint={tr(
              "salesChannelReconcileMismatchDaysHint",
              "같은 날짜의 POS 예상입금과 통장 차이가 1바트 이상인 날"
            )}
          >
            <p
              className={`mt-1 text-lg font-semibold font-erp-numeric ${
                mismatchDayCount > 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"
              }`}
            >
              {mismatchDayCount.toLocaleString()}
            </p>
          </KpiCard>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold">
              {tr("salesAppReconcileSectionDelivery", "배달만")}
              <span className="ml-2 text-xs font-normal text-muted-foreground">{selectedApp}</span>
            </p>
            <p className="mt-2 text-lg font-semibold font-erp-numeric">
              {formatAmount(kpi.deliverySales)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {tr("salesAppReconcileColDeliveryCount", "배달 건수")}{" "}
              <span className="font-erp-numeric font-medium text-foreground">
                {kpi.deliveryCount.toLocaleString()}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {tr("salesAppReconcileColSuggestedFee", "예상 수수료")} {formatAmount(kpi.suggestedFee)}
              {" · "}
              {tr("salesAppReconcileColSuggestedPayout", "예상 입금")} {formatAmount(deliveryPayout)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {merchantHint(appFilter, "orders", tr)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold">
              {tr("salesAppReconcileSectionDine", "매장앱결제만 (dine)")}
              <span className="ml-2 text-xs font-normal text-muted-foreground">{selectedApp}</span>
            </p>
            <p className="mt-2 text-lg font-semibold font-erp-numeric">
              {formatAmount(kpi.inStoreSales)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {tr("salesAppReconcileColInStoreCount", "매장앱 건수")}{" "}
              <span className="font-erp-numeric font-medium text-foreground">
                {kpi.inStoreCount.toLocaleString()}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {tr("salesAppReconcileDinePayoutNote", "매장앱결제는 배달 수수료%를 적용하지 않고 합계 입금에 더합니다.")}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {merchantHint(appFilter, "dine", tr)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={tableLayout === "split" ? "default" : "outline"}
          onClick={() => setTableLayout("split")}
        >
          {tr("salesAppReconcileTableSplit", "배달/dine/합계 나눠 보기")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tableLayout === "combined" ? "default" : "outline"}
          onClick={() => setTableLayout("combined")}
        >
          {tr("salesAppReconcileTableCombined", "한 행으로 보기")}
        </Button>
      </div>

      {tableLayout === "split" ? (
        <AdminTableScroll>
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="px-3 py-2 text-left">{tr("salesStoreName", "매장명")}</th>
                <th className="px-3 py-2 text-left">{tr("salesDeliveryChannel", "배달앱/채널")}</th>
                <th className="px-3 py-2 text-left">{tr("salesAppReconcileKind", "구분")}</th>
                <th className="px-3 py-2 text-right">{tr("pL_sales", "매출")}</th>
                <th className="px-3 py-2 text-right">{tr("salesOccupancy", "주문건수")}</th>
                <th className="px-3 py-2 text-right">{tr("salesAppReconcileColFeePct", "수수료%")}</th>
                <th className="px-3 py-2 text-right">{tr("salesAppReconcileColSuggestedFee", "예상 수수료")}</th>
                <th className="px-3 py-2 text-right">{tr("salesAppReconcileColSuggestedPayout", "예상 입금")}</th>
                <th className="px-3 py-2 text-right">{tr("salesAppReconcileColSettledNet", "통장 입금")}</th>
                <th className="px-3 py-2 text-right">{tr("salesAppReconcileCsvDiff", "차이")}</th>
                <th className="px-3 py-2 text-right">{tr("salesAppReconcileColSettledFee", "결산 수수료")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => {
                const k = rowKey(r)
                const open = openKey === k
                const feeLabel = r.feeSource === "none" ? "—" : `${r.feePct.toFixed(1)}%`
                const splitRows: {
                  kind: string
                  sales: number
                  count: number
                  fee: string
                  suggestedFee: number | null
                  suggestedPayout: number
                  bankDepositAmt: number | null
                  settledFee: number | null
                  emphasize?: boolean
                }[] = [
                  {
                    kind: kindDelivery,
                    sales: r.deliverySales,
                    count: r.deliveryCount,
                    fee: feeLabel,
                    suggestedFee: r.suggestedFee,
                    suggestedPayout: r.suggestedNet,
                    bankDepositAmt: null,
                    settledFee: null,
                  },
                  {
                    kind: kindDine,
                    sales: r.inStoreSales,
                    count: r.inStoreCount,
                    fee: "—",
                    suggestedFee: null,
                    suggestedPayout: r.inStoreSales,
                    bankDepositAmt: null,
                    settledFee: null,
                  },
                  {
                    kind: kindTotal,
                    sales: r.appNetSales,
                    count: r.deliveryCount + r.inStoreCount,
                    fee: feeLabel,
                    suggestedFee: r.suggestedFee,
                    suggestedPayout: r.suggestedPayout,
                    bankDepositAmt: r.bankDepositAmt ?? r.settledNet,
                    settledFee: r.settledFee,
                    emphasize: true,
                  },
                ]
                return (
                  <React.Fragment key={k}>
                    {splitRows.map((sr, idx) => (
                      <tr
                        key={`${k}-${idx}`}
                        className={
                          "cursor-pointer border-b hover:bg-muted/40 " +
                          (sr.emphasize ? "bg-muted/30 font-medium" : "")
                        }
                        onClick={() => setOpenKey(open ? null : k)}
                      >
                        <td className="px-3 py-1.5">
                          {idx === 0 ? (
                            <>
                              {storeDisplayName(r.storeCode)}
                              <MismatchCountLabel dates={deliveryMismatchDates(r)} tr={tr} />
                            </>
                          ) : (
                            ""
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          {idx === 0 ? translateDeliveryAppCode(r.appCode, tr) : ""}
                        </td>
                        <td className="px-3 py-1.5">{sr.kind}</td>
                        <td className="px-3 py-1.5 text-right font-erp-numeric">
                          {formatAmount(sr.sales)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-erp-numeric">
                          {sr.count.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-right font-erp-numeric">{sr.fee}</td>
                        <td className="px-3 py-1.5 text-right font-erp-numeric">
                          {sr.suggestedFee == null ? "—" : formatAmount(sr.suggestedFee)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-erp-numeric">
                          {formatAmount(sr.suggestedPayout)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-erp-numeric">
                          {sr.bankDepositAmt == null ? "—" : formatAmount(sr.bankDepositAmt)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-erp-numeric">
                          <DiffAmount
                            bank={sr.bankDepositAmt}
                            suggested={sr.suggestedPayout}
                            formatAmount={formatAmount}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right font-erp-numeric">
                          {sr.settledFee == null ? "—" : formatAmount(sr.settledFee)}
                        </td>
                      </tr>
                    ))}
                    {open ? (
                      <tr className="border-b bg-muted/20">
                        <td colSpan={11} className="px-3 py-2">
                          <DailySplitTable row={r} tr={tr} formatAmount={formatAmount} />
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </AdminTableScroll>
      ) : (
        <AdminTableScroll>
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="px-3 py-2 text-left">{tr("salesStoreName", "매장명")}</th>
                <th className="px-3 py-2 text-left">{tr("salesDeliveryChannel", "배달앱/채널")}</th>
                <th className="px-3 py-2 text-right">
                  {tr("salesAppReconcileColDeliverySales", "배달 순매출")}
                </th>
                <th className="px-3 py-2 text-right">
                  {tr("salesAppReconcileColDeliveryCount", "배달 건수")}
                </th>
                <th className="px-3 py-2 text-right">
                  {tr("salesAppReconcileColInStoreSales", "매장앱결제")}
                </th>
                <th className="px-3 py-2 text-right">
                  {tr("salesAppReconcileColInStoreCount", "매장앱 건수")}
                </th>
                <th className="px-3 py-2 text-right">{tr("salesAppReconcileColAppNet", "앱 합계 순매출")}</th>
                <th className="px-3 py-2 text-right">{tr("salesAppReconcileColFeePct", "수수료%")}</th>
                <th className="px-3 py-2 text-right">
                  {tr("salesAppReconcileColSuggestedFee", "예상 수수료")}
                </th>
                <th className="px-3 py-2 text-right">
                  {tr("salesAppReconcileColSuggestedPayout", "예상 입금")}
                </th>
                <th className="px-3 py-2 text-right">{tr("salesAppReconcileColSettledNet", "통장 입금")}</th>
                <th className="px-3 py-2 text-right">{tr("salesAppReconcileCsvDiff", "차이")}</th>
                <th className="px-3 py-2 text-right">{tr("salesAppReconcileColSettledFee", "결산 수수료")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => {
                const k = rowKey(r)
                const open = openKey === k
                return (
                  <React.Fragment key={k}>
                    <tr
                      className="cursor-pointer border-b hover:bg-muted/40"
                      onClick={() => setOpenKey(open ? null : k)}
                    >
                      <td className="px-3 py-1.5 font-medium">
                        {storeDisplayName(r.storeCode)}
                        <MismatchCountLabel dates={deliveryMismatchDates(r)} tr={tr} />
                      </td>
                      <td className="px-3 py-1.5">{translateDeliveryAppCode(r.appCode, tr)}</td>
                      <td className="px-3 py-1.5 text-right font-erp-numeric">
                        {formatAmount(r.deliverySales)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-erp-numeric">
                        {r.deliveryCount.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-right font-erp-numeric">
                        {formatAmount(r.inStoreSales)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-erp-numeric">
                        {r.inStoreCount.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-right font-erp-numeric font-medium">
                        {formatAmount(r.appNetSales)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-erp-numeric">
                        {r.feeSource === "none" ? "—" : `${r.feePct.toFixed(1)}%`}
                      </td>
                      <td className="px-3 py-1.5 text-right font-erp-numeric">
                        {formatAmount(r.suggestedFee)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-erp-numeric">
                        {formatAmount(r.suggestedPayout)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-erp-numeric">
                        {(r.bankDepositAmt ?? r.settledNet) == null
                          ? "—"
                          : formatAmount(r.bankDepositAmt ?? r.settledNet ?? 0)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-erp-numeric">
                        <DiffAmount
                          bank={r.bankDepositAmt ?? r.settledNet}
                          suggested={r.suggestedPayout}
                          formatAmount={formatAmount}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right font-erp-numeric">
                        {r.settledFee == null ? "—" : formatAmount(r.settledFee)}
                      </td>
                    </tr>
                    {open ? (
                      <tr className="border-b bg-muted/20">
                        <td colSpan={13} className="px-3 py-2">
                          <DailySplitTable row={r} tr={tr} formatAmount={formatAmount} />
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </AdminTableScroll>
      )}
      {data.truncated ? (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          {tr(
            "salesDataTruncatedWarning",
            "조회 기간 내 주문이 많아 일부만 반영했을 수 있습니다. 기간을 나누어 조회해 보세요."
          )}
        </p>
      ) : null}
    </div>
  )
}

function DailySplitTable(props: {
  row: PosDeliveryAppReconcileRow
  tr: (key: string, fallback: string) => string
  formatAmount: (n: number) => string
}) {
  const { row, tr, formatAmount } = props
  const [mismatchOnly, setMismatchOnly] = React.useState(true)
  const mismatchDates = deliveryMismatchDates(row)
  const visibleDays = mismatchOnly
    ? row.days.filter((d) =>
        isChannelReconcileDayMismatch(d.suggestedPayout ?? 0, d.bankDepositAmt)
      )
    : row.days

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {tr("salesAppReconcileDailyTitle", "일별 대조 (POS 예상입금 vs 통장)")}
        </p>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={mismatchOnly}
            onChange={(e) => setMismatchOnly(e.target.checked)}
          />
          {tr("salesAppReconcileCsvMismatchOnly", "틀린 날짜만")}
        </label>
      </div>
      {mismatchDates.length > 0 ? (
        <p className="text-xs text-destructive">
          {tr("salesChannelReconcileMismatchDates", "틀린 날짜")}:{" "}
          <span className="font-erp-numeric font-medium">{mismatchDates.join(", ")}</span>
        </p>
      ) : (
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          {tr("salesChannelReconcileAllDaysMatch", "조회 기간 일자가 모두 맞습니다.")}
        </p>
      )}
      {visibleDays.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {tr("salesChannelReconcileAllDaysMatch", "조회 기간 일자가 모두 맞습니다.")}
        </p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 text-left">{tr("salesPeriodDay", "일별")}</th>
              <th className="py-1 text-right">{tr("salesAppReconcileKindDelivery", "배달")}</th>
              <th className="py-1 text-right">{tr("salesAppReconcileKindDine", "매장앱결제")}</th>
              <th className="py-1 text-right">{tr("salesAppReconcileColSuggestedPayout", "예상 입금")}</th>
              <th className="py-1 text-right">{tr("salesAppReconcileColSettledNet", "통장 입금")}</th>
              <th className="py-1 text-right">{tr("salesAppReconcileCsvDiff", "차이")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleDays.map((d) => {
              const mismatch = isChannelReconcileDayMismatch(
                d.suggestedPayout ?? 0,
                d.bankDepositAmt
              )
              return (
                <tr
                  key={d.date}
                  className={mismatch ? "bg-destructive/10 text-destructive" : undefined}
                >
                  <td className="py-0.5 font-erp-numeric">{d.date}</td>
                  <td className="py-0.5 text-right font-erp-numeric">
                    {formatAmount(d.deliverySales)}
                  </td>
                  <td className="py-0.5 text-right font-erp-numeric">
                    {formatAmount(d.inStoreSales)}
                  </td>
                  <td className="py-0.5 text-right font-erp-numeric">
                    {formatAmount(d.suggestedPayout ?? 0)}
                  </td>
                  <td className="py-0.5 text-right font-erp-numeric">
                    {d.bankDepositAmt == null ? "—" : formatAmount(d.bankDepositAmt)}
                  </td>
                  <td className="py-0.5 text-right font-erp-numeric">
                    <DiffAmount
                      bank={d.bankDepositAmt}
                      suggested={d.suggestedPayout ?? 0}
                      formatAmount={formatAmount}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
