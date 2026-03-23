"use client"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Wallet, Camera, ArrowLeft } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { useStoreList } from "@/lib/api-client"
import {
  addExpenseAccrual,
  executeWithdrawal,
  registerExpenseFromBankTransaction,
  registerPurchaseFromBankTransaction,
  updateExpenseRegisterItem,
  updateExpenseAccrual,
  getAccountSubjects,
  getBankAccounts,
  getCardAccounts,
  getVendorsForPurchase,
  getAdminEmployeeList,
  getInboundBatchesForLink,
  saveBankTransactionInboundLinks,
  translateTexts,
  type AccountSubjectItem,
  type BankAccount,
  type CardAccount,
  type InboundBatchForLink,
} from "@/lib/api-client"
import { translateApiMessage } from "@/lib/translate-api-message"
import { compressImageForUpload } from "@/lib/utils"
import { useSearchParams, useRouter } from "next/navigation"

function todayStrBkk() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

const CATEGORY_MAIN_OPTIONS = [
  { value: "purchase", labelKey: "wm_purchase", sub: ["normal", "advance"] },
  { value: "expense", labelKey: "wm_expense", sub: ["normal", "advance"] },
  { value: "fixed_asset", labelKey: "wm_fixed_asset", sub: [] },
  { value: "transfer", labelKey: "wm_transfer", sub: [] },
  { value: "tax", labelKey: "wm_tax", sub: ["vat", "withholding"] },
  { value: "loan", labelKey: "wm_loan", sub: ["repayment", "given"] },
  { value: "correction", labelKey: "wm_correction", sub: [] },
  { value: "dividend", labelKey: "wm_dividend", sub: [] },
] as const

export function WithdrawalManagementTab() {
  const { lang } = useLang()
  const t = useT(lang)
  const tt = React.useCallback((key: string, fallback: string) => {
    const v = t(key)
    if (!v || v === key) return fallback
    return v
  }, [t])
  const { auth } = useAuth()
  const { stores } = useStoreList()

  const [paymentMethod, setPaymentMethod] = React.useState<"bank" | "petty" | "card">("bank")
  const [transferToCardAccountId, setTransferToCardAccountId] = React.useState<string>("")
  const [amount, setAmount] = React.useState("")
  const [transDate, setTransDate] = React.useState(todayStrBkk)
  const [memo, setMemo] = React.useState("")
  const [bankMemo, setBankMemo] = React.useState("")
  const [storeName, setStoreName] = React.useState("")
  const [categoryMain, setCategoryMain] = React.useState<string>("")
  const [categorySub, setCategorySub] = React.useState<string>("normal")
  const [vendorCode, setVendorCode] = React.useState("")
  const [accountSubjectId, setAccountSubjectId] = React.useState<string>("")
  const [transferBankAccountNo, setTransferBankAccountNo] = React.useState("")
  const [transferBankRecipientName, setTransferBankRecipientName] = React.useState("")
  const [transferToDept, setTransferToDept] = React.useState("")
  const [transferToEmployee, setTransferToEmployee] = React.useState("")
  const [transferToAccountNo, setTransferToAccountNo] = React.useState("")
  const [accountId, setAccountId] = React.useState<string>("")
  const [assetName, setAssetName] = React.useState("")
  const [assetCode, setAssetCode] = React.useState("")
  const [usefulLifeMonths, setUsefulLifeMonths] = React.useState("60")
  const [invoiceReceived, setInvoiceReceived] = React.useState(false)
  const [invoiceNo, setInvoiceNo] = React.useState("")
  const [invoicePhotoFile, setInvoicePhotoFile] = React.useState<File | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [expensePayMode, setExpensePayMode] = React.useState<"immediate" | "later">("later")
  const [payeeCode, setPayeeCode] = React.useState("")
  const [payeeName, setPayeeName] = React.useState("")
  const [payeeManual, setPayeeManual] = React.useState(false)
  const [advanceInstallments, setAdvanceInstallments] = React.useState("1")
  const [advanceInstallmentCurrent, setAdvanceInstallmentCurrent] = React.useState("1")

  const [inboundBatchesForLink, setInboundBatchesForLink] = React.useState<InboundBatchForLink[]>([])
  const [inboundLinkAmounts, setInboundLinkAmounts] = React.useState<Record<number, string>>({})
  const [inboundLinkLoading, setInboundLinkLoading] = React.useState(false)

  const [vendors, setVendors] = React.useState<{ code: string; name: string; bankAccountNo?: string | null }[]>([])
  const [bankAccounts, setBankAccounts] = React.useState<BankAccount[]>([])
  const [cardAccounts, setCardAccounts] = React.useState<CardAccount[]>([])
  const [subjects, setSubjects] = React.useState<AccountSubjectItem[]>([])
  const [subjectEnglishNames, setSubjectEnglishNames] = React.useState<Record<number, string>>({})
  const [employeeList, setEmployeeList] = React.useState<{ store: string; job: string; name: string; accountNumber: string; bankName: string }[]>([])

  const searchParams = useSearchParams()
  const router = useRouter()
  const hasAppliedParams = React.useRef(false)
  const bankTransactionIdParam = searchParams.get("bankTransactionId")
  const editAccrualIdParam = searchParams.get("editAccrualId")
  const isEditAccrualMode = !!editAccrualIdParam && !!Number(editAccrualIdParam)
  const isEditMode = searchParams.get("editMode") === "1" && !!bankTransactionIdParam && !!Number(bankTransactionIdParam)
  const isBankLinkMode = !isEditMode && !!bankTransactionIdParam && !!Number(bankTransactionIdParam)
  const updateExistingParam = searchParams.get("updateExisting") === "1"
  const startStrParam = searchParams.get("startStr")
  const endStrParam = searchParams.get("endStr")
  const returnTabParam = searchParams.get("returnTab")
  const returnOpenRegisterTxIdParam = searchParams.get("openRegisterTxId")

  const mapCategoryToMainSub = React.useCallback((catRaw: string): { main: string; sub: string } => {
    const c = String(catRaw || "").trim().toLowerCase()
    if (c === "purchase_payment") return { main: "purchase", sub: "normal" }
    if (c === "purchase_advance") return { main: "purchase", sub: "advance" }
    if (c === "expense") return { main: "expense", sub: "normal" }
    if (c === "expense_advance") return { main: "expense", sub: "advance" }
    if (c === "fixed_asset") return { main: "fixed_asset", sub: "" }
    if (c === "transfer" || c.startsWith("transfer_")) return { main: "transfer", sub: "" }
    if (c === "loan_repayment") return { main: "loan", sub: "repayment" }
    if (c === "loan_given") return { main: "loan", sub: "given" }
    if (c === "tax_vat") return { main: "tax", sub: "vat" }
    if (c === "tax_withholding") return { main: "tax", sub: "withholding" }
    if (c === "tax_corporate") return { main: "tax", sub: "corporate" }
    if (c === "correction") return { main: "correction", sub: "" }
    if (c === "dividend") return { main: "dividend", sub: "" }
    return { main: "expense", sub: "normal" }
  }, [])

  React.useEffect(() => {
    if (hasAppliedParams.current) return
    const amountParam = searchParams.get("amount")
    const bankMemoParam = searchParams.get("bankMemo")
    const transDateParam = searchParams.get("transDate")
    const accountIdParam = searchParams.get("accountId")
    const btIdParam = searchParams.get("bankTransactionId")
    const vendorCodeParam = searchParams.get("vendorCode")
    const payeeCodeParam = searchParams.get("payeeCode")
    const payeeNameParam = searchParams.get("payeeName")
    const accountSubjectIdParam = searchParams.get("accountSubjectId")
    const bankNoteParam = searchParams.get("bankNote")
    const memoParam = searchParams.get("memo")
    const categoryParam = searchParams.get("category")
    const storeNameParam = searchParams.get("storeName")
    const editAccrualId = searchParams.get("editAccrualId")
    const hasAnyParam =
      amountParam ||
      bankMemoParam ||
      transDateParam ||
      accountIdParam ||
      btIdParam ||
      vendorCodeParam ||
      payeeCodeParam ||
      payeeNameParam ||
      accountSubjectIdParam ||
      bankNoteParam ||
      memoParam ||
      categoryParam ||
      storeNameParam ||
      editAccrualId
    if (hasAnyParam) {
      hasAppliedParams.current = true
      if (amountParam && Number(amountParam) > 0) setAmount(String(Number(amountParam)))
      if (bankMemoParam) setBankMemo(bankMemoParam)
      if (bankNoteParam || memoParam) setMemo(memoParam || bankNoteParam || "")
      if (transDateParam && /^\d{4}-\d{2}-\d{2}$/.test(transDateParam)) setTransDate(transDateParam)
      if (accountIdParam) setAccountId(accountIdParam)
      if (btIdParam) {
        const mapped = mapCategoryToMainSub(categoryParam || "")
        setCategoryMain(mapped.main)
        if (mapped.sub) setCategorySub(mapped.sub)
        setExpensePayMode("immediate")
      }
      if (vendorCodeParam) {
        const vc = vendorCodeParam.trim()
        setVendorCode(vc)
        setPayeeCode(vc)
        setPayeeName(vc)
        setPayeeManual(true)
      }
      if (payeeCodeParam || payeeNameParam) {
        setPayeeCode(payeeCodeParam || payeeNameParam || "")
        setPayeeName(payeeNameParam || payeeCodeParam || "")
        setPayeeManual(true)
      }
      if (accountSubjectIdParam) setAccountSubjectId(accountSubjectIdParam)
      if (categoryParam) {
        const mapped = mapCategoryToMainSub(categoryParam)
        setCategoryMain(mapped.main)
        if (mapped.sub) setCategorySub(mapped.sub)
      }
      if (storeNameParam) setStoreName(storeNameParam)
    }
  }, [searchParams, mapCategoryToMainSub])

  const loadInboundBatchesForLink = React.useCallback(async () => {
    if (categoryMain !== "purchase" || !vendorCode.trim() || isBankLinkMode || isEditMode) {
      setInboundBatchesForLink([])
      setInboundLinkAmounts({})
      return
    }
    setInboundLinkLoading(true)
    try {
      const list = await getInboundBatchesForLink({ vendorCode: vendorCode.trim() })
      setInboundBatchesForLink(list || [])
    } catch {
      setInboundBatchesForLink([])
    } finally {
      setInboundLinkLoading(false)
    }
    setInboundLinkAmounts({})
  }, [categoryMain, vendorCode, isBankLinkMode, isEditMode])

  React.useEffect(() => {
    loadInboundBatchesForLink()
  }, [loadInboundBatchesForLink])

  React.useEffect(() => {
    const vc = searchParams.get("vendorCode")
    if (!vc || !isBankLinkMode || vendors.length === 0) return
    const v = vendors.find((x) => x.code === vc)
    if (v && payeeCode === vc && payeeName === vc) {
      setPayeeName(v.name)
      setPayeeManual(false)
    }
  }, [vendors, searchParams, isBankLinkMode, payeeCode, payeeName])

  React.useEffect(() => {
    // Prevent stale account subject from leaking into non-expense categories.
    if (categoryMain !== "expense" && accountSubjectId) {
      setAccountSubjectId("")
    }
  }, [categoryMain, accountSubjectId])

  const pickOfficeStore = React.useCallback((list: string[]) => {
    if (list.length === 0) return ""
    const office = list.find(
      (s) =>
        ["office", "본사", "오피스"].includes(String(s).toLowerCase()) ||
        String(s).toLowerCase().includes("office")
    )
    return office || list[0]
  }, [])

  const sortedStores = React.useMemo(() => {
    return [...(stores || [])]
      .filter((s) => s && String(s).trim())
      .sort((a, b) => {
        const lower = (x: string) => String(x).toLowerCase()
        const aOffice = ["office", "본사", "오피스"].includes(lower(a)) || lower(a).includes("office")
        const bOffice = ["office", "본사", "오피스"].includes(lower(b)) || lower(b).includes("office")
        if (aOffice && !bOffice) return -1
        if (!aOffice && bOffice) return 1
        return 0
      })
  }, [stores])

  React.useEffect(() => {
    if (sortedStores.length > 0 && !storeName) {
      setStoreName(pickOfficeStore(sortedStores))
    }
  }, [sortedStores, pickOfficeStore])

  React.useEffect(() => {
    getVendorsForPurchase().catch(() => []).then(setVendors)
    getAccountSubjects({ forExpense: true, excludeHeaders: true }).catch(() => []).then(setSubjects)
    getCardAccounts().catch(() => []).then((list) => setCardAccounts(list || []))
  }, [])

  React.useEffect(() => {
    const candidates = subjects
      .filter((s) => !s.nameEn && (s.name || "").trim())
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
    return () => {
      cancelled = true
    }
  }, [subjects])

  const getSubjectLabel = React.useCallback((s: AccountSubjectItem) => {
    return s.nameEn || (s.id != null ? subjectEnglishNames[s.id] : undefined) || s.name
  }, [subjectEnglishNames])

  React.useEffect(() => {
    if (categoryMain === "transfer" && paymentMethod === "petty" && auth?.role) {
      getAdminEmployeeList({ userStore: auth?.store || "", userRole: auth?.role || "" })
        .then((r) => setEmployeeList((r.list || []).map((e) => ({ store: e.store || "", job: e.job || "", name: e.name || "", accountNumber: e.accountNumber || "", bankName: e.bankName || "" }))))
        .catch(() => setEmployeeList([]))
    }
  }, [categoryMain, paymentMethod, auth?.store, auth?.role])

  React.useEffect(() => {
    const list = (stores || []).filter((s) => s && String(s).trim())
    const effectiveStore = storeName || (list[0] ? pickOfficeStore(list) : "")
    getBankAccounts({
      store: effectiveStore || undefined,
      userStore: auth?.store,
      userRole: auth?.role,
    })
      .catch(() => [])
      .then((accounts) => {
        setBankAccounts(accounts || [])
        setAccountId((prev) => {
          const exists = (accounts || []).some((a) => String(a.id) === prev)
          if (exists) return prev
          const first = (accounts || [])[0]
          return first ? String(first.id) : ""
        })
      })
  }, [storeName, auth?.role, auth?.store, stores, pickOfficeStore])

  const currentMain = CATEGORY_MAIN_OPTIONS.find((c) => c.value === categoryMain)
  const hasSub = currentMain && currentMain.sub.length > 0
  const hasTaxSub = categoryMain === "tax"
  const hasLoanSub = categoryMain === "loan"

  const isLaterPayment = !!categoryMain && expensePayMode === "later"

  const resolveWithdrawalCategory = React.useCallback((main: string, sub: string): string => {
    if (main === "purchase") return sub === "advance" ? "purchase_advance" : "purchase_payment"
    if (main === "expense") return sub === "advance" ? "expense_advance" : "expense"
    if (main === "fixed_asset") return "fixed_asset"
    if (main === "transfer") return "transfer"
    if (main === "loan") return sub === "given" ? "loan_given" : "loan_repayment"
    if (main === "tax") {
      if (sub === "vat") return "tax_vat"
      if (sub === "corporate") return "tax_corporate"
      return "tax_withholding"
    }
    if (main === "correction") return "correction"
    if (main === "dividend") return "dividend"
    return "expense"
  }, [])

  const getAutoPayeeName = React.useCallback((withdrawalCategory: string): string => {
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
    return map[withdrawalCategory] || (t("wm_expense") || "지출")
  }, [t])

  const handleRegisterAccrual = async () => {
    const amt = Number(String(amount).replace(/,/g, ""))
    const withdrawalCategory = resolveWithdrawalCategory(categoryMain, categorySub)
    let code = payeeCode.trim()
    let name = payeeName.trim()
    if (categoryMain === "purchase") {
      if (!vendorCode.trim()) {
        await appAlert(t("inAlertSelectVendor") || "매입처를 선택해 주세요.")
        return
      }
      code = vendorCode.trim()
      if (!name) {
        const found = vendors.find((v) => v.code === code)
        name = found?.name || code
      }
    } else if (categoryMain === "expense") {
      if (!code && !name) {
        await appAlert(t("expensePayeeRequired") || "지급처를 선택하거나 입력해 주세요.")
        return
      }
      if (!code) code = name
      if (!name) name = code
    } else {
      code = code || `auto_${withdrawalCategory}`
      name = name || getAutoPayeeName(withdrawalCategory)
    }
    if (!amt || amt <= 0) {
      await appAlert(t("pettyAlertAmount") || "금액을 입력해 주세요.")
      return
    }
    if (!storeName) {
      await appAlert(t("expenseStoreSelect") || "매장을 선택하세요.")
      return
    }
    setSaving(true)
    try {
      if (isEditAccrualMode && editAccrualIdParam) {
        const res = await updateExpenseAccrual({
          expenseAccrualId: Number(editAccrualIdParam),
          amount: amt,
          expenseDate: transDate,
          dueDate: transDate,
          memo: memo.trim() || undefined,
          payeeCode: code || undefined,
          payeeName: name || undefined,
          accountSubjectId:
            categoryMain === "expense" && accountSubjectId && accountSubjectId !== "__none__"
              ? Number(accountSubjectId)
              : null,
          storeName: storeName || undefined,
          withdrawalCategory,
          categoryMain,
          categorySub: (hasSub || hasTaxSub || hasLoanSub) ? categorySub : undefined,
          userRole: auth?.role,
        })
        if (!res.success) {
          await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
          return
        }
        setAmount("")
        setMemo("")
        setPayeeCode("")
        setPayeeName("")
        hasAppliedParams.current = false
        router.replace("/admin/expense-management?tab=plan")
        await appAlert(t("wm_accrualUpdateSuccess") || "수정되었습니다. 지급예정 탭에서 확인하세요.")
      } else {
        const res = await addExpenseAccrual({
          payeeCode: code || name,
          payeeName: name || code,
          withdrawalCategory,
          categoryMain,
          categorySub: (hasSub || hasTaxSub || hasLoanSub) ? categorySub : undefined,
          amount: amt,
          expenseDate: transDate,
          dueDate: transDate,
          memo: memo.trim() || undefined,
          accountSubjectId: categoryMain === "expense" && accountSubjectId ? Number(accountSubjectId) : null,
          storeName: storeName || undefined,
          userName: auth?.user,
          userRole: auth?.role,
        })
        if (!res.success) {
          await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
          return
        }
        setAmount("")
        setMemo("")
        setPayeeCode("")
        setPayeeName("")
        await appAlert(t("wm_accrualSuccess") || "등록되었습니다. 지급예정 탭에서 확인하세요.")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleEditSubmit = async () => {
    if (!bankTransactionIdParam) return
    const amt = Number(String(amount).replace(/,/g, ""))
    if (!amt || amt <= 0) {
      await appAlert(t("pettyAlertAmount") || "금액을 입력해 주세요.")
      return
    }
    if (!categoryMain) {
      await appAlert(t("wm_selectCategory") || "출금 유형을 선택해 주세요.")
      return
    }
    if (!accountId) {
      await appAlert(t("bankAccount") || "계좌를 선택하세요.")
      return
    }
    if (categoryMain === "purchase" && !vendorCode) {
      await appAlert(t("inAlertSelectVendor") || "매입처를 선택해 주세요.")
      return
    }
    if (categoryMain === "expense" && !accountSubjectId) {
      await appAlert(t("wm_accountSubjectPlaceholder") || "계정과목을 선택해 주세요.")
      return
    }

    let invoicePhotoUrl: string | undefined
    if (invoicePhotoFile && (categoryMain === "purchase" || categoryMain === "expense")) {
      try {
        invoicePhotoUrl = await compressImageForUpload(invoicePhotoFile, 1024, 0.7)
      } catch {
        invoicePhotoUrl = undefined
      }
    }

    setSaving(true)
    try {
      const res = await updateExpenseRegisterItem({
        bankTransactionId: Number(bankTransactionIdParam),
        accountId: Number(accountId),
        amount: amt,
        transDate,
        memo: memo.trim() || undefined,
        storeName: storeName || undefined,
        categoryMain,
        categorySub: (hasSub || hasTaxSub || hasLoanSub) ? categorySub : undefined,
        vendorCode: categoryMain === "purchase" ? vendorCode || undefined : undefined,
        accountSubjectId: categoryMain === "expense" && accountSubjectId ? Number(accountSubjectId) : undefined,
        invoiceReceived: (categoryMain === "purchase" || categoryMain === "expense") ? invoiceReceived : undefined,
        invoiceNo: (categoryMain === "purchase" || categoryMain === "expense") ? invoiceNo.trim() || undefined : undefined,
        invoicePhotoUrl,
        userRole: auth?.role,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
        return
      }
      await appAlert(t("saved") || "수정되었습니다.")
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (isEditMode) {
      await handleEditSubmit()
      return
    }
    if (isBankLinkMode) {
      await handleBankLinkSubmit()
      return
    }
    if (isLaterPayment) {
      await handleRegisterAccrual()
      return
    }
    const amt = Number(String(amount).replace(/,/g, ""))
    if (!amt || amt <= 0) {
      await appAlert(t("pettyAlertAmount") || "금액을 입력해 주세요.")
      return
    }
    if (!categoryMain) {
      await appAlert(t("wm_selectCategory") || "출금 유형을 선택해 주세요.")
      return
    }
    if (effectivePaymentMethod === "bank" && !accountId) {
      await appAlert(t("bankAccount") || "계좌를 선택하세요.")
      return
    }
    if (effectivePaymentMethod === "petty" && !storeName) {
      await appAlert(t("recFilterStoreSelect") || "매장을 선택하세요.")
      return
    }
    if (!storeName) {
      await appAlert(t("expenseStoreSelect") || "매장을 선택하세요.")
      return
    }
    if (categoryMain === "transfer" && effectivePaymentMethod === "bank" && (!transferBankAccountNo.trim() || !transferBankRecipientName.trim())) {
      await appAlert(t("wm_transferBankRequired") || "계좌번호와 받는 사람을 입력하세요.")
      return
    }
    if (categoryMain === "transfer" && effectivePaymentMethod === "card" && !transferToCardAccountId) {
      await appAlert(t("wm_transferCardRequired") || "충전할 카드를 선택하세요.")
      return
    }
    if (categoryMain === "transfer" && effectivePaymentMethod === "petty") {
      if (!transferToDept || !transferToEmployee) {
        await appAlert(t("wm_pettyTransferRecipientRequired") || "부서와 직원명을 선택하세요.")
        return
      }
      if (!transferToAccountNo.trim()) {
        await appAlert((t("inv_account_no") || "계좌번호") + "를 입력하세요.")
        return
      }
    }

    let invoicePhotoUrl: string | undefined
    if (invoicePhotoFile && (categoryMain === "purchase" || categoryMain === "expense")) {
      try {
        invoicePhotoUrl = await compressImageForUpload(invoicePhotoFile, 1024, 0.7)
      } catch {
        invoicePhotoUrl = undefined
      }
    }

    setSaving(true)
    try {
      const memoText = memo.trim() || (showAdvanceInstallments && advanceInstallments
        ? `Advance ${advanceInstallmentCurrent || "1"}/${advanceInstallments} installments`
        : undefined)
      const transferMemo =
        categoryMain === "transfer" && effectivePaymentMethod === "petty" && (storeName || transferToDept || transferToEmployee)
          ? [memoText, storeName && `매장: ${storeName}`, transferToDept && transferToDept !== "__none__" && `부서: ${transferToDept}`, transferToEmployee && transferToEmployee !== "__none__" && `직원: ${transferToEmployee}`]
            .filter(Boolean)
            .join(" ")
          : memoText

      const res = await executeWithdrawal({
        paymentMethod: effectivePaymentMethod === "card" ? "bank" : effectivePaymentMethod,
        amount: amt,
        transDate,
        memo: transferMemo || undefined,
        storeName: storeName || undefined,
        categoryMain,
        categorySub: (hasSub || hasTaxSub || hasLoanSub) ? categorySub : undefined,
        vendorCode: categoryMain === "purchase" ? vendorCode || undefined : undefined,
        accountSubjectId: categoryMain === "expense" && accountSubjectId ? Number(accountSubjectId) : undefined,
        accountSubjectCode: categoryMain === "expense" ? subjects.find((s) => String(s.id) === accountSubjectId)?.code : undefined,
        accountSubjectName: categoryMain === "expense" ? (() => {
          const subject = subjects.find((s) => String(s.id) === accountSubjectId)
          return subject ? getSubjectLabel(subject) : undefined
        })() : undefined,
        transferToAccountNo: categoryMain === "transfer" && effectivePaymentMethod === "petty" && transferToAccountNo.trim() ? transferToAccountNo.trim() : undefined,
        transferToCardAccountId: categoryMain === "transfer" && effectivePaymentMethod === "card" && transferToCardAccountId ? Number(transferToCardAccountId) : undefined,
        transferBankAccountNo: categoryMain === "transfer" && effectivePaymentMethod === "bank" ? transferBankAccountNo.trim() : undefined,
        transferBankRecipientName: categoryMain === "transfer" && effectivePaymentMethod === "bank" ? transferBankRecipientName.trim() : undefined,
        accountId: showBankAccountForTransfer ? Number(accountId) : undefined,
        assetName: categoryMain === "fixed_asset" ? assetName || undefined : undefined,
        assetCode: categoryMain === "fixed_asset" ? assetCode || undefined : undefined,
        usefulLifeMonths: categoryMain === "fixed_asset" ? Number(usefulLifeMonths) || 60 : undefined,
        invoiceReceived: (categoryMain === "purchase" || categoryMain === "expense") ? invoiceReceived : undefined,
        invoiceNo: (categoryMain === "purchase" || categoryMain === "expense") ? invoiceNo.trim() || undefined : undefined,
        invoicePhotoUrl,
        userName: auth?.user,
        userRole: auth?.role,
        userStore: auth?.store,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
        return
      }
      const newBankTxId = res.bankTransactionId ?? undefined
      if (categoryMain === "purchase" && newBankTxId && effectivePaymentMethod === "bank") {
        const links = Object.entries(inboundLinkAmounts)
          .map(([batchId, raw]) => ({ batchId, amount: Number(String(raw).replace(/,/g, "")) }))
          .filter((x) => Number.isFinite(x.amount) && x.amount > 0)
          .map((x) => ({ inboundBatchId: parseInt(x.batchId, 10), amount: x.amount }))
        if (links.length > 0) {
          try {
            const linkRes = await saveBankTransactionInboundLinks({ bankTransactionId: newBankTxId, links })
            if (linkRes?.success) {
              setInboundLinkAmounts({})
            }
          } catch (e) {
            console.error("saveBankTransactionInboundLinks:", e)
          }
        }
      }
      setAmount("")
      setMemo("")
      setInvoicePhotoFile(null)
      setInboundLinkAmounts({})
      if (res.fixedAssetId) {
        await appAlert(t("wm_successWithAsset") || "등록되었습니다. 감가상각 메뉴에서 자동 연동 확인하세요.")
      } else {
        await appAlert(t("success") || "등록되었습니다.")
      }
    } finally {
      setSaving(false)
    }
  }

  const effectivePaymentMethod = categoryMain === "transfer" ? paymentMethod : "bank"
  const showBankAccountForTransfer = effectivePaymentMethod === "bank" || effectivePaymentMethod === "card"
  const showAdvanceInstallments = categorySub === "advance" && (categoryMain === "purchase" || categoryMain === "expense")

  React.useEffect(() => {
    if (showAdvanceInstallments && advanceInstallments && advanceInstallmentCurrent) {
      const n = advanceInstallmentCurrent || "1"
      const m = advanceInstallments || "1"
      const text = `Advance ${n}/${m} installments`
      setMemo((prev) => {
        if (!prev.trim()) return text
        const hasInstallmentPattern = /\d+\/\d+/.test(prev)
        if (hasInstallmentPattern && prev.length < 30) return text
        return prev
      })
    }
  }, [showAdvanceInstallments, advanceInstallments, advanceInstallmentCurrent])

  const handleBankLinkSubmit = async () => {
    if (!bankTransactionIdParam) return
    const bankTxId = Number(bankTransactionIdParam)
    if (!bankTxId) return
    if (categoryMain === "purchase") {
      const vendor = vendorCode.trim()
      if (!vendor) {
        await appAlert(t("inAlertSelectVendor") || "매입처를 선택해 주세요.")
        return
      }
      setSaving(true)
      try {
        const res = await registerPurchaseFromBankTransaction({
          bankTransactionId: bankTxId,
          vendorCode: vendor,
          userName: auth?.user,
          userRole: auth?.role,
          updateExisting: updateExistingParam,
        })
        if (!res.success) {
          await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
          return
        }
        await appAlert(res.message || t("success"))
        const q = new URLSearchParams()
        q.set("tab", returnTabParam || "query")
        if (accountId) q.set("accountId", accountId)
        const start = (startStrParam && /^\d{4}-\d{2}-\d{2}$/.test(startStrParam)) ? startStrParam : (transDate || todayStrBkk())
        const end = (endStrParam && /^\d{4}-\d{2}-\d{2}$/.test(endStrParam)) ? endStrParam : (transDate || todayStrBkk())
        q.set("startStr", start)
        q.set("endStr", end)
        if (returnOpenRegisterTxIdParam && Number(returnOpenRegisterTxIdParam) > 0) {
          q.set("openRegisterTxId", returnOpenRegisterTxIdParam)
        }
        router.push(`/admin/bank-transactions?${q.toString()}`)
      } finally {
        setSaving(false)
      }
      return
    }
    const code = payeeCode.trim()
    const name = payeeName.trim()
    if (!code && !name) {
      await appAlert(t("expensePayeeRequired") || "지급처를 선택하거나 입력해 주세요.")
      return
    }
    setSaving(true)
    try {
      const res = await registerExpenseFromBankTransaction({
        bankTransactionId: bankTxId,
        payeeCode: code || name,
        payeeName: name || code,
        accountSubjectId: accountSubjectId ? Number(accountSubjectId) : null,
        memo: memo.trim() || undefined,
        userName: auth?.user,
        userRole: auth?.role,
        updateExisting: updateExistingParam,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
        return
      }
      await appAlert(res.message || t("success"))
      const q = new URLSearchParams()
      q.set("tab", returnTabParam || "query")
      if (accountId) q.set("accountId", accountId)
      const start = (startStrParam && /^\d{4}-\d{2}-\d{2}$/.test(startStrParam)) ? startStrParam : (transDate || todayStrBkk())
      const end = (endStrParam && /^\d{4}-\d{2}-\d{2}$/.test(endStrParam)) ? endStrParam : (transDate || todayStrBkk())
      q.set("startStr", start)
      q.set("endStr", end)
      if (returnOpenRegisterTxIdParam && Number(returnOpenRegisterTxIdParam) > 0) {
        q.set("openRegisterTxId", returnOpenRegisterTxIdParam)
      }
      router.push(`/admin/bank-transactions?${q.toString()}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex items-center gap-3">
            <Label className="font-semibold whitespace-nowrap">{t("expenseStoreSelect") || "매장"}</Label>
            <Select
              value={storeName || sortedStores[0] || ""}
              onValueChange={(v) => {
                if (v !== storeName) {
                  setTransferToDept("")
                  setTransferToEmployee("")
                }
                setStoreName(v)
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t("expenseStoreSelect") || "매장 선택"} />
              </SelectTrigger>
              <SelectContent>
                {sortedStores.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-sm font-semibold">{t("wm_title") || "출금 유형"}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CATEGORY_MAIN_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                variant={categoryMain === opt.value ? "default" : "outline"}
                size="sm"
                className="h-auto py-2 justify-start"
                onClick={() => {
                  setCategoryMain(opt.value)
                  setCategorySub(opt.sub[0] || "normal")
                }}
              >
                {t(opt.labelKey) || opt.value}
              </Button>
            ))}
          </div>

          {categoryMain && !isBankLinkMode && !isEditMode && (
            <div className="flex items-end gap-2">
              <Label className="pb-2.5 shrink-0">{t("wm_payMode") || "지급 방식"}</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={expensePayMode === "immediate" ? "default" : "outline"}
                  size="sm"
                  className="h-9"
                  onClick={() => setExpensePayMode("immediate")}
                >
                  {t("wm_payImmediate") || "즉시 지급"}
                </Button>
                <Button
                  type="button"
                  variant={expensePayMode === "later" ? "default" : "outline"}
                  size="sm"
                  className="h-9"
                  onClick={() => setExpensePayMode("later")}
                >
                  {t("wm_payLater") || "나중에 지급"}
                </Button>
              </div>
            </div>
          )}

          {hasTaxSub && (
            <div className="flex items-center gap-2">
              <Label>{t("wm_subType") || "세부"}</Label>
              <Select value={categorySub} onValueChange={setCategorySub}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vat">{t("wm_tax_vat") || "부가세 납부"}</SelectItem>
                  <SelectItem value="withholding">{t("wm_tax_withholding") || "원천세 납부"}</SelectItem>
                  <SelectItem value="corporate">{t("wm_tax_corporate") || "법인세 납부"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {hasLoanSub && (
            <div className="flex items-center gap-2">
              <Label>{t("wm_subType") || "세부"}</Label>
              <Select value={categorySub} onValueChange={setCategorySub}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="repayment">{t("wm_loan_repayment") || "대출 상환"}</SelectItem>
                  <SelectItem value="given">{t("wm_loan_given") || "대여"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          {hasSub && !hasTaxSub && !hasLoanSub && (categoryMain === "purchase" || categoryMain === "expense" || categoryMain === "loan") && (
            <div className="flex items-end gap-2">
              <Label className="pb-2.5">{t("wm_subType") || "세부"}</Label>
              <Select value={categorySub} onValueChange={setCategorySub}>
                <SelectTrigger className="w-[120px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">{t("wm_normal") || "일반"}</SelectItem>
                  <SelectItem value="advance">{t("wm_advance") || "선급"}</SelectItem>
                </SelectContent>
              </Select>
              {showAdvanceInstallments && (
                <>
                  <Label className="text-sm pb-2.5">{t("wm_advanceInstallments") || "분할 횟수"}</Label>
                  <Input type="number" min={1} value={advanceInstallments} onChange={(e) => setAdvanceInstallments(e.target.value)} className="w-[70px] h-9" />
                  <span className="text-muted-foreground pb-2.5">/</span>
                  <Label className="text-sm pb-2.5">{t("wm_advanceInstallmentCurrent") || "이번 회차"}</Label>
                  <Input type="number" min={1} value={advanceInstallmentCurrent} onChange={(e) => setAdvanceInstallmentCurrent(e.target.value)} className="w-[70px] h-9" />
                  <span className="text-sm font-medium tabular-nums pb-2.5">({advanceInstallmentCurrent}/{advanceInstallments})</span>
                </>
              )}
            </div>
          )}
          {(categoryMain === "purchase" || categoryMain === "expense" || categoryMain === "loan") && (
            <>
              {categoryMain === "purchase" && (
                <div className="flex items-end gap-2">
                  <div className="flex items-end gap-2">
                    <Label className="pb-2.5 shrink-0">{t("vendor") || "매입처"}</Label>
                    <Select value={vendorCode} onValueChange={(v) => setVendorCode(v)}>
                      <SelectTrigger className="h-9 w-[220px]">
                        <SelectValue placeholder={t("vendor") || "매입처 선택"} />
                      </SelectTrigger>
                      <SelectContent>
                        {vendors.map((v) => (
                          <SelectItem key={v.code} value={v.code}>
                            {v.name} ({v.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {vendorCode && (
                    <div className="text-sm text-muted-foreground pb-2">
                      {t("inv_account_no") || "계좌"}: {vendors.find((x) => x.code === vendorCode)?.bankAccountNo || "—"}
                    </div>
                  )}
                </div>
              )}
              {categoryMain === "purchase" && vendorCode && !isBankLinkMode && !isEditMode && (
                <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      {tt("adminInbound", "Inbound")} {tt("inboundLinkLabel", "Link")} ({tt("optional", "Optional")})
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={loadInboundBatchesForLink}
                      disabled={inboundLinkLoading}
                    >
                      {tt("store_refresh", "Refresh")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tt("inboundLinkAtRegisterHint", "You can link here when registering (optional). You can also link or edit later in the Bank tab.")}
                  </p>
                  {inboundLinkLoading ? (
                    <p className="text-sm text-muted-foreground py-2">{tt("loading", "Loading...")}</p>
                  ) : inboundBatchesForLink.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{tt("inboundNoBatches", "No inbound batches for this vendor.")}</p>
                  ) : (
                    <>
                      <div className="border rounded-md divide-y max-h-[200px] overflow-y-auto">
                        {inboundBatchesForLink.map((b) => (
                          <div key={b.id} className="flex items-center justify-between gap-2 p-2">
                            <div className="flex-1 min-w-0 text-sm">
                              <span>{b.batchDate}</span>
                              <span className="text-muted-foreground ml-2">
                                {b.vendorName} · {(b.totalAmount || 0).toLocaleString()} ฿
                              </span>
                            </div>
                            <Input
                              type="text"
                              inputMode="numeric"
                              placeholder="0"
                              className="w-24 h-8 text-right"
                              value={inboundLinkAmounts[b.id] || ""}
                              onChange={(e) => {
                                const next = String(e.target.value).replace(/[^\d.,]/g, "").replace(/,/g, "")
                                const parts = next.split(".")
                                const normalized = parts.length <= 1
                                  ? next
                                  : `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}`
                                setInboundLinkAmounts((prev) => ({ ...prev, [b.id]: normalized }))
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {tt("inboundLinkRegisterHelp", "Enter amounts by batch to match the withdrawal amount for auto-linking. Leave blank to link later in Bank tab.")}
                      </p>
                    </>
                  )}
                </div>
              )}
              {categoryMain === "expense" && (
                <>
                  <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
                    {expensePayMode === "immediate" && (
                      <>
                        {isBankLinkMode && (
                          <div className="flex items-end gap-2">
                            <Label className="pb-2.5 shrink-0">{t("vendor") || "지급처"}</Label>
                            <Select
                              value={payeeManual ? "__manual__" : (payeeCode || "__none__")}
                              onValueChange={(v) => {
                                if (v === "__manual__") { setPayeeManual(true); setPayeeCode(""); setPayeeName("") }
                                else if (v !== "__none__") {
                                  setPayeeManual(false)
                                  setPayeeCode(v)
                                  const found = vendors.find((x) => x.code === v)
                                  setPayeeName(found?.name || v)
                                }
                              }}
                            >
                              <SelectTrigger className="h-9 w-[180px]">
                                <SelectValue placeholder={t("vendor") || "지급처"} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__manual__">{t("bankRegisterPayeeManual") || "직접 입력"}</SelectItem>
                                <SelectItem value="__none__">-</SelectItem>
                                {vendors.map((v) => (
                                  <SelectItem key={v.code} value={v.code}>{v.name} ({v.code})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {payeeManual ? (
                              <>
                                <Input value={payeeCode} onChange={(e) => setPayeeCode(e.target.value)} placeholder={t("expensePayeeCode") || "코드"} className="h-9 w-[100px]" />
                                <Input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder={t("expensePayeeName") || "지급처명"} className="h-9 w-[140px]" />
                              </>
                            ) : (
                              <Input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder={t("expensePayeeName") || "지급처명"} className="h-9 w-[140px]" />
                            )}
                          </div>
                        )}
                        <div className="flex items-end gap-2">
                          <Label className="pb-2.5 shrink-0">{t("wm_accountSubject") || "계정과목"}</Label>
                          <Select value={accountSubjectId} onValueChange={setAccountSubjectId}>
                            <SelectTrigger className="h-9 w-[200px]">
                              <SelectValue placeholder={t("wm_accountSubjectPlaceholder") || "계정과목 선택"} />
                            </SelectTrigger>
                            <SelectContent>
                              {subjects.map((s) => (
                                <SelectItem key={s.id} value={String(s.id)}>
                                  {s.code} {getSubjectLabel(s)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                    {expensePayMode === "later" && (
                      <>
                        <div className="flex items-end gap-2">
                          <Label className="pb-2.5 shrink-0">{t("vendor") || "지급처"}</Label>
                          <Select
                            value={payeeManual ? "__manual__" : (payeeCode || "__none__")}
                            onValueChange={(v) => {
                              if (v === "__manual__") {
                                setPayeeManual(true)
                                setPayeeCode("")
                                setPayeeName("")
                              } else if (v !== "__none__") {
                                setPayeeManual(false)
                                setPayeeCode(v)
                                const found = vendors.find((x) => x.code === v)
                                setPayeeName(found?.name || v)
                              }
                            }}
                          >
                            <SelectTrigger className="w-[180px] h-9">
                              <SelectValue placeholder={t("vendor") || "지급처"} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__manual__">{t("bankRegisterPayeeManual") || "직접 입력"}</SelectItem>
                              <SelectItem value="__none__">-</SelectItem>
                              {vendors.map((v) => (
                                <SelectItem key={v.code} value={v.code}>{v.name} ({v.code})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {payeeManual ? (
                            <>
                              <Input
                                className="w-[120px] h-9"
                                value={payeeCode}
                                onChange={(e) => setPayeeCode(e.target.value)}
                                placeholder={t("expensePayeeCode") || "코드"}
                              />
                              <Input
                                className="w-[160px] h-9"
                                value={payeeName}
                                onChange={(e) => setPayeeName(e.target.value)}
                                placeholder={t("expensePayeeName") || "지급처명"}
                              />
                            </>
                          ) : (
                            <Input
                              className="w-[160px] h-9"
                              value={payeeName}
                              onChange={(e) => setPayeeName(e.target.value)}
                              placeholder={t("expensePayeeName") || "지급처명"}
                            />
                          )}
                        </div>
                        <div className="flex items-end gap-2">
                          <Label className="pb-2.5 shrink-0">{t("wm_accountSubject") || "계정과목"}</Label>
                          <Select value={accountSubjectId || "__none__"} onValueChange={(v) => setAccountSubjectId(v === "__none__" ? "" : v)}>
                            <SelectTrigger className="h-9 w-[200px]">
                              <SelectValue placeholder={t("wm_accountSubjectPlaceholder") || "계정과목 선택"} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">-</SelectItem>
                              {subjects.map((s) => (
                                <SelectItem key={s.id} value={String(s.id)}>
                                  {s.code} {getSubjectLabel(s)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {categoryMain === "transfer" && (
            <div className="flex items-center gap-2">
              <Label>{t("wm_paymentMethod") || "지급 수단"}</Label>
              <Select value={paymentMethod} onValueChange={(v) => { setPaymentMethod(v as "bank" | "petty" | "card"); if (v !== "card") setTransferToCardAccountId(""); }}>
                <SelectTrigger className="w-[120px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">{t("wm_paymentMethodBank") || "통장"}</SelectItem>
                  <SelectItem value="petty">{t("adminPettyCash") || "패티캐쉬"}</SelectItem>
                  <SelectItem value="card">{t("wm_paymentMethodCard") || "카드"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          </div>

          {categoryMain === "fixed_asset" && (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="block mb-2">{t("wm_assetName") || "자산명"}</Label>
                <Input
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  placeholder={t("wm_assetNamePlaceholder") || "차량, 장비 등"}
                  className="h-9 w-[160px]"
                />
              </div>
              <div>
                <Label className="block mb-2">{t("wm_assetCode") || "자산코드"}</Label>
                <Input
                  value={assetCode}
                  onChange={(e) => setAssetCode(e.target.value)}
                  placeholder={t("wm_assetCodePlaceholder") || "FA-001 (선택)"}
                  className="h-9 w-[120px]"
                />
              </div>
              <div>
                <Label className="block mb-2">{t("wm_usefulLife") || "내용연수(개월)"}</Label>
                <Input
                  value={usefulLifeMonths}
                  onChange={(e) => setUsefulLifeMonths(e.target.value)}
                  type="number"
                  min={1}
                  className="h-9 w-[100px]"
                />
              </div>
            </div>
          )}

          {categoryMain === "transfer" && effectivePaymentMethod === "bank" && (
            <div className="space-y-2">
              <Label>{t("wm_transferTo") || "이체 대상"}</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                <div>
                  <Label className="text-xs text-muted-foreground block mb-1">{t("inv_account_no") || "계좌번호"}</Label>
                  <Input
                    value={transferBankAccountNo}
                    onChange={(e) => setTransferBankAccountNo(e.target.value)}
                    placeholder={t("wm_transferAccountNoPlaceholder") || "계좌번호 직접 입력"}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground block mb-1">{t("wm_transferRecipient") || "받는 사람"}</Label>
                  <Input
                    value={transferBankRecipientName}
                    onChange={(e) => setTransferBankRecipientName(e.target.value)}
                    placeholder={t("wm_transferRecipientPlaceholder") || "받는 사람 수기 입력"}
                    className="h-9"
                  />
                </div>
              </div>
            </div>
          )}
          {categoryMain === "transfer" && effectivePaymentMethod === "card" && (
            <div className="space-y-2">
              <Label>{t("wm_transferTo") || "이체 대상"}</Label>
              <div className="max-w-md">
                <Label className="text-xs text-muted-foreground block mb-1.5">{t("wm_transferToCardCharge") || "충전할 카드"}</Label>
                <Select value={transferToCardAccountId || "__none__"} onValueChange={(v) => setTransferToCardAccountId(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder={t("cardManagementSelectCard") || "카드 선택"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {cardAccounts.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}{a.store ? ` (${a.store})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {categoryMain === "transfer" && effectivePaymentMethod === "petty" && (
            <div className="space-y-2">
              <Label>{t("wm_transferTo") || "이체 대상"}</Label>
              <div className="grid grid-cols-[160px_180px_200px_240px] gap-3 items-end max-w-3xl">
                <div>
                  <Label className="text-xs text-muted-foreground block mb-1.5">{t("wm_transferToDept") || "부서"}</Label>
                  <Select
                    value={transferToDept || "__none__"}
                    onValueChange={(v) => { setTransferToDept(v === "__none__" ? "" : v); setTransferToEmployee(""); setTransferToAccountNo(""); }}
                    disabled={!storeName}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder={t("wm_transferToDept") || "부서"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {[...new Set(employeeList.filter((e) => e.store === storeName).map((e) => e.job).filter(Boolean))].sort().map((j) => (
                        <SelectItem key={j} value={j}>{j}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground block mb-1.5">{t("wm_transferToEmployee") || "직원명"}</Label>
                  <Select
                    value={transferToEmployee || "__none__"}
                    onValueChange={(v) => {
                      setTransferToEmployee(v === "__none__" ? "" : v)
                      if (v && v !== "__none__") {
                        const emp = employeeList.find((e) => e.store === storeName && e.job === transferToDept && e.name === v)
                        setTransferToAccountNo(emp?.accountNumber || "")
                      } else {
                        setTransferToAccountNo("")
                      }
                    }}
                    disabled={!transferToDept}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder={t("wm_transferToEmployee") || "직원명"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {employeeList.filter((e) => e.store === storeName && e.job === transferToDept).map((e) => (
                        <SelectItem key={`${e.store}-${e.job}-${e.name}`} value={e.name}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground block mb-1.5">{t("wm_transferToEmployeeAccount") || "직원 계좌"}</Label>
                  {transferToEmployee && transferToEmployee !== "__none__" ? (() => {
                    const emp = employeeList.find((e) => e.store === storeName && e.job === transferToDept && e.name === transferToEmployee)
                    const hasAccount = emp?.accountNumber
                    return (
                      <div className="h-9 flex items-center text-sm font-medium">
                        {hasAccount ? (emp?.bankName ? `[${emp.bankName}] ` : "") + (emp?.accountNumber || "") : (t("wm_noAccountNumber") || "계좌번호 없음")}
                      </div>
                    )
                  })() : (
                    <div className="h-9 flex items-center text-sm text-muted-foreground">—</div>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground block mb-1.5">{t("wm_transferAccountDirectInput") || "계좌번호 (직접 입력)"}</Label>
                  <Input
                    value={transferToAccountNo}
                    onChange={(e) => setTransferToAccountNo(e.target.value)}
                    placeholder={t("wm_transferAccountNoPlaceholder") || "계좌번호 직접 입력"}
                    className="h-9"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("wm_pettyTransferStoreNote") || "매장은 상단 매장 선택과 연동됩니다."}
              </p>
            </div>
          )}

          <div className="border-t pt-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3 max-w-6xl">
              {!isLaterPayment && showBankAccountForTransfer && (
                <div className="w-[220px]">
                  <Label>{effectivePaymentMethod === "card" ? (t("wm_transferFromBank") || "출금 통장") : (t("bankAccount") || "계좌")}</Label>
                  <Select value={accountId} onValueChange={setAccountId} disabled={isBankLinkMode}>
                    <SelectTrigger className="w-[220px] h-9 mt-1">
                      <SelectValue placeholder={t("bankAccount") || "계좌 선택"} />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.bankName ? `[${a.bankName}] ` : ""}{a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!isLaterPayment && effectivePaymentMethod === "petty" && (
                <div className="w-[140px]">
                  <Label>{t("recFilterStoreSelect") || "매장"}</Label>
                  <Select value={storeName} onValueChange={setStoreName}>
                    <SelectTrigger className="w-[140px] h-9 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(stores || []).map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="w-[120px]">
                <Label>{t("amount") || "금액"}</Label>
                <Input
                  value={amount}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d.,]/g, "").replace(/,/g, "")
                    const parts = v.split(".")
                    setAmount(parts.length > 2 ? parts[0] + "." + parts[1] : v)
                  }}
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  className={`w-[120px] h-9 mt-1 ${isBankLinkMode ? "bg-muted/50 cursor-default" : ""}`}
                  readOnly={isBankLinkMode}
                />
              </div>
              <div className="w-[140px]">
                <Label>{t("date") || "날짜"}</Label>
                <Input
                  type="date"
                  value={transDate}
                  onChange={(e) => setTransDate(e.target.value)}
                  className={`w-[140px] h-9 mt-1 ${isBankLinkMode ? "bg-muted/50 cursor-default" : ""}`}
                  readOnly={isBankLinkMode}
                />
              </div>
              <div className="w-[280px]">
                <Label>{t("memo") || "적요"}</Label>
                <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t("memo") || "적요"} className="h-9 w-[280px] mt-1" />
              </div>
              <div className="w-[320px]" title={bankMemo || undefined}>
                <Label>{t("bankMemoLabel") || "은행 적요"}</Label>
                <Input
                  value={bankMemo}
                  readOnly
                  placeholder={t("bankMemoFromBank") || "통장에서 가져온 적요"}
                  className="h-9 w-[320px] mt-1 bg-muted/50 cursor-default"
                />
              </div>
            </div>
            {(categoryMain === "purchase" || categoryMain === "expense") && !isLaterPayment && effectivePaymentMethod === "bank" && (
              <div className="space-y-2 p-3 rounded-lg border bg-muted/20">
                <div className="text-sm font-medium">{t("poInvoice") || "인보이스"}</div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={invoiceReceived} onCheckedChange={(c) => setInvoiceReceived(c === true)} />
                    <span className="text-sm">{t("poInvoiceReceived") || "인보이스 수령"}</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">{t("wm_invoiceNoLabel") || "인보이스 번호"}</Label>
                    <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder={t("wm_invoiceNoPlaceholder") || "IV-xxx"} className="w-[140px] h-9" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">{t("bankInvoicePhotoUpload") || "인보이스 사진"}</Label>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="wm-invoice-photo"
                      onChange={(e) => setInvoicePhotoFile(e.target.files?.[0] || null)}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById("wm-invoice-photo")?.click()} className="h-9">
                      <Camera className="h-4 w-4 mr-1" />
                      {invoicePhotoFile ? invoicePhotoFile.name.slice(0, 12) + "..." : (t("wm_invoicePhotoSelect") || "선택")}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={handleSubmit}
                disabled={
                  saving ||
                  !categoryMain ||
                  (isBankLinkMode && (
                    categoryMain === "purchase"
                      ? !vendorCode.trim()
                      : !(payeeManual ? (payeeCode.trim() || payeeName.trim()) : payeeCode)
                  ))
                }
              >
                <Wallet className="h-4 w-4 mr-1" />
                {saving
                  ? (t("loading") || "처리 중...")
                  : isEditMode
                    ? (t("btnSave") || "저장")
                    : isBankLinkMode
                    ? (t("btnSave") || "저장")
                    : isLaterPayment
                      ? (t("wm_registerAccrual") || "발생 등록")
                      : (t("wm_execute") || "출금 등록")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const q = new URLSearchParams()
                  q.set("tab", returnTabParam || (isBankLinkMode ? "query" : "input"))
                  if (accountId) q.set("accountId", accountId)
                  const start = (startStrParam && /^\d{4}-\d{2}-\d{2}$/.test(startStrParam)) ? startStrParam : (transDate || todayStrBkk())
                  const end = (endStrParam && /^\d{4}-\d{2}-\d{2}$/.test(endStrParam)) ? endStrParam : (transDate || todayStrBkk())
                  q.set("startStr", start)
                  q.set("endStr", end)
                  if (returnOpenRegisterTxIdParam && Number(returnOpenRegisterTxIdParam) > 0) {
                    q.set("openRegisterTxId", returnOpenRegisterTxIdParam)
                  }
                  router.push(`/admin/bank-transactions?${q.toString()}`)
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                {t("wm_backToBank") || "통장 화면으로 돌아가기"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
