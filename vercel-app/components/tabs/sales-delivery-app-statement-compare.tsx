"use client"

import * as React from "react"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { Button } from "@/components/ui/button"
import type { PosDeliveryAppReconcileRow } from "@/lib/api-client"
import {
  compareMerchantStatementToErp,
  mergeErpStatementDays,
  parseMerchantStatementCsv,
  summarizeStatementCompare,
  type MerchantStatementApp,
  type ParseMerchantStatementResult,
  type StatementCompareDay,
} from "@/lib/pos-delivery-app-statement-csv"
import { translateDeliveryAppCode } from "@/lib/sales-analytics-labels"

export function SalesDeliveryAppStatementCompare(props: {
  erpRows: PosDeliveryAppReconcileRow[]
  onDetectedApp?: (app: MerchantStatementApp) => void
  tr: (key: string, fallback: string) => string
  formatAmount: (n: number) => string
}) {
  const { erpRows, onDetectedApp, tr, formatAmount } = props
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const [fileName, setFileName] = React.useState("")
  const [parseError, setParseError] = React.useState<string | null>(null)
  const [parsed, setParsed] = React.useState<Extract<ParseMerchantStatementResult, { ok: true }> | null>(
    null
  )
  const [mismatchOnly, setMismatchOnly] = React.useState(true)

  const compareDays = React.useMemo(() => {
    if (!parsed) return [] as StatementCompareDay[]
    const erpDays = mergeErpStatementDays(erpRows, parsed.app)
    return compareMerchantStatementToErp(parsed.days, erpDays)
  }, [parsed, erpRows])

  const summary = React.useMemo(() => summarizeStatementCompare(compareDays), [compareDays])
  const visibleDays = mismatchOnly
    ? compareDays.filter((d) => d.status !== "match")
    : compareDays

  const statusLabel = (status: StatementCompareDay["status"]) => {
    if (status === "match") return tr("salesAppReconcileCsvMatch", "맞음")
    if (status === "mismatch") return tr("salesAppReconcileCsvMismatch", "틀림")
    if (status === "csv_only") return tr("salesAppReconcileCsvOnly", "CSV만")
    return tr("salesAppReconcileErpOnly", "ERP만")
  }

  const parseMessage = (code: string) => {
    if (code === "unsupported_lineman") {
      return tr(
        "salesAppReconcileCsvUnsupportedLineman",
        "LINE MAN 명세서는 아직 자동 인식하지 않습니다. Grab Transaction_Store CSV를 올려 주세요."
      )
    }
    if (code === "unsupported_shopee") {
      return tr(
        "salesAppReconcileCsvUnsupportedShopee",
        "Shopee 명세서는 아직 자동 인식하지 않습니다. Grab Transaction_Store CSV를 올려 주세요."
      )
    }
    if (code === "missing_grab_columns" || code === "unrecognized_csv" || code === "empty_csv") {
      return tr(
        "salesAppReconcileCsvUnrecognized",
        "Grab 가맹점 Transaction CSV가 아닙니다. 앱에서 받은 Transaction_Store 파일을 올려 주세요."
      )
    }
    return code
  }

  const onFile = async (file: File | null) => {
    if (!file) return
    setFileName(file.name)
    setParseError(null)
    setParsed(null)
    const text = await file.text()
    const result = parseMerchantStatementCsv(text)
    if (!result.ok) {
      setParseError(parseMessage(result.message))
      return
    }
    setParsed(result)
    onDetectedApp?.(result.app)
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">
            {tr("salesAppReconcileCsvTitle", "앱 명세서 일자 대조")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {tr(
              "salesAppReconcileCsvHint",
              "Grab Transaction_Store CSV를 올리면 조회한 ERP와 일자별로 배달·dine이 맞는지 표시합니다. 틀린 날짜만 먼저 보세요."
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
          <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
            {tr("salesAppReconcileCsvUpload", "CSV 업로드")}
          </Button>
          {parsed ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setParsed(null)
                setFileName("")
                setParseError(null)
                if (inputRef.current) inputRef.current.value = ""
              }}
            >
              {tr("salesAppReconcileCsvClear", "파일 지우기")}
            </Button>
          ) : null}
        </div>
      </div>

      {fileName ? (
        <p className="text-xs text-muted-foreground">
          {fileName}
          {parsed?.storeLabel ? ` · ${parsed.storeLabel}` : ""}
        </p>
      ) : null}
      {parseError ? <p className="text-sm text-red-700 dark:text-red-300">{parseError}</p> : null}

      {parsed ? (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            <span>
              {translateDeliveryAppCode(parsed.app, tr)} · {parsed.parsedRows.toLocaleString()}
              {tr("salesAppReconcileCsvRows", "건")}
            </span>
            <span className="text-emerald-700 dark:text-emerald-400">
              {tr("salesAppReconcileCsvMatch", "맞음")} {summary.match}
            </span>
            <span className="font-medium text-red-700 dark:text-red-300">
              {tr("salesAppReconcileCsvMismatch", "틀림")} {summary.mismatch}
            </span>
            <span>
              {tr("salesAppReconcileCsvOnly", "CSV만")} {summary.csvOnly}
            </span>
            <span>
              {tr("salesAppReconcileErpOnly", "ERP만")} {summary.erpOnly}
            </span>
          </div>
          {summary.mismatchDates.length > 0 ? (
            <p className="text-sm">
              {tr("salesAppReconcileCsvMismatchDates", "틀린 날짜")}:{" "}
              <span className="font-erp-numeric font-medium">{summary.mismatchDates.join(", ")}</span>
            </p>
          ) : (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              {tr("salesAppReconcileCsvAllMatch", "조회 기간과 CSV 일자가 모두 맞습니다.")}
            </p>
          )}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={mismatchOnly}
              onChange={(e) => setMismatchOnly(e.target.checked)}
            />
            {tr("salesAppReconcileCsvMismatchOnly", "틀린 날짜만")}
          </label>
          <AdminTableScroll>
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-2 py-1.5 text-left">{tr("salesPeriodDay", "일별")}</th>
                  <th className="px-2 py-1.5 text-left">{tr("salesAppReconcileKind", "구분")}</th>
                  <th className="px-2 py-1.5 text-right">CSV {tr("salesAppReconcileKindDelivery", "배달")}</th>
                  <th className="px-2 py-1.5 text-right">ERP {tr("salesAppReconcileKindDelivery", "배달")}</th>
                  <th className="px-2 py-1.5 text-right">{tr("salesAppReconcileCsvDiff", "차이")}</th>
                  <th className="px-2 py-1.5 text-right">CSV dine</th>
                  <th className="px-2 py-1.5 text-right">ERP dine</th>
                  <th className="px-2 py-1.5 text-right">{tr("salesAppReconcileCsvDiff", "차이")}</th>
                  <th className="px-2 py-1.5 text-right">
                    {tr("salesAppReconcileColAppNet", "앱 합계 순매출")} {tr("salesAppReconcileCsvDiff", "차이")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleDays.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-2 py-4 text-center text-muted-foreground">
                      {tr("salesAppReconcileCsvAllMatch", "조회 기간과 CSV 일자가 모두 맞습니다.")}
                    </td>
                  </tr>
                ) : (
                  visibleDays.map((d) => (
                    <tr
                      key={d.date}
                      className={
                        d.status === "match"
                          ? "border-b"
                          : "border-b bg-red-50/80 dark:bg-red-950/30"
                      }
                    >
                      <td className="px-2 py-1 font-erp-numeric">{d.date}</td>
                      <td className="px-2 py-1">{statusLabel(d.status)}</td>
                      <td className="px-2 py-1 text-right font-erp-numeric">
                        {formatAmount(d.csvDeliverySales)}
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          ({d.csvDeliveryCount})
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right font-erp-numeric">
                        {formatAmount(d.erpDeliverySales)}
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          ({d.erpDeliveryCount})
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right font-erp-numeric">
                        {formatAmount(d.deliverySalesDiff)}
                      </td>
                      <td className="px-2 py-1 text-right font-erp-numeric">
                        {formatAmount(d.csvInStoreSales)}
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          ({d.csvInStoreCount})
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right font-erp-numeric">
                        {formatAmount(d.erpInStoreSales)}
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          ({d.erpInStoreCount})
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right font-erp-numeric">
                        {formatAmount(d.inStoreSalesDiff)}
                      </td>
                      <td className="px-2 py-1 text-right font-erp-numeric font-medium">
                        {formatAmount(d.netDiff)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </AdminTableScroll>
          {parsed.totals.adjustSales !== 0 ? (
            <p className="text-xs text-muted-foreground">
              {tr(
                "salesAppReconcileCsvAdjustNote",
                "차지백·รายได้조정은 POS 주문과 직접 맞추지 않습니다. CSV 조정 합계"
              )}{" "}
              {formatAmount(parsed.totals.adjustSales)}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
