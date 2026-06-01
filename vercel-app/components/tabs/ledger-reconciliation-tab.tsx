"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import {
  AccountingEmptyState,
  AccountingPeriodChip,
  AccountingTableBodyRow,
  AccountingTableHead,
  AccountingTableShell,
} from "@/components/admin/accounting-result-primitives"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getSubledgerGlReconciliation, type SubledgerGlReconciliationData } from "@/lib/api-client"
import {
  accountingResultTdCn,
  accountingResultTdRightCn,
  accountingResultThCn,
} from "@/lib/accounting-result-ui"
import { formatBahtInteger as formatBaht } from "@/lib/financial-amount-format"
import { cn } from "@/lib/utils"

type LedgerReconciliationTabProps = {
  yearMonth: string
  storeFilter: string
  hideControls?: boolean
  queryToken?: number
}

export function LedgerReconciliationTab({
  yearMonth,
  storeFilter,
  queryToken = 0,
}: LedgerReconciliationTabProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [loading, setLoading] = React.useState(false)
  const [data, setData] = React.useState<SubledgerGlReconciliationData | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!yearMonth || queryToken <= 0) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getSubledgerGlReconciliation({ yearMonth, storeFilter })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) {
          setData(null)
          setError(e instanceof Error ? e.message : String(e))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [yearMonth, storeFilter, queryToken])

  const diffRecv = data?.receivables.difference ?? 0
  const diffPay = data?.payables.difference ?? 0
  const recvOk = Math.abs(diffRecv) < 1
  const payOk = Math.abs(diffPay) < 1

  if (queryToken <= 0) {
    return <AccountingEmptyState>{t("msg_click_query")}</AccountingEmptyState>
  }

  if (loading) {
    return <AccountingEmptyState>{t("msg_loading") || "Loading…"}</AccountingEmptyState>
  }

  if (error) {
    return <p className="py-6 text-center text-sm text-destructive">{error}</p>
  }

  if (!data) {
    return <AccountingEmptyState>{t("inNoData") || "No data."}</AccountingEmptyState>
  }

  return (
    <div className="space-y-4">
      <AccountingPeriodChip>
        <span className="font-mono text-foreground">{data.endStr}</span>
        <span aria-hidden>·</span>
        <span>{data.storeFilter}</span>
      </AccountingPeriodChip>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardContent className="pt-4 space-y-2">
            <div className="text-sm font-semibold">{t("bs_receivables")}</div>
            <Row label={t("recon_gl1130")} value={data.receivables.glAccount1130} />
            <Row label={t("recon_subledgerRecv")} value={data.receivables.subledgerTotal} />
            <Row
              label={t("recon_difference")}
              value={diffRecv}
              highlight={!recvOk}
              ok={recvOk}
            />
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardContent className="pt-4 space-y-2">
            <div className="text-sm font-semibold">{t("bs_payables")}</div>
            <Row label={t("recon_gl2110")} value={data.payables.glAccount2110} />
            <Row label={t("recon_subledgerPay")} value={data.payables.subledgerTotal} />
            <Row label={t("recon_difference")} value={diffPay} highlight={!payOk} ok={payOk} />
          </CardContent>
        </Card>
      </div>

      {data.riskyRevenueDeposits.length > 0 ? (
        <IssueTable
          title={t("recon_riskyRevenueDeposits")}
          hint={t("recon_riskyRevenueDepositsHint")}
          headers={[t("bankDate") || "Date", t("bankAmount") || "Amount", t("bankCategory") || "Category", t("pL_store")]}
          rows={data.riskyRevenueDeposits.map((r) => [
            r.transDate,
            formatBaht(r.amount),
            r.category,
            r.store || "—",
          ])}
        />
      ) : null}

      {data.pendingChannelSettlements.length > 0 ? (
        <IssueTable
          title={t("recon_pendingChannelSettlements")}
          hint={t("recon_pendingChannelSettlementsHint")}
          headers={["Store", t("bankDate") || "Date", "Channel", "GROSS", "NET", "Bank", "JE"]}
          rows={data.pendingChannelSettlements.map((r) => [
            r.storeCode,
            r.settleDate,
            r.channel,
            formatBaht(r.gross),
            formatBaht(r.net),
            r.bankTransactionId ? String(r.bankTransactionId) : "—",
            r.journalEntryId ? String(r.journalEntryId) : "—",
          ])}
        />
      ) : null}

      {data.receivableReceiveWithSettlementLink.length > 0 ? (
        <IssueTable
          title={t("recon_recvSettleConflict")}
          hint={t("recon_recvSettleConflictHint")}
          headers={["Bank ID", t("bankDate") || "Date", t("bankAmount") || "Amount", "Settlement IDs"]}
          rows={data.receivableReceiveWithSettlementLink.map((r) => [
            String(r.bankId),
            r.transDate,
            formatBaht(r.amount),
            r.settlementIds.join(", "),
          ])}
        />
      ) : null}

      {recvOk &&
        payOk &&
        data.riskyRevenueDeposits.length === 0 &&
        data.pendingChannelSettlements.length === 0 &&
        data.receivableReceiveWithSettlementLink.length === 0 && (
          <p className="text-sm text-emerald-800 dark:text-emerald-300">{t("recon_allClear")}</p>
        )}
    </div>
  )
}

function Row({
  label,
  value,
  highlight,
  ok,
}: {
  label: string
  value: number
  highlight?: boolean
  ok?: boolean
}) {
  return (
    <div className="flex justify-between text-sm gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`font-mono ${highlight ? "text-amber-800 font-medium" : ""} ${ok ? "text-emerald-800" : ""}`}
      >
        {formatBaht(value)}
      </span>
    </div>
  )
}

function IssueTable({
  title,
  headers,
  rows,
}: {
  title: string
  hint?: string
  headers: string[]
  rows: string[][]
}) {
  return (
    <div className="rounded-lg border border-amber-200/80 dark:border-amber-800/50 bg-amber-50/40 dark:bg-amber-950/20 p-3 space-y-2 shadow-sm">
      <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">{title}</p>
      <AccountingTableShell>
        <AccountingTableHead>
          {headers.map((h) => (
            <th key={h} className={accountingResultThCn}>
              {h}
            </th>
          ))}
        </AccountingTableHead>
        <tbody>
          {rows.map((cells, i) => (
            <AccountingTableBodyRow key={i}>
              {cells.map((c, j) => (
                <td
                  key={j}
                  className={cn(
                    j === 0 ? accountingResultTdCn : accountingResultTdRightCn,
                    "font-mono text-xs"
                  )}
                >
                  {c}
                </td>
              ))}
            </AccountingTableBodyRow>
          ))}
        </tbody>
      </AccountingTableShell>
    </div>
  )
}
