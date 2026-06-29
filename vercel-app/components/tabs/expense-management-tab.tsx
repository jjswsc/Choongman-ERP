"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert, appConfirm, appPrompt } from "@/lib/app-message"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search, Wallet, Link2, Check, X, Pencil, Trash2, Paperclip } from "lucide-react"
import { MetricCard } from "@/components/cost-analysis/metric-card"
import { AdminFilterBar, AdminFilterField } from "@/components/erp/admin-filter-bar"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { useStoreList } from "@/lib/api-client"
import {
  approveExpenseAccrual,
  deleteExpenseAccrual,
  deleteExpenseAccrualsWithoutStore,
  executeExpensePayment,
  getAccountSubjects,
  getBankAccounts,
  getExpensePaymentPlan,
  getUnlinkedBankWithdrawals,
  translateTexts,
  updateExpenseAccrualInvoice,
  type AccountSubjectItem,
  type BankAccount,
  type ExpenseAccrualPlanItem,
} from "@/lib/api-client"
import { translateApiMessage } from "@/lib/translate-api-message"
import { canApproveExpenseAccrual, canEditExpenseAccrualPlan } from "@/lib/expense-accrual-approve-policy"
import { WithdrawalManagementTab } from "@/components/tabs/withdrawal-management-tab"
import { ExpenseRegisterSearchTab } from "@/components/tabs/expense-register-search-tab"
import { CardManagementTab } from "@/components/tabs/card-management-tab"
import { useSearchParams, useRouter } from "next/navigation"

function todayStrBkk() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

function planRowEditable(r: ExpenseAccrualPlanItem): boolean {
  return canEditExpenseAccrualPlan({ status: r.status, paidAmount: r.paidAmount })
}

function renderPlanPayAmountCell(
  r: ExpenseAccrualPlanItem,
  tt: (key: string, fallback: string) => string
) {
  const gross = r.grossAmount ?? r.plannedAmount ?? 0
  const planned = r.plannedAmount ?? 0
  const showNet = gross > 0 && planned > 0 && Math.abs(gross - planned) > 0.005
  return (
    <>
      ฿{gross.toLocaleString()}
      {showNet ? (
        <span
          className="block text-[10px] text-muted-foreground leading-tight"
          title={tt("expensePlanPayAmountHint", "Actual payout after withholding tax deduction")}
        >
          {tt("expensePlanNetPayShort", "Net")} ฿{planned.toLocaleString()}
        </span>
      ) : null}
    </>
  )
}

export function ExpenseManagementTab() {
  const { lang } = useLang()
  const t = useT(lang)
  const tt = React.useCallback((key: string, fallback: string) => {
    const v = t(key)
    if (!v || v === key) return fallback
    return v
  }, [t])
  const { auth } = useAuth()
  const { posStores: stores } = useStoreList()
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialTab = searchParams.get("tab") === "expenseRegister" ? "expenseRegister" : searchParams.get("tab") === "expenseSearch" ? "expenseSearch" : searchParams.get("tab") === "card" ? "card" : "plan"
  const [tab, setTab] = React.useState<"plan" | "expenseRegister" | "expenseSearch" | "card">(initialTab)

  React.useEffect(() => {
    const tabParam = searchParams.get("tab")
    if (tabParam === "expenseRegister") setTab("expenseRegister")
    else if (tabParam === "expenseSearch") setTab("expenseSearch")
    else if (tabParam === "card") setTab("card")
    else if (tabParam === "plan") setTab("plan")
  }, [searchParams])

  React.useEffect(() => {
    const s = searchParams.get("startStr")
    const e = searchParams.get("endStr")
    if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) setStartStr(s)
    if (e && /^\d{4}-\d{2}-\d{2}$/.test(e)) setEndStr(e)
  }, [searchParams])
  const [startStr, setStartStr] = React.useState(todayStrBkk)
  const [endStr, setEndStr] = React.useState(todayStrBkk)
  /** 지출 등록(지급 예정) 저장 후 지급예정 탭 강제 재조회 */
  const [planRefreshToken, setPlanRefreshToken] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [expensePlans, setExpensePlans] = React.useState<ExpenseAccrualPlanItem[]>([])
  const [purchasePlans, setPurchasePlans] = React.useState<ExpenseAccrualPlanItem[]>([])
  const [planTypeFilter, setPlanTypeFilter] = React.useState<string>("__all__")
  const [planStoreFilter, setPlanStoreFilter] = React.useState<string>("__all__")

  const [bankAccounts, setBankAccounts] = React.useState<BankAccount[]>([])

  const [payMethodById, setPayMethodById] = React.useState<Record<number, "bank" | "petty">>({})
  const [payAmountById, setPayAmountById] = React.useState<Record<number, string>>({})
  const [payDateById, setPayDateById] = React.useState<Record<number, string>>({})
  const [payMemoById, setPayMemoById] = React.useState<Record<number, string>>({})
  const [payBankById, setPayBankById] = React.useState<Record<number, string>>({})
  const [payStoreById, setPayStoreById] = React.useState<Record<number, string>>({})
  const [payEditorOpenById, setPayEditorOpenById] = React.useState<Record<number, boolean>>({})
  const [payingId, setPayingId] = React.useState<number | null>(null)
  const [approvalEditById, setApprovalEditById] = React.useState<Record<number, boolean>>({})
  const [deletingPlanId, setDeletingPlanId] = React.useState<number | null>(null)
  const [linkBankRow, setLinkBankRow] = React.useState<ExpenseAccrualPlanItem | null>(null)
  const [unlinkedList, setUnlinkedList] = React.useState<{ id: number; transDate: string; amount: number; memo: string }[]>([])
  const [unlinkedLoading, setUnlinkedLoading] = React.useState(false)
  const [approvingAll, setApprovingAll] = React.useState(false)
  const [rejectingAll, setRejectingAll] = React.useState(false)
  const [cleaningNoStore, setCleaningNoStore] = React.useState(false)
  const [attachmentPreview, setAttachmentPreview] = React.useState<{ urls: string[]; title: string } | null>(null)
  const [updatingInvoiceAccrualId, setUpdatingInvoiceAccrualId] = React.useState<number | null>(null)
  const [subjects, setSubjects] = React.useState<AccountSubjectItem[]>([])
  const [subjectEnglishNames, setSubjectEnglishNames] = React.useState<Record<number, string>>({})
  const [memoTransMap, setMemoTransMap] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    getAccountSubjects({ excludeHeaders: true }).catch(() => []).then(setSubjects)
  }, [])

  React.useEffect(() => {
    const candidates = subjects.filter((s) => !s.nameEn && (s.name || "").trim())
    if (candidates.length === 0) {
      setSubjectEnglishNames({})
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const translated = await translateTexts(candidates.map((s) => s.name.trim()), "en")
        if (cancelled) return
        const mapped: Record<number, string> = {}
        candidates.forEach((s, idx) => {
          const txt = String(translated[idx] || "").trim()
          if (txt && s.id != null) mapped[s.id] = txt
        })
        setSubjectEnglishNames(mapped)
      } catch {
        if (!cancelled) setSubjectEnglishNames({})
      }
    })()
    return () => { cancelled = true }
  }, [subjects])

  React.useEffect(() => {
    getBankAccounts({ userStore: auth?.store, userRole: auth?.role }).catch(() => []).then(setBankAccounts)
  }, [auth?.role, auth?.store])

  React.useEffect(() => {
    const items = [...expensePlans, ...purchasePlans, ...unlinkedList]
    const planRows = [...expensePlans, ...purchasePlans]
    const memos = items.map((r) => (r.memo || "").trim()).filter(Boolean)
    const payees = planRows.map((r) => (r.payeeName || "").trim()).filter(Boolean)
    const keys = [...new Set([...memos, ...payees])]
    if (keys.length === 0) {
      setMemoTransMap({})
      return
    }
    let cancelled = false
    translateTexts(keys, lang)
      .then((translated) => {
        if (cancelled) return
        const map: Record<string, string> = {}
        keys.forEach((m, i) => {
          map[m] = translated[i] ?? m
        })
        setMemoTransMap(map)
      })
      .catch(() => setMemoTransMap({}))
    return () => { cancelled = true }
  }, [expensePlans, purchasePlans, unlinkedList, lang])

  const getMemo = React.useCallback((memo: string | undefined) => {
    const k = (memo || "").trim()
    if (!k) return "-"
    return memoTransMap[k] || memo || "-"
  }, [memoTransMap])

  const getPayeeLine = React.useCallback(
    (payeeName: string | undefined, codeSuffix: string) => {
      const k = (payeeName || "").trim()
      const shown = k ? memoTransMap[k] || payeeName || k : ""
      return `${shown}${codeSuffix}`
    },
    [memoTransMap]
  )

  const loadPlans = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await getExpensePaymentPlan({
        startStr,
        endStr,
        userRole: auth?.role,
        userStore: auth?.store,
      })
      if (!res.success) {
        await appAlert(translateApiMessage((res as { message?: string }).message, t) || (res as { message?: string }).message || t("processFail"))
        setExpensePlans([])
        setPurchasePlans([])
        return
      }
      setExpensePlans(res.expensePlans || [])
      setPurchasePlans(res.purchasePlans || [])
    } catch {
      setExpensePlans([])
      setPurchasePlans([])
    } finally {
      setLoading(false)
    }
  }, [startStr, endStr, auth?.role, auth?.store, t])

  const loadPlansRef = React.useRef(loadPlans)
  loadPlansRef.current = loadPlans

  const handleAccrualSaved = React.useCallback(
    (opts: { expenseDate: string }) => {
      const d = String(opts.expenseDate || "").slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        setStartStr(d)
        setEndStr(d)
      }
      setTab("plan")
      setPlanRefreshToken((t) => t + 1)
      const q = new URLSearchParams({ tab: "plan" })
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        q.set("startStr", d)
        q.set("endStr", d)
      }
      router.replace(`/admin/expense-management?${q.toString()}`, { scroll: false })
    },
    [router]
  )

  const handleBatchWithdrawalSaved = React.useCallback(
    (opts: { startStr: string; endStr: string }) => {
      const start = String(opts.startStr || "").slice(0, 10)
      const end = String(opts.endStr || "").slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return
      setStartStr(start)
      setEndStr(end)
      setTab("expenseSearch")
      const q = new URLSearchParams({
        tab: "expenseSearch",
        startStr: start,
        endStr: end,
        searchRefresh: String(Date.now()),
      })
      router.replace(`/admin/expense-management?${q.toString()}`, { scroll: false })
    },
    [router]
  )

  /** 지급예정 탭 진입·등록 저장·auth.role 확정 시 조회. 기간만 바꾼 뒤에는 [조회] 버튼. */
  React.useEffect(() => {
    if (tab !== "plan") return
    void loadPlansRef.current()
  }, [tab, auth?.role, planRefreshToken])

  const openLinkBank = async (row: ExpenseAccrualPlanItem) => {
    const accountId = payBankById[row.id]
    const amt = Number(payAmountById[row.id] ?? row.remainingAmount) || 0
    const dt = payDateById[row.id] || todayStrBkk()
    if (!accountId || !amt) return
    setLinkBankRow(row)
    setUnlinkedLoading(true)
    try {
      const res = await getUnlinkedBankWithdrawals({
        accountId: Number(accountId),
        startStr: dt,
        endStr: dt,
        amount: amt,
        transDate: dt,
      })
      setUnlinkedList(res.list || [])
    } catch {
      setUnlinkedList([])
    } finally {
      setUnlinkedLoading(false)
    }
  }

  const handleLinkBank = async (bankTransactionId: number) => {
    if (!linkBankRow) return
    const amt = Number(payAmountById[linkBankRow.id] ?? linkBankRow.remainingAmount) || 0
    const dt = payDateById[linkBankRow.id] || todayStrBkk()
    if (!amt) return
    setPayingId(linkBankRow.id)
    try {
      const res = await executeExpensePayment({
        expenseAccrualId: linkBankRow.id,
        paymentMethod: "bank",
        amount: amt,
        transDate: dt,
        memo: payMemoById[linkBankRow.id] || "",
        bankTransactionId,
        userName: auth?.user,
        userRole: auth?.role,
      })
      if (!res.success) {
        await appAlert(translateApiMessage((res as { message?: string }).message, t) || (res as { message?: string }).message || t("processFail"))
        return
      }
      setLinkBankRow(null)
      await loadPlans()
    } finally {
      setPayingId(null)
    }
  }

  const handlePay = async (row: ExpenseAccrualPlanItem) => {
    const method = payMethodById[row.id] || "bank"
    const amountRaw = payAmountById[row.id] || String(row.remainingAmount || "")
    const payAmt = Number(String(amountRaw).replace(/,/g, ""))
    if (!payAmt || payAmt <= 0) {
      await appAlert(tt("pettyAlertAmount", "Please enter amount."))
      return
    }
    if (method === "bank" && !payBankById[row.id]) {
      await appAlert(tt("bankAccount", "Account"))
      return
    }
    if (method === "petty" && !payStoreById[row.id]) {
      await appAlert(tt("recFilterStoreSelect", "Select Store"))
      return
    }
    setPayingId(row.id)
    try {
      const res = await executeExpensePayment({
        expenseAccrualId: row.id,
        paymentMethod: method,
        amount: payAmt,
        transDate: payDateById[row.id] || todayStrBkk(),
        memo: payMemoById[row.id] || "",
        accountId: method === "bank" ? Number(payBankById[row.id]) : undefined,
        store: method === "petty" ? payStoreById[row.id] : undefined,
        userName: auth?.user,
        userRole: auth?.role,
      })
      if (!res.success) {
        await appAlert(translateApiMessage((res as { message?: string }).message, t) || (res as { message?: string }).message || t("processFail"))
        return
      }
      setApprovalEditById((prev) => ({ ...prev, [row.id]: false }))
      await loadPlans()
    } finally {
      setPayingId(null)
    }
  }

  const renderWithdrawalType = (cat?: string) => {
    const c = String(cat || "").toLowerCase()
    const map: Record<string, string> = {
      purchase_payment: tt("wm_purchase", "Purchase Payment"),
      purchase_advance: tt("wm_advance", "Advance Payment"),
      expense: tt("wm_expense", "Expense"),
      expense_advance: tt("wm_advance", "Advance Payment"),
      fixed_asset: tt("wm_fixed_asset", "Fixed Asset"),
      transfer: tt("wm_transfer", "Transfer"),
      transfer_to_petty: tt("wm_transferKindBankToPetty", "통장 → 패티캐시"),
      bank_card_bill: tt("wm_transferKindBankToCard", "통장 → 카드 대금"),
      tax_vat: tt("wm_tax_vat", "VAT"),
      tax_withholding: tt("wm_tax_withholding", "Withholding Tax"),
      tax_corporate: tt("wm_tax_corporate", "Corporate Tax"),
      loan_repayment: tt("wm_loan_repayment", "Loan Repayment"),
      loan_given: tt("wm_loan_given", "Loan Given"),
      correction: tt("wm_correction", "Correction"),
      dividend: tt("wm_dividend", "Dividend/Owner Draw"),
    }
    return map[c] || tt("wm_expense", "Expense")
  }

  const accountSubjectLabel = React.useCallback((id?: number | null) => {
    if (!id) return ""
    const found = subjects.find((s) => Number(s.id) === Number(id))
    return found ? (found.nameEn || (found.id != null ? subjectEnglishNames[found.id] : undefined) || found.name || "") : ""
  }, [subjects, subjectEnglishNames])

  const withdrawalTypeOptions = React.useMemo(
    () =>
      Array.from(
        new Set(
          [...(expensePlans || []), ...(purchasePlans || [])]
            .map((r) => String(r.withdrawalCategory || "").trim())
            .filter(Boolean)
        )
      ).sort(),
    [expensePlans, purchasePlans]
  )

  const planStoreOptions = React.useMemo(() => {
    const fromMaster = (stores || []).map((s) => String(s).trim()).filter(Boolean)
    const fromResults = [...(expensePlans || []), ...(purchasePlans || [])]
      .map((r) => String(r.storeName || "").trim())
      .filter(Boolean)
    return Array.from(new Set([...fromMaster, ...fromResults])).sort()
  }, [expensePlans, purchasePlans, stores])

  const filteredExpensePlans = React.useMemo(
    () =>
      (expensePlans || []).filter((r) =>
        (planTypeFilter === "__all__" ? true : String(r.withdrawalCategory || "").toLowerCase() === planTypeFilter) &&
        (planStoreFilter === "__all__" ? true : String(r.storeName || "").trim() === planStoreFilter)
      ),
    [expensePlans, planStoreFilter, planTypeFilter]
  )

  const expensePlansByStore = React.useMemo(() => {
    const map = new Map<string, typeof filteredExpensePlans>()
    for (const r of filteredExpensePlans) {
      const key = String(r.storeName || "").trim() || "—"
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] === "—" ? 1 : b[0] === "—" ? -1 : a[0].localeCompare(b[0])))
  }, [filteredExpensePlans])

  const filteredPurchasePlans = React.useMemo(
    () =>
      (purchasePlans || []).filter((r) =>
        (planTypeFilter === "__all__" ? true : String(r.withdrawalCategory || "").toLowerCase() === planTypeFilter) &&
        (planStoreFilter === "__all__" ? true : String(r.storeName || "").trim() === planStoreFilter)
      ),
    [purchasePlans, planStoreFilter, planTypeFilter]
  )

  /** 조회 기간(API) + 화면 매장·구분 필터 기준 합계 */
  const filteredPlanTotals = React.useMemo(
    () => ({
      expensePlanned: filteredExpensePlans.reduce((s, r) => s + (r.plannedAmount || 0), 0),
      expenseRemaining: filteredExpensePlans.reduce((s, r) => s + (r.remainingAmount || 0), 0),
      logisticsRemaining: filteredPurchasePlans.reduce((s, r) => s + (r.remainingAmount || 0), 0),
    }),
    [filteredExpensePlans, filteredPurchasePlans]
  )

  const purchasePlansByStore = React.useMemo(() => {
    const map = new Map<string, typeof filteredPurchasePlans>()
    for (const r of filteredPurchasePlans) {
      const key = String(r.storeName || "").trim() || "—"
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] === "—" ? 1 : b[0] === "—" ? -1 : a[0].localeCompare(b[0])))
  }, [filteredPurchasePlans])

  const canApproveByPolicy = React.useCallback(
    (row: ExpenseAccrualPlanItem) => canApproveExpenseAccrual(auth?.role, row.storeName),
    [auth?.role]
  )

  const approvablePlansForDay = React.useMemo(() => {
    const combined = [...(filteredExpensePlans || []), ...(filteredPurchasePlans || [])]
    return combined.filter((r) => {
      const rowDate = String(r.dueDate || r.expenseDate || "").slice(0, 10)
      return r.status === "planned" && canApproveByPolicy(r) && rowDate === startStr
    })
  }, [filteredExpensePlans, filteredPurchasePlans, canApproveByPolicy, startStr])

  const handleApprove = React.useCallback(async (row: ExpenseAccrualPlanItem, action: "approve" | "reject") => {
    const note = action === "reject"
      ? await appPrompt(tt("memo", "Memo"), "") || ""
      : ""
    const ok = action === "approve"
      ? await appConfirm(tt("confirmApprove", "Approve this item?"))
      : await appConfirm(tt("confirmReject", "Reject this item?"))
    if (!ok) return
    setPayingId(row.id)
    try {
      const res = await approveExpenseAccrual({
        expenseAccrualId: row.id,
        action,
        approvalNote: note || undefined,
        userName: auth?.user,
        userRole: auth?.role,
      })
      if (!res.success) {
        await appAlert(translateApiMessage((res as { message?: string }).message, t) || (res as { message?: string }).message || t("processFail"))
        return
      }
      setPayEditorOpenById((prev) => ({ ...prev, [row.id]: false }))
      await loadPlans()
    } finally {
      setPayingId(null)
    }
  }, [auth?.role, auth?.user, loadPlans])

  const navigateToEditInRegister = React.useCallback(
    (row: ExpenseAccrualPlanItem) => {
      const q = new URLSearchParams()
      q.set("tab", "expenseRegister")
      q.set("editAccrualId", String(row.id))
      q.set("amount", String(row.grossAmount ?? row.plannedAmount ?? 0))
      if (Number(row.vatAmount || 0) > 0) q.set("accrualVat", String(row.vatAmount))
      if (Number(row.withholdingTaxAmount || 0) > 0) q.set("accrualWht", String(row.withholdingTaxAmount))
      q.set("transDate", String(row.expenseDate || "").slice(0, 10))
      q.set("payeeCode", row.payeeCode || "")
      q.set("payeeName", row.payeeName || "")
      if ((row.withdrawalCategory || "").toLowerCase().startsWith("purchase") && (row.payeeCode || "").trim()) {
        q.set("vendorCode", row.payeeCode || "")
      }
      if (row.accountSubjectId) q.set("accountSubjectId", String(row.accountSubjectId))
      if (row.withdrawalCategory) q.set("category", row.withdrawalCategory)
      if ((row.storeName || "").trim()) q.set("storeName", (row.storeName || "").trim())
      if ((row.memo || "").trim()) q.set("memo", (row.memo || "").trim())
      if (row.invoiceReceived) q.set("invoiceReceived", "1")
      if ((row.invoiceNo || "").trim()) q.set("invoiceNo", (row.invoiceNo || "").trim())
      router.push(`/admin/expense-management?${q.toString()}`)
    },
    [router]
  )

  const handleAccrualInvoiceCheckChange = React.useCallback(
    async (row: ExpenseAccrualPlanItem, checked: boolean) => {
      if (!row.id) return
      setUpdatingInvoiceAccrualId(row.id)
      try {
        const res = await updateExpenseAccrualInvoice({
          expenseAccrualId: row.id,
          invoiceReceived: checked,
        })
        if (res.success) {
          const patch = { invoiceReceived: checked }
          setExpensePlans((prev) => prev.map((x) => (x.id === row.id ? { ...x, ...patch } : x)))
          setPurchasePlans((prev) => prev.map((x) => (x.id === row.id ? { ...x, ...patch } : x)))
        } else {
          await appAlert(res.message || t("processFail"))
        }
      } catch (e) {
        await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
      } finally {
        setUpdatingInvoiceAccrualId(null)
      }
    },
    [t]
  )

  const renderAccrualInvoiceCell = React.useCallback(
    (r: ExpenseAccrualPlanItem) => (
      <td className="py-2 px-1 text-center align-top min-w-[120px]">
        <div className="flex flex-col items-center gap-1">
          <Checkbox
            checked={Boolean(r.invoiceReceived)}
            onCheckedChange={(c) => handleAccrualInvoiceCheckChange(r, c === true)}
            disabled={updatingInvoiceAccrualId === r.id}
            title={tt("poInvoiceReceived", "Invoice Received")}
            className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
          />
          {r.invoiceNo ? (
            <span className="text-[10px] text-muted-foreground max-w-[7rem] truncate" title={r.invoiceNo}>
              {r.invoiceNo}
            </span>
          ) : null}
        </div>
      </td>
    ),
    [handleAccrualInvoiceCheckChange, tt, updatingInvoiceAccrualId]
  )

  const handleDeletePlan = React.useCallback(async (row: ExpenseAccrualPlanItem) => {
    if (!row?.id) return
    const ok = await appConfirm(tt("emp_confirm_delete", "Delete this item?"))
    if (!ok) return
    setDeletingPlanId(row.id)
    try {
      const res = await deleteExpenseAccrual({
        expenseAccrualId: row.id,
        userRole: auth?.role,
      })
      if (!res.success) {
        await appAlert(translateApiMessage((res as { message?: string }).message, t) || (res as { message?: string }).message || t("msg_delete_fail"))
        return
      }
      await loadPlans()
    } finally {
      setDeletingPlanId(null)
    }
  }, [auth?.role, loadPlans])

  const handleCleanNoStore = React.useCallback(async () => {
    const ok = await appConfirm(tt("expenseCleanNoStoreConfirm", "Delete all payment plans with no store selected?"))
    if (!ok) return
    setCleaningNoStore(true)
    try {
      const res = await deleteExpenseAccrualsWithoutStore({ userRole: auth?.role })
      if (!res.success) {
        await appAlert(translateApiMessage((res as { message?: string }).message, t) || (res as { message?: string }).message || t("processFail"))
        return
      }
      await appAlert(
        tt("expensePlanDeletedCount", "{count} item(s) deleted.").replace(
          "{count}",
          String(res.deletedCount ?? 0)
        )
      )
      await loadPlans()
    } finally {
      setCleaningNoStore(false)
    }
  }, [auth?.role, loadPlans])

  const handleApproveAllForDay = React.useCallback(async () => {
    if (approvablePlansForDay.length === 0) {
      await appAlert(tt("payableEmpty", "No items to approve."))
      return
    }
    const ok = await appConfirm(
      `${startStr} ${tt("expenseApproveAllDay", "Approve all for day")} (${approvablePlansForDay.length}${tt("receivPayCount", "items")})`
    )
    if (!ok) return
    setApprovingAll(true)
    try {
      for (const row of approvablePlansForDay) {
        const res = await approveExpenseAccrual({
          expenseAccrualId: row.id,
          action: "approve",
          userName: auth?.user,
          userRole: auth?.role,
        })
        if (!res.success) {
          await appAlert(translateApiMessage((res as { message?: string }).message, t) || (res as { message?: string }).message || t("processFail"))
          break
        }
      }
      await loadPlans()
    } finally {
      setApprovingAll(false)
    }
  }, [approvablePlansForDay, auth?.role, auth?.user, loadPlans, startStr])

  const handleRejectAllForDay = React.useCallback(async () => {
    if (approvablePlansForDay.length === 0) {
      await appAlert(tt("payableEmpty", "No items to reject."))
      return
    }
    const ok = await appConfirm(
      `${startStr} ${tt("expenseRejectAllDay", "Reject all for day")} (${approvablePlansForDay.length}${tt("receivPayCount", "items")})`
    )
    if (!ok) return
    setRejectingAll(true)
    try {
      for (const row of approvablePlansForDay) {
        const res = await approveExpenseAccrual({
          expenseAccrualId: row.id,
          action: "reject",
          userName: auth?.user,
          userRole: auth?.role,
        })
        if (!res.success) {
          await appAlert(translateApiMessage((res as { message?: string }).message, t) || (res as { message?: string }).message || t("processFail"))
          break
        }
      }
      await loadPlans()
    } finally {
      setRejectingAll(false)
    }
  }, [approvablePlansForDay, auth?.role, auth?.user, loadPlans, startStr])

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "plan" | "expenseRegister" | "expenseSearch" | "card")} className={adminTabsRootCn}>
        <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
              <TabsTrigger value="plan" className={adminTabsTriggerCn}>
                {tt("expensePlanTab", "Payment Plan")}
              </TabsTrigger>
              <TabsTrigger value="expenseRegister" className={adminTabsTriggerCn}>
                {tt("expenseRegisterTabTitle", "Expense Register")}
              </TabsTrigger>
              <TabsTrigger value="expenseSearch" className={adminTabsTriggerCn}>
                {tt("expenseRegisterSearchTab", "Expense Search")}
              </TabsTrigger>
              <TabsTrigger value="card" className={adminTabsTriggerCn}>
                {tt("cardManagementTab", "Card Management")}
              </TabsTrigger>
            </TabsList>
          </AdminTabsBarWithHelp>

        <TabsContent value="plan" className={cn(adminTabsContentCn, "space-y-4")}>
          {!loading ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <MetricCard
                size="sm"
                variant={approvablePlansForDay.length > 0 ? "warning" : "default"}
                label={t("acct_kpi_expense_approve_pending")}
                value={String(approvablePlansForDay.length)}
                subLabel={startStr}
              />
              <MetricCard
                size="sm"
                variant="primary"
                label={t("acct_kpi_expense_remaining")}
                value={`฿${filteredPlanTotals.expenseRemaining.toLocaleString()}`}
              />
              <MetricCard
                size="sm"
                label={t("acct_kpi_logistics_remaining")}
                value={`฿${filteredPlanTotals.logisticsRemaining.toLocaleString()}`}
              />
              <MetricCard
                size="sm"
                label={tt("expensePlanTab", "Payment Plan")}
                value={`฿${filteredPlanTotals.expensePlanned.toLocaleString()}`}
                subLabel={`${startStr} ~ ${endStr}`}
              />
            </div>
          ) : null}
          <AdminFilterBar>
            <AdminFilterField label={t("date")}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
            </AdminFilterField>
            <AdminFilterField label={tt("bankCategoryLabel", "Category")}>
              <Select value={planTypeFilter} onValueChange={setPlanTypeFilter}>
                <SelectTrigger className="w-full h-9 sm:w-[200px]">
                  <SelectValue placeholder={tt("bankCategoryLabel", "Category")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{tt("all", "All")} {tt("bankCategoryLabel", "Category")}</SelectItem>
                  {withdrawalTypeOptions.map((cat) => (
                    <SelectItem key={cat} value={cat.toLowerCase()}>
                      {renderWithdrawalType(cat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AdminFilterField>
            <AdminFilterField label={t("store")}>
              <Select value={planStoreFilter} onValueChange={setPlanStoreFilter}>
                <SelectTrigger className="w-full h-9 sm:w-[180px]">
                  <SelectValue placeholder={tt("recFilterStoreSelect", "Select Store")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{tt("all", "All")} {t("store")}</SelectItem>
                  {planStoreOptions.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AdminFilterField>
            <Button size="sm" onClick={() => void loadPlans()} disabled={loading} className="h-9">
              <Search className="h-4 w-4 mr-1" />
              {t("btn_query")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
              onClick={handleApproveAllForDay}
              disabled={approvingAll || approvablePlansForDay.length === 0}
            >
              {approvingAll ? tt("loading", "...") : tt("expenseApproveAllDay", "Approve all for day")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15"
              onClick={handleRejectAllForDay}
              disabled={rejectingAll || approvablePlansForDay.length === 0}
            >
              {rejectingAll ? tt("loading", "...") : tt("expenseRejectAllDay", "Reject all for day")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15"
              onClick={handleCleanNoStore}
              disabled={cleaningNoStore}
              title={tt("expenseCleanNoStoreHint", "Force delete payment plans with no store selected")}
            >
              {cleaningNoStore ? tt("loading", "...") : tt("expenseCleanNoStore", "Clean No-Store Plans")}
            </Button>
          </AdminFilterBar>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm font-semibold mb-2">{tt("expenseNonLogisticsSection", "General Expense Payment Plan")}</div>
              {filteredExpensePlans.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6">{tt("payableEmpty", "No payable items found.")}</p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-border/60">
                  <table className="w-full min-w-[1032px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="w-[88px] text-center py-2 px-2">{tt("bankCategoryLabel", "Category")}</th>
                        <th className="w-[120px] text-center py-2 px-2">{tt("accountSubject", "Account Subject")}</th>
                        <th className="min-w-[160px] max-w-[224px] w-[224px] text-center py-2 px-2">{tt("vendor", "Vendor")}</th>
                        <th className="w-[92px] text-center py-2 px-2">{tt("date", "Date")}</th>
                        <th className="w-[100px] text-center py-2 px-2" title={tt("expensePlanPayAmountHint", "Actual payout after withholding tax deduction")}>
                          {tt("expensePlanPayAmount", "Pay Amount")}
                        </th>
                        <th className="min-w-[148px] max-w-[188px] text-center py-2 px-2">{tt("memo", "Memo")}</th>
                        <th className="w-12 text-center py-2 px-1">{tt("expenseAccrualAttachCol", "Attachment")}</th>
                        <th className="w-[120px] text-center py-2 px-1" title={tt("poInvoice", "Invoice")}>
                          {tt("poInvoice", "Invoice")}
                        </th>
                        <th className="w-[84px] text-center py-2 px-1">{tt("pay_actions", "Action")}</th>
                        <th className="w-[108px] text-center py-2 px-1 sticky right-0 z-[2] bg-muted/95 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.12)] backdrop-blur-sm">
                          {tt("att_approval", "Approval")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {expensePlansByStore.map(([storeLabel, rows]) => (
                        <React.Fragment key={storeLabel}>
                          <tr className="border-b bg-muted/30">
                            <td colSpan={10} className="py-2 px-3 text-sm font-medium">
                              {tt("store", "Store")}: {storeLabel}
                            </td>
                          </tr>
                          {rows.map((r) => (
                            <React.Fragment key={r.id}>
                              <tr className="border-b">
                                {(() => {
                                  const codeLabel = r.payeeCode && !r.payeeCode.startsWith("auto_") ? ` (${r.payeeCode})` : ""
                                  return (
                                    <>
                                      <td className="py-2 px-2 text-center align-top">{renderWithdrawalType(r.withdrawalCategory)}</td>
                                      <td className="py-2 px-2 text-muted-foreground align-top break-words text-xs leading-snug">{accountSubjectLabel(r.accountSubjectId) || "-"}</td>
                                      <td className="py-2 px-2 align-top text-xs leading-snug min-w-[160px] max-w-[224px] w-[224px] break-words" title={getPayeeLine(r.payeeName, codeLabel)}>{getPayeeLine(r.payeeName, codeLabel)}</td>
                                    </>
                                  )
                                })()}
                            <td className="py-2 px-2 text-center align-top whitespace-nowrap">{r.dueDate || r.expenseDate || "-"}</td>
                            <td className="py-2 px-2 text-right tabular-nums align-top whitespace-nowrap">{renderPlanPayAmountCell(r, tt)}</td>
                            <td className="py-2 px-2 text-muted-foreground align-top text-xs leading-snug break-words min-w-[148px] max-w-[188px]" title={r.memo || ""}>{getMemo(r.memo)}</td>
                            <td className="py-2 px-1 text-center align-top">
                              {(r.attachmentUrls?.length ?? 0) > 0 ? (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 shrink-0 text-primary"
                                  title={tt("expenseViewAttachment", "View Attachment")}
                                  onClick={() =>
                                    setAttachmentPreview({
                                      urls: r.attachmentUrls!,
                                      title: `${r.payeeName || ""} #${r.id}`,
                                    })
                                  }
                                >
                                  <Paperclip className="h-4 w-4" />
                                </Button>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                            {renderAccrualInvoiceCell(r)}
                            <td className="py-2 px-1 text-center align-top">
                              <div className="flex flex-wrap items-center justify-center gap-1">
                                {planRowEditable(r) ? (
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-7 w-7"
                                    title={tt("btnEdit", "Edit")}
                                    onClick={() => navigateToEditInRegister(r)}
                                    disabled={payingId === r.id || deletingPlanId === r.id}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                ) : null}
                                {r.status === "approved" && r.remainingAmount > 0 ? (
                                  <Button
                                    size="sm"
                                    variant={payEditorOpenById[r.id] ? "outline" : "default"}
                                    className="h-7 px-2 text-xs"
                                    onClick={() =>
                                      setPayEditorOpenById((prev) => ({ ...prev, [r.id]: !prev[r.id] }))
                                    }
                                    disabled={payingId === r.id}
                                  >
                                    {payEditorOpenById[r.id] ? tt("btnClose", "Close") : tt("payBtn", "Pay")}
                                  </Button>
                                ) : !String(r.storeName || "").trim() ? (
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-7 w-7 border-destructive/40 text-destructive"
                                    title={tt("delete", "Delete")}
                                    onClick={() => handleDeletePlan(r)}
                                    disabled={payingId === r.id || deletingPlanId === r.id}
                                  >
                                    {deletingPlanId === r.id ? <span className="text-[10px]">...</span> : <Trash2 className="h-3.5 w-3.5" />}
                                  </Button>
                                ) : planRowEditable(r) ? null : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-1 text-center align-top sticky right-0 z-[1] border-l border-border/60 bg-card">
                              <div className="flex flex-col items-center justify-start gap-1 max-w-[6.5rem] mx-auto">
                                {canApproveByPolicy(r) && (
                                  (r.status === "planned" || approvalEditById[r.id]) && r.status !== "paid" ? (
                                  <>
                                    <div className="flex flex-wrap items-center justify-center gap-1">
                                      <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-7 w-7 shrink-0 border-primary/40 text-primary"
                                        onClick={() => handleApprove(r, "approve")}
                                        disabled={payingId === r.id}
                                        title={tt("att_approve", "Approve")}
                                      >
                                        <Check className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-7 w-7 shrink-0 border-destructive/40 text-destructive"
                                        onClick={() => handleApprove(r, "reject")}
                                        disabled={payingId === r.id}
                                        title={tt("att_reject", "Reject")}
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-7 w-7 shrink-0 border-destructive/40 text-destructive"
                                        title={tt("delete", "Delete")}
                                        onClick={() => handleDeletePlan(r)}
                                        disabled={payingId === r.id || deletingPlanId === r.id}
                                      >
                                        {deletingPlanId === r.id ? <span className="text-[10px]">...</span> : <Trash2 className="h-3.5 w-3.5" />}
                                      </Button>
                                    </div>
                                  </>
                                  ) : (
                                    (r.status === "approved" || r.status === "rejected") && (
                                      <div className="flex flex-col items-center gap-1 w-full">
                                        {r.status === "approved" ? (
                                          <span className="text-[11px] text-primary text-center leading-tight">{tt("att_approved", "Approved")}</span>
                                        ) : (
                                          <span className="text-[11px] text-destructive text-center leading-tight">{tt("att_rejected", "Rejected")}</span>
                                        )}
                                        <div className="flex flex-wrap items-center justify-center gap-1">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-6 px-1.5 text-[10px]"
                                            title={tt("btnEdit", "Edit")}
                                            onClick={() =>
                                              setApprovalEditById((prev) => ({ ...prev, [r.id]: true }))
                                            }
                                            disabled={payingId === r.id}
                                          >
                                            <Pencil className="h-3 w-3 mr-0.5" />
                                            {tt("btnEdit", "Edit")}
                                          </Button>
                                          {r.status === "rejected" && (
                                            <Button
                                              size="icon"
                                              variant="outline"
                                              className="h-7 w-7 shrink-0 border-destructive/40 text-destructive"
                                              title={tt("delete", "Delete")}
                                              onClick={() => handleDeletePlan(r)}
                                              disabled={payingId === r.id || deletingPlanId === r.id}
                                            >
                                              {deletingPlanId === r.id ? <span className="text-[10px]">...</span> : <Trash2 className="h-3.5 w-3.5" />}
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  )
                                )}
                                {!canApproveByPolicy(r) && r.status === "approved" ? (
                                  <span className="text-[11px] text-primary text-center leading-tight">{tt("att_approved", "Approved")}</span>
                                ) : !canApproveByPolicy(r) && r.status === "rejected" ? (
                                  <span className="text-[11px] text-destructive text-center leading-tight">{tt("att_rejected", "Rejected")}</span>
                                ) : r.status === "planned" && !approvalEditById[r.id] && !canApproveByPolicy(r) ? (
                                  <span className="text-[10px] text-muted-foreground text-center leading-tight px-0.5" title={tt("expensePayAwaitApprovalHint", "Pay appears after approval")}>
                                    {tt("expensePayAwaitApprovalShort", "Pending")}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                          {r.remainingAmount > 0 && r.status === "approved" && payEditorOpenById[r.id] && (
                            <tr className="border-b bg-muted/20">
                              <td className="py-2 px-2" colSpan={10}>
                                <div className="flex flex-wrap items-end gap-2">
                                  <Select
                                    value={payMethodById[r.id] || "bank"}
                                    onValueChange={(v) => setPayMethodById((p) => ({ ...p, [r.id]: v as "bank" | "petty" }))}
                                  >
                                    <SelectTrigger className="w-[120px] h-9">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="bank">{tt("bankTitle", "Bank")}</SelectItem>
                                      <SelectItem value="petty">{tt("adminPettyCash", "Petty Cash")}</SelectItem>
                                    </SelectContent>
                                  </Select>

                                  {(payMethodById[r.id] || "bank") === "bank" ? (
                                    <Select
                                      value={payBankById[r.id] || ""}
                                      onValueChange={(v) => setPayBankById((p) => ({ ...p, [r.id]: v }))}
                                    >
                                      <SelectTrigger className="w-[220px] h-9">
                                        <SelectValue placeholder={tt("bankAccount", "Account")} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {bankAccounts.map((a) => (
                                          <SelectItem key={a.id} value={String(a.id)}>
                                            {a.bankName ? `[${a.bankName}] ` : ""}{a.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <Select
                                      value={payStoreById[r.id] || ""}
                                      onValueChange={(v) => setPayStoreById((p) => ({ ...p, [r.id]: v }))}
                                    >
                                      <SelectTrigger className="w-[180px] h-9">
                                        <SelectValue placeholder={tt("recFilterStoreSelect", "Select Store")} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {(stores || []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                  )}

                                  <Input
                                    value={payAmountById[r.id] ?? String(r.remainingAmount)}
                                    onChange={(e) => setPayAmountById((p) => ({ ...p, [r.id]: e.target.value }))}
                                    className="w-[120px] h-9 text-right"
                                    type="number"
                                  />
                                  <Input
                                    type="date"
                                    value={payDateById[r.id] || todayStrBkk()}
                                    onChange={(e) => setPayDateById((p) => ({ ...p, [r.id]: e.target.value }))}
                                    className="w-[140px] h-9"
                                  />
                                  <Input
                                    value={payMemoById[r.id] || ""}
                                    onChange={(e) => setPayMemoById((p) => ({ ...p, [r.id]: e.target.value }))}
                                    className="w-[220px] h-9"
                                    placeholder={tt("memo", "Memo")}
                                  />
                                  <Button size="sm" onClick={() => handlePay(r)} disabled={payingId === r.id} className="h-9">
                                    <Wallet className="h-4 w-4 mr-1" />
                                    {tt("addPayment", "Add Payment")}
                                  </Button>
                                  {(payMethodById[r.id] || "bank") === "bank" && payBankById[r.id] && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => openLinkBank(r)}
                                      disabled={payingId === r.id}
                                      className="h-9"
                                    >
                                      <Link2 className="h-4 w-4 mr-1" />
                                      {tt("expenseLinkBank", "Link with Bank Transaction")}
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                            </React.Fragment>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="text-sm font-semibold mb-2">{tt("expenseLogisticsPlanSection", "Logistics Expense Payment Plan")}</div>
              {filteredPurchasePlans.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6">{tt("payableEmpty", "No logistics payable plans found.")}</p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-border/60">
                  <table className="w-full min-w-[1032px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="w-[88px] text-center py-2 px-2">{tt("bankCategoryLabel", "Category")}</th>
                        <th className="w-[120px] text-center py-2 px-2">{tt("accountSubject", "Account Subject")}</th>
                        <th className="min-w-[160px] max-w-[224px] w-[224px] text-center py-2 px-2">{tt("vendor", "Vendor")}</th>
                        <th className="w-[92px] text-center py-2 px-2">{tt("date", "Date")}</th>
                        <th className="w-[100px] text-center py-2 px-2" title={tt("expensePlanPayAmountHint", "Actual payout after withholding tax deduction")}>
                          {tt("expensePlanPayAmount", "Pay Amount")}
                        </th>
                        <th className="min-w-[148px] max-w-[188px] text-center py-2 px-2">{tt("memo", "Memo")}</th>
                        <th className="w-12 text-center py-2 px-1">{tt("expenseAccrualAttachCol", "Attachment")}</th>
                        <th className="w-[120px] text-center py-2 px-1" title={tt("poInvoice", "Invoice")}>
                          {tt("poInvoice", "Invoice")}
                        </th>
                        <th className="w-[84px] text-center py-2 px-1">{tt("pay_actions", "Action")}</th>
                        <th className="w-[108px] text-center py-2 px-1 sticky right-0 z-[2] bg-muted/95 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.12)] backdrop-blur-sm">
                          {tt("att_approval", "Approval")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchasePlansByStore.map(([storeLabel, rows]) => (
                        <React.Fragment key={storeLabel}>
                          <tr className="border-b bg-muted/30">
                            <td colSpan={10} className="py-2 px-3 text-sm font-medium">
                              {tt("store", "Store")}: {storeLabel}
                            </td>
                          </tr>
                          {rows.map((r) => (
                            <React.Fragment key={r.id}>
                              <tr className="border-b">
                                <td className="py-2 px-2 text-center align-top">{renderWithdrawalType(r.withdrawalCategory)}</td>
                                <td className="py-2 px-2 text-muted-foreground align-top break-words text-xs leading-snug">{accountSubjectLabel(r.accountSubjectId) || "-"}</td>
                                <td
                                  className="py-2 px-2 align-top text-xs leading-snug min-w-[160px] max-w-[224px] w-[224px] break-words"
                                  title={
                                    r.payeeCode && !r.payeeCode.startsWith("auto_")
                                      ? getPayeeLine(r.payeeName, ` (${r.payeeCode})`)
                                      : getPayeeLine(r.payeeName, "")
                                  }
                                >
                                  {r.payeeCode && !r.payeeCode.startsWith("auto_")
                                    ? getPayeeLine(r.payeeName, ` (${r.payeeCode})`)
                                    : getPayeeLine(r.payeeName, "")}
                                </td>
                                <td className="py-2 px-2 text-center align-top whitespace-nowrap">{r.dueDate || r.expenseDate || "-"}</td>
                                <td className="py-2 px-2 text-right tabular-nums align-top whitespace-nowrap">{renderPlanPayAmountCell(r, tt)}</td>
                                <td className="py-2 px-2 text-muted-foreground align-top text-xs leading-snug break-words min-w-[148px] max-w-[188px]" title={r.memo || ""}>{getMemo(r.memo)}</td>
                                <td className="py-2 px-1 text-center align-top">
                                  {(r.attachmentUrls?.length ?? 0) > 0 ? (
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8 shrink-0 text-primary"
                                      title={tt("expenseViewAttachment", "View Attachment")}
                                      onClick={() =>
                                        setAttachmentPreview({
                                          urls: r.attachmentUrls!,
                                          title: `${r.payeeName || ""} #${r.id}`,
                                        })
                                      }
                                    >
                                      <Paperclip className="h-4 w-4" />
                                    </Button>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </td>
                                {renderAccrualInvoiceCell(r)}
                                <td className="py-2 px-1 text-center align-top">
                                  <div className="flex flex-wrap items-center justify-center gap-1">
                                    {planRowEditable(r) ? (
                                      <Button size="icon" variant="outline" className="h-7 w-7" title={tt("btnEdit", "Edit")} onClick={() => navigateToEditInRegister(r)} disabled={payingId === r.id || deletingPlanId === r.id}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                    ) : null}
                                    {r.status === "approved" && r.remainingAmount > 0 ? (
                                      <Button size="sm" variant={payEditorOpenById[r.id] ? "outline" : "default"} className="h-7 px-2 text-xs" onClick={() => setPayEditorOpenById((prev) => ({ ...prev, [r.id]: !prev[r.id] }))} disabled={payingId === r.id}>
                                        {payEditorOpenById[r.id] ? tt("btnClose", "Close") : tt("payBtn", "Pay")}
                                      </Button>
                                    ) : !String(r.storeName || "").trim() ? (
                                      <Button size="icon" variant="outline" className="h-7 w-7 border-destructive/40 text-destructive" title={tt("delete", "Delete")} onClick={() => handleDeletePlan(r)} disabled={payingId === r.id || deletingPlanId === r.id}>
                                        {deletingPlanId === r.id ? <span className="text-[10px]">...</span> : <Trash2 className="h-3.5 w-3.5" />}
                                      </Button>
                                    ) : planRowEditable(r) ? null : (
                                      <span className="text-xs text-muted-foreground">-</span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 px-1 text-center align-top sticky right-0 z-[1] border-l border-border/60 bg-card">
                                  <div className="flex flex-col items-center justify-start gap-1 max-w-[6.5rem] mx-auto">
                                    {canApproveByPolicy(r) && (r.status === "planned" || approvalEditById[r.id]) && r.status !== "paid" ? (
                                      <div className="flex flex-wrap items-center justify-center gap-1">
                                        <Button size="icon" variant="outline" className="h-7 w-7 shrink-0 border-primary/40 text-primary" onClick={() => handleApprove(r, "approve")} disabled={payingId === r.id} title={tt("att_approve", "Approve")}>
                                          <Check className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button size="icon" variant="outline" className="h-7 w-7 shrink-0 border-destructive/40 text-destructive" onClick={() => handleApprove(r, "reject")} disabled={payingId === r.id} title={tt("att_reject", "Reject")}>
                                          <X className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button size="icon" variant="outline" className="h-7 w-7 shrink-0 border-destructive/40 text-destructive" title={tt("delete", "Delete")} onClick={() => handleDeletePlan(r)} disabled={payingId === r.id || deletingPlanId === r.id}>
                                          {deletingPlanId === r.id ? <span className="text-[10px]">...</span> : <Trash2 className="h-3.5 w-3.5" />}
                                        </Button>
                                      </div>
                                    ) : (r.status === "approved" || r.status === "rejected") && (
                                      <div className="flex flex-col items-center gap-1 w-full">
                                        {r.status === "approved" ? (
                                          <span className="text-[11px] text-primary text-center leading-tight">{tt("att_approved", "Approved")}</span>
                                        ) : (
                                          <span className="text-[11px] text-destructive text-center leading-tight">{tt("att_rejected", "Rejected")}</span>
                                        )}
                                        <div className="flex flex-wrap items-center justify-center gap-1">
                                          <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px]" title={tt("btnEdit", "Edit")} onClick={() => setApprovalEditById((prev) => ({ ...prev, [r.id]: true }))} disabled={payingId === r.id}>
                                            <Pencil className="h-3 w-3 mr-0.5" />
                                            {tt("btnEdit", "Edit")}
                                          </Button>
                                          {r.status === "rejected" && (
                                            <Button size="icon" variant="outline" className="h-7 w-7 shrink-0 border-destructive/40 text-destructive" title={tt("delete", "Delete")} onClick={() => handleDeletePlan(r)} disabled={payingId === r.id || deletingPlanId === r.id}>
                                              {deletingPlanId === r.id ? <span className="text-[10px]">...</span> : <Trash2 className="h-3.5 w-3.5" />}
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    {!canApproveByPolicy(r) && r.status === "approved" && <span className="text-[11px] text-primary text-center leading-tight">{tt("att_approved", "Approved")}</span>}
                                    {!canApproveByPolicy(r) && r.status === "rejected" && <span className="text-[11px] text-destructive text-center leading-tight">{tt("att_rejected", "Rejected")}</span>}
                                    {r.status === "planned" && !canApproveByPolicy(r) && !approvalEditById[r.id] && (
                                      <span className="text-[10px] text-muted-foreground text-center leading-tight px-0.5" title={tt("expensePayAwaitApprovalHint", "Pay appears after approval")}>
                                        {tt("expensePayAwaitApprovalShort", "Pending")}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              {r.remainingAmount > 0 && r.status === "approved" && payEditorOpenById[r.id] && (
                                <tr className="border-b bg-muted/20">
                                  <td className="py-2 px-2" colSpan={10}>
                                    <div className="flex flex-wrap items-end gap-2">
                                      <Select value={payMethodById[r.id] || "bank"} onValueChange={(v) => setPayMethodById((p) => ({ ...p, [r.id]: v as "bank" | "petty" }))}>
                                        <SelectTrigger className="w-[120px] h-9">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="bank">{tt("bankTitle", "Bank")}</SelectItem>
                                          <SelectItem value="petty">{tt("adminPettyCash", "Petty Cash")}</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      {(payMethodById[r.id] || "bank") === "bank" ? (
                                        <Select value={payBankById[r.id] || ""} onValueChange={(v) => setPayBankById((p) => ({ ...p, [r.id]: v }))}>
                                          <SelectTrigger className="w-[220px] h-9">
                                            <SelectValue placeholder={tt("bankAccount", "Account")} />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {bankAccounts.map((a) => (
                                              <SelectItem key={a.id} value={String(a.id)}>{a.bankName ? `[${a.bankName}] ` : ""}{a.name}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <Select value={payStoreById[r.id] || ""} onValueChange={(v) => setPayStoreById((p) => ({ ...p, [r.id]: v }))}>
                                          <SelectTrigger className="w-[180px] h-9">
                                            <SelectValue placeholder={tt("recFilterStoreSelect", "Select Store")} />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {(stores || []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                          </SelectContent>
                                        </Select>
                                      )}
                                      <Input value={payAmountById[r.id] ?? String(r.remainingAmount)} onChange={(e) => setPayAmountById((p) => ({ ...p, [r.id]: e.target.value }))} className="w-[120px] h-9 text-right" type="number" />
                                      <Input type="date" value={payDateById[r.id] || todayStrBkk()} onChange={(e) => setPayDateById((p) => ({ ...p, [r.id]: e.target.value }))} className="w-[140px] h-9" />
                                      <Input value={payMemoById[r.id] || ""} onChange={(e) => setPayMemoById((p) => ({ ...p, [r.id]: e.target.value }))} className="w-[220px] h-9" placeholder={tt("memo", "Memo")} />
                                      <Button size="sm" onClick={() => handlePay(r)} disabled={payingId === r.id} className="h-9">
                                        <Wallet className="h-4 w-4 mr-1" />
                                        {tt("addPayment", "Add Payment")}
                                      </Button>
                                      {(payMethodById[r.id] || "bank") === "bank" && payBankById[r.id] && (
                                        <Button size="sm" variant="outline" onClick={() => openLinkBank(r)} disabled={payingId === r.id} className="h-9">
                                          <Link2 className="h-4 w-4 mr-1" />
                                          {tt("expenseLinkBank", "Link with Bank Transaction")}
                                        </Button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={!!attachmentPreview} onOpenChange={(open) => !open && setAttachmentPreview(null)}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {tt("expenseAttachmentTitle", "Attachment")}
                  {attachmentPreview?.title ? ` — ${attachmentPreview.title}` : ""}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {(attachmentPreview?.urls || []).map((url, i) => (
                  <div key={i} className="rounded-md border border-border/60 p-2">
                    {url.startsWith("data:image/") || /^https?:\/\/.+\.(png|jpe?g|gif|webp)(\?|$)/i.test(url) ? (
                       
                      <img src={url} alt="" className="max-h-[70vh] w-auto max-w-full rounded mx-auto" />
                    ) : url.startsWith("data:application/pdf") || /\.pdf(\?|$)/i.test(url) ? (
                      <iframe title={`pdf-${i}`} src={url} className="h-[min(70vh,520px)] w-full rounded border-0" />
                    ) : (
                      <a href={url} target="_blank" rel="noreferrer" className="text-primary underline break-all text-sm">
                        {tt("expenseOpenFile", "Open File")} #{i + 1}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="expenseRegister" className={adminTabsContentCn}>
          <WithdrawalManagementTab
            onAccrualSaved={handleAccrualSaved}
            onBatchWithdrawalSaved={handleBatchWithdrawalSaved}
          />
        </TabsContent>

        <TabsContent value="expenseSearch" className={adminTabsContentCn}>
          <ExpenseRegisterSearchTab />
        </TabsContent>

        <TabsContent value="card" className={adminTabsContentCn}>
          <CardManagementTab />
        </TabsContent>
      </Tabs>

      <Dialog open={!!linkBankRow} onOpenChange={(open) => !open && setLinkBankRow(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tt("expenseLinkBankTitle", "Select Bank Transaction")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            {tt("expenseLinkBankHint", "Select an unlinked withdrawal transaction with matching amount/date.")}
          </p>
          {unlinkedLoading ? (
            <p className="text-sm py-4">{t("loading")}</p>
          ) : unlinkedList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{tt("expenseLinkBankEmpty", "No matching unlinked bank transactions found.")}</p>
          ) : (
            <div className="max-h-[280px] overflow-y-auto space-y-2">
              {unlinkedList.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between p-2 rounded border hover:bg-muted/50 cursor-pointer"
                  onClick={() => handleLinkBank(b.id)}
                >
                  <span className="text-sm">{b.transDate} · ฿{b.amount.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">{getMemo(b.memo)}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
