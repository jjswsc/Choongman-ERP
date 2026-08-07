"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search, Camera, Pencil, Trash2 } from "lucide-react"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ExpenseSearchTimelineCell } from "@/components/erp/expense-search-timeline-cell"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getExpenseSearchOverview,
  getBankAccounts,
  getAccountSubjects,
  getVendorsForPurchase,
  deleteExpenseRegisterItem,
  deleteExpenseAccrual,
  updateBankTransactionInvoice,
  updateExpenseAccrualInvoice,
  translateTexts,
  useStoreList,
  type BankAccount,
  type ExpenseSearchOverviewRow,
  type ExpenseSearchOverviewSummary,
  type ExpenseSearchRelation,
  type AccountSubjectItem,
} from "@/lib/api-client"
import { EXPENSE_WITHDRAW_SUBJECT_FETCH } from "@/lib/account-subject-withdraw-options"
import { useAuth } from "@/lib/auth-context"
import { compressImageForUpload, cn } from "@/lib/utils"
import { ImageViewerWithRotate } from "@/components/ui/image-viewer-with-rotate"
import { useRouter, useSearchParams } from "next/navigation"
import { getBangkokMonthRange } from "@/lib/bangkok-time"
import {
  canDeleteExpenseAccrual,
  canEditExpenseAccrualClassification,
} from "@/lib/expense-accrual-approve-policy"

function getCategoryLabel(cat: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    purchase_payment: t("wm_purchase") || "Purchase Payment",
    purchase_advance: t("wm_advance") || "Advance Payment",
    expense: t("wm_expense") || "Expense",
    expense_advance: t("wm_advance") || "Advance Payment",
    fixed: t("wm_expense") || "Expense",
    fixed_asset: t("wm_fixed_asset") || "Fixed Asset",
    transfer: t("wm_transfer") || "Transfer",
    tax: t("wm_tax") || "Tax",
    loan_repayment: t("wm_loan_repayment") || "Loan Repayment",
    loan_given: t("wm_loan_given") || "Loan Given",
    correction: t("wm_correction") || "Correction",
    dividend: t("wm_dividend") || "Dividend",
  }
  return map[cat] ?? cat
}

function relationBadgeClass(relation: ExpenseSearchRelation): string {
  switch (relation) {
    case "plan_only":
      return "bg-amber-100 text-amber-800 border-amber-200"
    case "approved_unpaid":
      return "bg-sky-100 text-sky-800 border-sky-200"
    case "paid_bank":
    case "paid_petty":
      return "bg-emerald-100 text-emerald-800 border-emerald-200"
    case "rejected":
      return "bg-red-100 text-red-800 border-red-200"
    case "bank_only":
      return "bg-slate-100 text-slate-700 border-slate-200"
    case "card_only":
      return "bg-violet-100 text-violet-800 border-violet-200"
    default:
      return "bg-muted text-muted-foreground"
  }
}

export function ExpenseRegisterSearchTab() {
  const { lang } = useLang()
  const t = useT(lang)
  const tt = React.useCallback((key: string, fallback: string) => {
    const v = t(key)
    if (!v || v === key) return fallback
    return v
  }, [t])
  const { auth } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { posStores: stores } = useStoreList()
  const asDisplayName = (a: AccountSubjectItem) => (lang === "ko" ? a.name : (a.nameEn || a.name))

  const defaultMonthRange = React.useMemo(() => getBangkokMonthRange(), [])
  const [storeFilter, setStoreFilter] = React.useState<string>("__all__")
  const [accountId, setAccountId] = React.useState<string>("__all__")
  const [startStr, setStartStr] = React.useState(defaultMonthRange.startStr)
  const [endStr, setEndStr] = React.useState(defaultMonthRange.endStr)
  const [loading, setLoading] = React.useState(false)
  const [list, setList] = React.useState<ExpenseSearchOverviewRow[]>([])
  const [summary, setSummary] = React.useState<ExpenseSearchOverviewSummary>({
    planOnly: 0,
    approvedUnpaid: 0,
    paid: 0,
    bankOnly: 0,
    rejected: 0,
  })
  const [categoryFilter, setCategoryFilter] = React.useState<string>("__all__")
  const [vendorFilter, setVendorFilter] = React.useState("")
  const [documentNoFilter, setDocumentNoFilter] = React.useState("")
  const [relationFilter, setRelationFilter] = React.useState<string>("__all__")
  const [accounts, setAccounts] = React.useState<BankAccount[]>([])
  const [accountSubjects, setAccountSubjects] = React.useState<AccountSubjectItem[]>([])
  const [vendors, setVendors] = React.useState<{ code: string; name: string }[]>([])
  const [updatingInvoiceId, setUpdatingInvoiceId] = React.useState<number | null>(null)
  const [invoicePhotoPreviewUrl, setInvoicePhotoPreviewUrl] = React.useState<string | null>(null)
  const [invoicePhotoUploadingId, setInvoicePhotoUploadingId] = React.useState<number | null>(null)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const [memoTransMap, setMemoTransMap] = React.useState<Record<string, string>>({})
  const [loadedOnce, setLoadedOnce] = React.useState(false)

  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const invoicePhotoTargetRowRef = React.useRef<ExpenseSearchOverviewRow | null>(null)

  React.useEffect(() => {
    Promise.all([
      getBankAccounts({ userStore: auth?.store, userRole: auth?.role }).catch(() => []),
      getAccountSubjects(EXPENSE_WITHDRAW_SUBJECT_FETCH).catch(() => []),
      getVendorsForPurchase().catch(() => []),
    ]).then(([a, s, v]) => {
      setAccounts(a || [])
      setAccountSubjects(s || [])
      setVendors(v || [])
    })
  }, [auth?.role, auth?.store])

  React.useEffect(() => {
    const memos = [...new Set(list.map((r) => (r.memo || "").trim()).filter(Boolean))]
    if (memos.length === 0) {
      setMemoTransMap({})
      return
    }
    let cancelled = false
    translateTexts(memos, lang)
      .then((translated) => {
        if (cancelled) return
        const map: Record<string, string> = {}
        memos.forEach((m, i) => {
          map[m] = translated[i] ?? m
        })
        setMemoTransMap(map)
      })
      .catch(() => setMemoTransMap({}))
    return () => { cancelled = true }
  }, [list, lang])

  const getMemo = React.useCallback((memo: string | undefined) => (memo && memoTransMap[memo]) || memo || "-", [memoTransMap])

  const relationLabel = React.useCallback(
    (relation: ExpenseSearchRelation) => {
      const map: Record<ExpenseSearchRelation, string> = {
        plan_only: tt("expenseSearchRelationPlanOnly", "Planned"),
        approved_unpaid: tt("expenseSearchRelationApprovedUnpaid", "Approved · Unpaid"),
        paid_bank: tt("expenseSearchRelationPaidBank", "Paid (Bank)"),
        paid_petty: tt("expenseSearchRelationPaidPetty", "Paid (Petty)"),
        rejected: tt("expenseSearchRelationRejected", "Rejected"),
        bank_only: tt("expenseSearchRelationBankOnly", "Bank Only"),
        card_only: tt("expenseSearchRelationCardOnly", "Card"),
      }
      return map[relation] || relation
    },
    [tt]
  )

  const loadData = React.useCallback(async (overrides?: { startStr?: string; endStr?: string }) => {
    const queryStart = overrides?.startStr ?? startStr
    const queryEnd = overrides?.endStr ?? endStr
    setLoading(true)
    try {
      const res = await getExpenseSearchOverview({
        startStr: queryStart,
        endStr: queryEnd,
        storeFilter,
        accountId,
        category: categoryFilter !== "__all__" ? categoryFilter : undefined,
        vendorFilter: vendorFilter.trim() || undefined,
        documentNo: documentNoFilter.trim() || undefined,
      })
      setList(res.list || [])
      setSummary(res.summary || { planOnly: 0, approvedUnpaid: 0, paid: 0, bankOnly: 0, rejected: 0 })
      setLoadedOnce(true)
    } catch {
      setList([])
      setSummary({ planOnly: 0, approvedUnpaid: 0, paid: 0, bankOnly: 0, rejected: 0 })
    } finally {
      setLoading(false)
    }
  }, [accountId, categoryFilter, documentNoFilter, endStr, startStr, storeFilter, vendorFilter])

  React.useEffect(() => {
    const s = searchParams.get("startStr")
    const e = searchParams.get("endStr")
    if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) setStartStr(s)
    if (e && /^\d{4}-\d{2}-\d{2}$/.test(e)) setEndStr(e)
  }, [searchParams])

  React.useEffect(() => {
    setLoadedOnce(false)
    setList([])
    setSummary({ planOnly: 0, approvedUnpaid: 0, paid: 0, bankOnly: 0, rejected: 0 })
  }, [storeFilter, accountId, startStr, endStr, categoryFilter, vendorFilter, documentNoFilter])

  const handledSearchRefreshRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    const token = searchParams.get("searchRefresh")
    if (!token || token === handledSearchRefreshRef.current) return
    handledSearchRefreshRef.current = token
    const s = searchParams.get("startStr")
    const e = searchParams.get("endStr")
    void loadData({
      startStr: s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined,
      endStr: e && /^\d{4}-\d{2}-\d{2}$/.test(e) ? e : undefined,
    })
  }, [loadData, searchParams])

  const filteredList = React.useMemo(() => {
    return (list || []).filter((r) => {
      if (relationFilter === "__all__") return true
      if (relationFilter === "paid") {
        return r.relation === "paid_bank" || r.relation === "paid_petty"
      }
      if (relationFilter === "unlinked") {
        return r.relation === "plan_only" || r.relation === "approved_unpaid"
      }
      return r.relation === relationFilter
    })
  }, [list, relationFilter])

  const handleInvoiceCheckChange = async (r: ExpenseSearchOverviewRow, checked: boolean) => {
    if (r.bankTransactionId) {
      setUpdatingInvoiceId(r.bankTransactionId)
      try {
        const res = await updateBankTransactionInvoice({
          bankTransactionId: r.bankTransactionId,
          invoiceReceived: checked,
        })
        if (res.success) {
          setList((prev) =>
            prev.map((x) =>
              x.rowKey === r.rowKey ? { ...x, invoiceReceived: checked } : x
            )
          )
        } else {
          await appAlert(res.message || t("processFail"))
        }
      } catch (e) {
        await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
      } finally {
        setUpdatingInvoiceId(null)
      }
      return
    }
    if (!r.accrualId) return
    setUpdatingInvoiceId(r.accrualId)
    try {
      const res = await updateExpenseAccrualInvoice({
        expenseAccrualId: r.accrualId,
        invoiceReceived: checked,
        documentType: checked ? 'tax_invoice' : null,
      })
      if (res.success) {
        setList((prev) =>
          prev.map((x) => (x.rowKey === r.rowKey ? { ...x, invoiceReceived: checked } : x))
        )
      } else {
        await appAlert(res.message || t("processFail"))
      }
    } catch (e) {
      await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setUpdatingInvoiceId(null)
    }
  }

  const handleInvoicePhotoUpload = React.useCallback(
    async (r: ExpenseSearchOverviewRow, file: File) => {
      const bankId = r.bankTransactionId
      if (!bankId) return
      setInvoicePhotoUploadingId(bankId)
      try {
        const dataUrl = await compressImageForUpload(file, 1024, 0.7)
        const res = await updateBankTransactionInvoice({
          bankTransactionId: bankId,
          invoicePhotoUrl: dataUrl,
        })
        if (res.success) {
          setList((prev) =>
            prev.map((x) => (x.rowKey === r.rowKey ? { ...x, invoicePhotoUrl: dataUrl } : x))
          )
        } else {
          await appAlert(res.message || t("msg_upload_fail"))
        }
      } catch (e) {
        await appAlert(t("msg_upload_fail") + ": " + (e instanceof Error ? e.message : String(e)))
      } finally {
        setInvoicePhotoUploadingId(null)
        if (fileInputRef.current) fileInputRef.current.value = ""
      }
    },
    [t]
  )

  React.useEffect(() => {
    const handleFileChange = (e: Event) => {
      const target = e.target as HTMLInputElement
      const file = target?.files?.[0]
      const row = invoicePhotoTargetRowRef.current
      if (file && row) {
        handleInvoicePhotoUpload(row, file)
        invoicePhotoTargetRowRef.current = null
      }
    }
    const input = fileInputRef.current
    if (input) input.addEventListener("change", handleFileChange)
    return () => input?.removeEventListener("change", handleFileChange)
  }, [handleInvoicePhotoUpload])

  const fmt = (n: number) => `฿${(n ?? 0).toLocaleString()}`

  const accountLabel = React.useCallback(
    (id?: number) => {
      if (!id) return "-"
      const acc = accounts.find((a) => Number(a.id) === Number(id))
      if (!acc) return `#${id}`
      return `${acc.bankName ? `[${acc.bankName}] ` : ""}${acc.name}`
    },
    [accounts]
  )

  const categoryOptions = React.useMemo(
    () => Array.from(new Set((list || []).map((r) => String(r.category || "").trim()).filter(Boolean))).sort(),
    [list]
  )

  const summaryChips = [
    { key: "plan_only", label: tt("expenseSearchSummaryPlanOnly", "Planned"), count: summary.planOnly },
    { key: "approved_unpaid", label: tt("expenseSearchSummaryApprovedUnpaid", "Approved · Unpaid"), count: summary.approvedUnpaid },
    { key: "paid", label: tt("expenseSearchSummaryPaid", "Paid"), count: summary.paid },
    { key: "bank_only", label: tt("expenseSearchSummaryBankOnly", "Bank Only"), count: summary.bankOnly },
    { key: "rejected", label: tt("expenseSearchSummaryRejected", "Rejected"), count: summary.rejected },
    { key: "unlinked", label: tt("expenseSearchSummaryUnlinked", "Unlinked"), count: summary.planOnly + summary.approvedUnpaid },
  ]

  /** 조회(기간·매장·통장 등) 결과 + 연결 상태 필터 기준 금액 합계 */
  const amountTotals = React.useMemo(() => {
    let plan = 0
    let bank = 0
    for (const r of filteredList) {
      if (r.accrualId && r.plannedAmount != null) plan += r.plannedAmount
      if (r.bankTransactionId && r.bankAmount != null) bank += r.bankAmount
    }
    return { plan, bank }
  }, [filteredList])

  const renderPayee = (r: ExpenseSearchOverviewRow) => {
    const isPurchase = ["purchase_payment", "purchase_advance"].includes(r.category)
    if (isPurchase) {
      const vendor = r.vendorCode ? vendors.find((v) => v.code === r.vendorCode) : null
      return vendor ? `${vendor.name} (${vendor.code})` : r.payeeName || r.vendorCode || "—"
    }
    if (r.payeeName) return r.payeeName
    const sub = accountSubjects.find((a) => a.id === r.accountSubjectId)
    return sub ? `${sub.code} ${asDisplayName(sub)}` : "—"
  }

  const planDateLabel = (r: ExpenseSearchOverviewRow) => r.dueDate || r.expenseDate || null

  const navigateToEditAccrual = React.useCallback(
    (r: ExpenseSearchOverviewRow) => {
      if (!r.accrualId) return
      const q = new URLSearchParams()
      q.set("tab", "expenseRegister")
      q.set("editAccrualId", String(r.accrualId))
      q.set("amount", String(r.grossAmount ?? r.plannedAmount ?? 0))
      if (Number(r.vatAmount || 0) > 0) q.set("accrualVat", String(r.vatAmount))
      if (Number(r.withholdingTaxAmount || 0) > 0) q.set("accrualWht", String(r.withholdingTaxAmount))
      if (r.expenseDate) q.set("transDate", r.expenseDate)
      if (r.payeeCode) q.set("payeeCode", r.payeeCode)
      if (r.payeeName) q.set("payeeName", r.payeeName)
      if (r.vendorCode) q.set("vendorCode", r.vendorCode)
      if (r.accountSubjectId) q.set("accountSubjectId", String(r.accountSubjectId))
      if (r.category) q.set("category", r.category)
      if (r.storeName) q.set("storeName", r.storeName)
      if (r.memo) q.set("memo", r.memo)
      if (r.invoiceReceived) q.set("invoiceReceived", "1")
      if (r.invoiceNo) q.set("invoiceNo", r.invoiceNo)
      router.push(`/admin/expense-management?${q.toString()}`)
    },
    [router]
  )

  const renderPlanCell = (r: ExpenseSearchOverviewRow) => {
    if (!r.accrualId) return <span className="text-muted-foreground">—</span>
    const amount = r.plannedAmount != null ? fmt(r.plannedAmount) : "-"
    return (
      <div className="text-xs leading-snug">
        <div className="font-medium tabular-nums">{amount}</div>
        <div className="text-[11px] text-muted-foreground">
          {tt("expenseSearchPlanRef", "Plan")} #{r.accrualId}
        </div>
      </div>
    )
  }

  const renderBankCell = (r: ExpenseSearchOverviewRow) => {
    if (!r.bankTransactionId) {
      return (
        <span className="text-xs text-muted-foreground">
          {tt("expenseSearchNoBankYet", "Unlinked")}
        </span>
      )
    }
    return (
      <div className="text-xs leading-snug">
        <div className="font-medium tabular-nums">{r.bankAmount != null ? fmt(r.bankAmount) : "-"}</div>
        <div className="text-muted-foreground">{r.bankTransDate || "-"}</div>
        <div className="text-[11px] text-muted-foreground truncate max-w-[140px]" title={accountLabel(r.accountId)}>
          {accountLabel(r.accountId)}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {tt("expenseSearchBankRef", "Bank")} #{r.bankTransactionId}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground px-1">
        {tt("expenseSearchHint", "Search payment plans and bank registrations together.")}
      </p>

      <Card>
        <CardContent className="pt-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {summaryChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => setRelationFilter(relationFilter === chip.key ? "__all__" : chip.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                  relationFilter === chip.key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
                )}
              >
                <span>{chip.label}</span>
                <span className="font-semibold tabular-nums">{chip.count}</span>
              </button>
            ))}
          </div>

          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder={tt("recFilterStoreSelect", "Select Store")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{tt("all", "All")} {tt("store", "Store")}</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder={tt("wm_searchAllAccounts", "All Accounts")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{tt("wm_searchAllAccounts", "All Accounts")}</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.bankName ? `[${a.bankName}] ` : ""}{a.name} {a.store ? `(${a.store})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Input
                type="date"
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
                className="h-9 w-full text-[13px] sm:w-[172px]"
              />
              <span className="hidden text-xs sm:inline">~</span>
              <Input
                type="date"
                value={endStr}
                onChange={(e) => setEndStr(e.target.value)}
                className="h-9 w-full text-[13px] sm:w-[172px]"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder={tt("bankCategoryLabel", "Category")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{tt("all", "All")} {tt("bankCategoryLabel", "Category")}</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c} value={c.toLowerCase()}>
                    {getCategoryLabel(c, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={relationFilter} onValueChange={setRelationFilter}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder={tt("expenseSearchFilterRelation", "Link Status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{tt("expenseSearchAllRelations", "All Links")}</SelectItem>
                <SelectItem value="plan_only">{relationLabel("plan_only")}</SelectItem>
                <SelectItem value="approved_unpaid">{relationLabel("approved_unpaid")}</SelectItem>
                <SelectItem value="paid_bank">{relationLabel("paid_bank")}</SelectItem>
                <SelectItem value="paid_petty">{relationLabel("paid_petty")}</SelectItem>
                <SelectItem value="bank_only">{relationLabel("bank_only")}</SelectItem>
                <SelectItem value="card_only">{relationLabel("card_only")}</SelectItem>
                <SelectItem value="rejected">{relationLabel("rejected")}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              placeholder={tt("expenseSearchVendorNameOrCode", "Vendor name / code")}
              className="w-[180px] h-9"
            />
            <Input
              value={documentNoFilter}
              onChange={(e) => setDocumentNoFilter(e.target.value)}
              placeholder={tt("expenseSearchDocumentNo", "Doc No. EXPyyyymm000x")}
              className="w-[180px] h-9"
            />
            <Button size="sm" onClick={() => void loadData()} disabled={loading} className="h-9">
              <Search className="h-4 w-4 mr-1" />
              {tt("btn_query", "Query")}
            </Button>
          </div>

          {loadedOnce && !loading ? (
            <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">
                  {tt("expenseSearchPlanAmountTotal", "Planned Total")}
                  {storeFilter !== "__all__" ? ` · ${storeFilter}` : ""}
                </div>
                <div className="text-lg font-semibold tabular-nums">{fmt(amountTotals.plan)}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">
                  {tt("expenseSearchBankAmountTotal", "Bank Total")}
                  {storeFilter !== "__all__" ? ` · ${storeFilter}` : ""}
                </div>
                <div className="text-lg font-semibold tabular-nums">{fmt(amountTotals.bank)}</div>
              </div>
            </div>
          ) : null}

          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" />

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
          ) : !loadedOnce ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("msg_click_query") || "검색 버튼을 눌러 주세요."}
            </p>
          ) : filteredList.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {tt("pettyNoData", "No expense registration records found.")}
            </p>
          ) : (
            <AdminTableScroll className="rounded-lg border max-h-[560px] overflow-auto">
              <table className="w-full text-sm min-w-[980px]">
                <thead className="bg-muted/50 sticky top-0 z-[1]">
                  <tr>
                    <th className="p-2 text-center">{tt("expenseSearchColRelation", "Link")}</th>
                    <th className="p-2 text-left whitespace-nowrap">{tt("expenseDocumentNo", "Doc No.")}</th>
                    <th className="p-2 text-center min-w-[168px]">{tt("expenseSearchColTimeline", "Timeline")}</th>
                    <th className="p-2 text-left">{tt("store", "Store")}</th>
                    <th className="p-2 text-center">{tt("bankCategoryLabel", "Category")}</th>
                    <th className="p-2 text-left">{tt("vendor", "Vendor")}</th>
                    <th className="p-2 text-center">{tt("expenseSearchColPlan", "Plan")}</th>
                    <th className="p-2 text-center">{tt("expenseSearchColBank", "Bank")}</th>
                    <th className="p-2 text-center min-w-[140px]" title={tt("poInvoice", "Invoice")}>
                      {tt("poInvoice", "Invoice")}
                    </th>
                    <th className="p-2 text-left">{tt("memo", "Memo")}</th>
                    <th className="p-2 text-center">{tt("action", "Action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((r) => {
                    const canEditBank = Boolean(r.bankTransactionId)
                    const canEditPlan = Boolean(
                      r.accrualId &&
                        canEditExpenseAccrualClassification({
                          status: r.accrualStatus ?? r.planStatus,
                        })
                    )
                    // 지급예정 연동 건은 지급예정 수정(계정과목·유형), bank_only만 통장 수정 — 수정 루프 방지
                    const showPlanEdit = canEditPlan
                    const showPlanDelete = Boolean(
                      r.accrualId &&
                        canDeleteExpenseAccrual({
                          userRole: auth?.role,
                          storeName: r.storeName,
                          status: r.accrualStatus ?? r.planStatus,
                          paidAmount: r.paidAmount,
                          hasPaymentLink: Boolean(r.bankLinked || r.pettyLinked || r.bankTransactionId),
                        })
                    )
                    const showBankEdit = canEditBank && !r.accrualId
                    const showBankDelete = canEditBank
                    const invoiceTargetId = r.bankTransactionId ?? r.accrualId
                    const planDeleteKey = r.accrualId ? `accrual-${r.accrualId}` : null
                    const bankDeleteKey = r.bankTransactionId ? `bank-${r.bankTransactionId}` : null
                    return (
                      <tr key={r.rowKey} className="border-t align-top">
                        <td className="p-2 text-center">
                          <div className="flex flex-col items-center gap-0.5 min-w-[88px]">
                            <Badge variant="outline" className={cn("text-[11px] font-normal whitespace-nowrap", relationBadgeClass(r.relation))}>
                              {relationLabel(r.relation)}
                            </Badge>
                            {planDateLabel(r) ? (
                              <div className="text-[10px] leading-tight text-muted-foreground">
                                <div className="opacity-80">{tt("expenseSearchColPlan", "Plan")}</div>
                                <div className="tabular-nums">{planDateLabel(r)}</div>
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="p-2 text-left tabular-nums text-xs whitespace-nowrap">
                          {r.documentNo || "—"}
                        </td>
                        <td className="p-2">
                          <ExpenseSearchTimelineCell row={r} />
                        </td>
                        <td className="p-2 text-sm">{r.storeName || "—"}</td>
                        <td className="p-2 text-center text-sm">{getCategoryLabel(r.category, t)}</td>
                        <td className="p-2 text-sm">{renderPayee(r)}</td>
                        <td className="p-2 text-center">{renderPlanCell(r)}</td>
                        <td className="p-2 text-center">{renderBankCell(r)}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-2 justify-center flex-wrap">
                            <Checkbox
                              checked={Boolean(r.invoiceReceived)}
                              onCheckedChange={(c) => handleInvoiceCheckChange(r, c === true)}
                              disabled={!invoiceTargetId || updatingInvoiceId === invoiceTargetId}
                              title={tt("poInvoiceReceived", "Invoice Received")}
                              className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 shrink-0"
                            />
                            {r.invoiceNo ? (
                              <span className="text-xs text-muted-foreground" title={r.invoiceNo}>
                                {r.invoiceNo}
                              </span>
                            ) : null}
                            {r.bankTransactionId ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (r.invoicePhotoUrl) {
                                    setInvoicePhotoPreviewUrl(r.invoicePhotoUrl!)
                                  } else {
                                    invoicePhotoTargetRowRef.current = r
                                    fileInputRef.current?.click()
                                  }
                                }}
                                disabled={invoicePhotoUploadingId === r.bankTransactionId}
                                className={`inline-flex h-8 w-8 items-center justify-center rounded hover:bg-muted shrink-0 overflow-hidden ${r.invoicePhotoUrl ? "text-green-600" : "text-muted-foreground"}`}
                                title={
                                  r.invoicePhotoUrl
                                    ? `${tt("poInvoice", "Invoice")} (${tt("clickToView", "click to view")})`
                                    : tt("bankInvoicePhotoUpload", "Upload invoice image")
                                }
                              >
                                {r.invoicePhotoUrl ? (
                                  <img src={r.invoicePhotoUrl} alt="" className="h-6 w-6 object-cover rounded" />
                                ) : invoicePhotoUploadingId === r.bankTransactionId ? (
                                  <span className="text-xs">...</span>
                                ) : (
                                  <Camera className="h-4 w-4" />
                                )}
                              </button>
                            ) : null}
                          </div>
                        </td>
                        <td className="p-2 text-muted-foreground text-sm max-w-[180px] truncate" title={r.memo}>
                          {getMemo(r.memo)}
                        </td>
                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {showPlanEdit ? (
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="h-8 w-8"
                                title={tt("btnEdit", "Edit")}
                                onClick={() => navigateToEditAccrual(r)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            ) : null}
                            {showPlanDelete && planDeleteKey ? (
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="h-8 w-8 border-destructive/40 text-destructive"
                                title={tt("delete", "Delete")}
                                disabled={deletingId === planDeleteKey}
                                onClick={async () => {
                                  if (!r.accrualId) return
                                  const status = String(r.accrualStatus ?? r.planStatus ?? "").toLowerCase()
                                  const confirmMsg =
                                    status === "approved"
                                      ? tt(
                                          "expensePlanDeleteApprovedConfirm",
                                          "This accrual is approved but unpaid. Delete it? Journals and payables for this plan will be removed."
                                        )
                                      : tt("emp_confirm_delete", "Delete this item?")
                                  const ok = await appConfirm(confirmMsg)
                                  if (!ok) return
                                  setDeletingId(planDeleteKey)
                                  try {
                                    const res = await deleteExpenseAccrual({
                                      expenseAccrualId: r.accrualId,
                                      userRole: auth?.role,
                                    })
                                    if (!res.success) {
                                      await appAlert(res.message || tt("msg_delete_fail", "Delete failed"))
                                      return
                                    }
                                    setList((prev) => prev.filter((x) => x.rowKey !== r.rowKey))
                                  } catch (e) {
                                    await appAlert(
                                      tt("msg_delete_fail", "Delete failed") +
                                        ": " +
                                        (e instanceof Error ? e.message : String(e))
                                    )
                                  } finally {
                                    setDeletingId(null)
                                  }
                                }}
                              >
                                {deletingId === planDeleteKey ? (
                                  <span className="text-xs">...</span>
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            ) : null}
                            {showBankEdit ? (
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="h-8 w-8"
                                title={tt("btnEdit", "Edit")}
                                onClick={() => {
                                  const q = new URLSearchParams()
                                  q.set("tab", "expenseRegister")
                                  q.set("editMode", "1")
                                  q.set("bankTransactionId", String(r.bankTransactionId))
                                  if (r.accountId) q.set("accountId", String(r.accountId))
                                  if (r.storeName) q.set("storeName", r.storeName)
                                  if (r.bankTransDate) q.set("transDate", r.bankTransDate)
                                  if (r.bankAmount) q.set("amount", String(r.bankAmount))
                                  if (r.memo) {
                                    q.set("bankNote", r.memo)
                                    q.set("bankMemo", r.memo)
                                  }
                                  if (r.category) q.set("category", r.category)
                                  if (r.vendorCode) q.set("vendorCode", r.vendorCode)
                                  if (r.accountSubjectId) q.set("accountSubjectId", String(r.accountSubjectId))
                                  if (r.payeeCode) q.set("payeeCode", r.payeeCode)
                                  if (r.payeeName) q.set("payeeName", r.payeeName)
                                  q.set("startStr", startStr)
                                  q.set("endStr", endStr)
                                  router.push(`/admin/expense-management?${q.toString()}`)
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            ) : null}
                            {showBankDelete && bankDeleteKey ? (
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="h-8 w-8 border-destructive/40 text-destructive"
                                title={tt("delete", "Delete")}
                                disabled={deletingId === bankDeleteKey}
                                onClick={async () => {
                                  if (!r.bankTransactionId) return
                                  const ok = await appConfirm(tt("emp_confirm_delete", "Delete this item?"))
                                  if (!ok) return
                                  setDeletingId(bankDeleteKey)
                                  try {
                                    const res = await deleteExpenseRegisterItem({
                                      bankTransactionId: r.bankTransactionId,
                                      userRole: auth?.role,
                                    })
                                    if (!res.success) {
                                      await appAlert(res.message || tt("msg_delete_fail", "Delete failed"))
                                      return
                                    }
                                    setList((prev) => prev.filter((x) => x.rowKey !== r.rowKey))
                                  } catch (e) {
                                    await appAlert(tt("msg_delete_fail", "Delete failed") + ": " + (e instanceof Error ? e.message : String(e)))
                                  } finally {
                                    setDeletingId(null)
                                  }
                                }}
                              >
                                {deletingId === bankDeleteKey ? <span className="text-xs">...</span> : <Trash2 className="h-4 w-4" />}
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </AdminTableScroll>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!invoicePhotoPreviewUrl} onOpenChange={(open) => !open && setInvoicePhotoPreviewUrl(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{tt("poInvoice", "Invoice")}</DialogTitle>
          </DialogHeader>
          <ImageViewerWithRotate
            src={invoicePhotoPreviewUrl || ""}
            alt=""
            imgClassName="max-h-[70vh] w-full object-contain rounded"
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
