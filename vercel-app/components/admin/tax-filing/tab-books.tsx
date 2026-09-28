"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import {
  getTaxBookEntries,
  getTaxManagementBridge,
  postTaxBookEntry,
  type TaxBookEntriesResponse,
  type TaxManagementBridgeResponse,
} from "@/lib/api-client/tax-book"
import type { TaxBridgeLineKey } from "@/lib/tax-management-bridge"
import { cn } from "@/lib/utils"

type BooksView = "bridge" | "vouchers" | "ledger" | "trial" | "closing"

const VIEWS: BooksView[] = ["bridge", "vouchers", "ledger", "trial", "closing"]

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function lineLabel(t: (k: string) => string, key: TaxBridgeLineKey): string {
  return t(`taxBooksLine_${key}`) || key
}

type AdjLine = { accountCode: string; side: "debit" | "credit"; amount: string }

export function TaxFilingBooksTab(props: {
  filingYearMonth: string
  filingStoreFilter: string
  searchTick: number
}) {
  const { lang } = useLang()
  const t = useT(lang)
  const [view, setView] = React.useState<BooksView>("bridge")
  const [bridge, setBridge] = React.useState<TaxManagementBridgeResponse | null>(null)
  const [entries, setEntries] = React.useState<TaxBookEntriesResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [posting, setPosting] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  const [memo, setMemo] = React.useState("")
  const [adj, setAdj] = React.useState<AdjLine[]>([
    { accountCode: "", side: "debit", amount: "" },
    { accountCode: "", side: "credit", amount: "" },
  ])

  const load = React.useCallback(async () => {
    if (!/^\d{4}-\d{2}$/.test(props.filingYearMonth)) return
    setLoading(true)
    setMessage(null)
    try {
      const data = await getTaxManagementBridge({
        yearMonth: props.filingYearMonth,
        scopeFilter: props.filingStoreFilter || "All",
      })
      if (data.error && !data.report) {
        setMessage(data.error)
        setBridge(null)
        return
      }
      setBridge(data)
      if (view !== "bridge") {
        const book = await getTaxBookEntries({
          yearMonth: props.filingYearMonth,
          scopeFilter: props.filingStoreFilter || "All",
          view: view === "closing" ? "trial" : view,
        })
        setEntries(book)
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [props.filingYearMonth, props.filingStoreFilter, view])

  React.useEffect(() => {
    void load()
  }, [load, props.searchTick])

  const post = async (action: "payroll" | "inventory" | "adjustment" | "closing" | "unlock") => {
    setPosting(true)
    setMessage(null)
    try {
      const res = await postTaxBookEntry({
        action,
        yearMonth: props.filingYearMonth,
        scopeFilter: props.filingStoreFilter || "All",
        memo,
        lines:
          action === "adjustment"
            ? adj
                .map((ln) => ({
                  accountCode: ln.accountCode.trim(),
                  side: ln.side,
                  amount: Number(ln.amount) || 0,
                }))
                .filter((ln) => ln.accountCode && ln.amount > 0)
            : undefined,
      })
      if (!res.success) {
        setMessage(res.error || t("accCompUnknownError"))
      } else {
        setMessage(t("accCompPp30AdjSaved"))
        await load()
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setPosting(false)
    }
  }

  const entityMissing = bridge != null && !bridge.taxEntityCode
  const closed = Boolean(bridge?.periodClosed)
  const schemaReady = bridge?.schemaReady !== false

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("taxBooksSubHint")}</p>
      <div className="flex flex-wrap gap-2">
        {VIEWS.map((key) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={view === key ? "default" : "outline"}
            onClick={() => setView(key)}
          >
            {t(`taxBooksView_${key}`)}
          </Button>
        ))}
      </div>
      {loading ? <p className="text-sm text-muted-foreground">{t("accCompPp30AdjLoadingChannels")}</p> : null}
      {message ? <p className="text-sm">{message}</p> : null}
      {bridge && !schemaReady ? <p className="text-sm text-amber-700 dark:text-amber-400">{t("taxBooksSchemaMissing")}</p> : null}
      {entityMissing ? <p className="text-sm text-muted-foreground">{t("taxBooksNeedEntity")}</p> : null}
      {closed ? <p className="text-sm">{t("taxBooksPeriodClosed")}</p> : null}
      {bridge?.report?.recognition ? (
        <p className={cn("text-sm font-medium", bridge.report.recognition.recognized ? "text-emerald-700" : "text-muted-foreground")}>
          {bridge.report.recognition.recognized ? t("taxBooksRecognized") : t("taxBooksNotRecognized")}
        </p>
      ) : null}

      {view === "bridge" && bridge?.report ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3">{t("taxBooksColItem")}</th>
                <th className="py-2 pr-3 text-right">{t("taxBooksColManagement")}</th>
                <th className="py-2 pr-3 text-right">{t("taxBooksColJournal")}</th>
                <th className="py-2 pr-3 text-right">{t("taxBooksColFiling")}</th>
                <th className="py-2 pr-3 text-right">{t("taxBooksColTax")}</th>
                <th className="py-2 text-right">{t("taxBooksColDiff")}</th>
              </tr>
            </thead>
            <tbody>
              {bridge.report.lines.map((ln) => (
                <tr key={ln.key} className={cn("border-b", ln.hole && "bg-amber-50 dark:bg-amber-950/30")}>
                  <td className="py-2 pr-3">{lineLabel(t, ln.key)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(ln.management)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(ln.journal)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{ln.filing == null ? "—" : money(ln.filing)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(ln.taxBook)}</td>
                  <td className="py-2 text-right tabular-nums">{money(ln.diff)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {view === "vouchers" ? (
        <EntryTable
          empty={t("taxBooksNoRows")}
          rows={(entries?.vouchers || []).map((v) => [
            v.accountingDate,
            v.voucherNo,
            t(`taxBooksKind_${v.voucherKind}`) || v.voucherKind,
            v.memo || "",
            money(v.debit),
            t("taxBooksPosted"),
          ])}
          headers={[t("taxBooksColDate"), t("taxBooksColDoc"), t("taxBooksColKind"), t("taxBooksMemo"), t("taxBooksDebit"), t("taxBooksColStatus")]}
        />
      ) : null}

      {view === "ledger" ? (
        <EntryTable
          empty={t("taxBooksNoRows")}
          rows={(entries?.ledger || []).map((ln) => [
            ln.accountCode,
            ln.accountName || "",
            ln.accountingDate,
            ln.voucherNo,
            ln.memo || "",
            money(ln.debit),
            money(ln.credit),
          ])}
          headers={[t("taxBooksAccount"), t("taxBooksColItem"), t("taxBooksColDate"), t("taxBooksColDoc"), t("taxBooksMemo"), t("taxBooksDebit"), t("taxBooksCredit")]}
        />
      ) : null}

      {view === "trial" && entries?.trial ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {t("taxBooksDebit")} {money(entries.totalDebit)} · {t("taxBooksCredit")} {money(entries.totalCredit)} · {t("taxBooksColDiff")} {money(entries.diff)}
          </p>
          <EntryTable
            empty={t("taxBooksNoRows")}
            rows={entries.trial.map((r) => [r.accountCode, r.accountName || "", money(r.debit), money(r.credit)])}
            headers={[t("taxBooksAccount"), t("taxBooksColItem"), t("taxBooksDebit"), t("taxBooksCredit")]}
          />
        </div>
      ) : null}

      {view === "closing" ? (
        <div className="space-y-3">
          <p className="text-sm">
            {t("taxBooksClosingNet")} {money(bridge?.closingNetIncome)} · {t("taxBooksClosingLines")} {bridge?.closingLineCount ?? 0}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={posting || closed || entityMissing || !schemaReady} onClick={() => void post("payroll")}>
              {t("taxBooksPostPayroll")}
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={posting || closed || entityMissing || !schemaReady} onClick={() => void post("inventory")}>
              {t("taxBooksPostInventory")}
            </Button>
            <Button type="button" size="sm" disabled={posting || closed || entityMissing || !schemaReady} onClick={() => void post("closing")}>
              {t("taxBooksPostClosing")}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={posting || !closed || entityMissing} onClick={() => void post("unlock")}>
              {t("taxBooksUnlock")}
            </Button>
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">{t("taxBooksAdjustment")}</p>
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t("taxBooksMemo")} />
            {adj.map((ln, idx) => (
              <div key={idx} className="flex flex-wrap gap-2">
                <Input
                  className="w-28"
                  value={ln.accountCode}
                  placeholder={t("taxBooksAccount")}
                  onChange={(e) =>
                    setAdj((rows) => rows.map((row, i) => (i === idx ? { ...row, accountCode: e.target.value } : row)))
                  }
                />
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={ln.side}
                  onChange={(e) =>
                    setAdj((rows) =>
                      rows.map((row, i) => (i === idx ? { ...row, side: e.target.value === "credit" ? "credit" : "debit" } : row))
                    )
                  }
                >
                  <option value="debit">{t("taxBooksDebit")}</option>
                  <option value="credit">{t("taxBooksCredit")}</option>
                </select>
                <Input
                  className="w-32"
                  inputMode="decimal"
                  value={ln.amount}
                  placeholder={t("taxBooksAmount")}
                  onChange={(e) =>
                    setAdj((rows) => rows.map((row, i) => (i === idx ? { ...row, amount: e.target.value } : row)))
                  }
                />
              </div>
            ))}
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAdj((rows) => [...rows, { accountCode: "", side: "debit", amount: "" }])}
              >
                {t("taxBooksAddLine")}
              </Button>
              <Button type="button" size="sm" disabled={posting || closed || entityMissing || !schemaReady} onClick={() => void post("adjustment")}>
                {t("taxBooksSaveAdjustment")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function EntryTable({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {headers.map((h) => (
              <th key={h} className="py-2 pr-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
