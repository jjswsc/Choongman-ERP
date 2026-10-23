"use client"

import * as React from "react"
import { formatSalesAmount } from "@/components/tabs/sales-management-shared"
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

export function SalesStoreCategoryView({
  tr,
  storeChannelRows,
  storeDeliveryPlatformRows,
  posStoreDisplayName,
}: SalesStoreCategoryViewProps) {
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
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{tr("salesAmountKindDineIn", "홀")}</dt>
                    <dd>{formatSalesAmount(r.dineIn)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{tr("salesAmountKindDelivery", "배달")}</dt>
                    <dd>{formatSalesAmount(r.delivery)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{tr("salesAmountKindTakeout", "포장")}</dt>
                    <dd>{formatSalesAmount(r.takeout)}</dd>
                  </div>
                  <div className="col-span-2 flex justify-between gap-2 border-t pt-1 font-semibold">
                    <dt>{tr("salesTotalLabel", "합계")}</dt>
                    <dd>{formatSalesAmount(r.total)}</dd>
                  </div>
                </dl>
              </div>
            ))}
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs font-semibold">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
                <div className="flex justify-between gap-2">
                  <dt className="font-medium">{tr("salesAmountKindDineIn", "홀")}</dt>
                  <dd>{formatSalesAmount(storeChannelTotals.dineIn)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="font-medium">{tr("salesAmountKindDelivery", "배달")}</dt>
                  <dd>{formatSalesAmount(storeChannelTotals.delivery)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="font-medium">{tr("salesAmountKindTakeout", "포장")}</dt>
                  <dd>{formatSalesAmount(storeChannelTotals.takeout)}</dd>
                </div>
                <div className="col-span-2 flex justify-between gap-2 border-t pt-1">
                  <dt>{tr("salesTotalLabel", "합계")}</dt>
                  <dd>{formatSalesAmount(storeChannelTotals.total)}</dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="hidden min-w-0 md:block">
            <AdminTableScroll className="rounded-lg border" hint={false}>
              <table className="min-w-[560px] w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">{tr("salesStoreName", "매장명")}</th>
                    <th className="px-3 py-2 text-right">{tr("salesAmountKindDineIn", "홀")}</th>
                    <th className="px-3 py-2 text-right">{tr("salesAmountKindDelivery", "배달")}</th>
                    <th className="px-3 py-2 text-right">{tr("salesAmountKindTakeout", "포장")}</th>
                    <th className="px-3 py-2 text-right">{tr("salesTotalLabel", "합계")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStoreChannelRows.map((r) => (
                    <tr key={r.storeName} className="border-t">
                      <td className="px-3 py-1.5 font-medium">{r.storeDisplayName}</td>
                      <td className="px-3 py-1.5 text-right font-erp-numeric">
                        {formatSalesAmount(r.dineIn)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-erp-numeric">
                        {formatSalesAmount(r.delivery)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-erp-numeric">
                        {formatSalesAmount(r.takeout)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-erp-numeric font-semibold">
                        {formatSalesAmount(r.total)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 bg-muted/40 font-semibold">
                    <td className="px-3 py-2">{tr("salesTotalLabel", "합계")}</td>
                    <td className="px-3 py-2 text-right font-erp-numeric">
                      {formatSalesAmount(storeChannelTotals.dineIn)}
                    </td>
                    <td className="px-3 py-2 text-right font-erp-numeric">
                      {formatSalesAmount(storeChannelTotals.delivery)}
                    </td>
                    <td className="px-3 py-2 text-right font-erp-numeric">
                      {formatSalesAmount(storeChannelTotals.takeout)}
                    </td>
                    <td className="px-3 py-2 text-right font-erp-numeric">
                      {formatSalesAmount(storeChannelTotals.total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </AdminTableScroll>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            {tr(
              "salesStoreChannelMatrixFootnote",
              "선택 기간·매장의 완료 매출(POS 영업일)입니다. 당일 차트의 미결제 테이블은 기간 비교에 포함하지 않습니다."
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
                <dl className="space-y-1 tabular-nums">
                  {deliveryPlatformCodes.map((code) => {
                    const sales = r.byCode.get(code) || 0
                    if (sales <= 0) return null
                    return (
                      <div key={code} className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">{translateDeliveryAppCode(code, tr)}</dt>
                        <dd>{formatSalesAmount(sales)}</dd>
                      </div>
                    )
                  })}
                  <div className="flex justify-between gap-2 border-t pt-1 font-semibold">
                    <dt>{tr("salesAmountKindDelivery", "배달")}</dt>
                    <dd>{formatSalesAmount(r.deliveryTotal)}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
          <div className="hidden min-w-0 md:block">
            <AdminTableScroll className="rounded-lg border" hint={false}>
              <table className="min-w-[640px] w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">{tr("salesStoreName", "매장명")}</th>
                    {deliveryPlatformCodes.map((code) => (
                      <th key={code} className="px-3 py-2 text-right">
                        {translateDeliveryAppCode(code, tr)}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right">{tr("salesAmountKindDelivery", "배달")}</th>
                  </tr>
                </thead>
                <tbody>
                  {storeDeliveryMatrixRows.map((r) => (
                    <tr key={r.storeName} className="border-t">
                      <td className="px-3 py-1.5 font-medium">{r.storeDisplayName}</td>
                      {deliveryPlatformCodes.map((code) => (
                        <td key={code} className="px-3 py-1.5 text-right font-erp-numeric">
                          {formatSalesAmount(r.byCode.get(code) || 0)}
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-right font-erp-numeric font-semibold">
                        {formatSalesAmount(r.deliveryTotal)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 bg-muted/40 font-semibold">
                    <td className="px-3 py-2">{tr("salesTotalLabel", "합계")}</td>
                    {deliveryPlatformCodes.map((code) => (
                      <td key={code} className="px-3 py-2 text-right font-erp-numeric">
                        {formatSalesAmount(storeDeliveryColumnTotals.byCode.get(code) || 0)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-erp-numeric">
                      {formatSalesAmount(storeDeliveryColumnTotals.deliveryTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </AdminTableScroll>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            {tr(
              "salesStoreDeliveryPlatformFootnote",
              "배달 주문만 집계합니다. 앱 코드가 없는 건은「앱 미지정」입니다."
            )}
          </p>
        </div>
      ) : null}
    </>
  )
}
