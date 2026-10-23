"use client"

import * as React from "react"
import { formatSalesAmount, formatSalesPct } from "@/components/tabs/sales-management-shared"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { translateDeliveryAppCode } from "@/lib/sales-analytics-labels"
import type { PosSalesStoreDeliveryPlatformRow } from "@/lib/api-client"
import type {
  SalesChannelChartRow,
  SalesPeriodBarXAxisProps,
  SalesPeriodChartRow,
  SalesPeriodChartYAxisProps,
  SalesStoreChartRow,
} from "@/components/tabs/sales-management-view-types"

export type StoreChannelCompareRow = {
  storeName: string
  storeDisplayName: string
  dineIn: number
  delivery: number
  takeout: number
  total: number
}

export interface SalesStoreCategoryViewProps {
  periodChartRows: SalesPeriodChartRow[]
  periodBarXAxisProps: SalesPeriodBarXAxisProps
  periodChartYAxisProps: SalesPeriodChartYAxisProps
  tr: (key: string, fallback: string) => string
  storeChartRows: SalesStoreChartRow[]
  channelChartRows: SalesChannelChartRow[]
  /** 매장×홀·배달·포장 (선택 기간) */
  storeChannelRows: StoreChannelCompareRow[]
  /** 매장×배달앱 */
  storeDeliveryPlatformRows: PosSalesStoreDeliveryPlatformRow[]
  posStoreDisplayName: (code: string) => string
}

function pctOf(part: number, whole: number): number {
  if (!(whole > 0)) return 0
  return (part / whole) * 100
}

function PctCell({ pct }: { pct: number }) {
  return (
    <td className="px-2 py-1.5 text-right font-erp-numeric text-muted-foreground whitespace-nowrap">
      {formatSalesPct(pct)}
    </td>
  )
}

function AmountCell({
  amount,
  strong,
}: {
  amount: number
  strong?: boolean
}) {
  return (
    <td
      className={`px-3 py-1.5 text-right font-erp-numeric whitespace-nowrap ${strong ? "font-semibold" : ""}`}
    >
      {formatSalesAmount(amount)}
    </td>
  )
}

function MobileMetricRow({
  label,
  amount,
  pct,
  strong,
}: {
  label: string
  amount: number
  pct: number
  strong?: boolean
}) {
  return (
    <div
      className={`grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 gap-y-0.5 ${strong ? "border-t pt-1 font-semibold" : ""}`}
    >
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums text-right">{formatSalesAmount(amount)}</span>
      <span className="w-14 tabular-nums text-right text-muted-foreground">{formatSalesPct(pct)}</span>
    </div>
  )
}

export function SalesStoreCategoryView({
  tr,
  storeChannelRows,
  storeDeliveryPlatformRows,
  posStoreDisplayName,
}: SalesStoreCategoryViewProps) {
  const pctHeader = tr("salesSharePctShort", "%")

  const storeChannelTotals = React.useMemo(
    () =>
      storeChannelRows.reduce(
        (acc, r) => ({
          dineIn: acc.dineIn + r.dineIn,
          delivery: acc.delivery + r.delivery,
          takeout: acc.takeout + r.takeout,
          total: acc.total + r.total,
        }),
        { dineIn: 0, delivery: 0, takeout: 0, total: 0 }
      ),
    [storeChannelRows]
  )

  const sortedStoreChannelRows = React.useMemo(
    () => [...storeChannelRows].sort((a, b) => b.total - a.total),
    [storeChannelRows]
  )

  const deliveryPlatformCodes = React.useMemo(() => {
    const totals = new Map<string, number>()
    for (const row of storeDeliveryPlatformRows) {
      for (const p of row.platforms) {
        totals.set(p.code, (totals.get(p.code) || 0) + p.sales)
      }
    }
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([code]) => code)
  }, [storeDeliveryPlatformRows])

  const storeDeliveryMatrixRows = React.useMemo(() => {
    return [...storeDeliveryPlatformRows]
      .map((r) => {
        const byCode = new Map(r.platforms.map((p) => [p.code, p.sales]))
        return {
          storeName: r.storeName,
          storeDisplayName: posStoreDisplayName(r.storeName),
          deliveryTotal: r.deliveryTotal,
          byCode,
        }
      })
      .sort((a, b) => b.deliveryTotal - a.deliveryTotal)
  }, [storeDeliveryPlatformRows, posStoreDisplayName])

  const storeDeliveryColumnTotals = React.useMemo(() => {
    const byCode = new Map<string, number>()
    let deliveryTotal = 0
    for (const row of storeDeliveryMatrixRows) {
      deliveryTotal += row.deliveryTotal
      for (const code of deliveryPlatformCodes) {
        byCode.set(code, (byCode.get(code) || 0) + (row.byCode.get(code) || 0))
      }
    }
    return { byCode, deliveryTotal }
  }, [storeDeliveryMatrixRows, deliveryPlatformCodes])

  if (sortedStoreChannelRows.length === 0 && storeDeliveryMatrixRows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {tr("salesDataNone", "데이터 없음")}
      </p>
    )
  }

  return (
    <>
      {sortedStoreChannelRows.length > 0 ? (
        <div className="mb-6 min-w-0">
          <h3 className="mb-2 text-sm font-semibold">
            {tr("salesByStoreChannelMatrix", "매장별 홀·배달·포장")}
          </h3>
          <div className="space-y-2 md:hidden">
            {sortedStoreChannelRows.map((r) => (
              <div key={r.storeName} className="rounded-lg border bg-card px-3 py-2.5 text-xs">
                <p className="mb-1.5 font-medium">{r.storeDisplayName}</p>
                <div className="space-y-1">
                  <MobileMetricRow
                    label={tr("salesAmountKindDineIn", "홀")}
                    amount={r.dineIn}
                    pct={pctOf(r.dineIn, r.total)}
                  />
                  <MobileMetricRow
                    label={tr("salesAmountKindDelivery", "배달")}
                    amount={r.delivery}
                    pct={pctOf(r.delivery, r.total)}
                  />
                  <MobileMetricRow
                    label={tr("salesAmountKindTakeout", "포장")}
                    amount={r.takeout}
                    pct={pctOf(r.takeout, r.total)}
                  />
                  <MobileMetricRow
                    label={tr("salesTotalLabel", "합계")}
                    amount={r.total}
                    pct={pctOf(r.total, storeChannelTotals.total)}
                    strong
                  />
                </div>
              </div>
            ))}
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs font-semibold">
              <div className="space-y-1">
                <MobileMetricRow
                  label={tr("salesAmountKindDineIn", "홀")}
                  amount={storeChannelTotals.dineIn}
                  pct={pctOf(storeChannelTotals.dineIn, storeChannelTotals.total)}
                />
                <MobileMetricRow
                  label={tr("salesAmountKindDelivery", "배달")}
                  amount={storeChannelTotals.delivery}
                  pct={pctOf(storeChannelTotals.delivery, storeChannelTotals.total)}
                />
                <MobileMetricRow
                  label={tr("salesAmountKindTakeout", "포장")}
                  amount={storeChannelTotals.takeout}
                  pct={pctOf(storeChannelTotals.takeout, storeChannelTotals.total)}
                />
                <MobileMetricRow
                  label={tr("salesTotalLabel", "합계")}
                  amount={storeChannelTotals.total}
                  pct={100}
                  strong
                />
              </div>
            </div>
          </div>
          <div className="hidden min-w-0 md:block">
            <AdminTableScroll className="rounded-lg border" hint={false}>
              <table className="min-w-[760px] w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">{tr("salesStoreName", "매장명")}</th>
                    <th className="px-3 py-2 text-right">{tr("salesAmountKindDineIn", "홀")}</th>
                    <th className="px-2 py-2 text-right text-muted-foreground font-normal">{pctHeader}</th>
                    <th className="px-3 py-2 text-right">{tr("salesAmountKindDelivery", "배달")}</th>
                    <th className="px-2 py-2 text-right text-muted-foreground font-normal">{pctHeader}</th>
                    <th className="px-3 py-2 text-right">{tr("salesAmountKindTakeout", "포장")}</th>
                    <th className="px-2 py-2 text-right text-muted-foreground font-normal">{pctHeader}</th>
                    <th className="px-3 py-2 text-right">{tr("salesTotalLabel", "합계")}</th>
                    <th className="px-2 py-2 text-right text-muted-foreground font-normal">{pctHeader}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStoreChannelRows.map((r) => (
                    <tr key={r.storeName} className="border-t">
                      <td className="px-3 py-1.5 font-medium whitespace-nowrap">{r.storeDisplayName}</td>
                      <AmountCell amount={r.dineIn} />
                      <PctCell pct={pctOf(r.dineIn, r.total)} />
                      <AmountCell amount={r.delivery} />
                      <PctCell pct={pctOf(r.delivery, r.total)} />
                      <AmountCell amount={r.takeout} />
                      <PctCell pct={pctOf(r.takeout, r.total)} />
                      <AmountCell amount={r.total} strong />
                      <PctCell pct={pctOf(r.total, storeChannelTotals.total)} />
                    </tr>
                  ))}
                  <tr className="border-t-2 bg-muted/40 font-semibold">
                    <td className="px-3 py-2">{tr("salesTotalLabel", "합계")}</td>
                    <AmountCell amount={storeChannelTotals.dineIn} strong />
                    <PctCell pct={pctOf(storeChannelTotals.dineIn, storeChannelTotals.total)} />
                    <AmountCell amount={storeChannelTotals.delivery} strong />
                    <PctCell pct={pctOf(storeChannelTotals.delivery, storeChannelTotals.total)} />
                    <AmountCell amount={storeChannelTotals.takeout} strong />
                    <PctCell pct={pctOf(storeChannelTotals.takeout, storeChannelTotals.total)} />
                    <AmountCell amount={storeChannelTotals.total} strong />
                    <PctCell pct={100} />
                  </tr>
                </tbody>
              </table>
            </AdminTableScroll>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            {tr(
              "salesStoreChannelMatrixFootnote",
              "홀·배달·포장 %는 해당 매장 합계 대비입니다. 합계 열 %는 전체 매장 합계 대비입니다."
            )}
          </p>
        </div>
      ) : null}

      {storeDeliveryMatrixRows.length > 0 && deliveryPlatformCodes.length > 0 ? (
        <div className="mb-6 min-w-0">
          <h3 className="mb-2 text-sm font-semibold">
            {tr("salesByStoreDeliveryPlatform", "매장별 배달 플랫폼")}
          </h3>
          <div className="space-y-2 md:hidden">
            {storeDeliveryMatrixRows.map((r) => (
              <div key={r.storeName} className="rounded-lg border bg-card px-3 py-2.5 text-xs">
                <p className="mb-1.5 font-medium">{r.storeDisplayName}</p>
                <div className="space-y-1">
                  {deliveryPlatformCodes.map((code) => {
                    const sales = r.byCode.get(code) || 0
                    if (sales <= 0) return null
                    return (
                      <MobileMetricRow
                        key={code}
                        label={translateDeliveryAppCode(code, tr)}
                        amount={sales}
                        pct={pctOf(sales, r.deliveryTotal)}
                      />
                    )
                  })}
                  <MobileMetricRow
                    label={tr("salesAmountKindDelivery", "배달")}
                    amount={r.deliveryTotal}
                    pct={pctOf(r.deliveryTotal, storeDeliveryColumnTotals.deliveryTotal)}
                    strong
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="hidden min-w-0 md:block">
            <AdminTableScroll className="rounded-lg border" hint={false}>
              <table className="min-w-[880px] w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">{tr("salesStoreName", "매장명")}</th>
                    {deliveryPlatformCodes.map((code) => (
                      <React.Fragment key={code}>
                        <th className="px-3 py-2 text-right">{translateDeliveryAppCode(code, tr)}</th>
                        <th className="px-2 py-2 text-right text-muted-foreground font-normal">
                          {pctHeader}
                        </th>
                      </React.Fragment>
                    ))}
                    <th className="px-3 py-2 text-right">{tr("salesAmountKindDelivery", "배달")}</th>
                    <th className="px-2 py-2 text-right text-muted-foreground font-normal">{pctHeader}</th>
                  </tr>
                </thead>
                <tbody>
                  {storeDeliveryMatrixRows.map((r) => (
                    <tr key={r.storeName} className="border-t">
                      <td className="px-3 py-1.5 font-medium whitespace-nowrap">{r.storeDisplayName}</td>
                      {deliveryPlatformCodes.map((code) => {
                        const sales = r.byCode.get(code) || 0
                        return (
                          <React.Fragment key={code}>
                            <AmountCell amount={sales} />
                            <PctCell pct={pctOf(sales, r.deliveryTotal)} />
                          </React.Fragment>
                        )
                      })}
                      <AmountCell amount={r.deliveryTotal} strong />
                      <PctCell pct={pctOf(r.deliveryTotal, storeDeliveryColumnTotals.deliveryTotal)} />
                    </tr>
                  ))}
                  <tr className="border-t-2 bg-muted/40 font-semibold">
                    <td className="px-3 py-2">{tr("salesTotalLabel", "합계")}</td>
                    {deliveryPlatformCodes.map((code) => {
                      const sales = storeDeliveryColumnTotals.byCode.get(code) || 0
                      return (
                        <React.Fragment key={code}>
                          <AmountCell amount={sales} strong />
                          <PctCell pct={pctOf(sales, storeDeliveryColumnTotals.deliveryTotal)} />
                        </React.Fragment>
                      )
                    })}
                    <AmountCell amount={storeDeliveryColumnTotals.deliveryTotal} strong />
                    <PctCell pct={100} />
                  </tr>
                </tbody>
              </table>
            </AdminTableScroll>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            {tr(
              "salesStoreDeliveryPlatformFootnote",
              "앱 %는 해당 매장 배달 합계 대비입니다. 배달 열 %는 전체 배달 합계 대비입니다."
            )}
          </p>
        </div>
      ) : null}
    </>
  )
}
