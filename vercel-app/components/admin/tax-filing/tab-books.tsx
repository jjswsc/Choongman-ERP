"use client"

import * as React from "react"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { useLang } from "@/lib/lang-context"
import {
  getTaxBookEntries,
  getTaxBookVoucherLines,
  getTaxManagementBridge,
  postTaxBookEntry,
  updateTaxBookVoucherLines,
  type TaxBookEntriesResponse,
  type TaxBookPostAction,
  type TaxBookVoucherLine,
  type TaxManagementBridgeResponse,
} from "@/lib/api-client/tax-book"
import {
  triggerErpExcelHtmlDownload,
} from "@/lib/erp-excel-export"
import {
  buildTaxBookLedgerSections,
  buildTaxBookStatements,
  filterTaxBookLedgerLines,
  resolveTaxBookMonthRange,
  voucherKindForSourceType,
  TAX_DAY_BOOK_FILTERS,
  type TaxBookLedgerScope,
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
  buildFlowLedgerHtml,
  buildFlowTrialBalanceHtml,
  printFlowReportHtml,
  taxBookFlowReportScreenCss,
  wrapFlowReportForExcel,
  type TaxBookFlowReportMeta,
} from "@/lib/tax-book-flow-report"
import { getAccountSubjects } from "@/lib/api-client/chart-of-accounts"
import { CHART_OF_ACCOUNTS_BY_CODE } from "@/lib/chart-of-accounts-mapping"
import {
  canonicalJournalAccountName,
  displayTaxBookAccountName,
  formatTaxBookLedgerPeriod,
  formatTaxBookMemoDisplay,
  formatTaxFilingYearMonthLabel,
  type TaxBookAccountSubjectLabel,
} from "@/lib/tax-book-display"
import { linesWithPaidBankCredit } from "@/lib/paid-bank-credit"
import { taxBookCompanyNameFromScope } from "@/lib/tax-entity-scope-label"
import type { TaxEntityScopeOption } from "@/components/admin/tax-filing/tax-entity-store-scope-filters"
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

function isoDayBefore(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return ""
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  dt.setUTCDate(dt.getUTCDate() - 1)
  const y = dt.getUTCFullYear()
  const mo = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const d = String(dt.getUTCDate()).padStart(2, "0")
  return `${y}-${mo}-${d}`
}

function ledgerScopeForMonths(fromMonth: string, toMonth: string): TaxBookLedgerScope {
  const range = resolveTaxBookMonthRange(fromMonth, toMonth)
  return {
    dateFrom: range.ok ? range.startDate : "",
    dateTo: range.ok ? range.endDate : "",
    accountFrom: "",
    accountTo: "",
    allBusiness: true,
  }
}

export function TaxFilingBooksTab(props: {
  fromMonth: string
  toMonth: string
  filingStoreFilter: string
  entityOptions?: TaxEntityScopeOption[]
  searchTick: number
  /** 신고 탭 등에서 전표 목록으로 바로 열 때 */
  focusView?: BooksView | null
  focusViewTick?: number
}) {
  const { lang } = useLang()
  const t = useT(lang)
  const [accountSubjects, setAccountSubjects] = React.useState<TaxBookAccountSubjectLabel[]>([])
  React.useEffect(() => {
    let cancelled = false
    void getAccountSubjects()
      .then((rows) => {
        if (cancelled) return
        setAccountSubjects(
          rows.map((row) => ({
            code: row.code,
            name: row.name,
            nameEn: row.nameEn,
            nameTh: row.nameTh,
          }))
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
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
  const [ledgerDraft, setLedgerDraft] = React.useState<TaxBookLedgerScope>(() =>
    ledgerScopeForMonths(props.fromMonth, props.toMonth)
  )
  const [ledgerApplied, setLedgerApplied] = React.useState<TaxBookLedgerScope>(() =>
    ledgerScopeForMonths(props.fromMonth, props.toMonth)
  )
  const ledgerTouchedRef = React.useRef(false)
  const [dayBook, setDayBook] = React.useState<TaxDayBookFilter>("all")
  const [voucherDateQuery, setVoucherDateQuery] = React.useState("")
  const [voucherDocQuery, setVoucherDocQuery] = React.useState("")
  const [openVoucher, setOpenVoucher] = React.useState<TaxBookEntriesResponse["vouchers"][number] | null>(null)
  const [voucherLines, setVoucherLines] = React.useState<TaxBookVoucherLine[] | null>(null)
  const [voucherLinesLoading, setVoucherLinesLoading] = React.useState(false)
  const [paidFromBank, setPaidFromBank] = React.useState<{
    accountCode: string
    accountName: string
    amount: number
  } | null>(null)
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

  React.useEffect(() => {
    if (query) return
    if (ledgerTouchedRef.current) return
    const next = ledgerScopeForMonths(props.fromMonth, props.toMonth)
    setLedgerDraft(next)
    setLedgerApplied(next)
  }, [props.fromMonth, props.toMonth, query])

  React.useEffect(() => {
    if (!query) return
    ledgerTouchedRef.current = false
    const next = ledgerScopeForMonths(query.from, query.to)
    setLedgerDraft(next)
    setLedgerApplied(next)
  }, [query])

  const load = React.useCallback(
    async (q: BooksQuery, opts?: { ensureFiling?: boolean }) => {
      const single = q.from === q.to
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
    [view]
  )

  React.useEffect(() => {
    if (!query) return
    void load(query)
  }, [query, load])

  const ledgerRows = React.useMemo(
    () => filterTaxBookLedgerLines(entries?.ledger || [], ledgerApplied),
    [entries?.ledger, ledgerApplied]
  )
  const ledgerSourceCount = entries?.ledger?.length || 0
  const ledgerDebit = React.useMemo(
    () => ledgerRows.reduce((sum, ln) => sum + (Number(ln.debit) || 0), 0),
    [ledgerRows]
  )
  const ledgerCredit = React.useMemo(
    () => ledgerRows.reduce((sum, ln) => sum + (Number(ln.credit) || 0), 0),
    [ledgerRows]
  )
  const ledgerBeforeNet = React.useMemo(() => {
    const start = ledgerApplied.dateFrom.trim()
    if (!start) return null
    const prior = filterTaxBookLedgerLines(entries?.ledger || [], {
      ...ledgerApplied,
      dateFrom: "",
      dateTo: isoDayBefore(start),
    })
    const debit = prior.reduce((sum, ln) => sum + (Number(ln.debit) || 0), 0)
    const credit = prior.reduce((sum, ln) => sum + (Number(ln.credit) || 0), 0)
    return debit - credit
  }, [entries?.ledger, ledgerApplied])

  const localizedTrial = React.useMemo(
    () =>
      (entries?.trial || []).map((r) => ({
        ...r,
        accountName: displayTaxBookAccountName(lang, r.accountCode, r.accountName, accountSubjects),
      })),
    [entries?.trial, lang, accountSubjects]
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
    const docQ = voucherDocQuery.trim().toLowerCase()
    const dateQ = voucherDateQuery.trim()
    return (entries?.vouchers || []).filter((v) => {
      if (!voucherMatchesDayBook(v.voucherKind as TaxVoucherKind, dayBook)) return false
      if (dateQ && v.accountingDate !== dateQ) return false
      if (docQ) {
        const docHit =
          String(v.voucherNo || "")
            .toLowerCase()
            .includes(docQ) ||
          String(v.referenceNo || "")
            .toLowerCase()
            .includes(docQ) ||
          String(v.entryNo || "")
            .toLowerCase()
            .includes(docQ)
        if (!docHit) return false
      }
      return true
    })
  }, [entries?.vouchers, dayBook, voucherDateQuery, voucherDocQuery])

  React.useEffect(() => {
    if (!openVoucher) {
      setVoucherLines(null)
      setPaidFromBank(null)
      setVoucherLinesLoading(false)
      return
    }
    let cancelled = false
    setVoucherLines(null)
    setPaidFromBank(null)
    setVoucherLinesLoading(true)
    void getTaxBookVoucherLines({
      entryId: openVoucher.id,
      scopeFilter: query?.scope || props.filingStoreFilter || "All",
    })
      .then((res) => {
        if (!cancelled) {
          setVoucherLines(res.lines || [])
          setPaidFromBank(res.paidFromBank || null)
        }
      })
      .catch(() => {
        if (!cancelled) setVoucherLines([])
      })
      .finally(() => {
        if (!cancelled) setVoucherLinesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [openVoucher, query?.scope, props.filingStoreFilter])

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
    const code = accountCode.trim()
    ledgerTouchedRef.current = true
    setLedgerDraft((prev) => ({ ...prev, accountFrom: code, accountTo: code, allBusiness: false }))
    setLedgerApplied((prev) => ({ ...prev, accountFrom: code, accountTo: code, allBusiness: false }))
    setView("ledger")
  }

  const applyLedgerScope = (next: TaxBookLedgerScope) => {
    let dateFrom = next.dateFrom.trim()
    let dateTo = next.dateTo.trim()
    if (dateFrom && dateTo && dateFrom > dateTo) {
      const swap = dateFrom
      dateFrom = dateTo
      dateTo = swap
    }
    const accountFrom = next.accountFrom.trim()
    const accountTo = next.accountTo.trim()
    const applied: TaxBookLedgerScope = {
      dateFrom,
      dateTo,
      accountFrom,
      accountTo,
      allBusiness: next.allBusiness || (!accountFrom && !accountTo),
    }
    ledgerTouchedRef.current = true
    setLedgerDraft(applied)
    setLedgerApplied(applied)
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
      taxBookCompanyNameFromScope(scopeLabel, props.entityOptions || [], bridge?.taxEntityCode || "") ||
      scopeLabel
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
  }, [bridge?.taxEntityCode, scopeLabel, props.entityOptions, query?.from, query?.to, props.fromMonth, props.toMonth, lang])

  const ledgerSections = React.useMemo(() => {
    const localized = (entries?.ledger || []).map((ln) => ({
      ...ln,
      accountName: displayTaxBookAccountName(lang, ln.accountCode, ln.accountName, accountSubjects),
      memo: formatTaxBookMemoDisplay(t, ln.memo, {
        sourceType: ln.sourceType,
        accountingDate: ln.accountingDate,
        lang,
      }),
    }))
    return buildTaxBookLedgerSections(localized, ledgerApplied)
  }, [entries?.ledger, ledgerApplied, lang, t, accountSubjects])

  const ledgerReportInput = React.useMemo(() => {
    const accountLabel = ledgerApplied.allBusiness
      ? t("taxBooksLedgerAllBusiness")
      : [ledgerApplied.accountFrom, ledgerApplied.accountTo].filter(Boolean).join(" – ")
    return {
      meta: {
        ...reportMeta,
        asOfLabel: formatTaxBookLedgerPeriod(ledgerApplied.dateFrom, ledgerApplied.dateTo, lang),
        periodLabel: accountLabel,
      },
      labels: {
        title: t("taxBooksLedgerReportTitle"),
        date: t("taxBooksColDate"),
        book: t("taxBooksColKind"),
        voucher: t("taxBooksLedgerVoucher"),
        description: t("taxBooksColDescription"),
        debit: t("taxBooksDebit"),
        credit: t("taxBooksCredit"),
        balance: t("taxBooksLedgerBalance"),
        total: t("taxBooksLedgerTotal"),
        bookLabel: (sourceType: string | null | undefined) =>
          t(`taxBooksDayBook_${voucherKindForSourceType(sourceType)}`) || "",
      },
    }
  }, [reportMeta, ledgerApplied, lang, t])

  const ledgerReportHtml = React.useMemo(
    () => buildFlowLedgerHtml(ledgerReportInput.meta, ledgerSections, ledgerReportInput.labels),
    [ledgerReportInput, ledgerSections]
  )
  const ledgerExcelHtml = React.useMemo(
    () => buildFlowLedgerHtml(ledgerReportInput.meta, ledgerSections, ledgerReportInput.labels, { numeric: true }),
    [ledgerReportInput, ledgerSections]
  )

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
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <div className="mb-1 text-xs text-muted-foreground">{t("taxBooksVoucherFind")}</div>
              <div className="flex flex-wrap gap-2">
                <Input
                  type="date"
                  className="h-9 w-[150px]"
                  aria-label={t("taxBooksVoucherSearchDate")}
                  value={voucherDateQuery}
                  onChange={(e) => setVoucherDateQuery(e.target.value)}
                />
                <Input
                  className="h-9 w-[220px]"
                  aria-label={t("taxBooksVoucherSearchDoc")}
                  placeholder={t("taxBooksVoucherSearchDoc")}
                  value={voucherDocQuery}
                  onChange={(e) => setVoucherDocQuery(e.target.value)}
                />
              </div>
            </div>
          </div>
          <VoucherJvTable
            empty={t("taxBooksNoRows")}
            statusLabel={t("taxBooksStatusApproved")}
            draftLabel={t("taxBooksStatusDraft")}
            onDocClick={(id) => {
              const row = filteredVouchers.find((v) => v.id === id)
              if (row) setOpenVoucher(row)
            }}
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
              referenceNo: v.referenceNo,
              kind: t(`taxBooksKind_${v.voucherKind}`) || v.voucherKind,
              description: formatTaxBookMemoDisplay(t, v.memo, {
                sourceType: v.sourceType,
                accountingDate: v.accountingDate,
                lang,
              }),
              total: money(Math.max(Number(v.debit) || 0, Number(v.credit) || 0)),
              status: v.postingStatus === "draft" ? "draft" : "approved",
            }))}
          />
          <Dialog open={openVoucher != null} onOpenChange={(open) => !open && setOpenVoucher(null)}>
            <DialogContent className="max-h-[min(85vh,720px)] max-w-3xl overflow-y-auto">
              {openVoucher ? (
                <VoucherEntryDialogBody
                  voucher={openVoucher}
                  lines={voucherLines}
                  loading={voucherLinesLoading}
                  lang={lang}
                  accountSubjects={accountSubjects}
                  t={t}
                  statusLabel={t("taxBooksStatusApproved")}
                  draftLabel={t("taxBooksStatusDraft")}
                  paidFromBank={paidFromBank}
                  locked={closed}
                  scopeFilter={query?.scope || props.filingStoreFilter || "All"}
                  onSaved={(next, notice) => {
                    setVoucherLines(next)
                    setMessage(notice || t("taxBooksLinesSaved"))
                    if (query) void load(query)
                  }}
                />
              ) : null}
            </DialogContent>
          </Dialog>
        </div>
      ) : null}

      {view === "ledger" ? (
        <div className="space-y-2">
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs text-muted-foreground">{t("taxBooksLedgerRangeHint")}</p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <div className="mb-1 text-xs text-muted-foreground">{t("taxBooksLedgerDateFrom")}</div>
                <Input
                  type="date"
                  className="h-9 w-[150px]"
                  value={ledgerDraft.dateFrom}
                  onChange={(e) => {
                    ledgerTouchedRef.current = true
                    setLedgerDraft((prev) => ({ ...prev, dateFrom: e.target.value }))
                  }}
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">{t("taxBooksLedgerDateTo")}</div>
                <Input
                  type="date"
                  className="h-9 w-[150px]"
                  value={ledgerDraft.dateTo}
                  onChange={(e) => {
                    ledgerTouchedRef.current = true
                    setLedgerDraft((prev) => ({ ...prev, dateTo: e.target.value }))
                  }}
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">{t("taxBooksLedgerAccountFrom")}</div>
                <Input
                  className="h-9 w-[150px]"
                  inputMode="numeric"
                  value={ledgerDraft.accountFrom}
                  placeholder="4110"
                  onChange={(e) => {
                    ledgerTouchedRef.current = true
                    const accountFrom = e.target.value
                    setLedgerDraft((prev) => ({
                      ...prev,
                      accountFrom,
                      allBusiness: accountFrom.trim() === "" && prev.accountTo.trim() === "",
                    }))
                  }}
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">{t("taxBooksLedgerAccountTo")}</div>
                <Input
                  className="h-9 w-[150px]"
                  inputMode="numeric"
                  value={ledgerDraft.accountTo}
                  placeholder="4110"
                  onChange={(e) => {
                    ledgerTouchedRef.current = true
                    const accountTo = e.target.value
                    setLedgerDraft((prev) => ({
                      ...prev,
                      accountTo,
                      allBusiness: prev.accountFrom.trim() === "" && accountTo.trim() === "",
                    }))
                  }}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant={ledgerDraft.allBusiness ? "default" : "outline"}
                onClick={() =>
                  applyLedgerScope({
                    ...ledgerDraft,
                    accountFrom: "",
                    accountTo: "",
                    allBusiness: true,
                  })
                }
              >
                {t("taxBooksLedgerAllBusiness")}
              </Button>
              <Button type="button" size="sm" onClick={() => applyLedgerScope(ledgerDraft)}>
                {t("search")}
              </Button>
            </div>
            {query ? (
              <p className="text-xs text-muted-foreground">
                {ledgerApplied.dateFrom || "—"} – {ledgerApplied.dateTo || "—"}
                {" · "}
                {ledgerApplied.allBusiness
                  ? t("taxBooksLedgerAllBusiness")
                  : `${ledgerApplied.accountFrom || "—"}${
                      ledgerApplied.accountTo && ledgerApplied.accountTo !== ledgerApplied.accountFrom
                        ? `–${ledgerApplied.accountTo}`
                        : ""
                    }`}
                {" · "}
                {ledgerBeforeNet != null && !ledgerApplied.allBusiness ? (
                  <>
                    {t("taxBooksLedgerBeforeRange")}{" "}
                    {ledgerBeforeNet >= 0
                      ? `${t("taxBooksDebit")} ${money(ledgerBeforeNet)}`
                      : `${t("taxBooksCredit")} ${money(-ledgerBeforeNet)}`}
                    {" · "}
                  </>
                ) : null}
                {t("taxBooksDebit")} {money(ledgerDebit)} / {t("taxBooksCredit")} {money(ledgerCredit)}
              </p>
            ) : null}
          </div>
          {query && ledgerSourceCount > 0 && ledgerSections.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("taxBooksLedgerNoMatch")}</p>
          ) : query && ledgerSections.length > 0 ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 no-print">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    triggerErpExcelHtmlDownload(
                      wrapFlowReportForExcel(ledgerExcelHtml),
                      `tax-ledger_${ledgerApplied.dateFrom || "from"}_${ledgerApplied.dateTo || "to"}.xls`
                    )
                  }
                >
                  {t("taxBooksExportExcel")}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => printFlowReportHtml(ledgerReportHtml)}>
                  {t("taxBooksPrint")}
                </Button>
              </div>
              <style dangerouslySetInnerHTML={{ __html: taxBookFlowReportScreenCss() }} />
              <div dangerouslySetInnerHTML={{ __html: ledgerReportHtml }} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("taxBooksNoRows")}</p>
          )}
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

function amountCell(n: number): string {
  if (!n) return ""
  return money(n)
}

type VoucherDraftLine = {
  accountCode: string
  accountName: string
  canonicalName: string
  debit: string
  credit: string
  memo: string
}

function accountPickList(subjects: TaxBookAccountSubjectLabel[]): TaxBookAccountSubjectLabel[] {
  const byCode = new Map(subjects.map((row) => [String(row.code || "").trim(), row]))
  for (const meta of Object.values(CHART_OF_ACCOUNTS_BY_CODE)) {
    if (!byCode.has(meta.code)) {
      byCode.set(meta.code, {
        code: meta.code,
        name: meta.nameKo,
        nameEn: meta.nameEn,
        nameTh: meta.nameTh || null,
      })
    }
  }
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code))
}

function parseDraftAmount(raw: string): number {
  const n = Number(String(raw || "").replace(/,/g, "").trim())
  return Number.isFinite(n) ? Math.abs(n) : 0
}

function draftFromLines(
  rows: TaxBookVoucherLine[],
  lang: string,
  subjects: TaxBookAccountSubjectLabel[]
): VoucherDraftLine[] {
  return rows.map((ln) => {
    const stored = String(ln.accountName || "").trim()
    const accountName = displayTaxBookAccountName(lang, ln.accountCode, stored, subjects)
    return {
      accountCode: ln.accountCode,
      accountName,
      canonicalName: stored || canonicalJournalAccountName(ln.accountCode, accountName, subjects),
      debit: ln.debit ? String(ln.debit) : "",
      credit: ln.credit ? String(ln.credit) : "",
      memo: ln.memo || "",
    }
  })
}

function voucherSaveErrorText(t: (key: string) => string, code: string): string {
  if (code === "UNBALANCED") return t("taxBooksUnbalanced")
  if (code === "ONE_SIDE") return t("taxBooksOneSide")
  if (code === "TAX_PERIOD_CLOSED") return t("taxBooksPeriodLockedEdit")
  if (code === "ACCOUNTING_APPROVAL_FORBIDDEN" || code === "ACCOUNTING_FORBIDDEN") return t("taxBooksEditForbidden")
  const key = `taxBooksErr_${code}`
  const msg = t(key)
  return msg && msg !== key ? msg : code
}

function AccountSearchField({
  lang,
  subjects,
  placeholder,
  onPick,
}: {
  lang: string
  subjects: TaxBookAccountSubjectLabel[]
  placeholder: string
  onPick: (code: string, shownName: string, canonicalName: string) => void
}) {
  const [query, setQuery] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const options = React.useMemo(() => accountPickList(subjects), [subjects])
  const matches = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    return options
      .filter((row) => {
        const shown = displayTaxBookAccountName(lang, row.code, row.name, options)
        const blob = [row.code, row.name, row.nameEn, row.nameTh, shown].join(" ").toLowerCase()
        return blob.includes(needle)
      })
      .slice(0, 8)
  }, [query, options, lang])
  return (
    <div className="relative mb-1">
      <Input
        className="h-8 min-w-[12rem]"
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 160)
        }}
      />
      {open && matches.length ? (
        <ul className="mt-1 max-h-40 overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md">
          {matches.map((row) => {
            const shown = displayTaxBookAccountName(lang, row.code, row.name, options)
            return (
              <li key={`${row.code}-${row.name}`}>
                <button
                  type="button"
                  className="w-full rounded px-2 py-1 text-left hover:bg-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(row.code, shown, String(row.name || shown).trim())
                    setQuery("")
                    setOpen(false)
                  }}
                >
                  {row.code} / {shown}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function VoucherEntryDialogBody({
  voucher,
  lines,
  loading,
  lang,
  accountSubjects,
  t,
  statusLabel,
  draftLabel,
  paidFromBank,
  locked,
  scopeFilter,
  onSaved,
}: {
  voucher: TaxBookEntriesResponse["vouchers"][number]
  lines: TaxBookVoucherLine[] | null
  loading: boolean
  lang: string
  accountSubjects: TaxBookAccountSubjectLabel[]
  t: (key: string) => string
  statusLabel: string
  draftLabel: string
  paidFromBank: { accountCode: string; accountName: string; amount: number } | null
  locked: boolean
  scopeFilter: string
  onSaved: (lines: TaxBookVoucherLine[], notice?: string) => void
}) {
  const kindLabel = t(`taxBooksKind_${voucher.voucherKind}`) || voucher.voucherKind
  const description = formatTaxBookMemoDisplay(t, voucher.memo, {
    sourceType: voucher.sourceType,
    accountingDate: voucher.accountingDate,
    lang,
  })
  const bankPreview = React.useMemo(
    () => linesWithPaidBankCredit(lines || [], locked ? null : paidFromBank),
    [lines, locked, paidFromBank]
  )
  const shown = bankPreview.replaced ? bankPreview.lines : lines
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState<VoucherDraftLine[]>([])
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)
  React.useEffect(() => {
    setEditing(false)
    setSaveError(null)
  }, [voucher.id])
  React.useEffect(() => {
    if (editing) return
    setDraft(draftFromLines(shown || [], lang, accountSubjects))
  }, [voucher.id, shown, lang, accountSubjects, editing])
  const debitTotal = (editing ? draft : shown || []).reduce((sum, ln) => {
    return sum + (editing ? parseDraftAmount((ln as VoucherDraftLine).debit) : Number((ln as TaxBookVoucherLine).debit) || 0)
  }, 0)
  const creditTotal = (editing ? draft : shown || []).reduce((sum, ln) => {
    return sum + (editing ? parseDraftAmount((ln as VoucherDraftLine).credit) : Number((ln as TaxBookVoucherLine).credit) || 0)
  }, 0)
  const statusDraft = voucher.postingStatus === "draft"
  const payableStillShown = linesWithPaidBankCredit(lines || [], paidFromBank).replaced && locked

  const saveRows = async (payload: { accountCode: string; accountName: string; debit: number; credit: number; memo: string }[]) => {
    if (payload.some((ln) => ln.debit > 0.0001 && ln.credit > 0.0001)) {
      setSaveError(t("taxBooksOneSide"))
      return
    }
    const debit = payload.reduce((sum, ln) => sum + ln.debit, 0)
    const credit = payload.reduce((sum, ln) => sum + ln.credit, 0)
    if (payload.length < 2 || Math.abs(debit - credit) > 0.02) {
      setSaveError(t("taxBooksUnbalanced"))
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const res = await updateTaxBookVoucherLines({
        entryId: voucher.id,
        scopeFilter,
        lines: payload,
      })
      if (!res.success) {
        setSaveError(voucherSaveErrorText(t, String(res.error || "")))
        return
      }
      setEditing(false)
      onSaved(res.lines || [], res.settlementSkipped ? t("taxBooksSettlementLeft") : t("taxBooksLinesSaved"))
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const saveDraft = () => {
    const payload = draft
      .map((ln) => ({
        accountCode: ln.accountCode.trim(),
        accountName: (ln.canonicalName || ln.accountName).trim(),
        debit: parseDraftAmount(ln.debit),
        credit: parseDraftAmount(ln.credit),
        memo: ln.memo.trim(),
      }))
      .filter((ln) => ln.accountCode && (ln.debit > 0 || ln.credit > 0))
    void saveRows(payload)
  }
  return (
    <>
      <DialogHeader className="pr-8">
        <div className="flex items-start justify-between gap-2">
          <DialogTitle>
            {t("taxBooksVoucherDetailTitle")} {kindLabel}
          </DialogTitle>
          {!loading && lines?.length && !locked ? (
            <div className="mr-6 flex shrink-0 gap-2">
              {editing ? (
                <>
                  <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => setEditing(false)}>
                    {t("taxBooksCancelEdit")}
                  </Button>
                  <Button type="button" size="sm" disabled={saving} onClick={saveDraft}>
                    {t("taxBooksSaveEntry")}
                  </Button>
                </>
              ) : (
                <>
                  {bankPreview.replaced ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={saving}
                      onClick={() =>
                        void saveRows(
                          (shown || []).map((ln) => ({
                            accountCode: ln.accountCode,
                            accountName: ln.accountName || "",
                            debit: ln.debit,
                            credit: ln.credit,
                            memo: ln.memo || "",
                          }))
                        )
                      }
                    >
                      {t("taxBooksPaidBankSave")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDraft(draftFromLines(shown || [], lang, accountSubjects))
                      setSaveError(null)
                      setEditing(true)
                    }}
                  >
                    {t("taxBooksEditLines")}
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </div>
        <DialogDescription className="sr-only">{voucher.voucherNo}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold text-primary">{voucher.voucherNo}</span>
        <span
          className={
            statusDraft
              ? "inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
              : "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
          }
        >
          {statusDraft ? draftLabel : statusLabel}
        </span>
      </div>
      {bankPreview.replaced ? <p className="text-sm text-amber-800 dark:text-amber-300">{t("taxBooksPaidBankHint")}</p> : null}
      {payableStillShown ? <p className="text-sm text-amber-800 dark:text-amber-300">{t("taxBooksPeriodLockedEdit")}</p> : null}
      {saveError ? <p className="text-sm text-red-600">{saveError}</p> : null}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">{t("taxBooksColDate")}</dt>
          <dd className="mt-0.5 tabular-nums">{voucher.accountingDate || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("taxBooksVoucherRef")}</dt>
          <dd className="mt-0.5">{voucher.referenceNo || "—"}</dd>
        </div>
      </dl>
      <div>
        <div className="text-xs text-muted-foreground">{t("taxBooksColDescription")}</div>
        <p className="mt-0.5 text-sm">{description || "—"}</p>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="bg-sky-700 text-left text-white">
              <th className="px-3 py-2 font-medium">{t("taxBooksVoucherAccount")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("taxBooksDebit")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("taxBooksCredit")}</th>
              <th className="px-3 py-2 font-medium">{t("taxBooksVoucherLineMemo")}</th>
              {editing ? <th className="px-3 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={editing ? 5 : 4} className="px-3 py-6 text-center text-muted-foreground">
                  {t("taxBooksVoucherLinesLoading")}
                </td>
              </tr>
            ) : editing ? (
              draft.map((ln, idx) => (
                <tr key={idx} className="border-t">
                  <td className="px-2 py-2">
                    <AccountSearchField
                      lang={lang}
                      subjects={accountSubjects}
                      placeholder={t("taxBooksAccountSearch")}
                      onPick={(code, shownName, canonicalName) =>
                        setDraft((rows) =>
                          rows.map((row, i) =>
                            i === idx ? { ...row, accountCode: code, accountName: shownName, canonicalName } : row
                          )
                        )
                      }
                    />
                    <Input
                      className="mb-1 h-8 w-24"
                      value={ln.accountCode}
                      placeholder={t("taxBooksAccount")}
                      onChange={(e) =>
                        setDraft((rows) => rows.map((row, i) => (i === idx ? { ...row, accountCode: e.target.value } : row)))
                      }
                    />
                    <Input
                      className="h-8 min-w-[10rem]"
                      value={ln.accountName}
                      placeholder={t("taxBooksAccountName")}
                      onChange={(e) => {
                        const accountName = e.target.value
                        setDraft((rows) =>
                          rows.map((row, i) =>
                            i === idx
                              ? {
                                  ...row,
                                  accountName,
                                  canonicalName: canonicalJournalAccountName(row.accountCode, accountName, accountSubjects),
                                }
                              : row
                          )
                        )
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      className="h-8 w-28 text-right"
                      inputMode="decimal"
                      value={ln.debit}
                      onChange={(e) =>
                        setDraft((rows) =>
                          rows.map((row, i) =>
                            i === idx ? { ...row, debit: e.target.value, credit: e.target.value.trim() ? "" : row.credit } : row
                          )
                        )
                      }
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      className="h-8 w-28 text-right"
                      inputMode="decimal"
                      value={ln.credit}
                      onChange={(e) =>
                        setDraft((rows) =>
                          rows.map((row, i) =>
                            i === idx ? { ...row, credit: e.target.value, debit: e.target.value.trim() ? "" : row.debit } : row
                          )
                        )
                      }
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      className="h-8 min-w-[8rem]"
                      value={ln.memo}
                      onChange={(e) =>
                        setDraft((rows) => rows.map((row, i) => (i === idx ? { ...row, memo: e.target.value } : row)))
                      }
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setDraft((rows) => rows.filter((_, i) => i !== idx))}
                    >
                      {t("taxBooksRemoveLine")}
                    </Button>
                  </td>
                </tr>
              ))
            ) : !shown?.length ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  {t("taxBooksVoucherLinesEmpty")}
                </td>
              </tr>
            ) : (
              shown.map((ln, idx) => {
                const name = displayTaxBookAccountName(lang, ln.accountCode, ln.accountName, accountSubjects)
                const lineMemoRaw = String(ln.memo || "").trim()
                const lineMemo = lineMemoRaw
                  ? formatTaxBookMemoDisplay(t, lineMemoRaw, {
                      sourceType: voucher.sourceType,
                      accountingDate: voucher.accountingDate,
                      lang,
                    })
                  : description
                return (
                  <tr key={`${ln.accountCode}-${idx}`} className="border-t">
                    <td className="px-3 py-2">
                      {ln.accountCode}
                      {name ? ` / ${name}` : ""}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{amountCell(ln.debit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{amountCell(ln.credit)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{lineMemo || "—"}</td>
                  </tr>
                )
              })
            )}
          </tbody>
          {!loading && (editing ? draft.length : shown?.length) ? (
            <tfoot>
              <tr className="border-t font-semibold">
                <td className="px-3 py-2">{t("taxBooksColTotal")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(debitTotal)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(creditTotal)}</td>
                <td colSpan={editing ? 2 : 1} />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {editing ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            setDraft((rows) => [
              ...rows,
              { accountCode: "", accountName: "", canonicalName: "", debit: "", credit: "", memo: "" },
            ])
          }
        >
          {t("taxBooksAddLine")}
        </Button>
      ) : null}
    </>
  )
}

/** FlowAccount JV 목록형: 일자·문서번호·종류·Description·합계·Approved */
function VoucherJvTable({
  headers,
  rows,
  empty,
  statusLabel,
  draftLabel,
  onDocClick,
}: {
  headers: string[]
  rows: {
    id: number
    date: string
    docNo: string
    referenceNo?: string
    kind: string
    description: string
    total: string
    status?: "draft" | "approved"
  }[]
  empty: string
  statusLabel: string
  draftLabel: string
  onDocClick: (id: number) => void
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
              <td className="whitespace-nowrap px-3 py-2.5 font-medium">
                <button
                  type="button"
                  className="text-left text-primary underline-offset-2 hover:underline"
                  onClick={() => onDocClick(r.id)}
                >
                  {r.docNo}
                  {r.referenceNo && r.referenceNo !== r.docNo ? (
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{r.referenceNo}</span>
                  ) : null}
                </button>
              </td>
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
