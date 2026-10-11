"use client"

import * as React from "react"
import { ADMIN_PANEL_WARNING_CN } from "@/lib/admin-ui-standards"
import { SalesPaymentTenderGapAlert, SALES_CHART_COLORS } from "@/components/tabs/sales-management-charts"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
} from "recharts"
import {
  formatSalesAmount,
  PERIOD_PAYMENT_COLUMNS,
  periodPaymentAmount,
} from "@/components/tabs/sales-management-shared"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import {
  posSalesPeriodPaymentTenderGap,
  type PosSalesPaymentTenderGapItem,
} from "@/lib/pos-sales-payment-tender-gap"
import type { PeriodGroupValue } from "@/components/tabs/sales-management-ia"
import type {
  SalesPeriodBarXAxisProps,
  SalesPeriodChartRow,
  SalesPeriodChartYAxisProps,
  SalesUserSelection,
} from "@/components/tabs/sales-management-view-types"

const COLORS = [...SALES_CHART_COLORS]

export interface SalesPeriodViewProps {
  periodTruncated: boolean
  tr: (key: string, fallback: string) => string
  showComparePeriodChart: boolean
  periodPaymentTenderGaps: PosSalesPaymentTenderGapItem[]
  canSearchAll: boolean
  selectedStoresParam: string[] | undefined
  compareStores: boolean
  userSelectedRef: React.RefObject<SalesUserSelection>
  setCompareStores: React.Dispatch<React.SetStateAction<boolean>>
  comparePeriodChartRows: Record<string, string | number>[]
  periodChartRows: SalesPeriodChartRow[]
  periodBarXAxisProps: SalesPeriodBarXAxisProps
  periodChartYAxisProps: SalesPeriodChartYAxisProps
  storesForCompareChart: string[]
  posStoreDisplayName: (code: string) => string
  periodGroupUi: PeriodGroupValue
}

export function SalesPeriodView({
  periodTruncated,
  tr,
  showComparePeriodChart,
  periodPaymentTenderGaps,
  canSearchAll,
  selectedStoresParam,
  compareStores,
  userSelectedRef,
  setCompareStores,
  comparePeriodChartRows,
  periodChartRows,
  periodBarXAxisProps,
  periodChartYAxisProps,
  storesForCompareChart,
  posStoreDisplayName,
  periodGroupUi,
}: SalesPeriodViewProps) {
  return (
    <>
      {periodTruncated ? (
        <p
          className={`mb-3 ${ADMIN_PANEL_WARNING_CN}`}
          role="status"
        >
          {tr(
            "salesDataTruncatedWarning",
            "조회 기간 내 주문이 많아 일부만 반영했을 수 있습니다. 기간을 나누어 조회해 보세요."
          )}
        </p>
      ) : null}
      {!showComparePeriodChart ? (
        <SalesPaymentTenderGapAlert gaps={periodPaymentTenderGaps} tr={tr} />
      ) : null}
      {canSearchAll && (selectedStoresParam?.length ?? 0) >= 2 ? (
        <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={compareStores}
            onCheckedChange={(c) => {
              const on = c === true
              userSelectedRef.current.compare = on
              setCompareStores(on)
            }}
          />
          <span>{tr("salesCompareByStorePeriod", "기간 차트를 매장별로 비교")}</span>
        </label>
      ) : null}
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={showComparePeriodChart ? comparePeriodChartRows : periodChartRows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="axisLabel" {...periodBarXAxisProps} />
            <YAxis {...periodChartYAxisProps} />
            <Tooltip
              formatter={(v: number, name: string) => [formatSalesAmount(v), name]}
            />
            {showComparePeriodChart ? (
              <>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {storesForCompareChart.map((s, i) => (
                  <Bar
                    key={s}
                    dataKey={`sales_${s}`}
                    fill={COLORS[i % COLORS.length]}
                    name={posStoreDisplayName(s)}
                  />
                ))}
              </>
            ) : (
              <Bar dataKey="sales" fill="#3b82f6" name={tr("pL_sales", "매출")} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <AdminTableScroll className="mt-4" lockViewport={false}>
      <table className="w-full min-w-[1480px] text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="py-2 text-left">
              {periodGroupUi === "hour"
                ? tr("salesPeriodHourColumn", "시간대")
                : tr("salesPeriod", "기간")}
            </th>
            <th className="py-2 text-right">{tr("salesOccupancy", "주문건수")}</th>
            <th className="py-2 text-right">{tr("salesGuestCount", "손님 수(홀)")}</th>
            <th className="py-2 text-right">{tr("salesHallPerOrder", "홀 건당")}</th>
            <th className="py-2 text-right">{tr("salesHallPerGuest", "홀 1인당")}</th>
            <th className="py-2 text-right">{tr("salesPerOrderInScope", "건당")}</th>
            <th className="py-2 text-right">{tr("salesSupplyAmount", "공급가액")}</th>
            <th className="py-2 text-right">{tr("salesTax", "세금")}</th>
            <th className="py-2 text-right">{tr("salesDiscountAmount", "할인 금액")}</th>
            <th className="py-2 text-right">{tr("salesServiceAmount", "서비스처리 금액")}</th>
            <th className="py-2 text-right">{tr("salesAmount", "매출액")}</th>
            {PERIOD_PAYMENT_COLUMNS.map((c) => (
              <th key={c.field} className="py-2 text-right">
                {tr(c.labelKey, c.fallback)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periodChartRows.map((r) => {
            const tenderGap = posSalesPeriodPaymentTenderGap(r)
            return (
            <tr
              key={r.key}
              className={`border-b ${tenderGap !== 0 ? "bg-amber-50/80 dark:bg-amber-950/20" : ""}`}
              title={
                tenderGap !== 0
                  ? tr(
                      "salesPaymentTenderGapRowTitle",
                      "매출액과 결제수단 합계 불일치"
                    )
                  : undefined
              }
            >
              <td className="py-1.5">{r.axisLabel}</td>
              <td className="py-1.5 text-right font-erp-numeric">{r.count.toLocaleString()}</td>
              <td className="py-1.5 text-right font-erp-numeric">{r.hallGuestSum.toLocaleString()}</td>
              <td className="py-1.5 text-right font-erp-numeric">
                {r.dineInOrderCount > 0 ? formatSalesAmount(r.salesPerDineInOrder) : "—"}
              </td>
              <td className="py-1.5 text-right font-erp-numeric">
                {r.hallGuestSum > 0 ? formatSalesAmount(r.salesPerGuestHall) : "—"}
              </td>
              <td className="py-1.5 text-right font-erp-numeric">
                {r.count > 0 ? formatSalesAmount(r.salesPerOrder) : "—"}
              </td>
              <td className="py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.subtotal)}</td>
              <td className="py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.vat)}</td>
              <td className="py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.discount)}</td>
              <td className="py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.service ?? 0)}</td>
              <td className="py-1.5 text-right font-erp-numeric font-medium">{formatSalesAmount(r.total)}</td>
              {PERIOD_PAYMENT_COLUMNS.map((c) => (
                <td key={c.field} className="py-1.5 text-right font-erp-numeric">
                  {formatSalesAmount(periodPaymentAmount(r, c.field))}
                </td>
              ))}
            </tr>
            )
          })}
          {periodChartRows.length > 0 && (
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
              <td className="py-2">{tr("salesTotalLabel", "합계")}</td>
              <td className="py-2 text-right font-erp-numeric">
                {periodChartRows.reduce((a, x) => a + x.count, 0).toLocaleString()}
              </td>
              <td className="py-2 text-right font-erp-numeric">
                {periodChartRows.reduce((a, x) => a + x.hallGuestSum, 0).toLocaleString()}
              </td>
              <td className="py-2 text-right font-erp-numeric">
                {(() => {
                  const c = periodChartRows.reduce((a, x) => a + x.dineInOrderCount, 0)
                  const t = periodChartRows.reduce((a, x) => a + x.dineInTotal, 0)
                  return c > 0 ? formatSalesAmount(Math.round((t / c) * 100) / 100) : "—"
                })()}
              </td>
              <td className="py-2 text-right font-erp-numeric">
                {(() => {
                  const gD = periodChartRows.reduce((a, x) => a + x.dineInGuestSum, 0)
                  const tD = periodChartRows.reduce((a, x) => a + x.dineInTotal, 0)
                  const gH = periodChartRows.reduce((a, x) => a + x.hallGuestSum, 0)
                  const tAll = periodChartRows.reduce((a, x) => a + x.total, 0)
                  if (gD > 0 && tD > 0)
                    return formatSalesAmount(Math.round((tD / gD) * 100) / 100)
                  if (gH > 0 && tAll > 0)
                    return formatSalesAmount(Math.round((tAll / gH) * 100) / 100)
                  return "—"
                })()}
              </td>
              <td className="py-2 text-right font-erp-numeric">
                {(() => {
                  const c = periodChartRows.reduce((a, x) => a + x.count, 0)
                  const t = periodChartRows.reduce((a, x) => a + x.total, 0)
                  return c > 0 ? formatSalesAmount(Math.round((t / c) * 100) / 100) : "—"
                })()}
              </td>
              <td className="py-2 text-right font-erp-numeric">
                {formatSalesAmount(periodChartRows.reduce((a, x) => a + x.subtotal, 0))}
              </td>
              <td className="py-2 text-right font-erp-numeric">
                {formatSalesAmount(periodChartRows.reduce((a, x) => a + x.vat, 0))}
              </td>
              <td className="py-2 text-right font-erp-numeric">
                {formatSalesAmount(periodChartRows.reduce((a, x) => a + x.discount, 0))}
              </td>
              <td className="py-2 text-right font-erp-numeric">
                {formatSalesAmount(periodChartRows.reduce((a, x) => a + (x.service ?? 0), 0))}
              </td>
              <td className="py-2 text-right font-erp-numeric">
                {formatSalesAmount(periodChartRows.reduce((a, x) => a + x.total, 0))}
              </td>
              {PERIOD_PAYMENT_COLUMNS.map((c) => (
                <td key={c.field} className="py-2 text-right font-erp-numeric">
                  {formatSalesAmount(
                    periodChartRows.reduce((a, x) => a + periodPaymentAmount(x, c.field), 0)
                  )}
                </td>
              ))}
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
        )}{" "}
        {tr(
          "salesPeriodTenderFootnote",
          "결제수단별 열은 POS 주문 payment_cash·payment_card·payment_qr·payment_delivery_app·payment_other 합계입니다. 매출액과 다르면 상단 경고·노란 행으로 표시됩니다."
        )}
      </p>
    </>
  )
}
