"use client"

import * as React from "react"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { Card, CardContent } from "@/components/ui/card"
import type { PosKbankQrReconcileResult } from "@/lib/api-client"

export const EMPTY_POS_KBANK_QR_RECONCILE: PosKbankQrReconcileResult = {
  rows: [],
  kpi: { orderCount: 0, qrSales: 0, storeCount: 0 },
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

export function SalesKbankQrReconcilePanel(props: {
  data: PosKbankQrReconcileResult
  placeholder?: string | null
  tr: (key: string, fallback: string) => string
  formatAmount: (n: number) => string
  storeDisplayName: (code: string) => string
}) {
  const { data, placeholder, tr, formatAmount, storeDisplayName } = props
  const [expanded, setExpanded] = React.useState<string | null>(null)

  if (placeholder) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{placeholder}</p>
  }

  const kpi = data.kpi

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {tr(
          "salesKbankQrReconcileIntro",
          "당일 마감은 POS QR(PromptPay) 합계를 기준으로 하세요. K Merchant Report는 보통 익일에 반영되므로, 익일 오전 은행 리포트·입금과 2차 대사합니다."
        )}
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          title={tr("salesKbankQrKpiSales", "POS QR 합계")}
          hint={tr("salesKbankQrKpiSalesHint", "완료 주문의 payment_qr (영업일)")}
        >
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatAmount(kpi.qrSales)}</p>
        </KpiCard>
        <KpiCard
          title={tr("salesKbankQrKpiCount", "QR 결제 건수")}
          hint={tr("salesKbankQrKpiCountHint", "payment_qr > 0 인 완료 주문")}
        >
          <p className="mt-1 text-2xl font-semibold tabular-nums">{kpi.orderCount.toLocaleString()}</p>
        </KpiCard>
        <KpiCard
          title={tr("salesKbankQrKpiStores", "매장 수")}
          hint={tr("salesKbankQrKpiStoresHint", "QR 매출이 있는 매장")}
        >
          <p className="mt-1 text-2xl font-semibold tabular-nums">{kpi.storeCount.toLocaleString()}</p>
        </KpiCard>
      </div>

      <p className="rounded-md border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
        {tr(
          "salesKbankQrReconcileNextDayNote",
          "K Merchant / 계좌 입금 대조는 익일 작업입니다. 당일 매장에서는 위 POS 금액을 결산 QR 칸에 맞추면 됩니다."
        )}
      </p>

      {data.rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {tr("salesKbankQrReconcileEmpty", "선택 기간에 POS QR 결제가 없습니다.")}
        </p>
      ) : (
        <AdminTableScroll>
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 text-left">{tr("store", "매장")}</th>
                <th className="py-2 text-right">{tr("salesKbankQrColCount", "건수")}</th>
                <th className="py-2 text-right">{tr("salesKbankQrColSales", "QR 합계")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const open = expanded === r.storeCode
                return (
                  <React.Fragment key={r.storeCode}>
                    <tr
                      className="cursor-pointer border-b hover:bg-muted/40"
                      onClick={() => setExpanded(open ? null : r.storeCode)}
                    >
                      <td className="py-2 text-left">
                        <span className="mr-1 text-muted-foreground">{open ? "▾" : "▸"}</span>
                        {storeDisplayName(r.storeCode) || r.storeCode}
                      </td>
                      <td className="py-2 text-right tabular-nums">{r.orderCount.toLocaleString()}</td>
                      <td className="py-2 text-right font-erp-numeric">{formatAmount(r.qrSales)}</td>
                    </tr>
                    {open
                      ? r.days.map((d) => (
                          <tr key={`${r.storeCode}-${d.date}`} className="border-b bg-muted/20 text-muted-foreground">
                            <td className="py-1.5 pl-8 text-left">{d.date}</td>
                            <td className="py-1.5 text-right tabular-nums">{d.orderCount.toLocaleString()}</td>
                            <td className="py-1.5 text-right font-erp-numeric">{formatAmount(d.qrSales)}</td>
                          </tr>
                        ))
                      : null}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </AdminTableScroll>
      )}
    </div>
  )
}
