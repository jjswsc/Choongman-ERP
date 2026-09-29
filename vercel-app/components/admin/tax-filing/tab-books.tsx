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
import { buildTaxBookStatements, resolveTaxBookMonthRange } from "@/lib/tax-book"
import type { TaxBridgeLineKey } from "@/lib/tax-management-bridge"
import { cn } from "@/lib/utils"

type BooksView = "bridge" | "vouchers" | "ledger" | "trial" | "taxIncome" | "taxBalance" | "closing"

const VIEWS: BooksView[] = ["bridge", "vouchers", "ledger", "trial", "taxIncome", "taxBalance", "closing"]

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function lineLabel(t: (k: string) => string, key: TaxBridgeLineKey): string {
  return t(`taxBooksLine_${key}`) || key
}

type AdjLine = { accountCode: string; side: "debit" | "credit"; amount: string }

type BooksQuery = { from: string; to: string; scope: string; tick: number }

export function TaxFilingBooksTab(props: {
  fromMonth: string
  toMonth: string
  filingStoreFilter: string
  searchTick: number
}) {
  const { lang } = useLang()
  const t = useT(lang)
  const [view, setView] = React.useState<BooksView>("bridge")
  const [query, setQuery] = React.useState<BooksQuery | null>(null)
  const [rangeError, setRangeError] = React.useState<string | null>(null)
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

  React.useEffect(() => {
    if (props.searchTick < 1) return
    const range = resolveTaxBookMonthRange(props.fromMonth, props.toMonth)
    if (!range.ok) {
      setRangeError(range.error)
      setQuery(null)
      setBridge(null)
      setEntries(null)
      return
    }
    setRangeError(null)
    setQuery({
      from: range.from,
      to: range.to,
      scope: props.filingStoreFilter || "All",
      tick: props.searchTick,
    })
  }, [props.searchTick])

  const load = React.useCallback(async (q: BooksQuery) => {
    const single = q.from === q.to
    setLoading(true)
    setMessage(null)
    try {
      if (single) {
        const data = await getTaxManagementBridge({
          yearMonth: q.from,
          scopeFilter: q.scope,
        })
        if (data.error && !data.report) {
          setMessage(data.error)
          setBridge(null)
          return
        }
        setBridge(data)
      } else {
        setBridge(null)
      }
      if (!single || view !== "bridge") {
        const entryView = view === "vouchers" || view === "ledger" ? view : "trial"
        const book = await getTaxBookEntries({
          fromMonth: q.from,
          toMonth: q.to,
          scopeFilter: q.scope,
          view: entryView,
        })
        if (book.error && !book.trial?.length && !book.vouchers?.length && !book.ledger?.length) {
          setMessage(book.error)
        }
        setEntries(book)
      } else {
        setEntries(null)
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [view])

  React.useEffect(() => {
    if (!query) return
    void load(query)
  }, [query, load])

  const statements = React.useMemo(() => buildTaxBookStatements(entries?.trial || []), [entries?.trial])

  const post = async (action: "payroll" | "inventory" | "vat" | "adjustment" | "closing" | "unlock") => {
    setPosting(true)
    setMessage(null)
    try {
      const res = await postTaxBookEntry({
        action,
        yearMonth: query?.from || props.fromMonth,
        scopeFilter: query?.scope || props.filingStoreFilter || "All",
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
        if (query) await load(query)
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setPosting(false)
    }
  }

  const singleMonth = Boolean(query && query.from === query.to)
  const entityMissing =
    (bridge != null && !bridge.taxEntityCode) || message === "NEED_TAX_ENTITY" || entries?.error === "NEED_TAX_ENTITY"
  const closed = Boolean(singleMonth && bridge?.periodClosed)
  const schemaReady = bridge ? bridge.schemaReady !== false : entries ? entries.schemaReady !== false : true

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
      {!query && !rangeError ? <p className="text-sm text-muted-foreground">{t("taxBooksSearchFirst")}</p> : null}
      {rangeError ? <p className="text-sm text-amber-700 dark:text-amber-400">{t(`taxBooksErr_${rangeError}`)}</p> : null}
      {query && !singleMonth ? <p className="text-sm text-muted-foreground">{t("taxBooksRangePosting")}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">{t("accCompPp30AdjLoadingChannels")}</p> : null}
      {message && message !== "NEED_TAX_ENTITY" ? <p className="text-sm">{t(`taxBooksErr_${message}`) !== `taxBooksErr_${message}` ? t(`taxBooksErr_${message}`) : message}</p> : null}
      {(bridge?.schemaReady === false || entries?.schemaReady === false) ? <p className="text-sm text-amber-700 dark:text-amber-400">{t("taxBooksSchemaMissing")}</p> : null}
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
                <th className="py-2 pr-3 text-right">{t("taxBooksColDiff")}</th>
                <th className="py-2">{t("taxBooksColReason")}</th>
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
                  <td className="py-2 pr-3 text-right tabular-nums">{money(ln.diff)}</td>
                  <td className="py-2 text-xs text-muted-foreground">{ln.reason ? t(`taxBooksReason_${ln.reason}`) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("taxBooksPosNet")} {money(bridge.report.salesSplit.posNet)} · {t("taxBooksTaxInvoiceNet")}{" "}
            {money(bridge.report.salesSplit.taxInvoiceNet)} · {t("taxBooksPurchaseNet")} {money(bridge.report.salesSplit.purchaseNet)}
          </p>
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

      {view === "taxIncome" && !loading ? (
        <div className="space-y-2">
          <p className="text-sm">
            {t("taxBooksRevenue")} {money(statements.revenue)} · {t("taxBooksExpense")} {money(statements.expense)} · {t("taxBooksIncomeNet")}{" "}
            {money(statements.netIncome)}
          </p>
          {Math.abs(statements.retainedEarnings) > 0.01 ? (
            <p className="text-sm text-muted-foreground">{t("taxBooksClosedIntoEquity")}</p>
          ) : null}
          <EntryTable
            empty={t("taxBooksNoRows")}
            rows={statements.incomeLines.map((ln) => [ln.accountCode, ln.accountName || "", t(`taxBooksSection_${ln.section}`), money(ln.amount)])}
            headers={[t("taxBooksAccount"), t("taxBooksColItem"), t("taxBooksColKind"), t("taxBooksAmount")]}
          />
        </div>
      ) : null}

      {view === "taxBalance" && !loading ? (
        <div className="space-y-2">
          <p className="text-sm">
            {t("taxBooksAssets")} {money(statements.assets)} · {t("taxBooksLiabilities")} {money(statements.liabilities)} · {t("taxBooksEquity")}{" "}
            {money(statements.equity)}
            {Math.abs(statements.unclosedProfit) > 0.01 ? ` · ${t("taxBooksIncomeNet")} ${money(statements.unclosedProfit)}` : ""}
          </p>
          <p className={cn("text-sm", statements.balanced ? "text-emerald-700" : "text-amber-700")}>
            {statements.balanced ? t("taxBooksStatementBalanced") : t("taxBooksStatementUnbalanced")}
          </p>
          <EntryTable
            empty={t("taxBooksNoRows")}
            rows={statements.balanceLines.map((ln) => [ln.accountCode, ln.accountName || "", t(`taxBooksSection_${ln.section}`), money(ln.amount)])}
            headers={[t("taxBooksAccount"), t("taxBooksColItem"), t("taxBooksColKind"), t("taxBooksAmount")]}
          />
        </div>
      ) : null}

      {view === "closing" ? (
        <div className="space-y-3">
          <p className="text-sm">
            {t("taxBooksClosingNet")} {money(bridge?.closingNetIncome)} · {t("taxBooksClosingLines")} {bridge?.closingLineCount ?? 0}
          </p>
          <p className="text-sm text-muted-foreground">{t("taxBooksCitUsesLockedProfit")}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={posting || closed || entityMissing || !schemaReady || !singleMonth} onClick={() => void post("vat")}>
              {t("taxBooksPostVat")}
            </Button>
            <Button type="button" size="sm" disabled={posting || closed || entityMissing || !schemaReady || !singleMonth} onClick={() => void post("payroll")}>
              {t("taxBooksPostPayroll")}
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={posting || closed || entityMissing || !schemaReady || !singleMonth} onClick={() => void post("inventory")}>
              {t("taxBooksPostInventory")}
            </Button>
            <Button type="button" size="sm" disabled={posting || closed || entityMissing || !schemaReady || !singleMonth} onClick={() => void post("closing")}>
              {t("taxBooksPostClosing")}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={posting || !closed || entityMissing || !singleMonth} onClick={() => void post("unlock")}>
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
              <Button type="button" size="sm" disabled={posting || closed || entityMissing || !schemaReady || !singleMonth} onClick={() => void post("adjustment")}>
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
