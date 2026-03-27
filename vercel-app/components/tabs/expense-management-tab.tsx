"use client"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search, Wallet, Link2, Check, X, Pencil, Trash2 } from "lucide-react"
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
  updateExpenseAccrual,
  getVendorsForPurchase,
  translateTexts,
  type AccountSubjectItem,
  type BankAccount,
  type ExpenseAccrualPlanItem,
} from "@/lib/api-client"
import { translateApiMessage } from "@/lib/translate-api-message"
import { WithdrawalManagementTab } from "@/components/tabs/withdrawal-management-tab"
import { ExpenseRegisterSearchTab } from "@/components/tabs/expense-register-search-tab"
import { CardManagementTab } from "@/components/tabs/card-management-tab"
import { useSearchParams, useRouter } from "next/navigation"

function todayStrBkk() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
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
  const { stores } = useStoreList()
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialTab = searchParams.get("tab") === "expenseRegister" ? "expenseRegister" : searchParams.get("tab") === "expenseSearch" ? "expenseSearch" : searchParams.get("tab") === "card" ? "card" : "plan"
  const [tab, setTab] = React.useState<"plan" | "expenseRegister" | "expenseSearch" | "card">(initialTab)

  React.useEffect(() => {
    const tabParam = searchParams.get("tab")
    if (tabParam === "expenseRegister") setTab("expenseRegister")
    if (tabParam === "expenseSearch") setTab("expenseSearch")
    if (tabParam === "card") setTab("card")
  }, [searchParams])
  const [startStr, setStartStr] = React.useState(todayStrBkk)
  const [endStr, setEndStr] = React.useState(todayStrBkk)
  const [loading, setLoading] = React.useState(false)
  const [expensePlans, setExpensePlans] = React.useState<ExpenseAccrualPlanItem[]>([])
  const [purchasePlans, setPurchasePlans] = React.useState<ExpenseAccrualPlanItem[]>([])
  const [totals, setTotals] = React.useState({ expensePlanned: 0, expenseRemaining: 0, logisticsRemaining: 0 })
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
  const [editingPlanRow, setEditingPlanRow] = React.useState<ExpenseAccrualPlanItem | null>(null)
  const [editPlanAmount, setEditPlanAmount] = React.useState("")
  const [editPlanExpenseDate, setEditPlanExpenseDate] = React.useState("")
  const [editPlanDueDate, setEditPlanDueDate] = React.useState("")
  const [editPlanMemo, setEditPlanMemo] = React.useState("")
  const [editPlanPayeeCode, setEditPlanPayeeCode] = React.useState("")
  const [editPlanPayeeName, setEditPlanPayeeName] = React.useState("")
  const [editPlanAccountSubjectId, setEditPlanAccountSubjectId] = React.useState<string>("")
  const [editPlanStoreName, setEditPlanStoreName] = React.useState("")
  const [editPlanSaving, setEditPlanSaving] = React.useState(false)
  const [deletingPlanId, setDeletingPlanId] = React.useState<number | null>(null)
  const [linkBankRow, setLinkBankRow] = React.useState<ExpenseAccrualPlanItem | null>(null)
  const [unlinkedList, setUnlinkedList] = React.useState<{ id: number; transDate: string; amount: number; memo: string }[]>([])
  const [unlinkedLoading, setUnlinkedLoading] = React.useState(false)
  const [approvingAll, setApprovingAll] = React.useState(false)
  const [rejectingAll, setRejectingAll] = React.useState(false)
  const [cleaningNoStore, setCleaningNoStore] = React.useState(false)
  const [vendors, setVendors] = React.useState<{ code: string; name: string; bankAccountNo?: string | null }[]>([])
  const [subjects, setSubjects] = React.useState<AccountSubjectItem[]>([])
  const [subjectEnglishNames, setSubjectEnglishNames] = React.useState<Record<number, string>>({})
  const [memoTransMap, setMemoTransMap] = React.useState<Record<string, string>>({})
  const vendorBankMap = React.useMemo(() => {
    const m: Record<string, string> = {}
    for (const v of vendors) {
      if (v.code && v.bankAccountNo) m[v.code] = v.bankAccountNo
    }
    return m
  }, [vendors])

  React.useEffect(() => {
    getVendorsForPurchase().catch(() => []).then(setVendors)
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
    const memos = [...new Set(items.map((r) => (r.memo || "").trim()).filter(Boolean))]
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
  }, [expensePlans, purchasePlans, unlinkedList, lang])

  const getMemo = React.useCallback((memo: string | undefined) => (memo && memoTransMap[memo]) || memo || "-", [memoTransMap])

  const loadPlans = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await getExpensePaymentPlan({
        startStr,
        endStr,
        userRole: auth?.role,
      })
      setExpensePlans(res.expensePlans || [])
      setPurchasePlans(res.purchasePlans || [])
      setTotals(res.totals || { expensePlanned: 0, expenseRemaining: 0, logisticsRemaining: 0 })
    } catch {
      setExpensePlans([])
      setPurchasePlans([])
      setTotals({ expensePlanned: 0, expenseRemaining: 0, logisticsRemaining: 0 })
    } finally {
      setLoading(false)
    }
  }, [startStr, endStr, auth?.role])

  React.useEffect(() => {
    loadPlans()
  }, [loadPlans])

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
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
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
      await appAlert(t("pettyAlertAmount") || "금액을 입력해 주세요.")
      return
    }
    if (method === "bank" && !payBankById[row.id]) {
      await appAlert(t("bankAccount") || "계좌")
      return
    }
    if (method === "petty" && !payStoreById[row.id]) {
      await appAlert(t("recFilterStoreSelect") || "매장 선택")
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
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
        return
      }
      setApprovalEditById((prev) => ({ ...prev, [row.id]: false }))
      await loadPlans()
    } finally {
      setPayingId(null)
    }
  }

  const renderStatus = (status: ExpenseAccrualPlanItem["status"]) => {
    if (status === "paid") return t("payStatusPaid") || "지급"
    if (status === "approved") return t("att_approved") || "승인"
    if (status === "rejected") return t("att_rejected") || "반려"
    return t("payStatusPlanned") || "요청"
  }

  const renderWithdrawalType = (cat?: string) => {
    const c = String(cat || "").toLowerCase()
    const map: Record<string, string> = {
      purchase_payment: t("wm_purchase") || "매입 대금",
      purchase_advance: t("wm_advance") || "매입 선급",
      expense: t("wm_expense") || "경비",
      expense_advance: t("wm_advance") || "경비 선급",
      fixed_asset: t("wm_fixed_asset") || "고정자산",
      transfer: t("wm_transfer") || "이체",
      tax_vat: t("wm_tax_vat") || "부가세",
      tax_withholding: t("wm_tax_withholding") || "원천세",
      tax_corporate: t("wm_tax_corporate") || "법인세",
      loan_repayment: t("wm_loan_repayment") || "대출 상환",
      loan_given: t("wm_loan_given") || "대여",
      correction: t("wm_correction") || "정정",
      dividend: t("wm_dividend") || "배당/사유 인출",
    }
    return map[c] || (t("wm_expense") || "경비")
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

  const planStoreOptions = React.useMemo(
    () =>
      Array.from(
        new Set(
          [...(expensePlans || []), ...(purchasePlans || [])]
            .map((r) => String(r.storeName || "").trim())
            .filter(Boolean)
        )
      ).sort(),
    [expensePlans, purchasePlans]
  )

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

  const purchasePlansByStore = React.useMemo(() => {
    const map = new Map<string, typeof filteredPurchasePlans>()
    for (const r of filteredPurchasePlans) {
      const key = String(r.storeName || "").trim() || "—"
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] === "—" ? 1 : b[0] === "—" ? -1 : a[0].localeCompare(b[0])))
  }, [filteredPurchasePlans])

  const isHqStoreName = React.useCallback((storeName?: string) => {
    const s = String(storeName || "").trim().toLowerCase()
    if (!s) return false // 매장 미선택(—)은 본사로 간주하지 않음 → officer도 승인 가능
    return s.includes("office") || s.includes("본사") || s.includes("hq") || s.includes("오피스")
  }, [])

  const canApproveByPolicy = React.useCallback((row: ExpenseAccrualPlanItem) => {
    const role = String(auth?.role || "").toLowerCase()
    const isDirector = role.includes("director")
    const isOfficer = role.includes("officer")
    if (isHqStoreName(row.storeName)) return isDirector
    return isOfficer
  }, [auth?.role, isHqStoreName])

  const approvablePlansForDay = React.useMemo(
    () =>
      (filteredExpensePlans || []).filter((r) => {
        const rowDate = String(r.dueDate || r.expenseDate || "").slice(0, 10)
        return r.status === "planned" && canApproveByPolicy(r) && rowDate === startStr
      }),
    [filteredExpensePlans, canApproveByPolicy, startStr]
  )

  const handleApprove = React.useCallback(async (row: ExpenseAccrualPlanItem, action: "approve" | "reject") => {
    const note = action === "reject"
      ? await appPrompt(t("memo") || "메모", "") || ""
      : ""
    const ok = action === "approve"
      ? await appConfirm(t("confirmApprove") || "승인하시겠습니까?")
      : await appConfirm(t("confirmReject") || "반려하시겠습니까?")
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
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
        return
      }
      setPayEditorOpenById((prev) => ({ ...prev, [row.id]: false }))
      await loadPlans()
    } finally {
      setPayingId(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- t 변경 시마다 재생성 시 무한 루프 방지
  }, [auth?.role, auth?.user, loadPlans])

  const navigateToEditInRegister = React.useCallback(
    (row: ExpenseAccrualPlanItem) => {
      const q = new URLSearchParams()
      q.set("tab", "expenseRegister")
      q.set("editAccrualId", String(row.id))
      q.set("amount", String(row.plannedAmount || 0))
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
      router.push(`/admin/expense-management?${q.toString()}`)
    },
    [router]
  )

  const openEditPlan = React.useCallback((row: ExpenseAccrualPlanItem) => {
    setEditingPlanRow(row)
    setEditPlanAmount(String(row.plannedAmount ?? ""))
    setEditPlanExpenseDate((row.expenseDate || "").slice(0, 10))
    setEditPlanDueDate((row.dueDate || "").slice(0, 10))
    setEditPlanMemo(row.memo || "")
    setEditPlanPayeeCode(row.payeeCode || "")
    setEditPlanPayeeName(row.payeeName || "")
    setEditPlanAccountSubjectId(row.accountSubjectId ? String(row.accountSubjectId) : "__none__")
    setEditPlanStoreName(row.storeName || "")
  }, [])

  const handleSavePlanEdit = React.useCallback(async () => {
    if (!editingPlanRow?.id) return
    const amount = Number(String(editPlanAmount || "").replace(/,/g, ""))
    if (!amount || amount <= 0) {
      await appAlert(t("pettyAlertAmount") || "금액을 입력해 주세요.")
      return
    }
    if (!editPlanExpenseDate || !/^\d{4}-\d{2}-\d{2}$/.test(editPlanExpenseDate)) {
      await appAlert(t("msg_select_date") || "날짜를 선택해 주세요.")
      return
    }
    if (!editPlanStoreName?.trim()) {
      await appAlert(t("expenseStoreSelect") || "매장을 선택해 주세요.")
      return
    }
    setEditPlanSaving(true)
    try {
      const res = await updateExpenseAccrual({
        expenseAccrualId: editingPlanRow.id,
        amount,
        expenseDate: editPlanExpenseDate,
        dueDate: editPlanDueDate || undefined,
        memo: editPlanMemo || undefined,
        payeeCode: editPlanPayeeCode || undefined,
        payeeName: editPlanPayeeName || undefined,
        accountSubjectId: editPlanAccountSubjectId && editPlanAccountSubjectId !== "__none__" ? Number(editPlanAccountSubjectId) : null,
        storeName: editPlanStoreName?.trim() || undefined,
        userRole: auth?.role,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
        return
      }
      setEditingPlanRow(null)
      await loadPlans()
    } finally {
      setEditPlanSaving(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- t 변경 시마다 재생성 시 무한 루프 방지
  }, [auth?.role, editPlanAccountSubjectId, editPlanAmount, editPlanDueDate, editPlanExpenseDate, editPlanMemo, editPlanPayeeCode, editPlanPayeeName, editPlanStoreName, editingPlanRow?.id, loadPlans])

  const handleDeletePlan = React.useCallback(async (row: ExpenseAccrualPlanItem) => {
    if (!row?.id) return
    const ok = await appConfirm(t("emp_confirm_delete") || "삭제하시겠습니까?")
    if (!ok) return
    setDeletingPlanId(row.id)
    try {
      const res = await deleteExpenseAccrual({
        expenseAccrualId: row.id,
        userRole: auth?.role,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("msg_delete_fail"))
        return
      }
      await loadPlans()
    } finally {
      setDeletingPlanId(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- t 변경 시마다 재생성 시 무한 루프 방지
  }, [auth?.role, loadPlans])

  const handleCleanNoStore = React.useCallback(async () => {
    const ok = await appConfirm(t("expenseCleanNoStoreConfirm") || "매장 미선택인 지급예정을 모두 삭제합니다. 진행할까요?")
    if (!ok) return
    setCleaningNoStore(true)
    try {
      const res = await deleteExpenseAccrualsWithoutStore({ userRole: auth?.role })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
        return
      }
      await appAlert(res.message || `${res.deletedCount ?? 0}건 삭제되었습니다.`)
      await loadPlans()
    } finally {
      setCleaningNoStore(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- t 변경 시마다 재생성 시 무한 루프 방지
  }, [auth?.role, loadPlans])

  const handleApproveAllForDay = React.useCallback(async () => {
    if (approvablePlansForDay.length === 0) {
      await appAlert(t("payableEmpty") || "승인할 항목이 없습니다.")
      return
    }
    const ok = await appConfirm(
      `${startStr} ${t("expenseApproveAllDay") || "당일 전체 승인"} (${approvablePlansForDay.length}${t("receivPayCount") || "건"})`
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
          await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
          break
        }
      }
      await loadPlans()
    } finally {
      setApprovingAll(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- t 변경 시마다 재생성 시 무한 루프 방지
  }, [approvablePlansForDay, auth?.role, auth?.user, loadPlans, startStr])

  const handleRejectAllForDay = React.useCallback(async () => {
    if (approvablePlansForDay.length === 0) {
      await appAlert(t("payableEmpty") || "반려할 항목이 없습니다.")
      return
    }
    const ok = await appConfirm(
      `${startStr} ${t("expenseRejectAllDay") || "당일 전체 반려"} (${approvablePlansForDay.length}${t("receivPayCount") || "건"})`
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
          await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
          break
        }
      }
      await loadPlans()
    } finally {
      setRejectingAll(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- t 변경 시마다 재생성 시 무한 루프 방지
  }, [approvablePlansForDay, auth?.role, auth?.user, loadPlans, startStr])

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "plan" | "expenseRegister" | "expenseSearch" | "card")} className={adminTabsRootCn}>
        <div className={adminTabsBarCn}>
          <div className={adminTabsScrollCn}>
            <TabsList className={adminTabsListRowCn}>
              <TabsTrigger value="plan" className={adminTabsTriggerCn}>
                {t("expensePlanTab") || "지급예정"}
              </TabsTrigger>
              <TabsTrigger value="expenseRegister" className={adminTabsTriggerCn}>
                {t("expenseRegisterTabTitle") || "지출 등록"}
              </TabsTrigger>
              <TabsTrigger value="expenseSearch" className={adminTabsTriggerCn}>
                {t("expenseRegisterSearchTab") || "지출 검색"}
              </TabsTrigger>
              <TabsTrigger value="card" className={adminTabsTriggerCn}>
                {t("cardManagementTab") || "카드 관리"}
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="plan" className={cn(adminTabsContentCn, "space-y-4")}>
          <div className="flex flex-wrap items-end gap-2">
            <Input type="date" value={startStr} onChange={(e) => setStartStr(e.target.value)} className="w-[140px] h-9" />
            <span className="text-xs">~</span>
            <Input type="date" value={endStr} onChange={(e) => setEndStr(e.target.value)} className="w-[140px] h-9" />
            <Select value={planTypeFilter} onValueChange={setPlanTypeFilter}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder={t("bankCategoryLabel") || "유형"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{(t("all") || "전체")} {(t("bankCategoryLabel") || "유형")}</SelectItem>
                {withdrawalTypeOptions.map((cat) => (
                  <SelectItem key={cat} value={cat.toLowerCase()}>
                    {renderWithdrawalType(cat)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={planStoreFilter} onValueChange={setPlanStoreFilter}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder={t("recFilterStoreSelect") || "매장 선택"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{(t("all") || "전체")} {(t("store") || "매장")}</SelectItem>
                {planStoreOptions.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={loadPlans} disabled={loading} className="h-9">
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
              {approvingAll ? (t("loading") || "...") : (t("expenseApproveAllDay") || "당일 전체 승인")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15"
              onClick={handleRejectAllForDay}
              disabled={rejectingAll || approvablePlansForDay.length === 0}
            >
              {rejectingAll ? (t("loading") || "...") : (t("expenseRejectAllDay") || "당일 전체 반려")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15"
              onClick={handleCleanNoStore}
              disabled={cleaningNoStore}
              title={t("expenseCleanNoStoreHint") || "매장이 선택되지 않은 지급예정을 강제 삭제"}
            >
              {cleaningNoStore ? (t("loading") || "...") : (t("expenseCleanNoStore") || "매장 미선택 정리")}
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{t("expensePlannedTotal") || "일반지출 발생합계"}</div>
              <div className="text-lg font-semibold tabular-nums">฿{(totals.expensePlanned || 0).toLocaleString()}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{t("expenseRemainingTotal") || "일반지출 미지급합계"}</div>
              <div className="text-lg font-semibold tabular-nums">฿{(totals.expenseRemaining || 0).toLocaleString()}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{t("expenseLogisticsPlanTotal") || "물류 지출 지급예정"}</div>
              <div className="text-lg font-semibold tabular-nums">฿{(totals.logisticsRemaining || 0).toLocaleString()}</div>
            </div>
            <div className="rounded-lg border p-3 bg-primary/5">
              <div className="text-xs text-muted-foreground">{t("total") || "합계"}</div>
              <div className="text-lg font-bold tabular-nums text-primary">฿{(totals.expenseRemaining + totals.logisticsRemaining).toLocaleString()}</div>
            </div>
          </div>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm font-semibold mb-2">{t("expenseNonLogisticsSection") || "일반 지출 지급예정"}</div>
              {filteredExpensePlans.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6">{t("payableEmpty") || "조회된 미지급금이 없습니다."}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm table-fixed">
                    <colgroup>
                      <col style={{ width: "96px" }} />
                      <col style={{ width: "140px" }} />
                      <col style={{ width: "220px" }} />
                      <col style={{ width: "90px" }} />
                      <col style={{ width: "100px" }} />
                      <col style={{ width: "118px" }} />
                      <col style={{ width: "200px" }} />
                      <col style={{ width: "80px" }} />
                      <col style={{ width: "116px" }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-center py-2 px-2">{t("bankCategoryLabel") || "유형"}</th>
                        <th className="text-center py-2 px-2">{t("accountSubject") || "계정과목"}</th>
                        <th className="text-center py-2 px-2">{tt("vendor", "매입처")}</th>
                        <th className="text-center py-2 px-2">{t("date") || "날짜"}</th>
                        <th className="text-center py-2 px-2">{t("amount") || "금액"}</th>
                        <th className="text-center py-2 px-2">{t("payColRemainingPayable") || "미지급액"}</th>
                        <th className="text-center py-2 px-2">{t("memo") || "메모"}</th>
                        <th className="text-center py-2 px-2">{tt("pay_actions", "실행")}</th>
                        <th className="text-center py-2 px-2">{tt("att_approval", "승인")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expensePlansByStore.map(([storeLabel, rows]) => (
                        <React.Fragment key={storeLabel}>
                          <tr className="border-b bg-muted/30">
                            <td colSpan={9} className="py-2 px-3 text-sm font-medium">
                              {(t("store") || "매장")}: {storeLabel}
                            </td>
                          </tr>
                          {rows.map((r) => (
                            <React.Fragment key={r.id}>
                              <tr className="border-b">
                                {(() => {
                                  const codeLabel = r.payeeCode && !r.payeeCode.startsWith("auto_") ? ` (${r.payeeCode})` : ""
                                  return (
                                    <>
                                      <td className="py-2 px-2 text-center">{renderWithdrawalType(r.withdrawalCategory)}</td>
                                      <td className="py-2 px-2 text-muted-foreground whitespace-nowrap truncate">{accountSubjectLabel(r.accountSubjectId) || "-"}</td>
                                      <td className="py-2 px-2 whitespace-nowrap truncate">{r.payeeName}{codeLabel}</td>
                                    </>
                                  )
                                })()}
                            <td className="py-2 px-2 text-center whitespace-nowrap">{r.dueDate || r.expenseDate || "-"}</td>
                            <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">฿{(r.plannedAmount || 0).toLocaleString()}</td>
                            <td className="py-2 px-2 text-right tabular-nums font-semibold whitespace-nowrap">฿{(r.remainingAmount || 0).toLocaleString()}</td>
                            <td className="py-2 px-2 text-muted-foreground whitespace-nowrap truncate" title={r.memo || ""}>{getMemo(r.memo)}</td>
                            <td className="py-2 px-2 text-center">
                              {r.status === "planned" ? (
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-7 w-7"
                                  title={tt("btnEdit", "수정")}
                                  onClick={() => navigateToEditInRegister(r)}
                                  disabled={payingId === r.id || deletingPlanId === r.id}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              ) : r.status === "approved" && r.remainingAmount > 0 ? (
                                <Button
                                  size="sm"
                                  variant={payEditorOpenById[r.id] ? "outline" : "default"}
                                  className="h-7 px-2 text-xs"
                                  onClick={() =>
                                    setPayEditorOpenById((prev) => ({ ...prev, [r.id]: !prev[r.id] }))
                                  }
                                  disabled={payingId === r.id}
                                >
                                  {payEditorOpenById[r.id] ? tt("btnClose", "닫기") : tt("payBtn", "지급")}
                                </Button>
                              ) : !String(r.storeName || "").trim() ? (
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-7 w-7 border-destructive/40 text-destructive"
                                  title={t("delete") || "삭제"}
                                  onClick={() => handleDeletePlan(r)}
                                  disabled={payingId === r.id || deletingPlanId === r.id}
                                >
                                  {deletingPlanId === r.id ? <span className="text-[10px]">...</span> : <Trash2 className="h-3.5 w-3.5" />}
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {canApproveByPolicy(r) && (
                                  (r.status === "planned" || approvalEditById[r.id]) && r.status !== "paid" ? (
                                  <>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      className="h-7 w-7 border-primary/40 text-primary"
                                      onClick={() => handleApprove(r, "approve")}
                                      disabled={payingId === r.id}
                                      title={tt("att_approve", "승인")}
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      className="h-7 w-7 border-destructive/40 text-destructive"
                                      onClick={() => handleApprove(r, "reject")}
                                      disabled={payingId === r.id}
                                      title={tt("att_reject", "반려")}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      className="h-7 w-7 border-destructive/40 text-destructive"
                                      title={t("delete") || "삭제"}
                                      onClick={() => handleDeletePlan(r)}
                                      disabled={payingId === r.id || deletingPlanId === r.id}
                                    >
                                      {deletingPlanId === r.id ? <span className="text-[10px]">...</span> : <Trash2 className="h-3.5 w-3.5" />}
                                    </Button>
                                  </>
                                  ) : (
                                    (r.status === "approved" || r.status === "rejected") && (
                                      <div className="flex flex-col items-center gap-1">
                                        {r.status === "approved" ? (
                                          <span className="text-xs text-primary">{tt("att_approved", "승인 완료")}</span>
                                        ) : (
                                          <span className="text-xs text-destructive">{tt("att_rejected", "반려")}</span>
                                        )}
                                        <div className="flex items-center gap-1">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-6 px-2 text-[11px]"
                                            title={tt("btnEdit", "수정")}
                                            onClick={() =>
                                              setApprovalEditById((prev) => ({ ...prev, [r.id]: true }))
                                            }
                                            disabled={payingId === r.id}
                                          >
                                            <Pencil className="h-3 w-3 mr-1" />
                                            {tt("btnEdit", "수정")}
                                          </Button>
                                          {r.status === "rejected" && (
                                            <Button
                                              size="icon"
                                              variant="outline"
                                              className="h-7 w-7 border-destructive/40 text-destructive"
                                              title={t("delete") || "삭제"}
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
                                  <span className="text-xs text-primary">{tt("att_approved", "승인 완료")}</span>
                                ) : !canApproveByPolicy(r) && r.status === "rejected" ? (
                                  <span className="text-xs text-destructive">{tt("att_rejected", "반려")}</span>
                                ) : r.status === "planned" && !approvalEditById[r.id] && !canApproveByPolicy(r) ? (
                                  <span className="text-xs text-muted-foreground">-</span>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                          {r.remainingAmount > 0 && r.status === "approved" && payEditorOpenById[r.id] && (
                            <tr className="border-b bg-muted/20">
                              <td className="py-2 px-2" colSpan={9}>
                                <div className="flex flex-wrap items-end gap-2">
                                  <Select
                                    value={payMethodById[r.id] || "bank"}
                                    onValueChange={(v) => setPayMethodById((p) => ({ ...p, [r.id]: v as "bank" | "petty" }))}
                                  >
                                    <SelectTrigger className="w-[120px] h-9">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="bank">{t("bankTitle") || "통장"}</SelectItem>
                                      <SelectItem value="petty">{t("adminPettyCash") || "패티캐쉬"}</SelectItem>
                                    </SelectContent>
                                  </Select>

                                  {(payMethodById[r.id] || "bank") === "bank" ? (
                                    <Select
                                      value={payBankById[r.id] || ""}
                                      onValueChange={(v) => setPayBankById((p) => ({ ...p, [r.id]: v }))}
                                    >
                                      <SelectTrigger className="w-[220px] h-9">
                                        <SelectValue placeholder={t("bankAccount") || "계좌"} />
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
                                        <SelectValue placeholder={t("recFilterStoreSelect") || "매장 선택"} />
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
                                    placeholder={t("memo") || "메모"}
                                  />
                                  <Button size="sm" onClick={() => handlePay(r)} disabled={payingId === r.id} className="h-9">
                                    <Wallet className="h-4 w-4 mr-1" />
                                    {t("addPayment") || "지급 입력"}
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
                                      {t("expenseLinkBank") || "통장 거래와 연결"}
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
              <div className="text-sm font-semibold mb-2">{t("expenseLogisticsPlanSection") || "물류 지출 지급예정"}</div>
              {filteredPurchasePlans.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6">{t("payableEmpty") || "조회된 물류 지출 지급예정이 없습니다."}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm table-fixed">
                    <colgroup>
                      <col style={{ width: "96px" }} />
                      <col style={{ width: "140px" }} />
                      <col style={{ width: "220px" }} />
                      <col style={{ width: "90px" }} />
                      <col style={{ width: "100px" }} />
                      <col style={{ width: "118px" }} />
                      <col style={{ width: "200px" }} />
                      <col style={{ width: "80px" }} />
                      <col style={{ width: "116px" }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-center py-2 px-2">{t("bankCategoryLabel") || "유형"}</th>
                        <th className="text-center py-2 px-2">{t("accountSubject") || "계정과목"}</th>
                        <th className="text-center py-2 px-2">{tt("vendor", "매입처")}</th>
                        <th className="text-center py-2 px-2">{t("date") || "날짜"}</th>
                        <th className="text-center py-2 px-2">{t("amount") || "금액"}</th>
                        <th className="text-center py-2 px-2">{t("payColRemainingPayable") || "미지급액"}</th>
                        <th className="text-center py-2 px-2">{t("memo") || "메모"}</th>
                        <th className="text-center py-2 px-2">{tt("pay_actions", "실행")}</th>
                        <th className="text-center py-2 px-2">{tt("att_approval", "승인")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchasePlansByStore.map(([storeLabel, rows]) => (
                        <React.Fragment key={storeLabel}>
                          <tr className="border-b bg-muted/30">
                            <td colSpan={9} className="py-2 px-3 text-sm font-medium">
                              {(t("store") || "매장")}: {storeLabel}
                            </td>
                          </tr>
                          {rows.map((r) => (
                            <React.Fragment key={r.id}>
                              <tr className="border-b">
                                <td className="py-2 px-2 text-center">{renderWithdrawalType(r.withdrawalCategory)}</td>
                                <td className="py-2 px-2 text-muted-foreground whitespace-nowrap truncate">{accountSubjectLabel(r.accountSubjectId) || "-"}</td>
                                <td className="py-2 px-2 whitespace-nowrap truncate">{r.payeeCode && !r.payeeCode.startsWith("auto_") ? `${r.payeeName} (${r.payeeCode})` : r.payeeName}</td>
                                <td className="py-2 px-2 text-center whitespace-nowrap">{r.dueDate || r.expenseDate || "-"}</td>
                                <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">฿{(r.plannedAmount || 0).toLocaleString()}</td>
                                <td className="py-2 px-2 text-right tabular-nums font-semibold whitespace-nowrap">฿{(r.remainingAmount || 0).toLocaleString()}</td>
                                <td className="py-2 px-2 text-muted-foreground whitespace-nowrap truncate" title={r.memo || ""}>{getMemo(r.memo)}</td>
                                <td className="py-2 px-2 text-center">
                                  {r.status === "planned" ? (
                                    <Button size="icon" variant="outline" className="h-7 w-7" title={tt("btnEdit", "수정")} onClick={() => navigateToEditInRegister(r)} disabled={payingId === r.id || deletingPlanId === r.id}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  ) : r.status === "approved" && r.remainingAmount > 0 ? (
                                    <Button size="sm" variant={payEditorOpenById[r.id] ? "outline" : "default"} className="h-7 px-2 text-xs" onClick={() => setPayEditorOpenById((prev) => ({ ...prev, [r.id]: !prev[r.id] }))} disabled={payingId === r.id}>
                                      {payEditorOpenById[r.id] ? tt("btnClose", "닫기") : tt("payBtn", "지급")}
                                    </Button>
                                  ) : !String(r.storeName || "").trim() ? (
                                    <Button size="icon" variant="outline" className="h-7 w-7 border-destructive/40 text-destructive" title={t("delete") || "삭제"} onClick={() => handleDeletePlan(r)} disabled={payingId === r.id || deletingPlanId === r.id}>
                                      {deletingPlanId === r.id ? <span className="text-[10px]">...</span> : <Trash2 className="h-3.5 w-3.5" />}
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  )}
                                </td>
                                <td className="py-2 px-2 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    {canApproveByPolicy(r) && (r.status === "planned" || approvalEditById[r.id]) && r.status !== "paid" ? (
                                      <>
                                        <Button size="icon" variant="outline" className="h-7 w-7 border-primary/40 text-primary" onClick={() => handleApprove(r, "approve")} disabled={payingId === r.id} title={tt("att_approve", "승인")}>
                                          <Check className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button size="icon" variant="outline" className="h-7 w-7 border-destructive/40 text-destructive" onClick={() => handleApprove(r, "reject")} disabled={payingId === r.id} title={tt("att_reject", "반려")}>
                                          <X className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button size="icon" variant="outline" className="h-7 w-7 border-destructive/40 text-destructive" title={t("delete") || "삭제"} onClick={() => handleDeletePlan(r)} disabled={payingId === r.id || deletingPlanId === r.id}>
                                          {deletingPlanId === r.id ? <span className="text-[10px]">...</span> : <Trash2 className="h-3.5 w-3.5" />}
                                        </Button>
                                      </>
                                    ) : (r.status === "approved" || r.status === "rejected") && (
                                      <div className="flex flex-col items-center gap-1">
                                        {r.status === "approved" ? (
                                          <span className="text-xs text-primary">{tt("att_approved", "승인 완료")}</span>
                                        ) : (
                                          <span className="text-xs text-destructive">{tt("att_rejected", "반려")}</span>
                                        )}
                                        <div className="flex items-center gap-1">
                                          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" title={tt("btnEdit", "수정")} onClick={() => setApprovalEditById((prev) => ({ ...prev, [r.id]: true }))} disabled={payingId === r.id}>
                                            <Pencil className="h-3 w-3 mr-1" />
                                            {tt("btnEdit", "수정")}
                                          </Button>
                                          {r.status === "rejected" && (
                                            <Button size="icon" variant="outline" className="h-7 w-7 border-destructive/40 text-destructive" title={t("delete") || "삭제"} onClick={() => handleDeletePlan(r)} disabled={payingId === r.id || deletingPlanId === r.id}>
                                              {deletingPlanId === r.id ? <span className="text-[10px]">...</span> : <Trash2 className="h-3.5 w-3.5" />}
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    {!canApproveByPolicy(r) && r.status === "approved" && <span className="text-xs text-primary">{tt("att_approved", "승인 완료")}</span>}
                                    {!canApproveByPolicy(r) && r.status === "rejected" && <span className="text-xs text-destructive">{tt("att_rejected", "반려")}</span>}
                                    {r.status === "planned" && !canApproveByPolicy(r) && !approvalEditById[r.id] && <span className="text-xs text-muted-foreground">-</span>}
                                  </div>
                                </td>
                              </tr>
                              {r.remainingAmount > 0 && r.status === "approved" && payEditorOpenById[r.id] && (
                                <tr className="border-b bg-muted/20">
                                  <td className="py-2 px-2" colSpan={9}>
                                    <div className="flex flex-wrap items-end gap-2">
                                      <Select value={payMethodById[r.id] || "bank"} onValueChange={(v) => setPayMethodById((p) => ({ ...p, [r.id]: v as "bank" | "petty" }))}>
                                        <SelectTrigger className="w-[120px] h-9">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="bank">{t("bankTitle") || "통장"}</SelectItem>
                                          <SelectItem value="petty">{t("adminPettyCash") || "패티캐쉬"}</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      {(payMethodById[r.id] || "bank") === "bank" ? (
                                        <Select value={payBankById[r.id] || ""} onValueChange={(v) => setPayBankById((p) => ({ ...p, [r.id]: v }))}>
                                          <SelectTrigger className="w-[220px] h-9">
                                            <SelectValue placeholder={t("bankAccount") || "계좌"} />
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
                                            <SelectValue placeholder={t("recFilterStoreSelect") || "매장 선택"} />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {(stores || []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                          </SelectContent>
                                        </Select>
                                      )}
                                      <Input value={payAmountById[r.id] ?? String(r.remainingAmount)} onChange={(e) => setPayAmountById((p) => ({ ...p, [r.id]: e.target.value }))} className="w-[120px] h-9 text-right" type="number" />
                                      <Input type="date" value={payDateById[r.id] || todayStrBkk()} onChange={(e) => setPayDateById((p) => ({ ...p, [r.id]: e.target.value }))} className="w-[140px] h-9" />
                                      <Input value={payMemoById[r.id] || ""} onChange={(e) => setPayMemoById((p) => ({ ...p, [r.id]: e.target.value }))} className="w-[220px] h-9" placeholder={t("memo") || "메모"} />
                                      <Button size="sm" onClick={() => handlePay(r)} disabled={payingId === r.id} className="h-9">
                                        <Wallet className="h-4 w-4 mr-1" />
                                        {t("addPayment") || "지급 입력"}
                                      </Button>
                                      {(payMethodById[r.id] || "bank") === "bank" && payBankById[r.id] && (
                                        <Button size="sm" variant="outline" onClick={() => openLinkBank(r)} disabled={payingId === r.id} className="h-9">
                                          <Link2 className="h-4 w-4 mr-1" />
                                          {t("expenseLinkBank") || "통장 거래와 연결"}
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
        </TabsContent>

        <TabsContent value="expenseRegister" className={adminTabsContentCn}>
          <WithdrawalManagementTab />
        </TabsContent>

        <TabsContent value="expenseSearch" className={adminTabsContentCn}>
          <ExpenseRegisterSearchTab />
        </TabsContent>

        <TabsContent value="card" className={adminTabsContentCn}>
          <CardManagementTab />
        </TabsContent>
      </Tabs>

      <Dialog open={!!editingPlanRow} onOpenChange={(open) => !open && setEditingPlanRow(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tt("btnEdit", "수정")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("pettyColAmount") || "금액"}</label>
              <Input value={editPlanAmount} onChange={(e) => setEditPlanAmount(e.target.value)} type="number" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("date") || "날짜"}</label>
              <Input value={editPlanExpenseDate} onChange={(e) => setEditPlanExpenseDate(e.target.value)} type="date" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{tt("payableDate", "지급예정일")}</label>
              <Input value={editPlanDueDate} onChange={(e) => setEditPlanDueDate(e.target.value)} type="date" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("store") || "매장"}</label>
              <Select value={editPlanStoreName || (stores?.[0] ?? "")} onValueChange={(v) => setEditPlanStoreName(v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("store") || "매장"} />
                </SelectTrigger>
                <SelectContent>
                  {(stores || []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("vendor") || "거래처"}</label>
              <Input value={editPlanPayeeCode} onChange={(e) => setEditPlanPayeeCode(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("expensePayeeName") || "지급처명"}</label>
              <Input value={editPlanPayeeName} onChange={(e) => setEditPlanPayeeName(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">{t("accountSubject") || "계정과목"}</label>
              <Select value={editPlanAccountSubjectId || "__none__"} onValueChange={(v) => setEditPlanAccountSubjectId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("accountSubject") || "계정과목"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.code} {s.nameEn || (s.id != null ? subjectEnglishNames[s.id] : undefined) || s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">{t("memo") || "메모"}</label>
              <Input value={editPlanMemo} onChange={(e) => setEditPlanMemo(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingPlanRow(null)}>{t("cancel") || "취소"}</Button>
            <Button onClick={handleSavePlanEdit} disabled={editPlanSaving}>
              {editPlanSaving ? "..." : (t("btnSave") || "저장")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linkBankRow} onOpenChange={(open) => !open && setLinkBankRow(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("expenseLinkBankTitle") || "통장 거래 선택"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            {t("expenseLinkBankHint") || "금액·날짜가 일치하는 미연결 출금 거래를 선택하세요."}
          </p>
          {unlinkedLoading ? (
            <p className="text-sm py-4">{t("loading")}</p>
          ) : unlinkedList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{t("expenseLinkBankEmpty") || "일치하는 미연결 통장 거래가 없습니다."}</p>
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
