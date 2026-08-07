"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert, appConfirm, appPrompt } from "@/lib/app-message"

import * as React from "react"
import {
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { ExpenseAttachmentPreviewItem } from "@/components/erp/expense-attachment-preview"
import { expenseAttachmentKind } from "@/lib/expense-attachment-urls"
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
import { Search, Paperclip } from "lucide-react"
import { MetricCard } from "@/components/cost-analysis/metric-card"
import { AdminFilterBar, AdminFilterField } from "@/components/erp/admin-filter-bar"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ExpensePlanStatusBadge } from "@/components/erp/expense-plan-status-badge"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { useStoreList } from "@/lib/api-client"
import { useErpPageActive, useErpRefetchOnActivate } from "@/lib/erp-page-visibility"
import {
  approveExpenseAccrual,
  deleteExpenseAccrual,
  deleteExpenseAccrualsWithoutStore,
  executeExpensePayment,
  getAccountSubjects,
  getBankAccounts,
  getExpensePaymentPlan,
  getHeadOfficeInfo,
  getUnlinkedBankWithdrawals,
  translateTexts,
  updateExpenseAccrualInvoice,
  updateExpenseAccrualPayeeBank,
  type AccountSubjectItem,
  type BankAccount,
  type ExpenseAccrualPlanItem,
} from "@/lib/api-client"
import { EXPENSE_WITHDRAW_SUBJECT_FETCH } from "@/lib/account-subject-withdraw-options"
import { translateApiMessage } from "@/lib/translate-api-message"
import {
  canApproveExpenseAccrual,
  canDeleteExpenseAccrual,
  canEditExpenseAccrualClassification,
  canMutateExpenseAccrualRecord,
} from "@/lib/expense-accrual-approve-policy"
import { WithdrawalManagementTab } from "@/components/tabs/withdrawal-management-tab"
import { ExpenseRegisterSearchTab } from "@/components/tabs/expense-register-search-tab"
import { CardManagementTab } from "@/components/tabs/card-management-tab"
import { AdminDesktopOnly } from "@/components/erp/admin-responsive-list"
import { ExpensePlanMobileList } from "@/components/erp/expense-plan-mobile-list"
import { ExpensePlanDesktopList } from "@/components/erp/expense-plan-desktop-list"
import { ExpensePlanPaySheet } from "@/components/erp/expense-plan-pay-sheet"
import { ExpenseBankTransferView } from "@/components/erp/expense-bank-transfer-view"
import { useSearchParams, useRouter, usePathname } from "next/navigation"

function groupPlansByStore(rows: ExpenseAccrualPlanItem[]): [string, ExpenseAccrualPlanItem[]][] {
  const map = new Map<string, ExpenseAccrualPlanItem[]>()
  for (const r of rows) {
    const key = String(r.storeName || "").trim() || "—"
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  return Array.from(map.entries()).sort((a, b) =>
    a[0] === "—" ? 1 : b[0] === "—" ? -1 : a[0].localeCompare(b[0])
  )
}

function matchesPlanSegment(
  r: ExpenseAccrualPlanItem,
  segment: "approve" | "pay" | "all"
): boolean {
  if (segment === "approve") return r.status === "planned"
  if (segment === "pay") return r.status === "approved" && (r.remainingAmount || 0) > 0
  return true
}

function todayStrBkk() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

function planRowEditable(r: ExpenseAccrualPlanItem): boolean {
  return canEditExpenseAccrualClassification({ status: r.status })
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
  const pathname = usePathname()
  const pageActive = useErpPageActive()
  const allowExpenseUrlSync =
    pageActive && (pathname || "").startsWith("/admin/expense-management")

  const initialTab = searchParams.get("tab") === "expenseRegister" ? "expenseRegister" : searchParams.get("tab") === "expenseSearch" ? "expenseSearch" : searchParams.get("tab") === "card" ? "card" : "plan"
  const [tab, setTab] = React.useState<"plan" | "expenseRegister" | "expenseSearch" | "card">(initialTab)

  React.useEffect(() => {
    // keep-alive 숨김·soft 표시 중에는 다른 탭 URL의 ?tab= 을 읽지 않음
    if (!allowExpenseUrlSync) return
    const tabParam = searchParams.get("tab")
    if (tabParam === "expenseRegister") setTab("expenseRegister")
    else if (tabParam === "expenseSearch") setTab("expenseSearch")
    else if (tabParam === "card") setTab("card")
    else if (tabParam === "plan") setTab("plan")
  }, [allowExpenseUrlSync, searchParams])

  React.useEffect(() => {
    if (!allowExpenseUrlSync) return
    const s = searchParams.get("startStr")
    const e = searchParams.get("endStr")
    if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) setStartStr(s)
    if (e && /^\d{4}-\d{2}-\d{2}$/.test(e)) setEndStr(e)
  }, [allowExpenseUrlSync, searchParams])
  const [startStr, setStartStr] = React.useState(todayStrBkk)
  const [endStr, setEndStr] = React.useState(todayStrBkk)
  /** 지출 등록(지급 예정) 저장 후 지급예정 탭 강제 재조회 */
  const [planRefreshToken, setPlanRefreshToken] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [expensePlans, setExpensePlans] = React.useState<ExpenseAccrualPlanItem[]>([])
  const [purchasePlans, setPurchasePlans] = React.useState<ExpenseAccrualPlanItem[]>([])
  const [planTypeFilter, setPlanTypeFilter] = React.useState<string>("__all__")
  const [planStoreFilter, setPlanStoreFilter] = React.useState<string>("__all__")
  const [planSegment, setPlanSegment] = React.useState<"approve" | "pay" | "all">("approve")
  const [payListMode, setPayListMode] = React.useState<"list" | "transfer">("transfer")
  const [paySheetRow, setPaySheetRow] = React.useState<ExpenseAccrualPlanItem | null>(null)
  const [savingBankId, setSavingBankId] = React.useState<number | null>(null)
  const [planKindFilter, setPlanKindFilter] = React.useState<"__all__" | "general" | "logistics">("__all__")

  const [bankAccounts, setBankAccounts] = React.useState<BankAccount[]>([])

  const [payMethodById, setPayMethodById] = React.useState<Record<number, "bank" | "petty">>({})
  const [payAmountById, setPayAmountById] = React.useState<Record<number, string>>({})
  const [payDateById, setPayDateById] = React.useState<Record<number, string>>({})
  const [payMemoById, setPayMemoById] = React.useState<Record<number, string>>({})
  const [payBankById, setPayBankById] = React.useState<Record<number, string>>({})
  const [payStoreById, setPayStoreById] = React.useState<Record<number, string>>({})
  const [payingId, setPayingId] = React.useState<number | null>(null)
  const [approvalEditById, setApprovalEditById] = React.useState<Record<number, boolean>>({})
  const [deletingPlanId, setDeletingPlanId] = React.useState<number | null>(null)
  const [linkBankRow, setLinkBankRow] = React.useState<ExpenseAccrualPlanItem | null>(null)
  const [unlinkedList, setUnlinkedList] = React.useState<{ id: number; transDate: string; amount: number; memo: string }[]>([])
  const [unlinkedLoading, setUnlinkedLoading] = React.useState(false)
  const [approvingAll, setApprovingAll] = React.useState(false)
  const [rejectingAll, setRejectingAll] = React.useState(false)
  const [payingAll, setPayingAll] = React.useState(false)
  const [payAllOpen, setPayAllOpen] = React.useState(false)
  const [payAllBankId, setPayAllBankId] = React.useState("")
  const [payAllDate, setPayAllDate] = React.useState(todayStrBkk)
  const [payAllAllowMissingBank, setPayAllAllowMissingBank] = React.useState(false)
  const [transferCompanyName, setTransferCompanyName] = React.useState("")
  const [planDetailRow, setPlanDetailRow] = React.useState<ExpenseAccrualPlanItem | null>(null)
  const [cleaningNoStore, setCleaningNoStore] = React.useState(false)
  const [attachmentPreview, setAttachmentPreview] = React.useState<{ urls: string[]; title: string } | null>(null)
  const [updatingInvoiceAccrualId, setUpdatingInvoiceAccrualId] = React.useState<number | null>(null)
  const [subjects, setSubjects] = React.useState<AccountSubjectItem[]>([])
  const [subjectEnglishNames, setSubjectEnglishNames] = React.useState<Record<number, string>>({})
  const [memoTransMap, setMemoTransMap] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    getAccountSubjects(EXPENSE_WITHDRAW_SUBJECT_FETCH).catch(() => []).then(setSubjects)
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
    let cancelled = false
    getHeadOfficeInfo()
      .then((ho) => {
        if (!cancelled) setTransferCompanyName(String(ho?.companyName || "").trim())
      })
      .catch(() => {
        if (!cancelled) setTransferCompanyName("")
      })
    return () => {
      cancelled = true
    }
  }, [])

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
      if (!allowExpenseUrlSync) return
      const q = new URLSearchParams({ tab: "plan" })
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        q.set("startStr", d)
        q.set("endStr", d)
      }
      router.replace(`/admin/expense-management?${q.toString()}`, { scroll: false })
    },
    [router, allowExpenseUrlSync]
  )

  const handleBatchWithdrawalSaved = React.useCallback(
    (opts: { startStr: string; endStr: string }) => {
      const start = String(opts.startStr || "").slice(0, 10)
      const end = String(opts.endStr || "").slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return
      setStartStr(start)
      setEndStr(end)
      setTab("expenseSearch")
      if (!allowExpenseUrlSync) return
      const q = new URLSearchParams({
        tab: "expenseSearch",
        startStr: start,
        endStr: end,
        searchRefresh: String(Date.now()),
      })
      router.replace(`/admin/expense-management?${q.toString()}`, { scroll: false })
    },
    [router, allowExpenseUrlSync]
  )

  /** 지급예정 탭 진입·등록 저장·auth.role 확정 시 조회. 기간만 바꾼 뒤에는 [조회] 버튼. */
  React.useEffect(() => {
    if (tab !== "plan") return
    void loadPlansRef.current()
  }, [tab, auth?.role, planRefreshToken])

  useErpRefetchOnActivate(() => {
    if (tab === "plan") void loadPlansRef.current()
  })

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
      setPaySheetRow(null)
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

  const filteredPurchasePlans = React.useMemo(
    () =>
      (purchasePlans || []).filter((r) =>
        (planTypeFilter === "__all__" ? true : String(r.withdrawalCategory || "").toLowerCase() === planTypeFilter) &&
        (planStoreFilter === "__all__" ? true : String(r.storeName || "").trim() === planStoreFilter)
      ),
    [purchasePlans, planStoreFilter, planTypeFilter]
  )

  const kindFilteredExpensePlans = React.useMemo(
    () => (planKindFilter === "logistics" ? [] : filteredExpensePlans),
    [filteredExpensePlans, planKindFilter]
  )
  const kindFilteredPurchasePlans = React.useMemo(
    () => (planKindFilter === "general" ? [] : filteredPurchasePlans),
    [filteredPurchasePlans, planKindFilter]
  )

  const allFilteredPlans = React.useMemo(
    () => [...kindFilteredExpensePlans, ...kindFilteredPurchasePlans],
    [kindFilteredExpensePlans, kindFilteredPurchasePlans]
  )

  const segmentedExpensePlans = React.useMemo(
    () => kindFilteredExpensePlans.filter((r) => matchesPlanSegment(r, planSegment)),
    [kindFilteredExpensePlans, planSegment]
  )
  const segmentedPurchasePlans = React.useMemo(
    () => kindFilteredPurchasePlans.filter((r) => matchesPlanSegment(r, planSegment)),
    [kindFilteredPurchasePlans, planSegment]
  )

  const expensePlansByStore = React.useMemo(
    () => groupPlansByStore(segmentedExpensePlans),
    [segmentedExpensePlans]
  )
  const purchasePlansByStore = React.useMemo(
    () => groupPlansByStore(segmentedPurchasePlans),
    [segmentedPurchasePlans]
  )

  const planSegmentCounts = React.useMemo(
    () => ({
      approve: allFilteredPlans.filter((r) => r.status === "planned").length,
      pay: allFilteredPlans.filter((r) => r.status === "approved" && (r.remainingAmount || 0) > 0).length,
      all: allFilteredPlans.length,
    }),
    [allFilteredPlans]
  )

  const transferPayablePlans = React.useMemo(
    () =>
      allFilteredPlans.filter((r) => r.status === "approved" && (r.remainingAmount || 0) > 0),
    [allFilteredPlans]
  )

  /** 조회 기간(API) + 화면 매장·구분 필터 기준 합계 — 잔액 KPI는 지급대기(approved·잔액>0)와 동일 */
  const filteredPlanTotals = React.useMemo(() => {
    const payableRemaining = (rows: ExpenseAccrualPlanItem[]) =>
      rows.reduce((s, r) => {
        if (r.status !== "approved" || (r.remainingAmount || 0) <= 0) return s
        return s + (r.remainingAmount || 0)
      }, 0)
    return {
      expensePlanned: filteredExpensePlans.reduce((s, r) => s + (r.plannedAmount || 0), 0),
      expenseRemaining: payableRemaining(filteredExpensePlans),
      logisticsRemaining: payableRemaining(filteredPurchasePlans),
    }
  }, [filteredExpensePlans, filteredPurchasePlans])

  const canApproveByPolicy = React.useCallback(
    (row: ExpenseAccrualPlanItem) => canApproveExpenseAccrual(auth?.role, row.storeName),
    [auth?.role]
  )
  const canDeleteByPolicy = React.useCallback(
    (row: ExpenseAccrualPlanItem) =>
      canDeleteExpenseAccrual({
        userRole: auth?.role,
        storeName: row.storeName,
        status: row.status,
        paidAmount: row.paidAmount,
      }),
    [auth?.role]
  )

  const approvablePlansForDay = React.useMemo(() => {
    // 화면에 보이는 종류·매장·기간 필터와 동일 범위 (시작일만 제한하지 않음)
    return allFilteredPlans.filter(
      (r) => r.status === "planned" && canApproveByPolicy(r)
    )
  }, [allFilteredPlans, canApproveByPolicy])

  /** KPI 카드용 — 유형 필터와 무관하게 기간·매장·용도만 반영 */
  const kpiApprovePendingCount = React.useMemo(
    () =>
      [...filteredExpensePlans, ...filteredPurchasePlans].filter(
        (r) => r.status === "planned" && canApproveByPolicy(r)
      ).length,
    [filteredExpensePlans, filteredPurchasePlans, canApproveByPolicy]
  )

  const applyPlanKpi = React.useCallback(
    (kind: "__all__" | "general" | "logistics", segment: "approve" | "pay" | "all") => {
      setPlanKindFilter(kind)
      setPlanSegment(segment)
      setPlanStoreFilter("__all__")
      // 잔액·승인 KPI는 매장별 업무 목록으로 (이체 보기는 토글로 전환)
      setPayListMode("list")
    },
    []
  )

  const payablePlansForDay = React.useMemo(() => {
    return allFilteredPlans.filter(
      (r) => r.status === "approved" && (r.remainingAmount || 0) > 0
    )
  }, [allFilteredPlans])

  const payAllMissingBankCount = React.useMemo(
    () => payablePlansForDay.filter((r) => !String(r.payeeBankAccountNo || "").trim()).length,
    [payablePlansForDay]
  )

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
      setApprovalEditById((prev) => ({ ...prev, [row.id]: false }))
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
      // 스냅샷 계좌 — 빈 값도 명시 전달(미전달 시 저장에서 기존 계좌가 지워질 수 있음)
      q.set("payeeAccountHolder", String(row.payeeAccountHolder || "").trim())
      q.set("payeeBankName", String(row.payeeBankName || "").trim())
      q.set("payeeBankAccountNo", String(row.payeeBankAccountNo || "").trim())
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

  const openPaySheet = React.useCallback((r: ExpenseAccrualPlanItem) => {
    setPaySheetRow(r)
    // 잔액·오늘로 강제 리셋 (이전 입력·부분지급 후 과다 지급 방지)
    setPayAmountById((p) => ({ ...p, [r.id]: String(r.remainingAmount || 0) }))
    setPayDateById((p) => ({ ...p, [r.id]: todayStrBkk() }))
    setPayMethodById((p) => ({ ...p, [r.id]: p[r.id] || "bank" }))
    setPayMemoById((p) => ({ ...p, [r.id]: r.memo || "" }))
  }, [])

  const handleSavePayeeBank = React.useCallback(
    async (
      r: ExpenseAccrualPlanItem,
      patch: { payeeAccountHolder: string; payeeBankName: string; payeeBankAccountNo: string }
    ): Promise<boolean> => {
      setSavingBankId(r.id)
      try {
        const res = await updateExpenseAccrualPayeeBank({
          expenseAccrualId: r.id,
          ...patch,
          userRole: auth?.role,
        })
        if (!res.success) {
          await appAlert(
            translateApiMessage((res as { message?: string }).message, t) ||
              (res as { message?: string }).message ||
              t("processFail")
          )
          return false
        }
        if (res.vendorSyncWarning) {
          await appAlert(res.vendorSyncWarning)
        }
        const localPatch = {
          payeeAccountHolder: res.payeeAccountHolder ?? patch.payeeAccountHolder,
          payeeBankName: res.payeeBankName ?? patch.payeeBankName,
          payeeBankAccountNo: res.payeeBankAccountNo ?? patch.payeeBankAccountNo,
        }
        setExpensePlans((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...localPatch } : x)))
        setPurchasePlans((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...localPatch } : x)))
        await loadPlans()
        return true
      } finally {
        setSavingBankId(null)
      }
    },
    [auth?.role, loadPlans, t]
  )

  const canEditPayeeBank = canMutateExpenseAccrualRecord(auth?.role)

  const handleDeletePlan = React.useCallback(async (row: ExpenseAccrualPlanItem) => {
    if (!row?.id) return
    if (
      !canDeleteExpenseAccrual({
        userRole: auth?.role,
        storeName: row.storeName,
        status: row.status,
        paidAmount: row.paidAmount,
      })
    ) {
      await appAlert(
        tt(
          "expensePlanDeleteDenied",
          "You cannot delete this payment plan. Only request/rejected/approved(unpaid, unlinked) items can be deleted."
        )
      )
      return
    }
    const confirmMsg =
      String(row.status || "").toLowerCase() === "approved"
        ? tt(
            "expensePlanDeleteApprovedConfirm",
            "This accrual is approved but unpaid. Delete it? Journals and payables for this plan will be removed."
          )
        : tt("emp_confirm_delete", "Delete this item?")
    const ok = await appConfirm(confirmMsg)
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
  }, [auth?.role, loadPlans, t, tt])

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
      `${startStr}${endStr && endStr !== startStr ? ` ~ ${endStr}` : ""} ${tt("expenseApproveAllDay", "Approve all for day")} (${approvablePlansForDay.length}${tt("receivPayCount", "items")})`
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
  }, [approvablePlansForDay, auth?.role, auth?.user, loadPlans, startStr, tt])

  const payAllTotal = React.useMemo(
    () => payablePlansForDay.reduce((s, r) => s + (r.remainingAmount || 0), 0),
    [payablePlansForDay]
  )

  const openPayAllDialog = React.useCallback(() => {
    if (payablePlansForDay.length === 0) {
      void appAlert(tt("payableEmpty", "No items to pay."))
      return
    }
    if (bankAccounts.length === 0) {
      void appAlert(tt("bankAccount", "Account"))
      return
    }
    setPayAllBankId(String(bankAccounts[0]?.id || ""))
    setPayAllDate(todayStrBkk())
    setPayAllAllowMissingBank(false)
    setPayAllOpen(true)
  }, [bankAccounts, payablePlansForDay.length, tt])

  const handlePayAllForDay = React.useCallback(async () => {
    const accountId = Number(payAllBankId || 0)
    if (!accountId) {
      await appAlert(tt("bankAccount", "Account"))
      return
    }
    const payDate = String(payAllDate || todayStrBkk()).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payDate)) {
      await appAlert(tt("date", "Date"))
      return
    }
    if (payAllMissingBankCount > 0 && !payAllAllowMissingBank) {
      await appAlert(
        tt(
          "expensePayAllMissingBankBlock",
          "{count} item(s) are missing a bank account. Fill them in Bank transfer view, or check “Pay anyway without account”."
        ).replace("{count}", String(payAllMissingBankCount))
      )
      return
    }
    const ok = await appConfirm(
      `${payDate} ${tt("expensePayAllDay", "Pay all approved for day")} (${payablePlansForDay.length}${tt("receivPayCount", "items")}) · ฿${payAllTotal.toLocaleString()}`
    )
    if (!ok) return
    setPayingAll(true)
    try {
      for (const row of payablePlansForDay) {
        const res = await executeExpensePayment({
          expenseAccrualId: row.id,
          paymentMethod: "bank",
          amount: row.remainingAmount || 0,
          transDate: payDate,
          memo: row.memo || "",
          accountId,
          userName: auth?.user,
          userRole: auth?.role,
        })
        if (!res.success) {
          await appAlert(
            translateApiMessage((res as { message?: string }).message, t) ||
              (res as { message?: string }).message ||
              t("processFail")
          )
          break
        }
      }
      setPayAllOpen(false)
      await loadPlans()
    } finally {
      setPayingAll(false)
    }
  }, [
    auth?.role,
    auth?.user,
    loadPlans,
    payAllAllowMissingBank,
    payAllBankId,
    payAllDate,
    payAllMissingBankCount,
    payAllTotal,
    payablePlansForDay,
    t,
    tt,
  ])

  const renderAttachmentButton = React.useCallback(
    (r: ExpenseAccrualPlanItem) => {
      const urls = r.attachmentUrls || []
      if (urls.length === 0) return null
      const firstImage = urls.find((u) => expenseAttachmentKind(u) === "image")
      return (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 gap-1.5 text-xs"
          title={tt("expenseViewAttachment", "View Attachment")}
          onClick={() =>
            setAttachmentPreview({
              urls,
              title: `${r.payeeName || ""} #${r.id}`,
            })
          }
        >
          {firstImage ? (
            <img src={firstImage} alt="" className="h-5 w-5 rounded object-cover" />
          ) : (
            <Paperclip className="h-3.5 w-3.5" />
          )}
          {tt("expenseAccrualAttachCol", "Attachment")}
        </Button>
      )
    },
    [tt]
  )

  const openAttachmentPreview = React.useCallback((r: ExpenseAccrualPlanItem) => {
    const urls = r.attachmentUrls || []
    if (urls.length === 0) return
    setAttachmentPreview({
      urls,
      title: `${r.payeeName || ""} #${r.id}`,
    })
  }, [])

  const expensePlanListSharedProps = {
    tt,
    getPayeeLine,
    getMemo,
    renderWithdrawalType,
    renderPayAmount: (r: ExpenseAccrualPlanItem) => renderPlanPayAmountCell(r, tt),
    planRowEditable,
    canApproveByPolicy,
    canDeleteByPolicy,
    payingId,
    deletingPlanId,
    approvalEditById,
    updatingInvoiceAccrualId,
    onPlanDetail: setPlanDetailRow,
    onEdit: navigateToEditInRegister,
    onPay: openPaySheet,
    onDelete: handleDeletePlan,
    onApprove: handleApprove,
    onApprovalEdit: (id: number) => setApprovalEditById((prev) => ({ ...prev, [id]: true })),
    onAttachment: openAttachmentPreview,
    onInvoiceToggle: (r: ExpenseAccrualPlanItem, checked: boolean) => {
      void handleAccrualInvoiceCheckChange(r, checked)
    },
  } as const

  const expensePlanMobileSharedProps = {
    tt,
    getPayeeLine,
    getMemo,
    renderWithdrawalType,
    accountSubjectLabel,
    renderPayAmount: (r: ExpenseAccrualPlanItem) => renderPlanPayAmountCell(r, tt),
    planRowEditable,
    canApproveByPolicy,
    canDeleteByPolicy,
    payingId,
    deletingPlanId,
    approvalEditById,
    updatingInvoiceAccrualId,
    onPlanDetail: setPlanDetailRow,
    onEdit: navigateToEditInRegister,
    onPay: openPaySheet,
    onDelete: handleDeletePlan,
    onApprove: handleApprove,
    onApprovalEdit: (id: number) => setApprovalEditById((prev) => ({ ...prev, [id]: true })),
    onInvoiceToggle: (r: ExpenseAccrualPlanItem, checked: boolean) => {
      void handleAccrualInvoiceCheckChange(r, checked)
    },
    renderAttachmentButton,
  } as const

  const handleRejectAllForDay = React.useCallback(async () => {
    if (approvablePlansForDay.length === 0) {
      await appAlert(tt("payableEmpty", "No items to reject."))
      return
    }
    const ok = await appConfirm(
      `${startStr}${endStr && endStr !== startStr ? ` ~ ${endStr}` : ""} ${tt("expenseRejectAllDay", "Reject all for day")} (${approvablePlansForDay.length}${tt("receivPayCount", "items")})`
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
      <Tabs value={tab} onValueChange={(v) => setTab(v as "plan" | "expenseRegister" | "expenseSearch" | "card")} preserveInactiveTabs={false} className={adminTabsRootCn}>
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
              <button
                type="button"
                className={cn(
                  "min-w-0 rounded-xl text-left ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  planSegment === "approve" && planKindFilter === "__all__" && "ring-2 ring-primary"
                )}
                onClick={() => applyPlanKpi("__all__", "approve")}
              >
                <MetricCard
                  size="sm"
                  variant={kpiApprovePendingCount > 0 ? "warning" : "default"}
                  label={t("acct_kpi_expense_approve_pending")}
                  value={String(kpiApprovePendingCount)}
                />
              </button>
              <button
                type="button"
                className={cn(
                  "min-w-0 rounded-xl text-left ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  planSegment === "pay" && planKindFilter === "general" && "ring-2 ring-primary"
                )}
                onClick={() => applyPlanKpi("general", "pay")}
              >
                <MetricCard
                  size="sm"
                  variant="primary"
                  label={t("acct_kpi_expense_remaining")}
                  value={`฿${filteredPlanTotals.expenseRemaining.toLocaleString()}`}
                />
              </button>
              <button
                type="button"
                className={cn(
                  "min-w-0 rounded-xl text-left ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  planSegment === "pay" && planKindFilter === "logistics" && "ring-2 ring-primary"
                )}
                onClick={() => applyPlanKpi("logistics", "pay")}
              >
                <MetricCard
                  size="sm"
                  label={t("acct_kpi_logistics_remaining")}
                  value={`฿${filteredPlanTotals.logisticsRemaining.toLocaleString()}`}
                />
              </button>
              <button
                type="button"
                className={cn(
                  "min-w-0 rounded-xl text-left ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  planSegment === "pay" && planKindFilter === "__all__" && "ring-2 ring-primary"
                )}
                onClick={() => applyPlanKpi("__all__", "pay")}
              >
                <MetricCard
                  size="sm"
                  label={tt("expensePlanTab", "Payment Plan")}
                  value={`฿${(
                    filteredPlanTotals.expenseRemaining + filteredPlanTotals.logisticsRemaining
                  ).toLocaleString()}`}
                />
              </button>
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
            <AdminFilterField label={tt("expensePlanKindFilter", "Kind")}>
              <Select
                value={planKindFilter}
                onValueChange={(v) => setPlanKindFilter(v as "__all__" | "general" | "logistics")}
              >
                <SelectTrigger className="w-full h-9 sm:w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{tt("all", "All")}</SelectItem>
                  <SelectItem value="general">{tt("expenseNonLogisticsSection", "General")}</SelectItem>
                  <SelectItem value="logistics">{tt("expenseLogisticsPlanSection", "Logistics")}</SelectItem>
                </SelectContent>
              </Select>
            </AdminFilterField>
            <Button size="sm" onClick={() => void loadPlans()} disabled={loading} className="h-9">
              <Search className="h-4 w-4 mr-1" />
              {t("btn_query")}
            </Button>
          </AdminFilterBar>

          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-0.5">
            {(
              [
                { id: "approve" as const, label: tt("expensePlanSegApprove", "To Approve"), count: planSegmentCounts.approve },
                { id: "pay" as const, label: tt("expensePlanSegPay", "To Pay"), count: planSegmentCounts.pay },
                { id: "all" as const, label: tt("expensePlanSegAll", "All"), count: planSegmentCounts.all },
              ] as const
            ).map((seg) => (
              <Button
                key={seg.id}
                size="sm"
                variant={planSegment === seg.id ? "default" : "outline"}
                className="h-9 shrink-0"
                onClick={() => setPlanSegment(seg.id)}
              >
                {seg.label}
                <span className="ml-1.5 tabular-nums text-xs opacity-80">({seg.count})</span>
              </Button>
            ))}
            {planSegment === "approve" ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 shrink-0 border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                  onClick={handleApproveAllForDay}
                  disabled={approvingAll || approvablePlansForDay.length === 0}
                  title={`${startStr}${endStr && endStr !== startStr ? ` ~ ${endStr}` : ""}`}
                >
                  {approvingAll
                    ? tt("loading", "...")
                    : `${tt("expenseApproveAllDay", "Approve all for day")} (${approvablePlansForDay.length})`}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 shrink-0 border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15"
                  onClick={handleRejectAllForDay}
                  disabled={rejectingAll || approvablePlansForDay.length === 0}
                  title={`${startStr}${endStr && endStr !== startStr ? ` ~ ${endStr}` : ""}`}
                >
                  {rejectingAll
                    ? tt("loading", "...")
                    : `${tt("expenseRejectAllDay", "Reject all for day")} (${approvablePlansForDay.length})`}
                </Button>
              </>
            ) : null}
            {planSegment === "pay" ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 shrink-0 border-emerald-600/30 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/15"
                  onClick={openPayAllDialog}
                  disabled={payingAll || payablePlansForDay.length === 0}
                  title={tt(
                    "expensePayAllDayHint",
                    "Choose bank account and payment date, then pay all approved items in the current filter"
                  )}
                >
                  {payingAll
                    ? tt("loading", "...")
                    : `${tt("expensePayAllDay", "Pay all for day")} (${payablePlansForDay.length})`}
                </Button>
                <div className="ml-auto flex shrink-0 items-center gap-1 rounded-md border border-border/60 p-0.5">
                  <Button
                    size="sm"
                    variant={payListMode === "transfer" ? "secondary" : "ghost"}
                    className="h-8"
                    onClick={() => setPayListMode("transfer")}
                  >
                    {tt("expensePayModeTransfer", "Bank Transfer")}
                  </Button>
                  <Button
                    size="sm"
                    variant={payListMode === "list" ? "secondary" : "ghost"}
                    className="h-8"
                    onClick={() => setPayListMode("list")}
                  >
                    {tt("expensePayModeList", "List")}
                  </Button>
                </div>
              </>
            ) : null}
            {planSegment === "all" ? (
              <Button
                size="sm"
                variant="outline"
                className="h-9 shrink-0 border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15"
                onClick={handleCleanNoStore}
                disabled={cleaningNoStore}
                title={tt("expenseCleanNoStoreHint", "Force delete payment plans with no store selected")}
              >
                {cleaningNoStore ? tt("loading", "...") : tt("expenseCleanNoStore", "Clean No-Store Plans")}
              </Button>
            ) : null}
          </div>

          {planSegment === "pay" && payListMode === "transfer" ? (
            <ExpenseBankTransferView
              key={`transfer-${planKindFilter}-${startStr}-${endStr}`}
              plans={transferPayablePlans}
              tt={tt}
              companyName={transferCompanyName}
              asOfDate={endStr || startStr}
              canEditBank={canEditPayeeBank}
              savingId={savingBankId}
              onSaveBank={handleSavePayeeBank}
              onPay={openPaySheet}
            />
          ) : (
            <>
              <AdminDesktopOnly className="space-y-4">
                {planKindFilter === "__all__" || planKindFilter === "general" ? (
                  <ExpensePlanDesktopList
                    title={tt("expenseNonLogisticsSection", "General Expense Payment Plan")}
                    plansByStore={expensePlansByStore}
                    emptyLabel={tt("payableEmpty", "No payable items found.")}
                    {...expensePlanListSharedProps}
                  />
                ) : null}
                {planKindFilter === "__all__" || planKindFilter === "logistics" ? (
                  <ExpensePlanDesktopList
                    title={tt("expenseLogisticsPlanSection", "Logistics Expense Payment Plan")}
                    plansByStore={purchasePlansByStore}
                    emptyLabel={tt("payableEmpty", "No logistics payable plans found.")}
                    {...expensePlanListSharedProps}
                  />
                ) : null}
              </AdminDesktopOnly>
              {planKindFilter === "__all__" || planKindFilter === "general" ? (
                <ExpensePlanMobileList
                  title={tt("expenseNonLogisticsSection", "General Expense Payment Plan")}
                  emptyLabel={tt("payableEmpty", "No payable items found.")}
                  plansByStore={expensePlansByStore}
                  {...expensePlanMobileSharedProps}
                />
              ) : null}
              {planKindFilter === "__all__" || planKindFilter === "logistics" ? (
                <ExpensePlanMobileList
                  title={tt("expenseLogisticsPlanSection", "Logistics Expense Payment Plan")}
                  emptyLabel={tt("payableEmpty", "No logistics payable plans found.")}
                  plansByStore={purchasePlansByStore}
                  {...expensePlanMobileSharedProps}
                />
              ) : null}
            </>
          )}

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
                    <ExpenseAttachmentPreviewItem
                      url={url}
                      index={i}
                      openFileLabel={tt("expenseOpenFile", "Open File")}
                      corruptedPdfLabel={tt(
                        "expenseAttachmentCorrupted",
                        "This PDF may have been damaged while saving. Please re-attach it from Withdrawal Management."
                      )}
                    />
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          <ExpensePlanPaySheet
            open={!!paySheetRow}
            row={paySheetRow}
            tt={tt}
            stores={stores || []}
            bankAccounts={bankAccounts}
            payingId={payingId}
            payMethod={paySheetRow ? payMethodById[paySheetRow.id] || "bank" : "bank"}
            payBankId={paySheetRow ? payBankById[paySheetRow.id] || "" : ""}
            payStore={paySheetRow ? payStoreById[paySheetRow.id] || "" : ""}
            payAmount={paySheetRow ? payAmountById[paySheetRow.id] ?? "" : ""}
            payDate={paySheetRow ? payDateById[paySheetRow.id] || "" : ""}
            payMemo={paySheetRow ? payMemoById[paySheetRow.id] || "" : ""}
            onPayMethodChange={(v) => {
              if (!paySheetRow) return
              setPayMethodById((p) => ({ ...p, [paySheetRow.id]: v }))
            }}
            onPayBankChange={(v) => {
              if (!paySheetRow) return
              setPayBankById((p) => ({ ...p, [paySheetRow.id]: v }))
            }}
            onPayStoreChange={(v) => {
              if (!paySheetRow) return
              setPayStoreById((p) => ({ ...p, [paySheetRow.id]: v }))
            }}
            onPayAmountChange={(v) => {
              if (!paySheetRow) return
              setPayAmountById((p) => ({ ...p, [paySheetRow.id]: v }))
            }}
            onPayDateChange={(v) => {
              if (!paySheetRow) return
              setPayDateById((p) => ({ ...p, [paySheetRow.id]: v }))
            }}
            onPayMemoChange={(v) => {
              if (!paySheetRow) return
              setPayMemoById((p) => ({ ...p, [paySheetRow.id]: v }))
            }}
            onClose={() => setPaySheetRow(null)}
            onSubmit={(r) => void handlePay(r)}
            onLinkBank={(r) => void openLinkBank(r)}
          />

          <Sheet open={!!planDetailRow} onOpenChange={(open) => !open && setPlanDetailRow(null)}>
            <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>
                  {tt("expensePlanDetailTitle", "Payment plan detail")}
                  {planDetailRow ? ` #${planDetailRow.id}` : ""}
                </SheetTitle>
              </SheetHeader>
              {planDetailRow ? (
                <div className="mt-4 space-y-3 px-4 pb-4 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{tt("expensePlanStatusCol", "Status")}</span>
                    <ExpensePlanStatusBadge status={planDetailRow.status} />
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">{tt("expenseDocumentNo", "Doc No.")}</div>
                    <div className="tabular-nums">{planDetailRow.documentNo || "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">{tt("vendor", "Vendor")}</div>
                    <div>{planDetailRow.payeeName || "—"}</div>
                    {planDetailRow.payeeCode && !planDetailRow.payeeCode.startsWith("auto_") ? (
                      <div className="text-[11px] text-muted-foreground">{planDetailRow.payeeCode}</div>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-muted-foreground text-xs">{tt("store", "Store")}</div>
                      <div>{planDetailRow.storeName || "—"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">{tt("date", "Date")}</div>
                      <div>{planDetailRow.dueDate || planDetailRow.expenseDate || "—"}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">{tt("expensePayeeAccountHolder", "Account holder")}</div>
                    <div>{planDetailRow.payeeAccountHolder || planDetailRow.payeeName || "—"}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-muted-foreground text-xs">{tt("expensePayeeBankName", "Bank")}</div>
                      <div>{planDetailRow.payeeBankName || "—"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">{tt("inv_account_no", "Account")}</div>
                      <div className="tabular-nums">{planDetailRow.payeeBankAccountNo || "—"}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">{tt("expensePlanPayAmount", "Pay Amount")}</div>
                    <div className="tabular-nums font-medium">
                      ฿{(planDetailRow.grossAmount ?? planDetailRow.plannedAmount ?? 0).toLocaleString()}
                    </div>
                    {(planDetailRow.remainingAmount || 0) > 0 &&
                    planDetailRow.remainingAmount !== (planDetailRow.plannedAmount || 0) ? (
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        {tt("expensePlanNetPayShort", "Net")} remaining ฿
                        {(planDetailRow.remainingAmount || 0).toLocaleString()}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">{tt("poInvoice", "Invoice")}</div>
                    <div>
                      {planDetailRow.invoiceReceived
                        ? tt("poInvoiceReceived", "Invoice Received")
                        : "—"}
                      {planDetailRow.invoiceNo ? ` · ${planDetailRow.invoiceNo}` : ""}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">{tt("memo", "Memo")}</div>
                    <div className="whitespace-pre-wrap">{planDetailRow.memo || "—"}</div>
                  </div>
                  {(planDetailRow.attachmentUrls?.length ?? 0) > 0 ? (
                    <div>
                      <div className="text-muted-foreground text-xs mb-2">{tt("expenseAttachmentTitle", "Attachment")}</div>
                      <div className="flex flex-wrap gap-2">
                        {planDetailRow.attachmentUrls!.map((url, i) => (
                          <button
                            key={i}
                            type="button"
                            className="h-16 w-16 rounded border overflow-hidden"
                            onClick={() =>
                              setAttachmentPreview({
                                urls: planDetailRow.attachmentUrls!,
                                title: `${planDetailRow.payeeName || ""} #${planDetailRow.id}`,
                              })
                            }
                          >
                            {expenseAttachmentKind(url) === "image" ? (
                              <img src={url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-[10px] p-1">PDF</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </SheetContent>
          </Sheet>
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

      <Dialog open={payAllOpen} onOpenChange={(open) => !open && setPayAllOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tt("expensePayAllDay", "Pay all for day")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {startStr}
              {endStr && endStr !== startStr ? ` ~ ${endStr}` : ""} · {payablePlansForDay.length}
              {tt("receivPayCount", "items")} · ฿{payAllTotal.toLocaleString()}
            </p>
            {payAllMissingBankCount > 0 ? (
              <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <p>
                  {tt(
                    "expensePayAllMissingBankWarn",
                    "{count} item(s) missing bank account — fill them before transfer, or allow pay without account."
                  ).replace("{count}", String(payAllMissingBankCount))}
                </p>
                <label className="flex items-center gap-2 font-medium">
                  <Checkbox
                    checked={payAllAllowMissingBank}
                    onCheckedChange={(v) => setPayAllAllowMissingBank(v === true)}
                  />
                  {tt("expensePayAllMissingBankAllow", "Pay anyway without account")}
                </label>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">{tt("bankAccount", "Account")}</label>
              <Select value={payAllBankId} onValueChange={setPayAllBankId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={tt("bankAccount", "Account")} />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.bankName ? `[${a.bankName}] ` : ""}
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">{tt("date", "Date")}</label>
              <Input
                type="date"
                className="h-9"
                value={payAllDate}
                onChange={(e) => setPayAllDate(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setPayAllOpen(false)} disabled={payingAll}>
                {tt("btnClose", "Close")}
              </Button>
              <Button
                onClick={() => void handlePayAllForDay()}
                disabled={
                  payingAll ||
                  !payAllBankId ||
                  (payAllMissingBankCount > 0 && !payAllAllowMissingBank)
                }
              >
                {payingAll ? tt("loading", "...") : tt("expensePayAllDay", "Pay all for day")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                  <span className="text-sm text-muted-foreground truncate max-w-[200px]">{getMemo(b.memo)}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
