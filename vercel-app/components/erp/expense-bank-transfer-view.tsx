"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { ExpenseAccrualPlanItem } from "@/lib/api-client"
import { appAlert } from "@/lib/app-message"
import { Check, Copy, Download, Printer, Wallet } from "lucide-react"

type Tt = (key: string, fallback: string) => string

const BANK_PRESETS = ["K-BANK", "SCB", "BBL", "Krungsri", "PromptPay", "QR CODE", "Other"] as const

function fmtAmount(n: number) {
  return (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function normKey(s: string) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]/g, "")
}

function transferRows(plans: ExpenseAccrualPlanItem[]) {
  return plans.filter((r) => r.status === "approved" && (r.remainingAmount || 0) > 0)
}

export type TransferDisplayRow = ExpenseAccrualPlanItem & {
  _aggregateCount?: number
  _sourceIds?: number[]
  _isAggregate?: boolean
}

function sortByPayee(rows: ExpenseAccrualPlanItem[]) {
  return [...rows].sort((a, b) => {
    const pa = String(a.payeeName || "").localeCompare(String(b.payeeName || ""), undefined, {
      sensitivity: "base",
    })
    if (pa !== 0) return pa
    const ba = normKey(a.payeeBankAccountNo || "").localeCompare(normKey(b.payeeBankAccountNo || ""))
    if (ba !== 0) return ba
    return (a.dueDate || a.expenseDate || "").localeCompare(b.dueDate || b.expenseDate || "")
  })
}

function groupTransferByStore(
  rows: ExpenseAccrualPlanItem[],
  tt: Tt,
  aggregateMode: boolean
): [string, TransferDisplayRow[]][] {
  const map = new Map<string, ExpenseAccrualPlanItem[]>()
  for (const r of rows) {
    const key = String(r.storeName || "").trim() || "—"
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] === "—" ? 1 : b[0] === "—" ? -1 : a[0].localeCompare(b[0])))
    .map(([store, storeRows]) => {
      const display = aggregateMode
        ? aggregateByAccount(storeRows, tt)
        : sortByPayee(storeRows).map((r) => ({
            ...r,
            _aggregateCount: 1,
            _sourceIds: [r.id],
            _isAggregate: false,
          }))
      return [store, display] as [string, TransferDisplayRow[]]
    })
}

function aggregateByAccount(rows: ExpenseAccrualPlanItem[], tt: Tt): TransferDisplayRow[] {
  const map = new Map<string, TransferDisplayRow & { _payeeNames?: string[] }>()
  const orphans: TransferDisplayRow[] = []
  for (const r of rows) {
    const acct = String(r.payeeBankAccountNo || "").trim()
    const bank = String(r.payeeBankName || "").trim()
    if (!acct) {
      orphans.push({ ...r, _aggregateCount: 1, _sourceIds: [r.id], _isAggregate: false })
      continue
    }
    const key = `${normKey(bank)}|${normKey(acct)}`
    const existing = map.get(key)
    const docBit = r.documentNo || `#${r.id}`
    const payeeLabel = String(r.payeeName || "").trim()
    if (!existing) {
      map.set(key, {
        ...r,
        memo: docBit + (r.memo ? ` ${r.memo}` : ""),
        remainingAmount: r.remainingAmount || 0,
        plannedAmount: r.plannedAmount || 0,
        _aggregateCount: 1,
        _sourceIds: [r.id],
        _isAggregate: false,
        _payeeNames: payeeLabel ? [payeeLabel] : [],
      })
    } else {
      existing.remainingAmount = (existing.remainingAmount || 0) + (r.remainingAmount || 0)
      existing.plannedAmount = (existing.plannedAmount || 0) + (r.plannedAmount || 0)
      existing._aggregateCount = (existing._aggregateCount || 1) + 1
      existing._sourceIds = [...(existing._sourceIds || [existing.id]), r.id]
      existing._isAggregate = true
      const addMemo = docBit + (r.memo ? ` ${r.memo}` : "")
      existing.memo = [existing.memo, addMemo].filter(Boolean).join(" | ")
      if (!existing.payeeAccountHolder && r.payeeAccountHolder) {
        existing.payeeAccountHolder = r.payeeAccountHolder
      }
      if (payeeLabel) {
        const names = existing._payeeNames || []
        if (!names.some((n) => n.toLowerCase() === payeeLabel.toLowerCase())) {
          names.push(payeeLabel)
        }
        existing._payeeNames = names
      }
    }
  }
  const aggregated = [...map.values()].map((r) => {
    const names = r._payeeNames || []
    let payeeName = r.payeeName || ""
    if (names.length > 1) {
      payeeName = `${names[0]} / ${names[1]}${names.length > 2 ? ` +${names.length - 2}` : ""}`
    } else if (names.length === 1) {
      payeeName = names[0]
    }
    if ((r._aggregateCount || 1) > 1) {
      payeeName =
        payeeName +
        ` (${r._aggregateCount}${tt("receivPayCount", "items")})`
    }
    const { _payeeNames: _names, ...rest } = r
    void _names
    return { ...rest, payeeName }
  })
  return sortByPayee([...aggregated, ...orphans])
}

export type ExpenseBankTransferViewProps = {
  plans: ExpenseAccrualPlanItem[]
  tt: Tt
  companyName?: string
  asOfDate: string
  canEditBank: boolean
  savingId: number | null
  onSaveBank: (
    r: ExpenseAccrualPlanItem,
    patch: { payeeAccountHolder: string; payeeBankName: string; payeeBankAccountNo: string }
  ) => Promise<boolean>
  onPay?: (r: ExpenseAccrualPlanItem) => void
}

export function ExpenseBankTransferView({
  plans,
  tt,
  companyName,
  asOfDate,
  canEditBank,
  savingId,
  onSaveBank,
  onPay,
}: ExpenseBankTransferViewProps) {
  const baseRows = React.useMemo(() => sortByPayee(transferRows(plans)), [plans])
  const [onlyMissingBank, setOnlyMissingBank] = React.useState(false)
  const [aggregateMode, setAggregateMode] = React.useState(false)
  const [editingId, setEditingId] = React.useState<number | null>(null)
  const [draftHolder, setDraftHolder] = React.useState("")
  const [draftBank, setDraftBank] = React.useState("")
  const [draftAcct, setDraftAcct] = React.useState("")
  const [bankPreset, setBankPreset] = React.useState<string>("")
  /** true = Excel 호환 영문 헤더(복사/CSV), false = UI 언어 헤더 */
  const [excelEnglishHeaders, setExcelEnglishHeaders] = React.useState(true)
  const printRef = React.useRef<HTMLDivElement>(null)

  const uiHeaders = React.useMemo(
    () => [
      "No.",
      tt("expenseBankColCompany", "Payee"),
      tt("expenseBankColAccountName", "Account name"),
      tt("expenseBankColBank", "Bank"),
      tt("expenseBankColDescription", "Description"),
      tt("expenseBankColAmount", "Amount"),
    ],
    [tt]
  )
  const excelHeaders = ["No.", "Companyname", "account name", "bank", "description", "amount"]
  const exportHeaders = excelEnglishHeaders ? excelHeaders : uiHeaders

  const filteredBase = React.useMemo(() => {
    if (!onlyMissingBank) return baseRows
    return baseRows.filter((r) => !String(r.payeeBankAccountNo || "").trim())
  }, [baseRows, onlyMissingBank])

  const rowsByStore = React.useMemo(
    () => groupTransferByStore(filteredBase, tt, aggregateMode),
    [filteredBase, aggregateMode, tt]
  )

  const rows: TransferDisplayRow[] = React.useMemo(
    () => rowsByStore.flatMap(([, storeRows]) => storeRows),
    [rowsByStore]
  )

  const total = React.useMemo(
    () => rows.reduce((s, r) => s + (r.remainingAmount || 0), 0),
    [rows]
  )
  const missingBankCount = React.useMemo(
    () => baseRows.filter((r) => !String(r.payeeBankAccountNo || "").trim()).length,
    [baseRows]
  )

  const startEdit = (r: ExpenseAccrualPlanItem) => {
    if ((r as TransferDisplayRow)._isAggregate) return
    setEditingId(r.id)
    setDraftHolder(r.payeeAccountHolder || r.payeeName || "")
    setDraftBank(r.payeeBankName || "")
    setDraftAcct(r.payeeBankAccountNo || "")
    const preset = BANK_PRESETS.find(
      (b) => b.toLowerCase() === String(r.payeeBankName || "").trim().toLowerCase()
    )
    setBankPreset(preset || (r.payeeBankName ? "Other" : ""))
  }

  const buildTsv = () => {
    const header = exportHeaders.join("\t")
    const body = rows
      .map((r, i) => {
        const holder = r.payeeAccountHolder || r.payeeName || ""
        const acct = r.payeeBankAccountNo ? `(${r.payeeBankAccountNo})` : ""
        const accountName = acct ? `${holder} ${acct}` : holder
        return [
          String(i + 1),
          r.payeeName || "",
          accountName,
          r.payeeBankName || "",
          (r.memo || "").replace(/\t|\n|\r/g, " ")
            ? `[${String(r.storeName || "").trim() || "—"}] ${(r.memo || "").replace(/\t|\n|\r/g, " ")}`
            : `[${String(r.storeName || "").trim() || "—"}]`,
          fmtAmount(r.remainingAmount || 0),
        ].join("\t")
      })
      .join("\n")
    return `${header}\n${body}\n\t\t\t\t${tt("total", "Total")}\t${fmtAmount(total)}`
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildTsv())
      await appAlert(
        tt("expenseBankTransferCopied", "Copied. Paste into Excel.")
      )
    } catch {
      await appAlert(tt("expenseBankTransferCopyFail", "Copy failed. Try CSV download."))
    }
  }

  const handleCsv = () => {
    const esc = (s: string) => `"${String(s || "").replace(/"/g, '""')}"`
    const lines = [
      exportHeaders.map(esc).join(","),
      ...rows.map((r, i) => {
        const holder = r.payeeAccountHolder || r.payeeName || ""
        const acctLine = r.payeeBankAccountNo ? `${holder} (${r.payeeBankAccountNo})` : holder
        return [
          String(i + 1),
          r.payeeName || "",
          acctLine,
          r.payeeBankName || "",
          r.memo
            ? `[${String(r.storeName || "").trim() || "—"}] ${r.memo}`
            : `[${String(r.storeName || "").trim() || "—"}]`,
          fmtAmount(r.remainingAmount || 0),
        ]
          .map(esc)
          .join(",")
      }),
      ["", "", "", "", tt("total", "Total"), fmtAmount(total)].map(esc).join(","),
    ]
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `expense-bank-transfer-${asOfDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
    void appAlert(tt("expenseBankTransferCsvDone", "CSV downloaded."))
  }

  const handlePrint = () => {
    const el = printRef.current
    if (!el) return
    const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700")
    if (!w) {
      void appAlert(tt("expenseBankTransferCopyFail", "Copy failed. Try CSV download."))
      return
    }
    w.document.write(`<!doctype html><html><head><title>${tt("expenseBankTransferView", "Bank transfer")}</title>
<style>
body{font-family:system-ui,sans-serif;padding:16px;color:#111}
h1{font-size:16px;text-align:center;margin:0 0 8px}
.meta{text-align:right;font-size:12px;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #ccc;padding:6px 8px;vertical-align:top}
th{background:#e8f0fe;text-align:center}
.amt{text-align:right;font-variant-numeric:tabular-nums}
.total{background:#fff59d;font-weight:600}
.same{background:#ffe8d6}
</style></head><body>${el.innerHTML}</body></html>`)
    w.document.close()
    w.focus()
    w.print()
  }

  if (baseRows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {tt("payableEmpty", "No payable items found.")}
      </p>
    )
  }

  const renderBankEditFields = () => (
    <div className="space-y-1.5 print:hidden">
      <Input
        className="h-8 text-xs"
        value={draftHolder}
        onChange={(e) => setDraftHolder(e.target.value)}
        placeholder={tt("expensePayeeAccountHolder", "Account holder")}
      />
      <Select
        value={bankPreset || "__none__"}
        onValueChange={(v) => {
          if (v === "__none__") {
            setBankPreset("")
            setDraftBank("")
            return
          }
          setBankPreset(v)
          if (v !== "Other") setDraftBank(v)
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={tt("expensePayeeBankName", "Bank")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">—</SelectItem>
          {BANK_PRESETS.map((b) => (
            <SelectItem key={b} value={b}>
              {b}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {(bankPreset === "Other" || !bankPreset) && (
        <Input
          className="h-8 text-xs"
          value={draftBank}
          onChange={(e) => setDraftBank(e.target.value)}
          placeholder="K-BANK"
        />
      )}
      <Input
        className="h-8 text-xs"
        value={draftAcct}
        onChange={(e) => setDraftAcct(e.target.value)}
        placeholder={tt("inv_account_no", "Account")}
      />
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button size="sm" variant="outline" className="h-9" onClick={() => void handleCopy()}>
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          {tt("expenseBankTransferCopy", "Copy for Excel")}
        </Button>
        <Button size="sm" variant="outline" className="h-9" onClick={handleCsv}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          CSV
        </Button>
        <Button size="sm" variant="outline" className="h-9" onClick={handlePrint}>
          <Printer className="mr-1.5 h-3.5 w-3.5" />
          {tt("print", "Print")}
        </Button>
        <Button
          size="sm"
          variant={excelEnglishHeaders ? "secondary" : "outline"}
          className="h-9"
          onClick={() => setExcelEnglishHeaders((v) => !v)}
          title={tt(
            "expenseBankExcelHeadersHint",
            "Copy/CSV: English Excel headers vs current language"
          )}
        >
          {excelEnglishHeaders
            ? tt("expenseBankExcelHeadersOn", "Excel EN headers")
            : tt("expenseBankExcelHeadersOff", "Localized headers")}
        </Button>
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-border/60 p-0.5">
          <Button
            size="sm"
            variant={!onlyMissingBank ? "secondary" : "ghost"}
            className="h-8"
            onClick={() => setOnlyMissingBank(false)}
          >
            {tt("all", "All")} ({baseRows.length})
          </Button>
          <Button
            size="sm"
            variant={onlyMissingBank ? "secondary" : "ghost"}
            className="h-8"
            onClick={() => setOnlyMissingBank(true)}
            disabled={missingBankCount === 0}
          >
            {tt("expenseBankMissingOnly", "Missing account")} ({missingBankCount})
          </Button>
        </div>
        <Button
          size="sm"
          variant={aggregateMode ? "secondary" : "outline"}
          className="h-9"
          onClick={() => {
            setAggregateMode((v) => !v)
            setEditingId(null)
          }}
          title={tt(
            "expenseBankAggregateHint",
            "Merge rows with the same bank account (document nos in description)"
          )}
        >
          {aggregateMode
            ? tt("expenseBankAggregateOn", "Aggregated")
            : tt("expenseBankAggregate", "Aggregate by account")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {tt("expenseBankTransferHint", "Use this list for bank transfers instead of a separate Excel sheet.")}
        </span>
      </div>

      {missingBankCount > 0 && !onlyMissingBank ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 print:hidden">
          {tt("expenseBankMissingBanner", "{count} item(s) missing bank account").replace(
            "{count}",
            String(missingBankCount)
          )}{" "}
          <button
            type="button"
            className="underline font-medium"
            onClick={() => setOnlyMissingBank(true)}
          >
            {tt("expenseBankMissingOnly", "Missing account")}
          </button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {tt("payableEmpty", "No payable items found.")}
        </p>
      ) : (
        <>
          <div className="space-y-2 md:hidden print:hidden">
            {rows.map((r, i) => {
              const missingBank = !String(r.payeeBankAccountNo || "").trim()
              const isEditing = editingId === r.id && !r._isAggregate
              const storeLabel = String(r.storeName || "").trim() || "—"
              const prevStore =
                i > 0 ? String(rows[i - 1]?.storeName || "").trim() || "—" : null
              const showStoreHeader = prevStore !== storeLabel
              return (
                <React.Fragment key={`${r.id}-${i}`}>
                  {showStoreHeader ? (
                    <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm font-medium">
                      {tt("store", "Store")}: {storeLabel}
                    </div>
                  ) : null}
                  <div
                    className={cn(
                      "space-y-2 rounded-lg border border-border/60 px-3 py-3",
                      missingBank && "border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20"
                    )}
                  >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs tabular-nums text-muted-foreground">No. {i + 1}</p>
                      <p className="text-sm font-semibold leading-snug">{r.payeeName || "—"}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      ฿{fmtAmount(r.remainingAmount || 0)}
                    </p>
                  </div>
                  {isEditing ? (
                    <>
                      {renderBankEditFields()}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-9 flex-1"
                          disabled={savingId === r.id}
                          onClick={() =>
                            void onSaveBank(r, {
                              payeeAccountHolder: draftHolder,
                              payeeBankName: draftBank,
                              payeeBankAccountNo: draftAcct,
                            }).then((ok) => {
                              if (ok) setEditingId(null)
                            })
                          }
                        >
                          {tt("btn_save", "Save")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-9"
                          onClick={() => setEditingId(null)}
                        >
                          {tt("btnClose", "Close")}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        {r.payeeAccountHolder || r.payeeName || "—"}
                        {r.payeeBankAccountNo ? ` (${r.payeeBankAccountNo})` : ""}
                      </p>
                      <p className="text-xs">
                        {r.payeeBankName ||
                          (missingBank
                            ? tt("expenseBankAccountMissing", "Account missing")
                            : "—")}
                      </p>
                      {r.memo ? (
                        <p className="text-[11px] text-muted-foreground line-clamp-3">{r.memo}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {onPay && !r._isAggregate ? (
                          <Button size="sm" className="h-9 flex-1" onClick={() => onPay(r)}>
                            <Wallet className="mr-1 h-3.5 w-3.5" />
                            {tt("payBtn", "Pay")}
                          </Button>
                        ) : null}
                        {canEditBank && !r._isAggregate ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9"
                            onClick={() => startEdit(r)}
                          >
                            {tt("expenseBankEdit", "Edit bank")}
                          </Button>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
                </React.Fragment>
              )
            })}
            <div className="rounded-md bg-yellow-100/90 px-3 py-2 text-right text-sm font-semibold dark:bg-yellow-900/40">
              {tt("total", "Total")} ฿{fmtAmount(total)}
            </div>
          </div>

          <div
            ref={printRef}
            className="hidden overflow-x-auto rounded-md border border-border/60 md:block print:block"
          >
            <div className="border-b bg-orange-50/80 px-3 py-2 dark:bg-orange-950/30">
              <h2 className="text-center text-sm font-semibold">
                {companyName || tt("expenseBankTransferCompanyFallback", "Company")}
              </h2>
              <p className="mt-0.5 text-center text-[11px] text-muted-foreground">
                {tt(
                  "expenseBankTransferPrintCompanyHint",
                  "Company name for print — rows below are grouped by store"
                )}
              </p>
              <p className="mt-0.5 text-right text-xs text-muted-foreground">
                {tt("date", "Date")} {asOfDate.replace(/-/g, ".")}
                {aggregateMode
                  ? ` · ${tt("expenseBankAggregateOn", "Aggregated")}`
                  : ""}
                {` · ${rowsByStore.length} ${tt("store", "Store")}`}
              </p>
            </div>
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b bg-sky-50/80 dark:bg-sky-950/40">
                  <th className="w-10 px-2 py-2 text-center">{uiHeaders[0]}</th>
                  <th className="min-w-[140px] px-2 py-2 text-left">{uiHeaders[1]}</th>
                  <th className="min-w-[160px] px-2 py-2 text-left">{uiHeaders[2]}</th>
                  <th className="w-[100px] px-2 py-2 text-center">{uiHeaders[3]}</th>
                  <th className="min-w-[180px] px-2 py-2 text-left">{uiHeaders[4]}</th>
                  <th className="w-[110px] px-2 py-2 text-right">{uiHeaders[5]}</th>
                  <th className="w-[88px] px-1 py-2 text-center print:hidden">
                    {tt("pay_actions", "Action")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const prev = i > 0 ? rows[i - 1] : null
                  const storeLabel = String(r.storeName || "").trim() || "—"
                  const prevStore = prev
                    ? String(prev.storeName || "").trim() || "—"
                    : null
                  const showStoreHeader = prevStore !== storeLabel
                  const samePayee =
                    prev &&
                    !showStoreHeader &&
                    String(prev.payeeName || "").trim().toLowerCase() ===
                      String(r.payeeName || "").trim().toLowerCase()
                  const missingBank = !String(r.payeeBankAccountNo || "").trim()
                  const isEditing = editingId === r.id && !r._isAggregate
                  return (
                    <React.Fragment key={`${r.id}-${i}`}>
                      {showStoreHeader ? (
                        <tr className="border-b bg-muted/50">
                          <td colSpan={7} className="px-3 py-2 text-sm font-semibold">
                            {tt("store", "Store")}: {storeLabel}
                            <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                              {rowsByStore.find(([s]) => s === storeLabel)?.[1].length || 0}
                              {tt("receivPayCount", "items")} · ฿
                              {fmtAmount(
                                (rowsByStore.find(([s]) => s === storeLabel)?.[1] || []).reduce(
                                  (s, x) => s + (x.remainingAmount || 0),
                                  0
                                )
                              )}
                            </span>
                          </td>
                        </tr>
                      ) : null}
                      <tr
                        className={cn(
                          "border-b",
                          samePayee && "bg-orange-50/70 dark:bg-orange-950/20",
                          missingBank && "bg-amber-50/40 dark:bg-amber-950/20"
                        )}
                      >
                      <td className="px-2 py-2 text-center tabular-nums">{i + 1}</td>
                      <td className="px-2 py-2 align-top font-medium leading-snug">
                        {r.payeeName || "—"}
                      </td>
                      <td className="px-2 py-2 align-top leading-snug">
                        {isEditing ? (
                          renderBankEditFields()
                        ) : (
                          <>
                            <div>{r.payeeAccountHolder || r.payeeName || "—"}</div>
                            {r.payeeBankAccountNo ? (
                              <div className="text-xs tabular-nums text-muted-foreground">
                                ({r.payeeBankAccountNo})
                              </div>
                            ) : (
                              <div className="text-xs text-amber-700 dark:text-amber-400">
                                {tt("expenseBankAccountMissing", "Account missing")}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center align-top">
                        {isEditing ? null : r.payeeBankName || "—"}
                      </td>
                      <td className="max-w-[220px] px-2 py-2 align-top text-xs leading-snug text-muted-foreground">
                        {r.memo || "—"}
                      </td>
                      <td className="px-2 py-2 text-right align-top font-medium tabular-nums">
                        {fmtAmount(r.remainingAmount || 0)}
                      </td>
                      <td className="px-1 py-2 text-center align-top print:hidden">
                        {isEditing ? (
                          <div className="flex flex-col items-center gap-1">
                            <Button
                              size="sm"
                              className="h-7 px-2 text-[10px]"
                              disabled={savingId === r.id}
                              onClick={() =>
                                void onSaveBank(r, {
                                  payeeAccountHolder: draftHolder,
                                  payeeBankName: draftBank,
                                  payeeBankAccountNo: draftAcct,
                                }).then((ok) => {
                                  if (ok) setEditingId(null)
                                })
                              }
                            >
                              <Check className="mr-0.5 h-3 w-3" />
                              {tt("btn_save", "Save")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[10px]"
                              onClick={() => setEditingId(null)}
                            >
                              {tt("btnClose", "Close")}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            {onPay && !r._isAggregate ? (
                              <Button
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                                onClick={() => onPay(r)}
                              >
                                <Wallet className="mr-0.5 h-3 w-3" />
                                {tt("payBtn", "Pay")}
                              </Button>
                            ) : null}
                            {canEditBank && !r._isAggregate ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[10px]"
                                onClick={() => startEdit(r)}
                              >
                                {tt("expenseBankEdit", "Edit bank")}
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                    </React.Fragment>
                  )
                })}
                <tr className="border-t-2 bg-yellow-100/90 dark:bg-yellow-900/40">
                  <td colSpan={5} className="px-2 py-2 text-right text-sm font-semibold">
                    {tt("total", "Total")}
                  </td>
                  <td className="px-2 py-2 text-right text-sm font-semibold tabular-nums">
                    {fmtAmount(total)}
                  </td>
                  <td className="print:hidden" />
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
