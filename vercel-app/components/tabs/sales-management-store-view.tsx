"use client"

import * as React from "react"
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from "recharts"
import { formatSalesAmount } from "@/components/tabs/sales-management-shared"
import {
  SalesSortableTh,
  sortSalesRows,
  useSalesTableSort,
} from "@/components/tabs/sales-management-sortable"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import type {
  SalesPeriodBarXAxisProps,
  SalesPeriodChartYAxisProps,
  SalesStoreChartRow,
  SalesStoreDataRow,
} from "@/components/tabs/sales-management-view-types"

type StoreSortKey =
  | "store"
  | "total"
  | "count"
  | "hallGuests"
  | "hallPerOrder"
  | "hallPerGuest"
  | "perOrder"
  | "subtotal"
  | "vat"
  | "discount"
  | "service"

type EnrichedStoreRow = SalesStoreDataRow & {
  storeDisplay: string
  hallGuestSum: number
  salesPerDineInOrder: number
  salesPerGuestHall: number
  salesPerOrder: number
}

function enrichStoreRow(r: SalesStoreDataRow, posStoreDisplayName: (code: string) => string): EnrichedStoreRow {
  const guestSum = r.guestSum ?? 0
  const dineInOrderCount = r.dineInOrderCount ?? 0
  const dineInGuestSum = r.dineInGuestSum ?? 0
  const dineInTotal = r.dineInTotal ?? 0
  const legacyBreakdown =
    r.dineInOrderCount === undefined &&
    r.dineInGuestSum === undefined &&
    r.dineInTotal === undefined
  const hallGuestSum = legacyBreakdown ? guestSum : dineInGuestSum

  const salesPerDineInOrder =
    dineInOrderCount > 0
      ? r.salesPerDineInOrder != null && r.salesPerDineInOrder > 0
        ? r.salesPerDineInOrder
        : Math.round((dineInTotal / dineInOrderCount) * 100) / 100
      : 0

  let salesPerGuestHall = 0
  if (dineInGuestSum > 0 && dineInTotal > 0) {
    salesPerGuestHall =
      r.salesPerGuest != null && r.salesPerGuest > 0
        ? r.salesPerGuest
        : Math.round((dineInTotal / dineInGuestSum) * 100) / 100
  } else if (legacyBreakdown && hallGuestSum > 0 && r.total > 0) {
    salesPerGuestHall =
      r.salesPerGuest != null && r.salesPerGuest > 0
        ? r.salesPerGuest
        : Math.round((r.total / hallGuestSum) * 100) / 100
  }

  const salesPerOrder =
    r.count > 0
      ? r.salesPerOrder != null
        ? r.salesPerOrder
        : Math.round((r.total / r.count) * 100) / 100
      : 0

  return {
    ...r,
    storeDisplay: posStoreDisplayName(r.storeName),
    hallGuestSum,
    salesPerDineInOrder,
    salesPerGuestHall,
    salesPerOrder,
  }
}

export interface SalesStoreViewProps {
  storeChartRows: SalesStoreChartRow[]
  periodBarXAxisProps: SalesPeriodBarXAxisProps
  periodChartYAxisProps: SalesPeriodChartYAxisProps
  tr: (key: string, fallback: string) => string
  scopedStoreData: SalesStoreDataRow[]
  posStoreDisplayName: (code: string) => string
}

export function SalesStoreView({
  storeChartRows,
  periodBarXAxisProps,
  periodChartYAxisProps,
  tr,
  scopedStoreData,
  posStoreDisplayName,
}: SalesStoreViewProps) {
  const { sortKey, sortDir, toggleSort } = useSalesTableSort<StoreSortKey>("total", "desc")

  const enrichedRows = React.useMemo(
    () => scopedStoreData.map((r) => enrichStoreRow(r, posStoreDisplayName)),
    [scopedStoreData, posStoreDisplayName]
  )

  const sortedRows = React.useMemo(
    () =>
      sortSalesRows(
        enrichedRows,
        sortDir,
        (r) => {
          switch (sortKey) {
            case "store":
              return r.storeDisplay
            case "count":
              return r.count
            case "hallGuests":
              return r.hallGuestSum
            case "hallPerOrder":
              return r.salesPerDineInOrder
            case "hallPerGuest":
              return r.salesPerGuestHall
            case "perOrder":
              return r.salesPerOrder
            case "subtotal":
              return r.subtotal
            case "vat":
              return r.vat
            case "discount":
              return r.discount ?? 0
            case "service":
              return r.service ?? 0
            case "total":
            default:
              return r.total
          }
        },
        (a, b) => a.storeDisplay.localeCompare(b.storeDisplay, undefined, { sensitivity: "base" })
      ),
    [enrichedRows, sortKey, sortDir]
  )

  if (scopedStoreData.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {tr("salesDataNone", "데이터 없음")}
      </p>
    )
  }
  return (
    <>
      <div className="mb-4 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={storeChartRows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="axisLabel" {...periodBarXAxisProps} />
            <YAxis {...periodChartYAxisProps} />
            <Tooltip formatter={(v: number) => [formatSalesAmount(v), tr("pL_sales", "매출")]} />
            <Bar dataKey="sales" fill="#3b82f6" name={tr("pL_sales", "매출")} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <AdminTableScroll className="rounded-lg border" hint={false}>
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="bg-slate-100">
            <tr>
              <SalesSortableTh
                label={tr("salesStoreName", "매장명")}
                active={sortKey === "store"}
                dir={sortDir}
                align="left"
                className="font-semibold text-slate-700"
                onClick={() => toggleSort("store")}
              />
              <SalesSortableTh
                label={tr("salesAmount", "매출액")}
                active={sortKey === "total"}
                dir={sortDir}
                className="font-semibold text-slate-700 md:hidden"
                onClick={() => toggleSort("total")}
              />
              <SalesSortableTh
                label={tr("salesOccupancy", "주문건수")}
                active={sortKey === "count"}
                dir={sortDir}
                className="font-semibold text-slate-700"
                onClick={() => toggleSort("count")}
              />
              <SalesSortableTh
                label={tr("salesGuestCount", "손님 수(홀)")}
                active={sortKey === "hallGuests"}
                dir={sortDir}
                className="font-semibold text-slate-700"
                onClick={() => toggleSort("hallGuests")}
              />
              <SalesSortableTh
                label={tr("salesHallPerOrder", "홀 건당")}
                active={sortKey === "hallPerOrder"}
                dir={sortDir}
                className="font-semibold text-slate-700"
                onClick={() => toggleSort("hallPerOrder")}
              />
              <SalesSortableTh
                label={tr("salesHallPerGuest", "홀 1인당")}
                active={sortKey === "hallPerGuest"}
                dir={sortDir}
                className="font-semibold text-slate-700"
                onClick={() => toggleSort("hallPerGuest")}
              />
              <SalesSortableTh
                label={tr("salesPerOrderInScope", "건당")}
                active={sortKey === "perOrder"}
                dir={sortDir}
                className="font-semibold text-slate-700"
                onClick={() => toggleSort("perOrder")}
              />
              <SalesSortableTh
                label={tr("salesSupplyAmount", "공급가액")}
                active={sortKey === "subtotal"}
                dir={sortDir}
                className="font-semibold text-slate-700"
                onClick={() => toggleSort("subtotal")}
              />
              <SalesSortableTh
                label={tr("salesTax", "세금")}
                active={sortKey === "vat"}
                dir={sortDir}
                className="font-semibold text-slate-700"
                onClick={() => toggleSort("vat")}
              />
              <SalesSortableTh
                label={tr("salesDiscountAmount", "할인 금액")}
                active={sortKey === "discount"}
                dir={sortDir}
                className="font-semibold text-slate-700"
                onClick={() => toggleSort("discount")}
              />
              <SalesSortableTh
                label={tr("salesServiceAmount", "서비스처리 금액")}
                active={sortKey === "service"}
                dir={sortDir}
                className="font-semibold text-slate-700"
                onClick={() => toggleSort("service")}
              />
              <SalesSortableTh
                label={tr("salesAmount", "매출액")}
                active={sortKey === "total"}
                dir={sortDir}
                className="hidden font-semibold text-slate-700 md:table-cell"
                onClick={() => toggleSort("total")}
              />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => {
              const dineInOrderCount = r.dineInOrderCount ?? 0
              return (
              <tr key={r.storeName} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium">{r.storeDisplay}</td>
                <td className="px-4 py-2.5 text-right font-erp-numeric font-semibold md:hidden">{formatSalesAmount(r.total)}</td>
                <td className="px-4 py-2.5 text-right font-erp-numeric">{r.count.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right font-erp-numeric">{r.hallGuestSum.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right font-erp-numeric">
                  {dineInOrderCount > 0 ? formatSalesAmount(r.salesPerDineInOrder) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-erp-numeric">
                  {r.hallGuestSum > 0 ? formatSalesAmount(r.salesPerGuestHall) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-erp-numeric">
                  {r.count > 0 ? formatSalesAmount(r.salesPerOrder) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-erp-numeric">{formatSalesAmount(r.subtotal)}</td>
                <td className="px-4 py-2.5 text-right font-erp-numeric">{formatSalesAmount(r.vat)}</td>
                <td className="px-4 py-2.5 text-right font-erp-numeric">{formatSalesAmount(r.discount ?? 0)}</td>
                <td className="px-4 py-2.5 text-right font-erp-numeric">{formatSalesAmount(r.service ?? 0)}</td>
                <td className="hidden px-4 py-2.5 text-right font-erp-numeric font-semibold md:table-cell">{formatSalesAmount(r.total)}</td>
              </tr>
              )
            })}
            {scopedStoreData.length > 0 && (
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td className="px-4 py-3">{tr("salesTotalLabel", "합계")}</td>
                <td className="px-4 py-3 text-right font-erp-numeric md:hidden">
                  {formatSalesAmount(scopedStoreData.reduce((a, r) => a + r.total, 0))}
                </td>
                <td className="px-4 py-3 text-right font-erp-numeric">
                  {scopedStoreData.reduce((a, r) => a + r.count, 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-erp-numeric">
                  {scopedStoreData.reduce((a, r) => {
                    const g = r.guestSum ?? 0
                    const legacy =
                      r.dineInGuestSum === undefined &&
                      r.dineInOrderCount === undefined &&
                      r.dineInTotal === undefined
                    const hall = legacy ? g : (r.dineInGuestSum ?? 0)
                    return a + hall
                  }, 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-erp-numeric">
                  {(() => {
                    const c = scopedStoreData.reduce((a, r) => a + (r.dineInOrderCount ?? 0), 0)
                    const t = scopedStoreData.reduce((a, r) => a + (r.dineInTotal ?? 0), 0)
                    return c > 0 ? formatSalesAmount(Math.round((t / c) * 100) / 100) : "—"
                  })()}
                </td>
                <td className="px-4 py-3 text-right font-erp-numeric">
                  {(() => {
                    const gD = scopedStoreData.reduce((a, r) => a + (r.dineInGuestSum ?? 0), 0)
                    const tD = scopedStoreData.reduce((a, r) => a + (r.dineInTotal ?? 0), 0)
                    const gH = scopedStoreData.reduce((a, r) => {
                      const g = r.guestSum ?? 0
                      const legacy =
                        r.dineInGuestSum === undefined &&
                        r.dineInOrderCount === undefined &&
                        r.dineInTotal === undefined
                      return a + (legacy ? g : (r.dineInGuestSum ?? 0))
                    }, 0)
                    const tAll = scopedStoreData.reduce((a, r) => a + r.total, 0)
                    if (gD > 0 && tD > 0)
                      return formatSalesAmount(Math.round((tD / gD) * 100) / 100)
                    if (gH > 0 && tAll > 0)
                      return formatSalesAmount(Math.round((tAll / gH) * 100) / 100)
                    return "—"
                  })()}
                </td>
                <td className="px-4 py-3 text-right font-erp-numeric">
                  {(() => {
                    const c = scopedStoreData.reduce((a, r) => a + r.count, 0)
                    const t = scopedStoreData.reduce((a, r) => a + r.total, 0)
                    return c > 0 ? formatSalesAmount(Math.round((t / c) * 100) / 100) : "—"
                  })()}
                </td>
                <td className="px-4 py-3 text-right font-erp-numeric">
                  {formatSalesAmount(scopedStoreData.reduce((a, r) => a + r.subtotal, 0))}
                </td>
                <td className="px-4 py-3 text-right font-erp-numeric">
                  {formatSalesAmount(scopedStoreData.reduce((a, r) => a + r.vat, 0))}
                </td>
                <td className="px-4 py-3 text-right font-erp-numeric">
                  {formatSalesAmount(scopedStoreData.reduce((a, r) => a + (r.discount ?? 0), 0))}
                </td>
                <td className="px-4 py-3 text-right font-erp-numeric">
                  {formatSalesAmount(scopedStoreData.reduce((a, r) => a + (r.service ?? 0), 0))}
                </td>
                <td className="hidden px-4 py-3 text-right font-erp-numeric md:table-cell">
                  {formatSalesAmount(scopedStoreData.reduce((a, r) => a + r.total, 0))}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </AdminTableScroll>
      <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
        {tr(
          "salesAmountBreakdownFootnote",
          "공급가액은 품목 합계(할인 전)입니다. 세금·매출액은 POS 요금·부가세 계산 규칙이 반영된 값입니다. 할인 금액은 수동 할인과 쿠폰 할인의 합이며, 서비스처리 금액은 별도 집계됩니다."
        )}{" "}
        {tr(
          "salesGuestMetricsFootnote",
          "손님 수(홀)·홀 건당·홀 1인당은 dine_in 주문과 POS guest_count만 사용합니다. 건당은 현재 매출액 종류 필터에 포함된 주문 전체의 매출÷건수입니다. 포장·배달은 인원 미입력이므로 홀 지표와 섞지 않습니다."
        )}
      </p>
      {scopedStoreData.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {tr("salesNoSalesData", "해당 기간 매출 데이터가 없습니다.")}
        </p>
      )}
    </>
  )
}
