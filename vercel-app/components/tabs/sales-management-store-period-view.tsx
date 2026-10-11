"use client"

import * as React from "react"
import { ADMIN_PANEL_WARNING_CN } from "@/lib/admin-ui-standards"
import { SalesPaymentTenderGapAlert } from "@/components/tabs/sales-management-charts"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import {
  PERIOD_PAYMENT_COLUMNS,
  formatSalesAmount,
  periodPaymentAmount,
} from "@/components/tabs/sales-management-shared"
import {
  posSalesPeriodPaymentTenderGap,
  type PosSalesPaymentTenderGapItem,
} from "@/lib/pos-sales-payment-tender-gap"
import type { PeriodGroupValue } from "@/components/tabs/sales-management-ia"
import type { SalesStorePeriodFlatRow } from "@/components/tabs/sales-management-view-types"

export interface SalesStorePeriodViewProps {
  periodTruncated: boolean
  tr: (key: string, fallback: string) => string
  storePeriodPaymentTenderGaps: PosSalesPaymentTenderGapItem[]
  storeByPeriodFlatRows: SalesStorePeriodFlatRow[]
  periodGroupUi: PeriodGroupValue
}

export function SalesStorePeriodView({
  periodTruncated,
  tr,
  storePeriodPaymentTenderGaps,
  storeByPeriodFlatRows,
  periodGroupUi,
}: SalesStorePeriodViewProps) {
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
      <SalesPaymentTenderGapAlert gaps={storePeriodPaymentTenderGaps} tr={tr} />
      {storeByPeriodFlatRows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {tr("salesDataNone", "데이터 없음")}
        </p>
      ) : (
        <AdminTableScroll className="rounded-md border" hint={false}>
          <table className="w-full min-w-[1480px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="px-3 py-2 text-left">{tr("salesStoreName", "매장명")}</th>
                <th className="px-3 py-2 text-left">
                  {periodGroupUi === "hour"
                    ? tr("salesPeriodHourColumn", "시간대")
                    : tr("salesPeriod", "기간")}
                </th>
                <th className="px-3 py-2 text-right">{tr("salesOccupancy", "주문건수")}</th>
                <th className="px-3 py-2 text-right">{tr("salesGuestCount", "손님 수(홀)")}</th>
                <th className="px-3 py-2 text-right">{tr("salesHallPerOrder", "홀 건당")}</th>
                <th className="px-3 py-2 text-right">{tr("salesHallPerGuest", "홀 1인당")}</th>
                <th className="px-3 py-2 text-right">{tr("salesPerOrderInScope", "건당")}</th>
                <th className="px-3 py-2 text-right">{tr("salesSupplyAmount", "공급가액")}</th>
                <th className="px-3 py-2 text-right">{tr("salesTax", "세금")}</th>
                <th className="px-3 py-2 text-right">{tr("salesDiscountAmount", "할인 금액")}</th>
                <th className="px-3 py-2 text-right">{tr("salesServiceAmount", "서비스처리 금액")}</th>
                <th className="px-3 py-2 text-right">{tr("salesAmount", "매출액")}</th>
                {PERIOD_PAYMENT_COLUMNS.map((c) => (
                  <th key={c.field} className="px-3 py-2 text-right">
                    {tr(c.labelKey, c.fallback)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {storeByPeriodFlatRows.map((r) => {
                const tenderGap = posSalesPeriodPaymentTenderGap(r)
                return (
                <tr
                  key={`${r.storeCode}\t${r.key}`}
                  className={`border-b border-border/60 ${tenderGap !== 0 ? "bg-amber-50/80 dark:bg-amber-950/20" : ""}`}
                  title={
                    tenderGap !== 0
                      ? tr(
                          "salesPaymentTenderGapRowTitle",
                          "매출액과 결제수단 합계 불일치"
                        )
                      : undefined
                  }
                >
                  <td className="px-3 py-1.5 font-medium">{r.storeDisplay}</td>
                  <td className="px-3 py-1.5">{r.axisLabel}</td>
                  <td className="px-3 py-1.5 text-right font-erp-numeric">{r.count.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right font-erp-numeric">{r.hallGuestSum.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right font-erp-numeric">
                    {r.dineInOrderCount > 0 ? formatSalesAmount(r.salesPerDineInOrder) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right font-erp-numeric">
                    {r.hallGuestSum > 0 ? formatSalesAmount(r.salesPerGuestHall) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right font-erp-numeric">
                    {r.count > 0 ? formatSalesAmount(r.salesPerOrder) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.subtotal)}</td>
                  <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.vat)}</td>
                  <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.discount)}</td>
                  <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesAmount(r.service ?? 0)}</td>
                  <td className="px-3 py-1.5 text-right font-erp-numeric font-medium">
                    {formatSalesAmount(r.total)}
                  </td>
                  {PERIOD_PAYMENT_COLUMNS.map((c) => (
                    <td key={c.field} className="px-3 py-1.5 text-right font-erp-numeric">
                      {formatSalesAmount(periodPaymentAmount(r, c.field))}
                    </td>
                  ))}
                </tr>
                )
              })}
            </tbody>
          </table>
        </AdminTableScroll>
      )}
      <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
        {tr(
          "salesStorePeriodFootnote",
          "매장을 전체로 두면 이 기간에 주문이 있는 매장만 행으로 나옵니다. 위쪽「집계 기간」으로 년·월·주·일·요일·시간대를 바꿀 수 있습니다."
        )}
      </p>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
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
