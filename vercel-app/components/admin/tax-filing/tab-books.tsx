"use client"

import * as React from "react"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { useLang } from "@/lib/lang-context"
import {
  getTaxBookEntries,
  getTaxManagementBridge,
  postTaxBookEntry,
  type TaxBookEntriesResponse,
  type TaxBookPostAction,
  type TaxManagementBridgeResponse,
} from "@/lib/api-client/tax-book"
import {
  triggerErpExcelHtmlDownload,
} from "@/lib/erp-excel-export"
import {
  buildTaxBookStatements,
  resolveTaxBookMonthRange,
  TAX_DAY_BOOK_FILTERS,
  voucherKindForDayBookFilter,
  voucherMatchesDayBook,
  type TaxDayBookFilter,
  type TaxVoucherKind,
} from "@/lib/tax-book"
import { buildTaxCloseChecklist, type TaxCloseChecklistStepId } from "@/lib/tax-close-checklist"
import { parseFlowTrialBalanceSheet } from "@/lib/tax-book-opening-parse"
import type { ExternalTrialBalanceRow } from "@/lib/tax-book-opening"
import type { TaxBridgeLineKey } from "@/lib/tax-management-bridge"
import {
  buildFlowBalanceSheetHtml,
  buildFlowIncomeStatementHtml,
  buildFlowTrialBalanceHtml,
  printFlowReportHtml,
  taxBookFlowReportScreenCss,
  wrapFlowReportForExcel,
  type TaxBookFlowReportMeta,
} from "@/lib/tax-book-flow-report"
import {
  displayTaxBookAccountName,
  formatTaxBookMemoDisplay,
  formatTaxFilingYearMonthLabel,
} from "@/lib/tax-book-display"
import { useT } from "@/lib/i18n"
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
  /** 신고 탭 등에서 전표 목록으로 바로 열 때 */
  focusView?: BooksView | null
  focusViewTick?: number
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
  const [openingInventory, setOpeningInventory] = React.useState("")
  const [inventoryPreview, setInventoryPreview] = React.useState<number | null>(null)
  const [inventoryConfirmed, setInventoryConfirmed] = React.useState(false)
  const [cogsPreview, setCogsPreview] = React.useState<number | null>(null)
  const [ledgerAccount, setLedgerAccount] = React.useState<string | null>(null)
  const [dayBook, setDayBook] = React.useState<TaxDayBookFilter>("all")
  const [dayMemo, setDayMemo] = React.useState("")
  const [dayDocNo, setDayDocNo] = React.useState("")
  const [dayDate, setDayDate] = React.useState("")
  const [dayStatus, setDayStatus] = React.useState<"draft" | "approved">("approved")
  const [dayKind, setDayKind] = React.useState<TaxVoucherKind>("general")
  const [dayAdj, setDayAdj] = React.useState<AdjLine[]>([
    { accountCode: "", side: "debit", amount: "" },
    { accountCode: "", side: "credit", amount: "" },
  ])
  const [openingDate, setOpeningDate] = React.useState("2026-07-01")
  const [trialUploadRows, setTrialUploadRows] = React.useState<ExternalTrialBalanceRow[] | null>(null)
  const [trialUploadName, setTrialUploadName] = React.useState<string | null>(null)
  const loadSeqRef = React.useRef(0)
  const lastEnsureTickRef = React.useRef(0)
  const searchPropsRef = React.useRef({
    fromMonth: props.fromMonth,
    toMonth: props.toMonth,
    scope: props.filingStoreFilter || "All",
  })
  searchPropsRef.current = {
    fromMonth: props.fromMonth,
    toMonth: props.toMonth,
    scope: props.filingStoreFilter || "All",
  }

  React.useEffect(() => {
    if (!props.focusViewTick || !props.focusView) return
    if (!VIEWS.includes(props.focusView)) return
    setView(props.focusView)
    if (props.focusView !== "ledger") setLedgerAccount(null)
  }, [props.focusViewTick, props.focusView])

  // 검색 버튼을 눌렀을 때만 조건 확정 (월·매장만 바꾸면 자동 재조회하지 않음)
  React.useEffect(() => {
    if (props.searchTick < 1) return
    const { fromMonth, toMonth, scope } = searchPropsRef.current
    const range = resolveTaxBookMonthRange(fromMonth, toMonth)
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
      scope,
      tick: props.searchTick,
    })
  }, [props.searchTick])

  const load = React.useCallback(
    async (q: BooksQuery, opts?: { ledgerAccount?: string | null; ensureFiling?: boolean }) => {
      const single = q.from === q.to
      const acct = opts?.ledgerAccount !== undefined ? opts.ledgerAccount : ledgerAccount
      const doEnsure =
        opts?.ensureFiling === true ||
        (single && q.tick > 0 && q.tick !== lastEnsureTickRef.current)
      const seq = ++loadSeqRef.current
      setLoading(true)
      setMessage(null)
      try {
        if (single) {
          try {
            const data = await getTaxManagementBridge({
              yearMonth: q.from,
              scopeFilter: q.scope,
            })
            if (seq !== loadSeqRef.current) return
            if (data.error && !data.report) {
              setMessage(data.error)
              setBridge(null)
            } else {
              setBridge(data)
              if (
                doEnsure &&
                data.taxEntityCode &&
                !data.periodClosed &&
                data.schemaReady !== false
              ) {
                const ensured = await postTaxBookEntry({
                  action: "ensureFiling",
                  yearMonth: q.from,
                  scopeFilter: q.scope,
                })
                if (seq !== loadSeqRef.current) return
                if (ensured?.success) lastEnsureTickRef.current = q.tick
              }
            }
          } catch (e) {
            if (seq !== loadSeqRef.current) return
            setMessage(e instanceof Error ? e.message : String(e))
            setBridge(null)
          }
        } else {
          setBridge(null)
        }
        const entryView = view === "vouchers" || view === "ledger" ? view : "trial"
        const book = await getTaxBookEntries({
          fromMonth: q.from,
          toMonth: q.to,
          scopeFilter: q.scope,
          view: entryView,
          accountCode: view === "ledger" && acct ? acct : undefined,
        })
        if (seq !== loadSeqRef.current) return
        if (book.error && !book.trial?.length && !book.vouchers?.length && !book.ledger?.length) {
          setMessage(book.error)
        }
        setEntries(book)
      } catch (e) {
        if (seq !== loadSeqRef.current) return
        setMessage(e instanceof Error ? e.message : String(e))
      } finally {
        if (seq === loadSeqRef.current) setLoading(false)
      }
    },
    [view, ledgerAccount]
  )

  React.useEffect(() => {
    if (!query) return
    void load(query)
  }, [query, load])

  const localizedTrial = React.useMemo(
    () =>
      (entries?.trial || []).map((r) => ({
        ...r,
        accountName: displayTaxBookAccountName(lang, r.accountCode, r.accountName),
      })),
    [entries?.trial, lang]
  )
  const statements = React.useMemo(() => buildTaxBookStatements(localizedTrial), [localizedTrial])

  const sourceTypes = React.useMemo(() => {
    const set = new Set<string>()
    for (const v of entries?.vouchers || []) {
      if (v.sourceType) set.add(v.sourceType)
    }
    return set
  }, [entries?.vouchers])

  const checklist = React.useMemo(() => {
    const holes = (bridge?.report?.lines || []).filter((l) => l.hole).length
    const split = bridge?.report?.salesSplit
    const hasBsBalance = (entries?.trial || []).some(
      (r) => /^[123]/.test(String(r.accountCode || "")) && (Number(r.debit) || 0) + (Number(r.credit) || 0) > 0.009
    )
    const salesNet = split?.taxInvoiceNet || 0
    const purchaseNet = split?.purchaseNet || 0
    const outputVat = bridge?.report?.lines.find((l) => l.key === "outputVat")?.filing || 0
    const inputVat = bridge?.report?.lines.find((l) => l.key === "inputVat")?.filing || 0
    const payrollMgt = bridge?.report?.lines.find((l) => l.key === "payroll")?.management || 0
    const cogsMgt = bridge?.report?.lines.find((l) => l.key === "cogs")?.management || 0
    return buildTaxCloseChecklist({
      hasOpening: sourceTypes.has("tax_opening") || hasBsBalance,
      hasVatSummary: sourceTypes.has("tax_vat_summary") || (outputVat <= 0 && inputVat <= 0),
      hasSalesSummary: sourceTypes.has("tax_sales_summary") || salesNet <= 0,
      hasPurchaseSummary: sourceTypes.has("tax_purchase_summary") || purchaseNet <= 0,
      hasPayroll: sourceTypes.has("tax_payroll") || payrollMgt <= 0,
      hasInventoryCogs: sourceTypes.has("tax_inventory_cogs") || cogsMgt <= 0,
      bridgeHoles: holes,
      recognition: bridge?.report?.recognition || null,
      periodClosed: Boolean(bridge?.periodClosed),
      schemaReady: bridge ? bridge.schemaReady !== false : entries ? entries.schemaReady !== false : true,
      entityReady: Boolean(bridge?.taxEntityCode || (entries && entries.error !== "NEED_TAX_ENTITY")),
    })
  }, [bridge, entries, sourceTypes])

  const dayBookCounts = React.useMemo(() => {
    const counts: Record<TaxDayBookFilter, number> = {
      all: 0,
      general: 0,
      purchase: 0,
      sales: 0,
      payment: 0,
      receipt: 0,
    }
    for (const v of entries?.vouchers || []) {
      const kind = v.voucherKind as TaxVoucherKind
      counts.all += 1
      for (const filter of TAX_DAY_BOOK_FILTERS) {
        if (filter === "all") continue
        if (voucherMatchesDayBook(kind, filter)) counts[filter] += 1
      }
    }
    return counts
  }, [entries?.vouchers])

  const filteredVouchers = React.useMemo(() => {
    return (entries?.vouchers || []).filter((v) =>
      voucherMatchesDayBook(v.voucherKind as TaxVoucherKind, dayBook)
    )
  }, [entries?.vouchers, dayBook])

  const parseInventoryAmount = (): number | undefined => {
    const invRaw = openingInventory.trim()
    if (invRaw === "") return undefined
    const n = Number(invRaw)
    return Number.isFinite(n) && n >= 0 ? n : undefined
  }

  const post = async (action: TaxBookPostAction) => {
    setPosting(true)
    setMessage(null)
    try {
      const inventoryAmount = parseInventoryAmount()
      const res = await postTaxBookEntry({
        action,
        yearMonth: query?.from || props.fromMonth,
        scopeFilter: query?.scope || props.filingStoreFilter || "All",
        memo,
        accountingDate: action === "opening" ? openingDate : undefined,
        inventoryAmount:
          action === "opening" || action === "inventory"
            ? inventoryAmount ?? (inventoryPreview != null && inventoryConfirmed ? inventoryPreview : undefined)
            : undefined,
        inventoryConfirmed:
          action === "inventory" || action === "opening" ? inventoryConfirmed || inventoryAmount != null : undefined,
        trialBalanceRows: action === "opening" && trialUploadRows?.length ? trialUploadRows : undefined,
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
      } else if (action === "inventoryPreview") {
        setInventoryPreview(res.inventoryAmount ?? null)
        setCogsPreview(res.cogsPreview ?? null)
        if (res.inventoryAmount != null && openingInventory.trim() === "") {
          setOpeningInventory(String(res.inventoryAmount))
        }
        setMessage(
          `${t("taxBooksInventoryPreviewDone")} ${money(res.inventoryAmount)} · COGS ${money(res.cogsPreview)}`
        )
      } else {
        setMessage(
          action === "opening"
            ? `${t("taxBooksOpeningDone")} (${t("taxBooksAccount")} ${res.lineCount ?? "—"} · 1460 ${money(res.inventoryAmount)})`
            : t("accCompPp30AdjSaved")
        )
        if (query) await load(query)
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setPosting(false)
    }
  }

  React.useEffect(() => {
    if (dayBook !== "all") setDayKind(voucherKindForDayBookFilter(dayBook))
  }, [dayBook])

  const dayDebit = dayAdj.reduce(
    (s, ln) => s + (ln.side === "debit" ? Math.abs(Number(ln.amount) || 0) : 0),
    0
  )
  const dayCredit = dayAdj.reduce(
    (s, ln) => s + (ln.side === "credit" ? Math.abs(Number(ln.amount) || 0) : 0),
    0
  )
  const dayBalanced = dayDebit > 0 && Math.abs(dayDebit - dayCredit) <= 0.01

  const postManual = async () => {
    setPosting(true)
    setMessage(null)
    try {
      const lines = dayAdj
        .map((ln) => ({
          accountCode: ln.accountCode.trim(),
          side: ln.side,
          amount: Number(ln.amount) || 0,
        }))
        .filter((ln) => ln.accountCode && ln.amount > 0)
      const defaultDate =
        dayDate ||
        (() => {
          const today = getBangkokTodayDateString()
          const from = query?.from || props.fromMonth
          return today.slice(0, 7) === from ? today : `${from}-01`
        })()
      const res = await postTaxBookEntry({
        action: "manual",
        yearMonth: query?.from || props.fromMonth,
        scopeFilter: query?.scope || props.filingStoreFilter || "All",
        memo: dayMemo,
        accountingDate: defaultDate,
        voucherKind: dayBook === "all" ? dayKind : voucherKindForDayBookFilter(dayBook),
        entryNo: dayDocNo.trim() || undefined,
        postingStatus: dayStatus,
        lines,
      })
      if (!res.success) {
        setMessage(res.error || t("accCompUnknownError"))
      } else {
        setMessage(t("taxBooksEntrySaved"))
        setDayMemo("")
        setDayDocNo("")
        setDayAdj([
          { accountCode: "", side: "debit", amount: "" },
          { accountCode: "", side: "credit", amount: "" },
        ])
        if (query) await load(query)
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setPosting(false)
    }
  }

  const drillToLedger = (accountCode: string) => {
    // view·ledgerAccount 변경 → load identity 변경 → effect 1회만 조회 (이중 fetch 방지)
    setLedgerAccount(accountCode)
    setView("ledger")
  }

  const onTrialFile = async (file: File | null) => {
    if (!file) {
      setTrialUploadRows(null)
      setTrialUploadName(null)
      return
    }
    try {
      const XLSX = await import("xlsx")
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: "array" })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][]
      const parsed = parseFlowTrialBalanceSheet(rows)
      setTrialUploadRows(parsed)
      setTrialUploadName(file.name)
      setMessage(parsed.length ? `${t("taxBooksTrialUploadRows")} ${parsed.length}` : t("taxBooksTrialUploadEmpty"))
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  const singleMonth = Boolean(query && query.from === query.to)
  const entityMissing =
    (bridge != null && !bridge.taxEntityCode) || message === "NEED_TAX_ENTITY" || entries?.error === "NEED_TAX_ENTITY"
  const closed = Boolean(singleMonth && bridge?.periodClosed)
  const schemaReady = bridge ? bridge.schemaReady !== false : entries ? entries.schemaReady !== false : true
  const canPost = !posting && !closed && !entityMissing && schemaReady && singleMonth
  const ymLabel = query?.from || props.fromMonth
  const scopeLabel = query?.scope || props.filingStoreFilter || "All"
  const reportMeta: TaxBookFlowReportMeta = React.useMemo(() => {
    const company =
      bridge?.taxEntityCode ||
      (scopeLabel.startsWith("entity:") || scopeLabel.startsWith("taxid:") || scopeLabel.startsWith("store:")
        ? scopeLabel
        : scopeLabel)
    const from = query?.from || props.fromMonth
    const to = query?.to || props.toMonth
    const fromLabel = formatTaxFilingYearMonthLabel(from, lang)
    const toLabel = formatTaxFilingYearMonthLabel(to, lang)
    return {
      companyName: company,
      lang,
      asOfLabel:
        from === to
          ? lang === "th"
            ? `สิ้นสุด ณ ${toLabel}`
            : lang === "ko"
              ? `${toLabel} 말`
              : `As at ${to}`
          : lang === "th"
            ? `ช่วง ${fromLabel} – ${toLabel}`
            : lang === "ko"
              ? `${fromLabel} ~ ${toLabel}`
              : `Period ${from} ~ ${to}`,
      periodLabel: from === to ? fromLabel : `${fromLabel} ~ ${toLabel}`,
    }
  }, [bridge?.taxEntityCode, scopeLabel, query?.from, query?.to, props.fromMonth, props.toMonth, lang])

  const stepLabel = (id: TaxCloseChecklistStepId): string => t(`taxBooksCheck_${id}`)

  const exportFlow = (kind: "trial" | "income" | "balance") => {
    let inner = ""
    let filename = ""
    if (kind === "trial") {
      inner = buildFlowTrialBalanceHtml(reportMeta, localizedTrial, {
        debit: entries?.totalDebit || 0,
        credit: entries?.totalCredit || 0,
      })
      filename = `tax-trial-flow-${ymLabel}.xls`
    } else if (kind === "income") {
      inner = buildFlowIncomeStatementHtml(reportMeta, statements)
      filename = `tax-income-flow-${ymLabel}.xls`
    } else {
      inner = buildFlowBalanceSheetHtml(reportMeta, statements)
      filename = `tax-balance-flow-${ymLabel}.xls`
    }
    triggerErpExcelHtmlDownload(wrapFlowReportForExcel(inner), filename)
  }

  const printFlow = (kind: "trial" | "income" | "balance") => {
    let inner = ""
    if (kind === "trial") {
      inner = buildFlowTrialBalanceHtml(reportMeta, localizedTrial, {
        debit: entries?.totalDebit || 0,
        credit: entries?.totalCredit || 0,
      })
    } else if (kind === "income") {
      inner = buildFlowIncomeStatementHtml(reportMeta, statements)
    } else {
      inner = buildFlowBalanceSheetHtml(reportMeta, statements)
    }
    printFlowReportHtml(inner)
  }

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
            onClick={() => {
              if (key !== "ledger") setLedgerAccount(null)
              setView(key)
            }}
          >
            {t(`taxBooksView_${key}`)}
          </Button>
        ))}
      </div>
      {!query && !rangeError ? <p className="text-sm text-muted-foreground">{t("taxBooksSearchFirst")}</p> : null}
      {rangeError ? <p className="text-sm text-amber-700 dark:text-amber-400">{t(`taxBooksErr_${rangeError}`)}</p> : null}
      {query && !singleMonth ? <p className="text-sm text-muted-foreground">{t("taxBooksRangePosting")}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">{t("accCompPp30AdjLoadingChannels")}</p> : null}
      {message && message !== "NEED_TAX_ENTITY" ? (
        <p className="text-sm">
          {t(`taxBooksErr_${message}`) !== `taxBooksErr_${message}` ? t(`taxBooksErr_${message}`) : message}
        </p>
      ) : null}
      {bridge?.schemaReady === false || entries?.schemaReady === false ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">{t("taxBooksSchemaMissing")}</p>
      ) : null}
      {entityMissing ? (
        <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{t("taxBooksNeedEntity")}</p>
      ) : null}
      {closed ? <p className="text-sm">{t("taxBooksPeriodClosed")}</p> : null}
      {bridge?.report?.recognition ? (
        <p
          className={cn(
            "text-sm font-medium",
            bridge.report.recognition.recognized ? "text-emerald-700" : "text-muted-foreground"
          )}
        >
          {bridge.report.recognition.recognized ? t("taxBooksRecognized") : t("taxBooksNotRecognized")}
          {closed ? ` · ${t("taxBooksPeriodClosed")}` : ""}
        </p>
      ) : null}

      {view === "bridge" && bridge?.report ? (
        <AdminTableScroll lockViewport={false}>
          <table className="w-full min-w-[720px] text-sm">
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
                  <td className="py-2 text-xs text-muted-foreground">
                    {ln.reason ? t(`taxBooksReason_${ln.reason}`) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("taxBooksPosNet")} {money(bridge.report.salesSplit.posNet)} · {t("taxBooksTaxInvoiceNet")}{" "}
            {money(bridge.report.salesSplit.taxInvoiceNet)} · {t("taxBooksPurchaseNet")}{" "}
            {money(bridge.report.salesSplit.purchaseNet)}
          </p>
        </AdminTableScroll>
      ) : null}

      {view === "vouchers" ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("taxBooksJvListHint")}</p>
          <div className="flex flex-wrap gap-1.5">
            {TAX_DAY_BOOK_FILTERS.map((key) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={dayBook === key ? "default" : "outline"}
                onClick={() => setDayBook(key)}
              >
                {t(`taxBooksDayBook_${key}`)}
                {query ? ` (${dayBookCounts[key]})` : ""}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t(`taxBooksDayBookHint_${dayBook}`)}</p>
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">{t("taxBooksAddEntry")}</p>
            <p className="text-xs text-muted-foreground">{t("taxBooksAddEntryHint")}</p>
            <div className="flex flex-wrap gap-2">
              <Input
                type="date"
                className="w-40"
                value={dayDate}
                onChange={(e) => setDayDate(e.target.value)}
              />
              <Input
                className="w-40"
                value={dayDocNo}
                placeholder={t("taxBooksColDoc")}
                onChange={(e) => setDayDocNo(e.target.value)}
              />
              <Input
                className="min-w-[12rem] flex-1"
                value={dayMemo}
                placeholder={t("taxBooksColDescription")}
                onChange={(e) => setDayMemo(e.target.value)}
              />
              {dayBook === "all" ? (
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={dayKind}
                  onChange={(e) => setDayKind(e.target.value as TaxVoucherKind)}
                >
                  {(["general", "purchase", "sales", "payment", "receipt"] as TaxVoucherKind[]).map((k) => (
                    <option key={k} value={k}>
                      {t(`taxBooksDayBook_${k}`)}
                    </option>
                  ))}
                </select>
              ) : null}
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={dayStatus}
                onChange={(e) => setDayStatus(e.target.value === "draft" ? "draft" : "approved")}
              >
                <option value="approved">{t("taxBooksStatusApproved")}</option>
                <option value="draft">{t("taxBooksStatusDraft")}</option>
              </select>
            </div>
            {dayAdj.map((ln, idx) => (
              <div key={idx} className="flex flex-wrap gap-2">
                <Input
                  className="w-28"
                  value={ln.accountCode}
                  placeholder={t("taxBooksAccount")}
                  onChange={(e) =>
                    setDayAdj((rows) => rows.map((row, i) => (i === idx ? { ...row, accountCode: e.target.value } : row)))
                  }
                />
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={ln.side}
                  onChange={(e) =>
                    setDayAdj((rows) =>
                      rows.map((row, i) =>
                        i === idx ? { ...row, side: e.target.value === "credit" ? "credit" : "debit" } : row
                      )
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
                    setDayAdj((rows) => rows.map((row, i) => (i === idx ? { ...row, amount: e.target.value } : row)))
                  }
                />
              </div>
            ))}
            <p className="text-sm tabular-nums">
              {t("taxBooksColTotal")} {money(Math.max(dayDebit, dayCredit))}
              {dayDebit > 0 || dayCredit > 0
                ? ` · Dr ${money(dayDebit)} / Cr ${money(dayCredit)}${dayBalanced ? "" : ` · ${t("taxBooksUnbalanced")}`}`
                : ""}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setDayAdj((rows) => [...rows, { accountCode: "", side: "debit", amount: "" }])}
              >
                {t("taxBooksAddLine")}
              </Button>
              <Button type="button" size="sm" disabled={!canPost || !dayBalanced} onClick={() => void postManual()}>
                {t("taxBooksSaveEntry")}
              </Button>
            </div>
          </div>
          <VoucherJvTable
            empty={t("taxBooksNoRows")}
            statusLabel={t("taxBooksStatusApproved")}
            draftLabel={t("taxBooksStatusDraft")}
            headers={[
              t("taxBooksColDate"),
              t("taxBooksColDoc"),
              t("taxBooksColKind"),
              t("taxBooksColDescription"),
              t("taxBooksColTotal"),
              t("taxBooksColStatus"),
            ]}
            rows={filteredVouchers.map((v) => ({
              id: v.id,
              date: v.accountingDate,
              docNo: v.voucherNo,
              kind: t(`taxBooksKind_${v.voucherKind}`) || v.voucherKind,
              description: formatTaxBookMemoDisplay(t, v.memo, {
                sourceType: v.sourceType,
                accountingDate: v.accountingDate,
              }),
              total: money(Math.max(Number(v.debit) || 0, Number(v.credit) || 0)),
              status: v.postingStatus === "draft" ? "draft" : "approved",
            }))}
          />
        </div>
      ) : null}

      {view === "ledger" ? (
        <div className="space-y-2">
          {ledgerAccount ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm">
                {t("taxBooksLedgerFilter")} <span className="font-medium">{ledgerAccount}</span>
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setLedgerAccount(null)}
              >
                {t("taxBooksLedgerClear")}
              </Button>
            </div>
          ) : null}
          <EntryTable
            empty={t("taxBooksNoRows")}
            rows={(entries?.ledger || []).map((ln) => [
              ln.accountCode,
              displayTaxBookAccountName(lang, ln.accountCode, ln.accountName),
              ln.accountingDate,
              ln.voucherNo,
              formatTaxBookMemoDisplay(t, ln.memo, {
                sourceType: ln.sourceType,
                accountingDate: ln.accountingDate,
              }),
              money(ln.debit),
              money(ln.credit),
            ])}
            headers={[
              t("taxBooksAccount"),
              t("taxBooksColItem"),
              t("taxBooksColDate"),
              t("taxBooksColDoc"),
              t("taxBooksMemo"),
              t("taxBooksDebit"),
              t("taxBooksCredit"),
            ]}
          />
        </div>
      ) : null}

      {view === "trial" && entries?.trial ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 no-print">
            <Button type="button" size="sm" variant="outline" onClick={() => exportFlow("trial")}>
              {t("taxBooksExportExcel")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => printFlow("trial")}>
              {t("taxBooksPrint")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground no-print">{t("taxBooksTrialDrillHint")}</p>
          <style dangerouslySetInnerHTML={{ __html: taxBookFlowReportScreenCss() }} />
          <div
            dangerouslySetInnerHTML={{
              __html: buildFlowTrialBalanceHtml(reportMeta, localizedTrial, {
                debit: entries.totalDebit || 0,
                credit: entries.totalCredit || 0,
              }),
            }}
          />
          <div className="no-print rounded-md border border-dashed p-2">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t("taxBooksLedgerFilter")}</p>
            <ClickableTrialTable
              empty={t("taxBooksNoRows")}
              rows={localizedTrial}
              headers={[t("taxBooksAccount"), t("taxBooksColItem"), t("taxBooksDebit"), t("taxBooksCredit")]}
              onAccountClick={drillToLedger}
            />
          </div>
        </div>
      ) : null}

      {view === "taxIncome" && !loading ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 no-print">
            <Button type="button" size="sm" variant="outline" onClick={() => exportFlow("income")}>
              {t("taxBooksExportExcel")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => printFlow("income")}>
              {t("taxBooksPrint")}
            </Button>
          </div>
          <style dangerouslySetInnerHTML={{ __html: taxBookFlowReportScreenCss() }} />
          <div dangerouslySetInnerHTML={{ __html: buildFlowIncomeStatementHtml(reportMeta, statements) }} />
        </div>
      ) : null}

      {view === "taxBalance" && !loading ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 no-print">
            <Button type="button" size="sm" variant="outline" onClick={() => exportFlow("balance")}>
              {t("taxBooksExportExcel")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => printFlow("balance")}>
              {t("taxBooksPrint")}
            </Button>
          </div>
          <style dangerouslySetInnerHTML={{ __html: taxBookFlowReportScreenCss() }} />
          <div dangerouslySetInnerHTML={{ __html: buildFlowBalanceSheetHtml(reportMeta, statements) }} />
        </div>
      ) : null}

      {view === "closing" ? (
        <div className="space-y-3">
          <div className="rounded-md border p-3 space-y-2">
            <p className="text-sm font-medium">{t("taxBooksChecklistTitle")}</p>
            <ol className="space-y-1.5 text-sm">
              {checklist.map((step, idx) => (
                <li key={step.id} className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums text-muted-foreground w-5">{idx + 1}.</span>
                  <span
                    className={cn(
                      "inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-xs font-medium",
                      step.done
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {step.done ? "✓" : "·"}
                  </span>
                  <span>{stepLabel(step.id)}</span>
                  {step.id === "recognize" && bridge?.report?.recognition ? (
                    <span className="text-xs text-muted-foreground">
                      {bridge.report.recognition.recognized ? t("taxBooksRecognized") : t("taxBooksNotRecognized")}
                    </span>
                  ) : null}
                  {step.id === "close" && closed ? (
                    <span className="text-xs text-emerald-700">{t("taxBooksPeriodClosed")}</span>
                  ) : null}
                  {step.id === "bridge" && step.detail ? (
                    <span className="text-xs text-amber-700">
                      {t("taxBooksBridgeHoles")} {step.detail}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>

          <p className="text-sm">
            {t("taxBooksClosingNet")} {money(bridge?.closingNetIncome)} · {t("taxBooksClosingLines")}{" "}
            {bridge?.closingLineCount ?? 0}
          </p>
          <p className="text-sm text-muted-foreground">{t("taxBooksCitUsesLockedProfit")}</p>

          <div className="space-y-2 rounded-md border border-dashed p-3">
            <p className="text-sm font-medium">{t("taxBooksPostOpening")}</p>
            <p className="text-xs text-muted-foreground">{t("taxBooksOpeningInventoryHint")}</p>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t("taxBooksOpeningDate")}</div>
                <Input className="h-9 w-[150px]" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t("taxBooksOpeningInventory")}</div>
                <Input
                  className="h-9 w-[180px]"
                  inputMode="decimal"
                  value={openingInventory}
                  onChange={(e) => {
                    setOpeningInventory(e.target.value)
                    setInventoryConfirmed(false)
                  }}
                  placeholder="1460"
                />
              </div>
              <Button type="button" size="sm" variant="outline" disabled={posting || !singleMonth} onClick={() => void post("inventoryPreview")}>
                {t("taxBooksInventoryPreview")}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={inventoryConfirmed}
                  onChange={(e) => setInventoryConfirmed(e.target.checked)}
                />
                {t("taxBooksInventoryConfirm")}
              </label>
              {inventoryPreview != null ? (
                <span className="text-xs text-muted-foreground">
                  {t("taxBooksInventoryPreviewDone")} {money(inventoryPreview)}
                  {cogsPreview != null ? ` · COGS ${money(cogsPreview)}` : ""}
                </span>
              ) : null}
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t("taxBooksTrialUploadHint")}</p>
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="h-9 max-w-md"
                onChange={(e) => void onTrialFile(e.target.files?.[0] || null)}
              />
              {trialUploadName ? (
                <p className="text-xs text-muted-foreground">
                  {trialUploadName}
                  {trialUploadRows ? ` · ${trialUploadRows.length}` : ""}
                </p>
              ) : null}
            </div>
            <Button type="button" size="sm" variant="secondary" disabled={!canPost} onClick={() => void post("opening")}>
              {t("taxBooksPostOpening")}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={!canPost} onClick={() => void post("vat")}>
              {t("taxBooksPostVat")}
            </Button>
            <Button type="button" size="sm" disabled={!canPost} onClick={() => void post("sales")}>
              {t("taxBooksPostSales")}
            </Button>
            <Button type="button" size="sm" disabled={!canPost} onClick={() => void post("purchase")}>
              {t("taxBooksPostPurchase")}
            </Button>
            <Button type="button" size="sm" disabled={!canPost} onClick={() => void post("payroll")}>
              {t("taxBooksPostPayroll")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!canPost || (!inventoryConfirmed && parseInventoryAmount() == null)}
              onClick={() => void post("inventory")}
            >
              {t("taxBooksPostInventory")}
            </Button>
            <Button type="button" size="sm" disabled={!canPost} onClick={() => void post("closing")}>
              {t("taxBooksPostClosing")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={posting || !closed || entityMissing || !singleMonth}
              onClick={() => void post("unlock")}
            >
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
                      rows.map((row, i) =>
                        i === idx ? { ...row, side: e.target.value === "credit" ? "credit" : "debit" } : row
                      )
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
              <Button type="button" size="sm" disabled={!canPost} onClick={() => void post("adjustment")}>
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
    <AdminTableScroll lockViewport={false}>
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
    </AdminTableScroll>
  )
}

/** FlowAccount JV 목록형: 일자·문서번호·종류·Description·합계·Approved */
function VoucherJvTable({
  headers,
  rows,
  empty,
  statusLabel,
  draftLabel,
}: {
  headers: string[]
  rows: {
    id: number
    date: string
    docNo: string
    kind: string
    description: string
    total: string
    status?: "draft" | "approved"
  }[]
  empty: string
  statusLabel: string
  draftLabel: string
}) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <AdminTableScroll lockViewport={false} className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-muted-foreground">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{r.date}</td>
              <td className="whitespace-nowrap px-3 py-2.5 font-medium">{r.docNo}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{r.kind}</td>
              <td className="max-w-[28rem] px-3 py-2.5">{r.description || "—"}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{r.total}</td>
              <td className="whitespace-nowrap px-3 py-2.5">
                <span
                  className={
                    r.status === "draft"
                      ? "inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                      : "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                  }
                >
                  {r.status === "draft" ? draftLabel : statusLabel}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminTableScroll>
  )
}

function ClickableTrialTable({
  headers,
  rows,
  empty,
  onAccountClick,
}: {
  headers: string[]
  rows: { accountCode: string; accountName: string | null; debit: number; credit: number }[]
  empty: string
  onAccountClick: (code: string) => void
}) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <AdminTableScroll lockViewport={false}>
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
          {rows.map((r) => (
            <tr key={r.accountCode} className="border-b">
              <td className="py-2 pr-3">
                <button
                  type="button"
                  className="text-left text-primary underline-offset-2 hover:underline"
                  onClick={() => onAccountClick(r.accountCode)}
                >
                  {r.accountCode}
                </button>
              </td>
              <td className="py-2 pr-3">{r.accountName || ""}</td>
              <td className="py-2 pr-3 tabular-nums">{money(r.debit)}</td>
              <td className="py-2 pr-3 tabular-nums">{money(r.credit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminTableScroll>
  )
}
