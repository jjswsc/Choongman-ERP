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
import { Wallet, ArrowLeft } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { useStoreList } from "@/lib/api-client"
import {
  addExpenseAccrual,
  executeWithdrawal,
  registerExpenseFromBankTransaction,
  updateExpenseRegisterItem,
  updateExpenseAccrual,
  getAccountSubjects,
  getBankAccounts,
  getCardAccounts,
  getVendorsForPurchase,
  getInboundBatchesForLink,
  saveBankTransactionInboundLinks,
  markBankTransactionForCardBill,
  markBankTransactionForPettyCash,
  translateTexts,
  getHeadOfficeInfo,
  type AccountSubjectItem,
  type BankAccount,
  type CardAccount,
  type InboundBatchForLink,
} from "@/lib/api-client"
import {
  EXPENSE_WITHDRAW_SUBJECT_FETCH,
  TRANSFER_WITHDRAW_SUBJECT_FETCH,
  filterExpenseWithdrawAccountSubjects,
} from "@/lib/account-subject-withdraw-options"
import { translateApiMessage } from "@/lib/translate-api-message"
import { bankNoteUserDisplayText } from "@/lib/bank-transaction-note-meta"
import { PURCHASE_PAYMENT_VIA_EXPENSE_ONLY_MESSAGE } from "@/lib/bank-purchase-payment-via-expense"
import { storesMatchForGradeLookup } from "@/lib/grade-store-key-variants"
import { useSearchParams, useRouter } from "next/navigation"
import { isOfficeStore } from "@/lib/permissions"
import { CANONICAL_OFFICE_STORE, canonicalOfficeStore } from "@/lib/office-store-canonical"
import { moneyInputStringFromAmount, normalizeMoneyInputString, parseMoneyAmount } from "@/lib/money-amount"
import { getBangkokMonthRange } from "@/lib/bangkok-time"
import { encodeCardPayeeCode, parseCardAccountIdFromPayeeCode } from "@/lib/prepayment-accrual-categories"
import { VendorRdSearchButton } from "@/components/erp/vendor-rd-search"
import {
  resolveExpenseFeeAmounts,
  type ExpenseFeeVatMode,
} from "@/lib/expense-fee-vat"
import {
  EXPENSE_WHT_RATE_OPTIONS,
  expenseWhtAmountFromRate,
} from "@/lib/expense-accrual-net"
import { openWhtCertificatePrintWindow } from "@/lib/open-wht-certificate-print"
import {
  resolveVendorPayeeForWht,
  whtCertificateFromExpenseRegister,
} from "@/lib/wht-certificate-data"
import {
  ExpenseDocumentAttachPanel,
  type ExpenseOcrFieldPayload,
} from "@/components/erp/expense-document-attach-panel"
import { ExpenseRecurringTemplatesBar } from "@/components/erp/expense-recurring-templates-bar"
import { suggestAccountSubjectId, suggestVendorFromHint } from "@/lib/expense-ocr-suggestions"
import {
  type ExpenseDocumentType,
  documentTypeFromInvoiceReceived,
  invoiceReceivedFromDocumentType,
} from "@/lib/expense-document-type"
import {
  todayStrBkk,
  processExpenseAttachmentFiles,
  isSelectableStoreOption,
  withdrawalCategoryFromTransferKind,
  transferKindFromWithdrawalCategory,
  isTransferPrepaymentKind,
  CATEGORY_MAIN_OPTIONS,
  DELIVERY_APP_FEE_PRESETS,
  CARD_FEE_PRESETS,
  resolveMonthEndDate,
  type TransferKind,
  type WithdrawalManagementTabProps,
} from "./withdrawal-management-tab-utils"

export function WithdrawalManagementTab({ onAccrualSaved, onBatchWithdrawalSaved }: WithdrawalManagementTabProps = {}) {
  const { lang } = useLang()
  const t = useT(lang)
  const tt = React.useCallback((key: string, fallback: string) => {
    const v = t(key)
    if (!v || v === key) return fallback
    return v
  }, [t])
  const { auth } = useAuth()
  const { posStores: stores } = useStoreList()

  const [transferKind, setTransferKind] = React.useState<TransferKind>("bank_to_petty")
  const [transferToCardAccountId, setTransferToCardAccountId] = React.useState<string>("")
  const [transferBankAccountNo, setTransferBankAccountNo] = React.useState("")
  const [transferBankRecipientName, setTransferBankRecipientName] = React.useState("")
  const [transferToPettyStore, setTransferToPettyStore] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [transDate, setTransDate] = React.useState(todayStrBkk)
  const [memo, setMemo] = React.useState("")
  const [bankMemo, setBankMemo] = React.useState("")
  const [storeName, setStoreName] = React.useState("")
  const [categoryMain, setCategoryMain] = React.useState<string>("")
  const [categorySub, setCategorySub] = React.useState<string>("normal")
  const [vendorCode, setVendorCode] = React.useState("")
  const [accountSubjectId, setAccountSubjectId] = React.useState<string>("")
  const [accountId, setAccountId] = React.useState<string>("")
  const [assetName, setAssetName] = React.useState("")
  const [assetCode, setAssetCode] = React.useState("")
  const [usefulLifeMonths, setUsefulLifeMonths] = React.useState("60")
  const [invoiceReceived, setInvoiceReceived] = React.useState(false)
  const [documentType, setDocumentType] = React.useState<ExpenseDocumentType | "">("")
  const [invoiceNo, setInvoiceNo] = React.useState("")
  /** 경비·매입 — 인보이스·영수증 첨부 (이미지/PDF, 최대 3개) */
  const [expenseAttachmentFiles, setExpenseAttachmentFiles] = React.useState<File[]>([])

  const applyDocumentType = React.useCallback((next: ExpenseDocumentType | "") => {
    setDocumentType(next)
    setInvoiceReceived(invoiceReceivedFromDocumentType(next || null))
  }, [])
  const [accrualVatAmount, setAccrualVatAmount] = React.useState("")
  const [accrualWithholdingTax, setAccrualWithholdingTax] = React.useState("")
  /** 선택 시 (총액−VAT)×% 로 WHT 자동 계산. null = 미선택 */
  const [accrualWhtRate, setAccrualWhtRate] = React.useState<number | null>(null)
  const [autoCreateWhtCert, setAutoCreateWhtCert] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [deliveryFeeSaving, setDeliveryFeeSaving] = React.useState(false)
  const [deliveryFeeMonth, setDeliveryFeeMonth] = React.useState(() => todayStrBkk().slice(0, 7))
  const [deliveryFeeAmounts, setDeliveryFeeAmounts] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(DELIVERY_APP_FEE_PRESETS.map((preset) => [preset.id, ""]))
  )
  const [cardFeeSaving, setCardFeeSaving] = React.useState(false)
  const [cardFeeMonth, setCardFeeMonth] = React.useState(() => todayStrBkk().slice(0, 7))
  const [cardFeeAmounts, setCardFeeAmounts] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(CARD_FEE_PRESETS.map((preset) => [preset.id, ""]))
  )
  const [deliveryFeeDialogOpen, setDeliveryFeeDialogOpen] = React.useState(false)
  const [cardFeeDialogOpen, setCardFeeDialogOpen] = React.useState(false)
  const [deliveryFeeVatMode, setDeliveryFeeVatMode] = React.useState<ExpenseFeeVatMode>("included")
  const [cardFeeVatMode, setCardFeeVatMode] = React.useState<ExpenseFeeVatMode>("included")
  /** 수수료 빠른 입력 시 메인 폼 금액·VAT 해석 기준 */
  const [activeFeeVatMode, setActiveFeeVatMode] = React.useState<ExpenseFeeVatMode | null>(null)
  const [expensePayMode, setExpensePayMode] = React.useState<"immediate" | "later">("later")
  const [payeeCode, setPayeeCode] = React.useState("")
  const [payeeName, setPayeeName] = React.useState("")
  const [payeeManual, setPayeeManual] = React.useState(false)
  const [advanceInstallments, setAdvanceInstallments] = React.useState("1")
  const [advanceInstallmentCurrent, setAdvanceInstallmentCurrent] = React.useState("1")

  const [inboundBatchesForLink, setInboundBatchesForLink] = React.useState<InboundBatchForLink[]>([])
  const [inboundLinkAmounts, setInboundLinkAmounts] = React.useState<Record<number, string>>({})
  const [inboundLinkLoading, setInboundLinkLoading] = React.useState(false)

  const [vendors, setVendors] = React.useState<
    { code: string; name: string; bankAccountNo?: string | null; taxId?: string; address?: string }[]
  >([])
  const [bankAccounts, setBankAccounts] = React.useState<BankAccount[]>([])
  const [cardAccounts, setCardAccounts] = React.useState<CardAccount[]>([])
  const [subjects, setSubjects] = React.useState<AccountSubjectItem[]>([])
  const [transferSubjects, setTransferSubjects] = React.useState<AccountSubjectItem[]>([])
  const [subjectEnglishNames, setSubjectEnglishNames] = React.useState<Record<number, string>>({})

  const searchParams = useSearchParams()
  const router = useRouter()
  const hasAppliedParams = React.useRef(false)
  const bankLinkStorePinned = React.useRef(false)
  const bankTransactionIdParam = searchParams.get("bankTransactionId")
  const editAccrualIdParam = searchParams.get("editAccrualId")
  const isEditAccrualMode = !!editAccrualIdParam && !!Number(editAccrualIdParam)
  const isEditMode = searchParams.get("editMode") === "1" && !!bankTransactionIdParam && !!Number(bankTransactionIdParam)
  const isBankLinkMode = !isEditMode && !!bankTransactionIdParam && !!Number(bankTransactionIdParam)
  /** 기존 통장 출금 건 수정·연동 — 지급예정(나중 지급) UI와 분리 */
  const isExistingBankTxMode = isEditMode || isBankLinkMode
  const updateExistingParam = searchParams.get("updateExisting") === "1"
  const startStrParam = searchParams.get("startStr")
  const endStrParam = searchParams.get("endStr")
  const returnTabParam = searchParams.get("returnTab")
  const returnOpenRegisterTxIdParam = searchParams.get("openRegisterTxId")

  const effectivePaymentMethod = "bank" as const
  const showBankAccountOutsideTransfer = categoryMain !== "transfer"

  React.useEffect(() => {
    if (isExistingBankTxMode) return
    if (categoryMain === "purchase") setExpensePayMode("later")
  }, [categoryMain, isExistingBankTxMode])

  const mapCategoryToMainSub = React.useCallback((catRaw: string): { main: string; sub: string } => {
    const c = String(catRaw || "").trim().toLowerCase()
    if (c === "purchase_payment") return { main: "purchase", sub: "normal" }
    if (c === "purchase_advance") return { main: "purchase", sub: "advance" }
    if (c === "expense") return { main: "expense", sub: "normal" }
    if (c === "expense_advance") return { main: "expense", sub: "advance" }
    if (c === "fixed_asset") return { main: "fixed_asset", sub: "" }
    if (c === "bank_card_bill" || c === "transfer_to_petty") return { main: "transfer", sub: "" }
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
    const accrualVatParam = searchParams.get("accrualVat")
    const accrualWhtParam = searchParams.get("accrualWht")
    const invoiceReceivedParam = searchParams.get("invoiceReceived")
    const invoiceNoParam = searchParams.get("invoiceNo")
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
      editAccrualId ||
      accrualVatParam ||
      accrualWhtParam ||
      invoiceReceivedParam ||
      invoiceNoParam
    if (hasAnyParam) {
      hasAppliedParams.current = true
      if (amountParam && parseMoneyAmount(amountParam) > 0) setAmount(moneyInputStringFromAmount(amountParam))
      if (bankMemoParam) setBankMemo(bankMemoParam)
      if (bankNoteParam || memoParam) {
        setMemo(memoParam || bankNoteUserDisplayText(bankNoteParam || "") || "")
      }
      if (transDateParam && /^\d{4}-\d{2}-\d{2}$/.test(transDateParam)) setTransDate(transDateParam)
      if (accountIdParam) setAccountId(accountIdParam)
      if (btIdParam) {
        const mapped = mapCategoryToMainSub(categoryParam || "")
        setCategoryMain(mapped.main)
        if (mapped.sub) setCategorySub(mapped.sub)
        if (mapped.main === "transfer") {
          setTransferKind(transferKindFromWithdrawalCategory(categoryParam || ""))
        }
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
        if (mapped.main === "transfer") {
          setTransferKind(transferKindFromWithdrawalCategory(categoryParam))
        }
      }
      if (payeeCodeParam) {
        const cardId = parseCardAccountIdFromPayeeCode(payeeCodeParam)
        if (cardId) setTransferToCardAccountId(String(cardId))
      }
      if (storeNameParam) {
        setStoreName(storeNameParam)
        bankLinkStorePinned.current = true
      }
      if (accrualVatParam != null && accrualVatParam !== "") {
        const v = Math.max(0, Number(accrualVatParam) || 0)
        setAccrualVatAmount(v > 0 ? String(v) : "")
      }
      if (accrualWhtParam != null && accrualWhtParam !== "") {
        const w = Math.max(0, Number(accrualWhtParam) || 0)
        setAccrualWithholdingTax(w > 0 ? String(w) : "")
      }
      if (invoiceReceivedParam === "1" || invoiceReceivedParam === "true") {
        applyDocumentType(documentTypeFromInvoiceReceived(true) || "tax_invoice")
      }
      if (invoiceNoParam) setInvoiceNo(invoiceNoParam)
      if (editAccrualId) {
        setExpensePayMode("later")
      }
    }
  }, [searchParams, mapCategoryToMainSub, applyDocumentType])

  React.useEffect(() => {
    if (!isBankLinkMode || bankLinkStorePinned.current) return
    const accountIdParam = searchParams.get("accountId")
    if (!accountIdParam) return
    const acc = bankAccounts.find((a) => String(a.id) === accountIdParam)
    const accStore = String(acc?.store || "").trim()
    if (accStore) {
      setStoreName(accStore)
      bankLinkStorePinned.current = true
    }
  }, [isBankLinkMode, bankAccounts, searchParams])

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
    if (
      categoryMain !== "expense" &&
      !(categoryMain === "transfer" && transferKind === "bank_general") &&
      accountSubjectId
    ) {
      setAccountSubjectId("")
    }
  }, [categoryMain, transferKind, accountSubjectId])

  React.useEffect(() => {
    if (categoryMain === "transfer" && transferKind === "bank_to_petty" && storeName) {
      setTransferToPettyStore(storeName)
    }
  }, [categoryMain, transferKind, storeName])

  const pettyCashStoreOptions = React.useMemo(
    () => (stores || []).filter((s) => s && s !== "All"),
    [stores]
  )

  const transferBankAccountsForStore = React.useMemo(() => {
    const sn = String(storeName || "").trim()
    if (!sn) return bankAccounts
    return bankAccounts.filter((a) => storesMatchForGradeLookup(a.store, sn))
  }, [bankAccounts, storeName])

  const transferCardAccountsForStore = React.useMemo(() => {
    const sn = String(storeName || "").trim()
    if (!sn) return cardAccounts
    return cardAccounts.filter((a) => {
      const cardStore = String(a.store || "").trim()
      return !cardStore || storesMatchForGradeLookup(cardStore, sn)
    })
  }, [cardAccounts, storeName])

  React.useEffect(() => {
    if (categoryMain !== "transfer") return
    setAccountId((prev) => {
      const list = transferBankAccountsForStore
      const exists = list.some((a) => String(a.id) === prev)
      if (exists) return prev
      return list[0] ? String(list[0].id) : ""
    })
  }, [categoryMain, transferBankAccountsForStore])

  React.useEffect(() => {
    if (categoryMain !== "transfer" || transferKind !== "bank_to_card") return
    setTransferToCardAccountId((prev) => {
      if (!prev) return prev
      const exists = transferCardAccountsForStore.some((a) => String(a.id) === prev)
      return exists ? prev : ""
    })
  }, [categoryMain, transferKind, transferCardAccountsForStore])

  const pickOfficeStore = React.useCallback((list: string[]) => {
    if (list.length === 0) return ""
    if (list.includes(CANONICAL_OFFICE_STORE)) return CANONICAL_OFFICE_STORE
    const office = list.find((s) => isOfficeStore(s))
    return office ? canonicalOfficeStore(office) : list[0]
  }, [])

  const availableStores = React.useMemo(() => {
    const merged = Array.from(
      new Set(
        [...(stores || []), String(auth?.store || "").trim()]
          .map((s) => canonicalOfficeStore(String(s || "").trim()))
          .filter(isSelectableStoreOption)
      )
    )
    return merged
      .sort((a, b) => {
        const lower = (x: string) => String(x).toLowerCase()
        const aOffice = ["office", "본사", "오피스"].includes(lower(a)) || lower(a).includes("office")
        const bOffice = ["office", "본사", "오피스"].includes(lower(b)) || lower(b).includes("office")
        if (aOffice && !bOffice) return -1
        if (!aOffice && bOffice) return 1
        return 0
      })
  }, [auth?.store, stores])

  const resolveStoreInList = React.useCallback((name: string, list: string[]) => {
    const n = String(name || "").trim()
    if (!n) return ""
    if (list.includes(n)) return n
    const fuzzy = list.find((s) => storesMatchForGradeLookup(s, n))
    return fuzzy || n
  }, [])

  const displayStoreName = React.useMemo(
    () => resolveStoreInList(storeName, availableStores),
    [storeName, availableStores, resolveStoreInList]
  )

  const storeSelectOptions = React.useMemo(() => {
    const pinned = String(storeName || "").trim()
    if (!pinned || availableStores.includes(pinned)) return availableStores
    return [pinned, ...availableStores]
  }, [availableStores, storeName])

  React.useEffect(() => {
    if (availableStores.length === 0) return
    if (bankLinkStorePinned.current) {
      const resolved = resolveStoreInList(storeName, availableStores)
      if (resolved && resolved !== storeName && availableStores.includes(resolved)) {
        setStoreName(resolved)
      }
      return
    }
    if (storeName && availableStores.includes(storeName)) return
    if (storeName) {
      const fuzzy = resolveStoreInList(storeName, availableStores)
      if (availableStores.includes(fuzzy)) {
        setStoreName(fuzzy)
        return
      }
    }
    setStoreName(pickOfficeStore(availableStores))
  }, [availableStores, pickOfficeStore, storeName, resolveStoreInList])

  React.useEffect(() => {
    const reloadSubjects = () => {
      getAccountSubjects(EXPENSE_WITHDRAW_SUBJECT_FETCH).catch(() => []).then(setSubjects)
      getAccountSubjects(TRANSFER_WITHDRAW_SUBJECT_FETCH).catch(() => []).then(setTransferSubjects)
    }
    reloadSubjects()
    const onVisible = () => {
      if (document.visibilityState === "visible") reloadSubjects()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [])

  const expenseSubjectOptions = React.useMemo(
    () => filterExpenseWithdrawAccountSubjects(subjects),
    [subjects]
  )

  React.useEffect(() => {
    getVendorsForPurchase().catch(() => []).then(setVendors)
    getCardAccounts().catch(() => []).then((list) => setCardAccounts(list || []))
  }, [])

  React.useEffect(() => {
    const candidates = [...subjects, ...transferSubjects].filter((s) => !s.nameEn && (s.name || "").trim())
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
  }, [subjects, transferSubjects])

  const getSubjectLabel = React.useCallback((s: AccountSubjectItem) => {
    return s.nameEn || (s.id != null ? subjectEnglishNames[s.id] : undefined) || s.name
  }, [subjectEnglishNames])

  React.useEffect(() => {
    const list = availableStores
    const effectiveStore = isExistingBankTxMode
      ? ""
      : storeName || (list[0] ? pickOfficeStore(list) : "")
    getBankAccounts({
      store: effectiveStore || undefined,
      userStore: auth?.store,
      userRole: auth?.role,
    })
      .catch(() => [])
      .then((accounts) => {
        setBankAccounts(accounts || [])
        setAccountId((prev) => {
          const urlAccountId = String(searchParams.get("accountId") || "").trim()
          const pinned = prev || urlAccountId
          if (isExistingBankTxMode && pinned) {
            const exists = (accounts || []).some((a) => String(a.id) === pinned)
            if (exists) return pinned
          }
          const exists = (accounts || []).some((a) => String(a.id) === prev)
          if (exists) return prev
          const first = (accounts || [])[0]
          return first ? String(first.id) : ""
        })
      })
  }, [storeName, auth?.role, auth?.store, availableStores, pickOfficeStore, isExistingBankTxMode, searchParams])

  const currentMain = CATEGORY_MAIN_OPTIONS.find((c) => c.value === categoryMain)
  const hasSub = currentMain && currentMain.sub.length > 0
  const hasTaxSub = categoryMain === "tax"
  const hasLoanSub = categoryMain === "loan"

  const isTransferPrepaymentAccrual =
    categoryMain === "transfer" && isTransferPrepaymentKind(transferKind)

  const isLaterPayment =
    !isExistingBankTxMode &&
    (isTransferPrepaymentAccrual ||
      ((categoryMain === "purchase" || categoryMain === "expense") && expensePayMode === "later"))

  const resolveAccountIdForSave = React.useCallback((): number => {
    const fromState = Number(accountId || 0)
    if (fromState > 0) return fromState
    const fromUrl = Number(searchParams.get("accountId") || 0)
    if (fromUrl > 0) return fromUrl
    const first = bankAccounts[0]
    return first ? Number(first.id) : 0
  }, [accountId, bankAccounts, searchParams])

  const showRecurringTemplatesBar = categoryMain === "purchase" || categoryMain === "expense"

  const handleExpenseOcrFields = React.useCallback(
    (f: ExpenseOcrFieldPayload) => {
      if (f.amount && f.amount > 0) {
        setAmount(moneyInputStringFromAmount(f.amount))
      }
      if (f.vatAmount && f.vatAmount > 0) {
        setAccrualVatAmount(moneyInputStringFromAmount(f.vatAmount))
      }
      if (f.withholdingTaxAmount && f.withholdingTaxAmount > 0) {
        setAccrualWithholdingTax(moneyInputStringFromAmount(f.withholdingTaxAmount))
      }
      if (f.expenseDate && /^\d{4}-\d{2}-\d{2}$/.test(f.expenseDate)) {
        setTransDate(f.expenseDate)
      }
      if (f.invoiceNo) {
        setInvoiceNo(f.invoiceNo)
        // 문서번호가 인식되면 유형이 비어 있을 때 Invoice로 기본 선택
        if (!documentType) applyDocumentType("invoice")
      }
      if (f.vendorNameHint) {
        const vendor = suggestVendorFromHint(vendors, f.vendorNameHint)
        if (vendor) {
          setPayeeCode(vendor.code)
          setPayeeName(vendor.name)
          setPayeeManual(false)
          if (categoryMain === "purchase") setVendorCode(vendor.code)
        } else if (!payeeName.trim()) {
          setPayeeName(f.vendorNameHint)
          setPayeeManual(true)
        }
      }
      if (categoryMain === "expense" && !accountSubjectId) {
        const subjectOpts = expenseSubjectOptions
          .filter((s) => s.id != null)
          .map((s) => ({ id: s.id!, code: s.code, name: s.name, nameEn: s.nameEn }))
        const sid = suggestAccountSubjectId(subjectOpts, {
          vendorName: f.vendorNameHint || payeeName,
          memo: [memo, f.vendorNameHint].filter(Boolean).join(" "),
          vendorCode: payeeCode,
        })
        if (sid) setAccountSubjectId(String(sid))
      }
    },
    [
      accountSubjectId,
      applyDocumentType,
      categoryMain,
      documentType,
      memo,
      payeeCode,
      payeeName,
      expenseSubjectOptions,
      vendors,
    ]
  )

  const accrualNetPreview = React.useMemo(() => {
    if (categoryMain !== "purchase" && categoryMain !== "expense") return null
    const g = parseMoneyAmount(amount)
    const w = Math.max(0, Math.abs(Number(String(accrualWithholdingTax).replace(/,/g, "")) || 0))
    return Math.max(0, g - w)
  }, [categoryMain, amount, accrualWithholdingTax])

  React.useEffect(() => {
    if (categoryMain !== "purchase" && categoryMain !== "expense") return
    if (accrualWhtRate == null || accrualWhtRate <= 0) return
    const g = parseMoneyAmount(amount)
    const v = Math.max(0, Number(String(accrualVatAmount).replace(/,/g, "")) || 0)
    const wht = expenseWhtAmountFromRate(g, v, accrualWhtRate)
    setAccrualWithholdingTax(wht > 0 ? moneyInputStringFromAmount(wht) : "")
  }, [categoryMain, amount, accrualVatAmount, accrualWhtRate])

  const resolvePayeeForWht = React.useCallback(
    (codeRaw: string, nameRaw: string) => resolveVendorPayeeForWht(vendors, codeRaw, nameRaw),
    [vendors]
  )

  const openExpenseWhtCertificateIfNeeded = React.useCallback(
    async (params: {
      certificateNo: string
      payeeName: string
      payeeTaxId?: string
      payeeAddress?: string
      grossInclVat: number
      vatAmount: number
      whtAmount: number
      whtRate: number | null
      paymentDate: string
      memo?: string
      storeName?: string
    }) => {
      if (!autoCreateWhtCert || params.whtAmount <= 0) return
      try {
        const ho = await getHeadOfficeInfo()
        const cert = whtCertificateFromExpenseRegister(
          {
            certificateNo: params.certificateNo,
            paymentDate: params.paymentDate,
            payeeName: params.payeeName,
            payeeTaxId: params.payeeTaxId,
            payeeAddress: params.payeeAddress,
            grossInclVat: params.grossInclVat,
            vatAmount: params.vatAmount,
            whtRate: params.whtRate,
            whtAmount: params.whtAmount,
            memo: params.memo,
            storeName: params.storeName,
          },
          {
            companyName: ho.companyName || "",
            taxId: ho.taxId || "",
            address: ho.address || "",
            phone: ho.phone,
          }
        )
        if (cert) openWhtCertificatePrintWindow([cert], lang)
      } catch (e) {
        console.error("openExpenseWhtCertificateIfNeeded:", e)
      }
    },
    [autoCreateWhtCert, lang]
  )

  const sumInboundLinkAmounts = React.useCallback(() => {
    return Object.values(inboundLinkAmounts).reduce((sum, raw) => {
      const n = Number(String(raw).replace(/,/g, ""))
      return sum + (Number.isFinite(n) && n > 0 ? n : 0)
    }, 0)
  }, [inboundLinkAmounts])

  const resolvePurchaseVendorPayee = React.useCallback(
    (codeRaw: string) => {
      const code = String(codeRaw || "").trim()
      if (!code) return { code: "", name: "" }
      const found = vendors.find((v) => v.code === code)
      return { code, name: found?.name || code }
    },
    [vendors]
  )

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
      purchase_payment: tt("wm_purchase", "Purchase Payment"),
      purchase_advance: tt("wm_advance", "Advance Payment"),
      expense: tt("wm_expense", "Expense"),
      expense_advance: tt("wm_advance", "Advance Payment"),
      fixed_asset: tt("wm_fixed_asset", "Fixed Asset"),
      transfer: tt("wm_transfer", "Transfer"),
      tax_vat: tt("wm_tax_vat", "VAT"),
      tax_withholding: tt("wm_tax_withholding", "Withholding Tax"),
      tax_corporate: tt("wm_tax_corporate", "Corporate Tax"),
      loan_repayment: tt("wm_loan_repayment", "Loan Repayment"),
      loan_given: tt("wm_loan_given", "Loan Given"),
      correction: tt("wm_correction", "Correction"),
      dividend: tt("wm_dividend", "Dividend/Owner Draw"),
    }
    return map[withdrawalCategory] || tt("wm_expense", "Expense")
  }, [tt])

  const handleRegisterAccrual = async () => {
    let amt = parseMoneyAmount(amount)
    if (
      categoryMain === "purchase" &&
      (!Number.isFinite(amt) || amt <= 0)
    ) {
      const fromLinks = sumInboundLinkAmounts()
      if (fromLinks > 0) {
        amt = fromLinks
        setAmount(String(fromLinks))
      }
    }
    const withdrawalCategory =
      categoryMain === "transfer"
        ? withdrawalCategoryFromTransferKind(transferKind)
        : resolveWithdrawalCategory(categoryMain, categorySub)
    let code = payeeCode.trim()
    let name = payeeName.trim()
    if (categoryMain === "purchase") {
      if (!vendorCode.trim()) {
        await appAlert(tt("inAlertSelectVendor", "Please select a vendor."))
        return
      }
      const resolved = resolvePurchaseVendorPayee(vendorCode)
      code = resolved.code
      name = resolved.name
    } else if (categoryMain === "expense") {
      if (!code && !name) {
        await appAlert(tt("expensePayeeRequired", "Please select or enter a payee."))
        return
      }
      if (!code) code = name
      if (!name) name = code
    } else if (categoryMain === "transfer") {
      if (transferKind === "bank_to_petty") {
        if (!transferToPettyStore.trim()) {
          await appAlert(tt("wm_transferToPetty", "패티캐시 매장") + tt("msg_enter_required_suffix", " is required."))
          return
        }
        code = transferToPettyStore.trim()
        name = `${transferToPettyStore.trim()} · ${tt("wm_transferKindBankToPetty", "통장 → 패티캐시")}`
      } else if (transferKind === "bank_to_card") {
        if (!transferToCardAccountId) {
          await appAlert(tt("wm_transferCardRequired", "Please select a card to charge."))
          return
        }
        code = encodeCardPayeeCode(Number(transferToCardAccountId))
        const card = cardAccounts.find((a) => String(a.id) === transferToCardAccountId)
        name = card?.name
          ? `${card.name}${card.store ? ` (${card.store})` : ""}`
          : tt("wm_transferKindBankToCard", "통장 → 카드 대금")
      } else {
        if (!accountSubjectId || accountSubjectId === "__none__") {
          await appAlert(tt("wm_transferAccountSubjectRequired", "이체 계정과목을 선택해 주세요."))
          return
        }
        const subject = transferSubjects.find((s) => String(s.id) === accountSubjectId)
        const subjectLabel = subject ? getSubjectLabel(subject) : accountSubjectId
        code = `transfer_${accountSubjectId}`
        name = subjectLabel || tt("wm_transferKindBankGeneral", "일반 이체")
      }
    } else {
      code = code || `auto_${withdrawalCategory}`
      name = name || getAutoPayeeName(withdrawalCategory)
    }
    if (!amt || amt <= 0) {
      const msg =
        categoryMain === "purchase" && sumInboundLinkAmounts() <= 0
          ? tt(
              "expenseAccrualPurchaseAmountRequired",
              "Enter the total (incl. tax) or link amounts for inbound batches."
            )
          : tt("pettyAlertAmount", "Please enter amount.")
      await appAlert(msg)
      return
    }
    if (!storeName) {
      await appAlert(tt("expenseStoreSelect", "Please select a store."))
      return
    }
    const feeResolved =
      categoryMain === "expense" ? resolveFeeSubmitAmounts(amt, activeFeeVatMode) : null
    let submitInvoiceReceived = invoiceReceived
    let submitDocumentType: ExpenseDocumentType | "" = documentType
    if (feeResolved) {
      amt = feeResolved.gross
      submitInvoiceReceived = feeResolved.invoiceReceived
      submitDocumentType = feeResolved.invoiceReceived ? "tax_invoice" : documentType
    }
    const vatV = feeResolved
      ? feeResolved.vat
      : categoryMain === "purchase" || categoryMain === "expense"
        ? Math.max(0, Number(String(accrualVatAmount).replace(/,/g, "")) || 0)
        : 0
    const whtV =
      categoryMain === "purchase" || categoryMain === "expense"
        ? Math.max(0, Number(String(accrualWithholdingTax).replace(/,/g, "")) || 0)
        : 0
    if ((categoryMain === "purchase" || categoryMain === "expense") && amt - whtV <= 0) {
      await appAlert(tt("expenseAccrualNetPositiveRequired", "Net payable amount must be greater than 0. Check total and withholding tax."))
      return
    }
    let attachmentUrls: string[] | undefined
    let accrualInvoicePhotoUrl: string | undefined
    if (
      (categoryMain === "purchase" || categoryMain === "expense") &&
      expenseAttachmentFiles.length > 0
    ) {
      try {
        const processed = await processExpenseAttachmentFiles(expenseAttachmentFiles)
        attachmentUrls = processed.attachmentUrls
        accrualInvoicePhotoUrl = processed.invoicePhotoUrl
      } catch (e) {
        const msg =
          e instanceof Error && e.message === "FILE_TOO_LARGE"
            ? tt("expenseAccrualAttachTooLarge", "Attachment is too large. Please upload PDF files under 1.5MB.")
            : tt("expenseAccrualAttachFail", "Failed to process attachment.")
        await appAlert(msg)
        return
      }
    }

    setSaving(true)
    try {
      if (isEditAccrualMode && editAccrualIdParam) {
        const res = await updateExpenseAccrual({
          expenseAccrualId: Number(editAccrualIdParam),
          amount: amt,
          vatAmount: vatV,
          withholdingTaxAmount: whtV,
          expenseDate: transDate,
          dueDate: transDate,
          memo: memo.trim() || undefined,
          payeeCode: code || undefined,
          payeeName: name || undefined,
          accountSubjectId:
            categoryMain === "expense" && accountSubjectId && accountSubjectId !== "__none__"
              ? Number(accountSubjectId)
              : categoryMain === "transfer" && transferKind === "bank_general" && accountSubjectId
                ? Number(accountSubjectId)
                : null,
          storeName: storeName || undefined,
          withdrawalCategory,
          categoryMain,
          categorySub: (hasSub || hasTaxSub || hasLoanSub) ? categorySub : undefined,
          userRole: auth?.role,
          ...(attachmentUrls && attachmentUrls.length > 0 ? { attachmentUrls } : {}),
          ...(categoryMain === "purchase" || categoryMain === "expense"
            ? {
                invoiceReceived: submitInvoiceReceived,
                documentType: submitDocumentType || null,
                invoiceNo: invoiceNo.trim() || undefined,
                ...(accrualInvoicePhotoUrl ? { invoicePhotoUrl: accrualInvoicePhotoUrl } : {}),
              }
            : {}),
        })
        if (!res.success) {
          await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
          return
        }
        await openExpenseWhtCertificateIfNeeded({
          certificateNo: `EAW-${editAccrualIdParam}`,
          payeeName: name || code,
          ...(() => {
            const p = resolvePayeeForWht(code, name)
            return { payeeTaxId: p.taxId, payeeAddress: p.address }
          })(),
          grossInclVat: amt,
          vatAmount: vatV,
          whtAmount: whtV,
          whtRate: accrualWhtRate,
          paymentDate: transDate,
          memo: memo.trim() || undefined,
          storeName: storeName || undefined,
        })
        setAmount("")
        setMemo("")
        setPayeeCode("")
        setPayeeName("")
        setExpenseAttachmentFiles([])
        setAccrualVatAmount("")
        setAccrualWithholdingTax("")
        setAccrualWhtRate(null)
        setAutoCreateWhtCert(false)
        setInvoiceReceived(false)
        setDocumentType("")
        setInvoiceNo("")
        setActiveFeeVatMode(null)
        hasAppliedParams.current = false
        onAccrualSaved?.({ expenseDate: transDate })
        await appAlert(tt("wm_accrualUpdateSuccess", "Updated. Please check in the payment plan tab."))
      } else {
        const res = await addExpenseAccrual({
          payeeCode: code || name,
          payeeName: name || code,
          withdrawalCategory,
          categoryMain,
          categorySub: (hasSub || hasTaxSub || hasLoanSub) ? categorySub : undefined,
          amount: amt,
          vatAmount: vatV,
          withholdingTaxAmount: whtV,
          expenseDate: transDate,
          dueDate: transDate,
          memo: memo.trim() || undefined,
          accountSubjectId: categoryMain === "expense" && accountSubjectId ? Number(accountSubjectId) : null,
          storeName: storeName || undefined,
          userName: auth?.user,
          userRole: auth?.role,
          ...(attachmentUrls && attachmentUrls.length > 0 ? { attachmentUrls } : {}),
          ...(categoryMain === "purchase" || categoryMain === "expense"
            ? {
                invoiceReceived: submitInvoiceReceived,
                documentType: submitDocumentType || null,
                invoiceNo: invoiceNo.trim() || undefined,
                ...(accrualInvoicePhotoUrl ? { invoicePhotoUrl: accrualInvoicePhotoUrl } : {}),
              }
            : {}),
        })
        if (!res.success) {
          await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
          return
        }
        const queued = (res as { queued?: boolean }).queued === true
        const newId = Math.floor(Number(res.id) || 0)
        if (!queued) {
          await openExpenseWhtCertificateIfNeeded({
            certificateNo: newId > 0 ? `EAW-${newId}` : `EAW-${Date.now()}`,
            payeeName: name || code,
            ...(() => {
              const p = resolvePayeeForWht(code, name)
              return { payeeTaxId: p.taxId, payeeAddress: p.address }
            })(),
            grossInclVat: amt,
            vatAmount: vatV,
            whtAmount: whtV,
            whtRate: accrualWhtRate,
            paymentDate: transDate,
            memo: memo.trim() || undefined,
            storeName: storeName || undefined,
          })
        }
        setAmount("")
        setMemo("")
        setPayeeCode("")
        setPayeeName("")
        setVendorCode("")
        setExpenseAttachmentFiles([])
        setAccrualVatAmount("")
        setAccrualWithholdingTax("")
        setAccrualWhtRate(null)
        setAutoCreateWhtCert(false)
        setInvoiceReceived(false)
        setDocumentType("")
        setInvoiceNo("")
        setActiveFeeVatMode(null)
        if (queued) {
          await appAlert(
            tt(
              "expenseAccrualQueuedOffline",
              "Saved to this device offline queue. It will appear in the payment plan tab after the network syncs."
            )
          )
          return
        }
        onAccrualSaved?.({ expenseDate: transDate })
        await appAlert(tt("wm_accrualSuccess", "Saved. Please check in the payment plan tab."))
      }
    } finally {
      setSaving(false)
    }
  }

  const handleEditSubmit = async () => {
    if (!bankTransactionIdParam) return
    const amt = parseMoneyAmount(amount)
    if (!amt || amt <= 0) {
      await appAlert(tt("pettyAlertAmount", "Please enter amount."))
      return
    }
    if (!categoryMain) {
      await appAlert(tt("wm_selectCategory", "Please select a withdrawal category."))
      return
    }
    const resolvedAccountId = resolveAccountIdForSave()
    if (!resolvedAccountId) {
      await appAlert(tt("bankAccount", "Please select an account."))
      return
    }
    if (categoryMain === "purchase" && !vendorCode) {
      await appAlert(tt("inAlertSelectVendor", "Please select a vendor."))
      return
    }
    if (categoryMain === "expense" && !accountSubjectId) {
      await appAlert(tt("wm_accountSubjectPlaceholder", "Please select an account subject."))
      return
    }
    if (categoryMain === "transfer" && transferKind === "bank_general" && !accountSubjectId) {
      await appAlert(tt("wm_transferAccountSubjectRequired", "이체 계정과목을 선택해 주세요."))
      return
    }
    if (categoryMain === "expense") {
      const code = payeeCode.trim() || vendorCode.trim()
      const name = payeeName.trim() || code
      if (!code && !name) {
        await appAlert(tt("expensePayeeRequired", "Please select or enter a payee."))
        return
      }
    }

    let invoicePhotoUrl: string | undefined
    if (
      expenseAttachmentFiles.length > 0 &&
      (categoryMain === "purchase" || categoryMain === "expense")
    ) {
      try {
        const processed = await processExpenseAttachmentFiles(expenseAttachmentFiles)
        invoicePhotoUrl = processed.invoicePhotoUrl
      } catch {
        invoicePhotoUrl = undefined
      }
    }

    setSaving(true)
    try {
      if (categoryMain === "expense") {
        const code = payeeCode.trim() || vendorCode.trim()
        const name = payeeName.trim() || code
        const res = await registerExpenseFromBankTransaction({
          bankTransactionId: Number(bankTransactionIdParam),
          payeeCode: code || name,
          payeeName: name || code,
          accountSubjectId: accountSubjectId ? Number(accountSubjectId) : null,
          memo: memo.trim() || undefined,
          storeName: storeName || undefined,
          userName: auth?.user,
          userRole: auth?.role,
          updateExisting: true,
        })
        if (!res.success) {
          await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
          return
        }
        await appAlert(res.message || tt("saved", "Saved."))
        return
      }

      const res = await updateExpenseRegisterItem({
        bankTransactionId: Number(bankTransactionIdParam),
        accountId: resolvedAccountId,
        amount: amt,
        transDate,
        memo: memo.trim() || undefined,
        storeName: storeName || undefined,
        categoryMain,
        categorySub: (hasSub || hasTaxSub || hasLoanSub) ? categorySub : undefined,
        vendorCode: categoryMain === "purchase" ? vendorCode || undefined : undefined,
        accountSubjectId:
          categoryMain === "transfer" && transferKind === "bank_general" && accountSubjectId
            ? Number(accountSubjectId)
            : undefined,
        invoiceReceived: categoryMain === "purchase" ? invoiceReceived : undefined,
        documentType:
          categoryMain === "purchase" || categoryMain === "expense"
            ? documentType || null
            : undefined,
        invoiceNo: categoryMain === "purchase" ? invoiceNo.trim() || undefined : undefined,
        invoicePhotoUrl,
        userRole: auth?.role,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
        return
      }
      await appAlert(tt("saved", "Saved."))
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (isEditMode) {
      await handleEditSubmit()
      return
    }
    if (isEditAccrualMode) {
      await handleRegisterAccrual()
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
    if (categoryMain === "purchase") {
      await appAlert(tt("purchasePaymentViaExpenseOnly", PURCHASE_PAYMENT_VIA_EXPENSE_ONLY_MESSAGE))
      return
    }
    const amt = parseMoneyAmount(amount)
    if (!amt || amt <= 0) {
      await appAlert(tt("pettyAlertAmount", "Please enter amount."))
      return
    }
    if (!categoryMain) {
      await appAlert(tt("wm_selectCategory", "Please select a withdrawal category."))
      return
    }
    if (!accountId) {
      await appAlert(tt("bankAccount", "Please select an account."))
      return
    }
    if (!storeName) {
      await appAlert(tt("expenseStoreSelect", "Please select a store."))
      return
    }
    if (categoryMain === "expense") {
      const code = payeeCode.trim()
      const name = payeeName.trim()
      if (!code && !name) {
        await appAlert(tt("expensePayeeRequired", "Please select or enter a payee."))
        return
      }
    }
    if (categoryMain === "transfer" && transferKind === "bank_general") {
      const hasExternal =
        transferBankAccountNo.trim().length > 0 && transferBankRecipientName.trim().length > 0
      const hasPartialExternal =
        transferBankAccountNo.trim().length > 0 || transferBankRecipientName.trim().length > 0
      if (hasPartialExternal && !hasExternal) {
        await appAlert(tt("wm_transferBankRequired", "계좌번호와 받는 사람을 입력해 주세요."))
        return
      }
      if (!hasExternal && !accountSubjectId) {
        await appAlert(tt("wm_transferAccountSubjectRequired", "이체 계정과목을 선택해 주세요."))
        return
      }
    }
    if (categoryMain === "transfer" && transferKind === "bank_to_petty" && !transferToPettyStore.trim()) {
      await appAlert(tt("wm_transferToPetty", "패티캐시 매장") + tt("msg_enter_required_suffix", " is required."))
      return
    }

    let invoicePhotoUrl: string | undefined
    let attachmentUrls: string[] | undefined
    if (
      expenseAttachmentFiles.length > 0 &&
      (categoryMain === "purchase" || categoryMain === "expense")
    ) {
      try {
        const processed = await processExpenseAttachmentFiles(expenseAttachmentFiles)
        attachmentUrls = processed.attachmentUrls
        invoicePhotoUrl = processed.invoicePhotoUrl
      } catch (e) {
        const msg =
          e instanceof Error && e.message === "FILE_TOO_LARGE"
            ? tt("expenseAccrualAttachTooLarge", "Attachment is too large. Please upload PDF files under 1.5MB.")
            : tt("expenseAccrualAttachFail", "Failed to process attachment.")
        await appAlert(msg)
        return
      }
    }

    const feeResolved =
      categoryMain === "expense" ? resolveFeeSubmitAmounts(amt, activeFeeVatMode) : null
    const submitAmt = feeResolved?.gross ?? amt
    const submitVat = feeResolved
      ? feeResolved.vat
      : Math.max(0, Number(String(accrualVatAmount).replace(/,/g, "")) || 0)
    const submitWht =
      categoryMain === "purchase" || categoryMain === "expense"
        ? Math.max(0, Number(String(accrualWithholdingTax).replace(/,/g, "")) || 0)
        : 0
    if ((categoryMain === "purchase" || categoryMain === "expense") && submitAmt - submitWht <= 0) {
      await appAlert(tt("expenseAccrualNetPositiveRequired", "Net payable amount must be greater than 0. Check total and withholding tax."))
      return
    }
    const submitInvoiceReceived = feeResolved ? feeResolved.invoiceReceived : invoiceReceived
    const submitDocumentType: ExpenseDocumentType | "" = feeResolved?.invoiceReceived
      ? "tax_invoice"
      : documentType

    setSaving(true)
    try {
      const memoText = memo.trim() || (showAdvanceInstallments && advanceInstallments
        ? `Advance ${advanceInstallmentCurrent || "1"}/${advanceInstallments} installments`
        : undefined)

      const res = await executeWithdrawal({
        paymentMethod: effectivePaymentMethod,
        amount: submitAmt,
        transDate,
        memo: memoText || undefined,
        storeName: storeName || undefined,
        categoryMain,
        categorySub: (hasSub || hasTaxSub || hasLoanSub) ? categorySub : undefined,
        vendorCode:
          categoryMain === "purchase"
            ? vendorCode || undefined
            : categoryMain === "expense" && payeeCode.trim()
              ? payeeCode.trim()
              : undefined,
        accountSubjectId:
          categoryMain === "expense" && accountSubjectId
            ? Number(accountSubjectId)
            : categoryMain === "transfer" &&
                transferKind === "bank_general" &&
                accountSubjectId &&
                !(transferBankAccountNo.trim() && transferBankRecipientName.trim())
              ? Number(accountSubjectId)
              : undefined,
        accountSubjectCode:
          categoryMain === "expense"
            ? subjects.find((s) => String(s.id) === accountSubjectId)?.code
            : categoryMain === "transfer" &&
                transferKind === "bank_general" &&
                !(transferBankAccountNo.trim() && transferBankRecipientName.trim())
              ? transferSubjects.find((s) => String(s.id) === accountSubjectId)?.code
              : undefined,
        accountSubjectName:
          categoryMain === "expense"
            ? (() => {
                const subject = subjects.find((s) => String(s.id) === accountSubjectId)
                return subject ? getSubjectLabel(subject) : undefined
              })()
            : categoryMain === "transfer" &&
                transferKind === "bank_general" &&
                !(transferBankAccountNo.trim() && transferBankRecipientName.trim())
              ? (() => {
                  const subject = transferSubjects.find((s) => String(s.id) === accountSubjectId)
                  return subject ? getSubjectLabel(subject) : undefined
                })()
              : undefined,
        accountId:
          (categoryMain === "transfer" || showBankAccountOutsideTransfer) && accountId
            ? Number(accountId)
            : undefined,
        transferBankAccountNo:
          categoryMain === "transfer" &&
          transferKind === "bank_general" &&
          transferBankAccountNo.trim()
            ? transferBankAccountNo.trim()
            : undefined,
        transferBankRecipientName:
          categoryMain === "transfer" &&
          transferKind === "bank_general" &&
          transferBankRecipientName.trim()
            ? transferBankRecipientName.trim()
            : undefined,
        transferToPettyStore:
          categoryMain === "transfer" && transferKind === "bank_to_petty" && transferToPettyStore.trim()
            ? transferToPettyStore.trim()
            : undefined,
        assetName: categoryMain === "fixed_asset" ? assetName || undefined : undefined,
        assetCode: categoryMain === "fixed_asset" ? assetCode || undefined : undefined,
        usefulLifeMonths: categoryMain === "fixed_asset" ? Number(usefulLifeMonths) || 60 : undefined,
        invoiceReceived: (categoryMain === "purchase" || categoryMain === "expense") ? submitInvoiceReceived : undefined,
        documentType:
          categoryMain === "purchase" || categoryMain === "expense"
            ? submitDocumentType || null
            : undefined,
        invoiceNo: (categoryMain === "purchase" || categoryMain === "expense") ? invoiceNo.trim() || undefined : undefined,
        invoicePhotoUrl,
        vatAmount:
          categoryMain === "purchase" || categoryMain === "expense"
            ? submitVat > 0 ? submitVat : undefined
            : undefined,
        withholdingTaxAmount:
          categoryMain === "purchase" || categoryMain === "expense"
            ? submitWht > 0 ? submitWht : undefined
            : undefined,
        withholdingTaxRate:
          (categoryMain === "purchase" || categoryMain === "expense") &&
          accrualWhtRate != null &&
          accrualWhtRate > 0
            ? accrualWhtRate
            : undefined,
        ...(attachmentUrls && attachmentUrls.length > 0 ? { attachmentUrls } : {}),
        userName: auth?.user,
        userRole: auth?.role,
        userStore: auth?.store,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
        return
      }
      const newBankTxId = res.bankTransactionId ?? undefined
      if (
        (categoryMain === "purchase" || categoryMain === "expense") &&
        submitWht > 0
      ) {
        const payeeLabel =
          categoryMain === "purchase"
            ? resolvePurchaseVendorPayee(vendorCode).name || vendorCode
            : payeeName.trim() || payeeCode.trim() || "—"
        const payeeCodeForWht =
          categoryMain === "purchase" ? vendorCode : payeeCode.trim() || vendorCode.trim()
        const payeeWht = resolvePayeeForWht(payeeCodeForWht, payeeLabel)
        await openExpenseWhtCertificateIfNeeded({
          certificateNo: newBankTxId ? `BTW-${newBankTxId}` : `BTW-${Date.now()}`,
          payeeName: payeeLabel,
          payeeTaxId: payeeWht.taxId,
          payeeAddress: payeeWht.address,
          grossInclVat: submitAmt,
          vatAmount: submitVat,
          whtAmount: submitWht,
          whtRate: accrualWhtRate,
          paymentDate: transDate,
          memo: memoText || undefined,
          storeName: storeName || undefined,
        })
      }
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
      setExpenseAttachmentFiles([])
      setInboundLinkAmounts({})
      setAccrualVatAmount("")
      setAccrualWithholdingTax("")
      setAccrualWhtRate(null)
      setAutoCreateWhtCert(false)
      setActiveFeeVatMode(null)
      if (res.fixedAssetId) {
        await appAlert(tt("wm_successWithAsset", "Saved. Check auto-linking in the depreciation menu."))
      } else {
        await appAlert(tt("success", "Saved."))
      }
    } finally {
      setSaving(false)
    }
  }

  const handleMarkBankForCardBill = React.useCallback(
    async (bankTransactionId: number) => {
      const res = await markBankTransactionForCardBill({
        bankTransactionId,
        userName: auth?.user,
        userRole: auth?.role,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
        return false
      }
      await appAlert(
        translateApiMessage(res.message, t) ||
          tt("expenseRegisterCardBillQueued", "카드대금 연동 대기열에 등록되었습니다. 카드 관리 탭에서 연동하세요.")
      )
      return true
    },
    [auth?.role, auth?.user, t, tt]
  )

  const handleMarkBankForPetty = React.useCallback(
    async (bankTransactionId: number) => {
      const res = await markBankTransactionForPettyCash({
        bankTransactionId,
        userName: auth?.user,
        userRole: auth?.role,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
        return false
      }
      await appAlert(
        translateApiMessage(res.message, t) ||
          tt("expenseRegisterPettyQueued", "패티캐시 연동 대기열에 등록되었습니다. 패티 캐쉬 탭에서 연동하세요.")
      )
      return true
    },
    [auth?.role, auth?.user, t, tt]
  )

  const showAdvanceInstallments = categorySub === "advance" && (categoryMain === "purchase" || categoryMain === "expense")
  const deliveryFeeAccountSubjectId = React.useMemo(() => {
    const byCode = subjects.find((s) => String(s.code || "").trim() === "5528")
    if (byCode?.id != null) return String(byCode.id)
    const picked = subjects.find((s) => {
      const txt = `${String(s.code || "")} ${String(s.name || "")} ${String(s.nameEn || "")}`.toLowerCase()
      return (
        txt.includes("delivery fee") ||
        txt.includes("delivery platform") ||
        txt.includes("배달앱수수료") ||
        txt.includes("배달") ||
        txt.includes("platform fee")
      )
    })
    return picked?.id != null ? String(picked.id) : ""
  }, [subjects])

  const applyDeliveryFeePreset = React.useCallback((preset: (typeof DELIVERY_APP_FEE_PRESETS)[number]) => {
    setCategoryMain("expense")
    setCategorySub("normal")
    setPayeeManual(true)
    setPayeeCode(preset.code)
    setPayeeName(preset.name)
    setMemo((prev) => {
      const cur = String(prev || "").trim()
      return cur ? cur : preset.memo
    })
    if (deliveryFeeAccountSubjectId) {
      setAccountSubjectId(deliveryFeeAccountSubjectId)
    }
    setActiveFeeVatMode(deliveryFeeVatMode)
    setDeliveryFeeDialogOpen(false)
  }, [deliveryFeeAccountSubjectId, deliveryFeeVatMode])
  const cardFeeAccountSubjectId = React.useMemo(() => {
    const byCode = subjects.find((s) => String(s.code || "").trim() === "5529")
    if (byCode?.id != null) return String(byCode.id)
    const picked = subjects.find((s) => {
      const txt = `${String(s.code || "")} ${String(s.name || "")} ${String(s.nameEn || "")}`.toLowerCase()
      return (
        txt.includes("card fee") ||
        txt.includes("카드수수료") ||
        txt.includes("카드 수수료") ||
        txt.includes("credit card fee") ||
        txt.includes("merchant fee")
      )
    })
    return picked?.id != null ? String(picked.id) : ""
  }, [subjects])

  const applyCardFeePreset = React.useCallback((preset: (typeof CARD_FEE_PRESETS)[number]) => {
    setCategoryMain("expense")
    setCategorySub("normal")
    setPayeeManual(true)
    setPayeeCode(preset.code)
    setPayeeName(preset.name)
    setMemo((prev) => {
      const cur = String(prev || "").trim()
      return cur ? cur : preset.memo
    })
    if (cardFeeAccountSubjectId) {
      setAccountSubjectId(cardFeeAccountSubjectId)
    }
    setActiveFeeVatMode(cardFeeVatMode)
    setCardFeeDialogOpen(false)
  }, [cardFeeAccountSubjectId, cardFeeVatMode])
  const handleMoneyInputChange = React.useCallback((raw: string, setter: (value: string) => void) => {
    setter(normalizeMoneyInputString(raw))
  }, [])

  const handleDeliveryFeeAmountChange = React.useCallback((presetId: string, raw: string) => {
    setDeliveryFeeAmounts((prev) => ({ ...prev, [presetId]: normalizeMoneyInputString(raw) }))
  }, [])

  const handleCardFeeAmountChange = React.useCallback((presetId: string, raw: string) => {
    setCardFeeAmounts((prev) => ({ ...prev, [presetId]: normalizeMoneyInputString(raw) }))
  }, [])

  const feeVatModeLabel = React.useCallback(
    (mode: ExpenseFeeVatMode) => {
      if (mode === "separate") return tt("expenseFeeVatSeparate", "VAT separate")
      return tt("expenseFeeVatIncluded", "VAT included")
    },
    [tt]
  )

  const feeAmountFieldLabel = React.useCallback(
    (mode: ExpenseFeeVatMode) => {
      if (mode === "separate") return tt("expenseFeeAmountSeparate", "Net (excl. VAT)")
      return tt("expenseFeeAmountIncluded", "Amount (incl. VAT)")
    },
    [tt]
  )

  const feeVatModeHint = React.useCallback(
    (mode: ExpenseFeeVatMode) => {
      if (mode === "separate") {
        return tt(
          "expenseFeeVatSeparateHint",
          "Enter the net amount before VAT. Withdrawal adds 7% VAT on top."
        )
      }
      return tt(
        "expenseFeeVatIncludedHint",
        "Enter the invoice total including 7% VAT. Withdrawal uses this gross amount."
      )
    },
    [tt]
  )

  const renderFeeVatModePicker = React.useCallback(
    (mode: ExpenseFeeVatMode, onChange: (next: ExpenseFeeVatMode) => void) => (
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{tt("expenseFeeVatModeLabel", "VAT basis")}</Label>
        <div className="flex flex-wrap gap-2">
          {(["included", "separate"] as const).map((opt) => (
            <Button
              key={opt}
              type="button"
              size="sm"
              variant={mode === opt ? "default" : "outline"}
              className="h-8"
              onClick={() => onChange(opt)}
            >
              {feeVatModeLabel(opt)}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{feeVatModeHint(mode)}</p>
      </div>
    ),
    [feeVatModeHint, feeVatModeLabel, tt]
  )

  const resolveFeeSubmitAmounts = React.useCallback(
    (rawAmount: number, feeMode: ExpenseFeeVatMode | null) => {
      if (!feeMode || !Number.isFinite(rawAmount) || rawAmount <= 0) {
        return null
      }
      return resolveExpenseFeeAmounts(rawAmount, feeMode)
    },
    []
  )

  const feeAmountPreview = React.useMemo(() => {
    if (!activeFeeVatMode || categoryMain !== "expense") return null
    const raw = parseMoneyAmount(amount)
    if (!Number.isFinite(raw) || raw <= 0) return null
    return resolveExpenseFeeAmounts(raw, activeFeeVatMode)
  }, [activeFeeVatMode, amount, categoryMain])

  React.useEffect(() => {
    if (!activeFeeVatMode || categoryMain !== "expense") return
    const raw = parseMoneyAmount(amount)
    if (!Number.isFinite(raw) || raw <= 0) {
      setAccrualVatAmount("")
      applyDocumentType("")
      return
    }
    const resolved = resolveExpenseFeeAmounts(raw, activeFeeVatMode)
    setAccrualVatAmount(resolved.vat > 0 ? String(resolved.vat) : "")
    applyDocumentType(resolved.invoiceReceived ? "tax_invoice" : "")
  }, [activeFeeVatMode, amount, categoryMain, applyDocumentType])

  const handleRegisterDeliveryFeeBatch = React.useCallback(async () => {
    const batchDate = resolveMonthEndDate(deliveryFeeMonth)
    if (!batchDate) {
      await appAlert(tt("deliveryFeeBatchMonthRequired", "월(YYYY-MM)을 확인해 주세요."))
      return
    }
    if (!accountId) {
      await appAlert(tt("bankAccount", "Please select an account."))
      return
    }
    if (!storeName) {
      await appAlert(tt("expenseStoreSelect", "Please select a store."))
      return
    }
    const subjectId = Number(accountSubjectId || deliveryFeeAccountSubjectId || 0)
    if (!subjectId) {
      await appAlert(tt("wm_accountSubjectPlaceholder", "Please select an account subject."))
      return
    }
    const rows = DELIVERY_APP_FEE_PRESETS
      .map((preset) => {
        const amount = Number(String(deliveryFeeAmounts[preset.id] || "").replace(/,/g, ""))
        return { preset, amount: Number.isFinite(amount) ? amount : 0 }
      })
      .filter((row) => row.amount > 0)

    if (rows.length === 0) {
      await appAlert(tt("deliveryFeeBatchAmountRequired", "4개 앱 중 1개 이상 금액을 입력해 주세요."))
      return
    }

    setDeliveryFeeSaving(true)
    try {
      for (const row of rows) {
        const resolved = resolveExpenseFeeAmounts(row.amount, deliveryFeeVatMode)
        if (resolved.gross <= 0) continue
        const res = await executeWithdrawal({
          paymentMethod: "bank",
          amount: resolved.gross,
          transDate: batchDate,
          memo: `Delivery App fee ${deliveryFeeMonth} - ${row.preset.name}`,
          storeName: storeName || undefined,
          categoryMain: "expense",
          categorySub: "normal",
          vendorCode: row.preset.code,
          accountSubjectId: subjectId,
          accountId: Number(accountId),
          invoiceReceived: resolved.invoiceReceived,
          documentType: resolved.invoiceReceived ? "tax_invoice" : null,
          vatAmount: resolved.vat > 0 ? resolved.vat : undefined,
          userName: auth?.user,
          userRole: auth?.role,
          userStore: auth?.store,
        })
        if (!res.success) {
          const fail = translateApiMessage(res.message, t) || res.message || t("processFail")
          await appAlert(`${row.preset.name}: ${fail}`)
          return
        }
      }
      setDeliveryFeeAmounts(Object.fromEntries(DELIVERY_APP_FEE_PRESETS.map((preset) => [preset.id, ""])))
      setDeliveryFeeDialogOpen(false)
      const monthRange = getBangkokMonthRange(deliveryFeeMonth)
      onBatchWithdrawalSaved?.({ startStr: monthRange.startStr, endStr: monthRange.endStr })
      await appAlert(
        tt("deliveryFeeBatchDone", "월별 배달앱 수수료가 등록되었습니다.")
          + ` (${deliveryFeeMonth}, ${rows.length}${tt("receivPayCount", "건")})`
      )
    } finally {
      setDeliveryFeeSaving(false)
    }
  }, [
    accountId,
    accountSubjectId,
    auth?.role,
    auth?.store,
    auth?.user,
    deliveryFeeAccountSubjectId,
    deliveryFeeAmounts,
    deliveryFeeMonth,
    deliveryFeeVatMode,
    onBatchWithdrawalSaved,
    storeName,
    t,
    tt,
  ])

  const handleRegisterCardFeeBatch = React.useCallback(async () => {
    const batchDate = resolveMonthEndDate(cardFeeMonth)
    if (!batchDate) {
      await appAlert(tt("cardFeeBatchMonthRequired", "월(YYYY-MM)을 확인해 주세요."))
      return
    }
    if (!accountId) {
      await appAlert(tt("bankAccount", "Please select an account."))
      return
    }
    if (!storeName) {
      await appAlert(tt("expenseStoreSelect", "Please select a store."))
      return
    }
    const subjectId = Number(accountSubjectId || cardFeeAccountSubjectId || 0)
    if (!subjectId) {
      await appAlert(tt("wm_accountSubjectPlaceholder", "Please select an account subject."))
      return
    }
    const rows = CARD_FEE_PRESETS
      .map((preset) => {
        const amount = Number(String(cardFeeAmounts[preset.id] || "").replace(/,/g, ""))
        return { preset, amount: Number.isFinite(amount) ? amount : 0 }
      })
      .filter((row) => row.amount > 0)

    if (rows.length === 0) {
      await appAlert(tt("cardFeeBatchAmountRequired", "카드 수수료 금액을 1개 이상 입력해 주세요."))
      return
    }

    setCardFeeSaving(true)
    try {
      for (const row of rows) {
        const resolved = resolveExpenseFeeAmounts(row.amount, cardFeeVatMode)
        if (resolved.gross <= 0) continue
        const res = await executeWithdrawal({
          paymentMethod: "bank",
          amount: resolved.gross,
          transDate: batchDate,
          memo: `Card fee ${cardFeeMonth} - ${row.preset.name}`,
          storeName: storeName || undefined,
          categoryMain: "expense",
          categorySub: "normal",
          vendorCode: row.preset.code,
          accountSubjectId: subjectId,
          accountId: Number(accountId),
          invoiceReceived: resolved.invoiceReceived,
          documentType: resolved.invoiceReceived ? "tax_invoice" : null,
          vatAmount: resolved.vat > 0 ? resolved.vat : undefined,
          userName: auth?.user,
          userRole: auth?.role,
          userStore: auth?.store,
        })
        if (!res.success) {
          const fail = translateApiMessage(res.message, t) || res.message || t("processFail")
          await appAlert(`${row.preset.name}: ${fail}`)
          return
        }
      }
      setCardFeeAmounts(Object.fromEntries(CARD_FEE_PRESETS.map((preset) => [preset.id, ""])))
      setCardFeeDialogOpen(false)
      const monthRange = getBangkokMonthRange(cardFeeMonth)
      onBatchWithdrawalSaved?.({ startStr: monthRange.startStr, endStr: monthRange.endStr })
      await appAlert(
        tt("cardFeeBatchDone", "월별 카드 수수료가 등록되었습니다.")
          + ` (${cardFeeMonth}, ${rows.length}${tt("receivPayCount", "건")})`
      )
    } finally {
      setCardFeeSaving(false)
    }
  }, [
    accountId,
    accountSubjectId,
    auth?.role,
    auth?.store,
    auth?.user,
    cardFeeAccountSubjectId,
    cardFeeAmounts,
    cardFeeMonth,
    cardFeeVatMode,
    onBatchWithdrawalSaved,
    storeName,
    t,
    tt,
  ])

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

    const redirectAfterBankLinkSuccess = () => {
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
    }

    if (categoryMain === "purchase") {
      const amt = parseMoneyAmount(amount)
      if (!amt || amt <= 0) {
        await appAlert(tt("pettyAlertAmount", "Please enter amount."))
        return
      }
      if (!vendorCode.trim()) {
        await appAlert(tt("inAlertSelectVendor", "Please select a vendor."))
        return
      }
      const resolvedAccountId = resolveAccountIdForSave()
      if (!resolvedAccountId) {
        await appAlert(tt("bankAccount", "Please select an account."))
        return
      }
      if (!storeName) {
        await appAlert(tt("expenseStoreSelect", "Please select a store."))
        return
      }

      let invoicePhotoUrl: string | undefined
      if (expenseAttachmentFiles.length > 0) {
        try {
          const processed = await processExpenseAttachmentFiles(expenseAttachmentFiles)
          invoicePhotoUrl = processed.invoicePhotoUrl
        } catch {
          invoicePhotoUrl = undefined
        }
      }

      if (!updateExistingParam) {
        await appAlert(tt("purchasePaymentViaExpenseOnly", PURCHASE_PAYMENT_VIA_EXPENSE_ONLY_MESSAGE))
      }

      setSaving(true)
      try {
        const res = await updateExpenseRegisterItem({
          bankTransactionId: bankTxId,
          accountId: resolvedAccountId,
          transDate,
          amount: amt,
          memo: memo.trim() || undefined,
          storeName: storeName || undefined,
          categoryMain,
          categorySub: (hasSub || hasTaxSub || hasLoanSub) ? categorySub : undefined,
          vendorCode: vendorCode.trim(),
          invoiceReceived,
          documentType: documentType || null,
          invoiceNo: invoiceNo.trim() || undefined,
          invoicePhotoUrl,
          userRole: auth?.role,
        })
        if (!res.success) {
          await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
          return
        }
        redirectAfterBankLinkSuccess()
      } finally {
        setSaving(false)
      }
      return
    }

    if (categoryMain === "expense") {
      const code = payeeCode.trim()
      const name = payeeName.trim()
      if (!code && !name) {
        await appAlert(tt("expensePayeeRequired", "Please select or enter a payee."))
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
          storeName: storeName || undefined,
          userName: auth?.user,
          userRole: auth?.role,
          updateExisting: updateExistingParam,
        })
        if (!res.success) {
          await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
          return
        }
        await appAlert(res.message || t("success"))
        redirectAfterBankLinkSuccess()
      } finally {
        setSaving(false)
      }
      return
    }

    if (categoryMain === "transfer") {
      if (transferKind === "bank_to_card") {
        setSaving(true)
        try {
          const ok = await handleMarkBankForCardBill(bankTxId)
          if (ok) router.push("/admin/expense-management?tab=card")
        } finally {
          setSaving(false)
        }
        return
      }
      if (transferKind === "bank_to_petty") {
        setSaving(true)
        try {
          const ok = await handleMarkBankForPetty(bankTxId)
          if (ok) router.push("/admin/petty-cash")
        } finally {
          setSaving(false)
        }
        return
      }
      if (!accountSubjectId) {
        await appAlert(tt("wm_transferAccountSubjectRequired", "이체 계정과목을 선택해 주세요."))
        return
      }
      const resolvedAccountId = resolveAccountIdForSave()
      if (!resolvedAccountId) {
        await appAlert(tt("bankAccount", "Please select an account."))
        return
      }
      const amt = parseMoneyAmount(amount)
      if (!amt || amt <= 0) {
        await appAlert(tt("pettyAlertAmount", "Please enter amount."))
        return
      }
      if (!storeName) {
        await appAlert(tt("expenseStoreSelect", "Please select a store."))
        return
      }
      setSaving(true)
      try {
        const res = await updateExpenseRegisterItem({
          bankTransactionId: bankTxId,
          accountId: resolvedAccountId,
          transDate,
          amount: amt,
          memo: memo.trim() || undefined,
          storeName: storeName || undefined,
          categoryMain,
          categorySub: (hasSub || hasTaxSub || hasLoanSub) ? categorySub : undefined,
          accountSubjectId: Number(accountSubjectId),
          userRole: auth?.role,
        })
        if (!res.success) {
          await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
          return
        }
        await appAlert(res.message || t("success"))
        redirectAfterBankLinkSuccess()
      } finally {
        setSaving(false)
      }
      return
    }

    const amt = parseMoneyAmount(amount)
    if (!amt || amt <= 0) {
      await appAlert(tt("pettyAlertAmount", "Please enter amount."))
      return
    }
    const resolvedAccountId = resolveAccountIdForSave()
    if (!resolvedAccountId) {
      await appAlert(tt("bankAccount", "Please select an account."))
      return
    }
    if (!storeName) {
      await appAlert(tt("expenseStoreSelect", "Please select a store."))
      return
    }

    const memoText = memo.trim() || undefined

    setSaving(true)
    try {
      const res = await updateExpenseRegisterItem({
        bankTransactionId: bankTxId,
        accountId: resolvedAccountId,
        transDate,
        amount: amt,
        memo: memoText,
        storeName: storeName || undefined,
        categoryMain,
        categorySub: (hasSub || hasTaxSub || hasLoanSub) ? categorySub : undefined,
        accountSubjectId: null,
        userRole: auth?.role,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
        return
      }
      await appAlert(res.message || t("success"))
      redirectAfterBankLinkSuccess()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex items-center gap-3">
            <Label className="font-semibold whitespace-nowrap">{tt("expenseStoreSelect", "Store")}</Label>
            <Select
              value={storeSelectOptions.includes(displayStoreName) ? displayStoreName : (storeSelectOptions[0] || "")}
              onValueChange={(v) => {
                bankLinkStorePinned.current = true
                setStoreName(v)
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={tt("expenseStoreSelect", "Select Store")} />
              </SelectTrigger>
              <SelectContent>
                {storeSelectOptions.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-sm font-semibold">{tt("wm_title", "Withdrawal Type")}</div>
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
                  if (opt.value === "transfer") setTransferKind("bank_to_petty")
                }}
              >
                {t(opt.labelKey) || opt.value}
              </Button>
            ))}
          </div>

          {categoryMain && !isBankLinkMode && !isEditMode && (categoryMain === "purchase" || categoryMain === "expense") && (
            <div className="flex items-end gap-2">
              <Label className="pb-2.5 shrink-0">{tt("wm_payMode", "Payment Mode")}</Label>
              <div className="flex gap-2">
                {categoryMain !== "purchase" ? (
                <Button
                  type="button"
                  variant={expensePayMode === "immediate" ? "default" : "outline"}
                  size="sm"
                  className="h-9"
                  onClick={() => setExpensePayMode("immediate")}
                >
                  {tt("wm_payImmediate", "Pay Now")}
                </Button>
                ) : null}
                <Button
                  type="button"
                  variant={expensePayMode === "later" ? "default" : "outline"}
                  size="sm"
                  className="h-9"
                  onClick={() => setExpensePayMode("later")}
                >
                  {tt("wm_payLater", "Pay Later")}
                </Button>
              </div>
            </div>
          )}

          {showRecurringTemplatesBar ? (
            <ExpenseRecurringTemplatesBar
              canSave={!!categoryMain}
              onApply={(tpl) => {
                setCategoryMain(tpl.categoryMain)
                if (tpl.payeeCode) {
                  setPayeeCode(tpl.payeeCode)
                  setPayeeManual(false)
                }
                if (tpl.payeeName) setPayeeName(tpl.payeeName)
                if (tpl.categoryMain === "purchase" && tpl.payeeCode) setVendorCode(tpl.payeeCode)
                if (tpl.accountSubjectId) setAccountSubjectId(String(tpl.accountSubjectId))
                if (tpl.memo) setMemo(tpl.memo)
                if (tpl.amount) setAmount(tpl.amount)
                if (tpl.vatAmount) setAccrualVatAmount(tpl.vatAmount)
              }}
              onSaveCurrent={() => {
                if (categoryMain !== "purchase" && categoryMain !== "expense") return null
                const label =
                  payeeName.trim() ||
                  vendors.find((v) => v.code === payeeCode)?.name ||
                  (categoryMain === "purchase" ? tt("wm_purchase", "Purchase") : tt("wm_expense", "Expense"))
                return {
                  label,
                  categoryMain,
                  payeeCode: payeeCode || undefined,
                  payeeName: payeeName || undefined,
                  accountSubjectId: accountSubjectId ? Number(accountSubjectId) : null,
                  memo: memo || undefined,
                  amount: amount || undefined,
                  vatAmount: accrualVatAmount || undefined,
                }
              }}
            />
          ) : null}

          {hasTaxSub && (
            <div className="flex items-center gap-2">
              <Label>{tt("wm_subType", "Detail")}</Label>
              <Select value={categorySub} onValueChange={setCategorySub}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vat">{tt("wm_tax_vat", "VAT Payment")}</SelectItem>
                  <SelectItem value="withholding">{tt("wm_tax_withholding", "Withholding Tax Payment")}</SelectItem>
                  <SelectItem value="corporate">{tt("wm_tax_corporate", "Corporate Tax Payment")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {hasLoanSub && (
            <div className="flex items-center gap-2">
              <Label>{tt("wm_subType", "Detail")}</Label>
              <Select value={categorySub} onValueChange={setCategorySub}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="repayment">{tt("wm_loan_repayment", "Loan Repayment")}</SelectItem>
                  <SelectItem value="given">{tt("wm_loan_given", "Loan Given")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          {hasSub && !hasTaxSub && !hasLoanSub && (categoryMain === "purchase" || categoryMain === "expense" || categoryMain === "loan") && (
            <div className="flex flex-wrap items-end gap-2 w-full">
              <Label className="pb-2.5">{tt("wm_subType", "Detail")}</Label>
              <Select value={categorySub} onValueChange={setCategorySub}>
                <SelectTrigger className="w-[120px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">{tt("wm_normal", "Normal")}</SelectItem>
                  <SelectItem value="advance">{tt("wm_advance", "Advance")}</SelectItem>
                </SelectContent>
              </Select>
              {showAdvanceInstallments && (
                <>
                  <Label className="text-sm pb-2.5">{tt("wm_advanceInstallments", "Installments")}</Label>
                  <Input type="number" min={1} value={advanceInstallments} onChange={(e) => setAdvanceInstallments(e.target.value)} className="w-[70px] h-9" />
                  <span className="text-muted-foreground pb-2.5">/</span>
                  <Label className="text-sm pb-2.5">{tt("wm_advanceInstallmentCurrent", "Current Installment")}</Label>
                  <Input type="number" min={1} value={advanceInstallmentCurrent} onChange={(e) => setAdvanceInstallmentCurrent(e.target.value)} className="w-[70px] h-9" />
                  <span className="text-sm font-medium tabular-nums pb-2.5">({advanceInstallmentCurrent}/{advanceInstallments})</span>
                </>
              )}
              {categoryMain === "expense" && (
                <div className="ml-auto flex flex-wrap gap-2 pb-0.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => setDeliveryFeeDialogOpen(true)}
                  >
                    {tt("pL_expenseSourceDeliveryApps", "배달앱 수수료")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => setCardFeeDialogOpen(true)}
                  >
                    {tt("pL_expenseSourceCardFees", "카드 수수료")}
                  </Button>
                </div>
              )}
            </div>
          )}
          {(categoryMain === "purchase" || categoryMain === "expense" || categoryMain === "loan") && (
            <>
              {categoryMain === "purchase" && (
                <div className="flex items-end gap-2">
                  <div className="flex items-end gap-2 flex-wrap">
                    <Label className="pb-2.5 shrink-0">{tt("vendor", "Vendor")}</Label>
                    <Select
                      value={vendorCode}
                      onValueChange={(v) => {
                        setVendorCode(v)
                        const resolved = resolvePurchaseVendorPayee(v)
                        if (resolved.code) {
                          setPayeeCode(resolved.code)
                          setPayeeName(resolved.name)
                          setPayeeManual(false)
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 w-[220px]">
                        <SelectValue placeholder={tt("vendor", "Select Vendor")} />
                      </SelectTrigger>
                      <SelectContent>
                        {vendors.map((v) => (
                          <SelectItem key={v.code} value={v.code}>
                            {v.name} ({v.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <VendorRdSearchButton
                      triggerSize="sm"
                      triggerVariant="outline"
                      triggerClassName="h-9"
                      onPick={(c) => {
                        const matched = vendors.find(
                          (v) =>
                            String((v as { taxId?: string; tax_id?: string }).taxId || (v as { tax_id?: string }).tax_id || "").replace(/\D/g, "") ===
                              c.taxId ||
                            v.name.trim() === c.name.trim()
                        )
                        if (matched) {
                          setVendorCode(matched.code)
                          setPayeeCode(matched.code)
                          setPayeeName(matched.name)
                          setPayeeManual(false)
                        } else {
                          void appAlert(
                            tt(
                              "vendorRdPickSaveVendorFirst",
                              "Save this company in Vendors first, then select it here."
                            ) + `\n${c.name} (${c.taxId})`
                          )
                        }
                      }}
                    />
                  </div>
                  {vendorCode && (
                    <div className="text-sm text-muted-foreground pb-2">
                      {tt("inv_account_no", "Account")}: {vendors.find((x) => x.code === vendorCode)?.bankAccountNo || "—"}
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
                        {isLaterPayment
                          ? tt(
                              "inboundLinkAccrualHelp",
                              "For pay-later registration, linked batch amounts are used as the total when the total field is empty."
                            )
                          : tt(
                              "inboundLinkRegisterHelp",
                              "Enter amounts by batch to match the withdrawal amount for auto-linking. Leave blank to link later in Bank tab."
                            )}
                      </p>
                    </>
                  )}
                </div>
              )}
              {categoryMain === "expense" && (
                <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
                  <div className="flex items-end gap-2">
                    <Label className="pb-2.5 shrink-0">{tt("vendor", "Payee")}</Label>
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
                        <SelectValue placeholder={tt("vendor", "Payee")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__manual__">{tt("bankRegisterPayeeManual", "Enter Manually")}</SelectItem>
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
                          placeholder={tt("expensePayeeCode", "Code")}
                        />
                        <Input
                          className="w-[160px] h-9"
                          value={payeeName}
                          onChange={(e) => setPayeeName(e.target.value)}
                          placeholder={tt("expensePayeeName", "Payee Name")}
                        />
                      </>
                    ) : (
                      <Input
                        className="w-[160px] h-9"
                        value={payeeName}
                        onChange={(e) => setPayeeName(e.target.value)}
                        placeholder={tt("expensePayeeName", "Payee Name")}
                      />
                    )}
                    <VendorRdSearchButton
                      triggerSize="sm"
                      triggerVariant="outline"
                      triggerClassName="h-9"
                      initialQuery={payeeName}
                      onPick={(c) => {
                        const matched = vendors.find(
                          (v) =>
                            String((v as { taxId?: string; tax_id?: string }).taxId || (v as { tax_id?: string }).tax_id || "").replace(/\D/g, "") ===
                              c.taxId ||
                            v.name.trim() === c.name.trim()
                        )
                        if (matched) {
                          setPayeeManual(false)
                          setPayeeCode(matched.code)
                          setPayeeName(matched.name)
                        } else {
                          setPayeeManual(true)
                          setPayeeCode(c.taxId || "")
                          setPayeeName(c.name)
                        }
                      }}
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <Label className="pb-2.5 shrink-0">{tt("wm_accountSubject", "Account Subject")}</Label>
                    <Select
                      value={accountSubjectId || "__none__"}
                      onValueChange={(v) => setAccountSubjectId(v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger className="h-9 w-[200px]">
                        <SelectValue placeholder={tt("wm_accountSubjectPlaceholder", "Select Account Subject")} />
                      </SelectTrigger>
                      <SelectContent>
                        {isLaterPayment ? <SelectItem value="__none__">-</SelectItem> : null}
                        {expenseSubjectOptions.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.code} {getSubjectLabel(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </>
          )}

          {categoryMain === "transfer" && (
            <div className="rounded-lg border border-border/60 bg-muted/15 p-4 space-y-3 max-w-3xl">
              <div>
                <Label className="font-medium">{tt("wm_transferKind", "이체 유형")}</Label>
                <Select
                  value={transferKind}
                  onValueChange={(v) => {
                    setTransferKind(v as TransferKind)
                    if (v !== "bank_to_card") setTransferToCardAccountId("")
                    if (v !== "bank_general") {
                      setAccountSubjectId("")
                      setTransferBankAccountNo("")
                      setTransferBankRecipientName("")
                    }
                    if (v !== "bank_to_petty") setTransferToPettyStore("")
                  }}
                >
                  <SelectTrigger className="h-9 w-full max-w-xl mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_to_petty">{tt("wm_transferKindBankToPetty", "통장 → 패티캐시")}</SelectItem>
                    <SelectItem value="bank_to_card">{tt("wm_transferKindBankToCard", "통장 → 카드 대금")}</SelectItem>
                    <SelectItem value="bank_general">{tt("wm_transferKindBankGeneral", "일반 이체")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1.5">
                  {isBankLinkMode
                    ? transferKind === "bank_to_card"
                      ? tt(
                          "wm_transferKindHintBankToCardLink",
                          "통장에서 이미 나간 출금입니다. 저장하면 카드 탭 연동 대기열에 등록됩니다."
                        )
                      : transferKind === "bank_to_petty"
                        ? tt(
                            "wm_transferKindHintBankToPettyLink",
                            "통장에서 이미 나간 출금입니다. 저장하면 패티 캐쉬 탭 연동 대기열에 등록됩니다."
                          )
                        : tt(
                            "wm_transferKindHintBankGeneralLink",
                            "통장에서 이미 나간 일반 이체입니다. 이체 계정과목을 선택한 뒤 저장하세요."
                          )
                    : transferKind === "bank_to_card"
                      ? tt(
                          "wm_transferKindHintBankToCard",
                          "카드·금액 입력 후 지급예정 저장 → 승인 → 통장 송금 건과 연동하세요. (통장에서는 「지급예정 선택」도 가능)"
                        )
                      : transferKind === "bank_to_petty"
                        ? tt(
                            "wm_transferKindHintBankToPetty",
                            "매장·금액 입력 후 지급예정 저장 → 승인 → 통장 송금 건과 연동하세요. (분개: 1160/1010)"
                          )
                        : tt(
                            "wm_transferKindHintBankGeneral",
                            "이체용 계정과목·금액 입력 후 저장하면 통장 출금으로 등록됩니다."
                          )}
                </p>
              </div>

              <div className="max-w-md">
                <Label className="text-xs text-muted-foreground">{tt("bankAccount", "Account")}</Label>
                <Select value={accountId || "__none__"} onValueChange={(v) => setAccountId(v === "__none__" ? "" : v)} disabled={isBankLinkMode}>
                  <SelectTrigger className="h-9 w-full mt-1">
                    <SelectValue placeholder={tt("bankAccount", "Select Account")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {transferBankAccountsForStore.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.bankName ? `[${a.bankName}] ` : ""}{a.name}{a.store ? ` (${a.store})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!storeName && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {tt("expenseStoreSelect", "매장을 먼저 선택하세요.")}
                  </p>
                )}
              </div>

              {transferKind === "bank_to_petty" && (
                <div className="max-w-md">
                  <Label className="text-xs text-muted-foreground block mb-1">{tt("wm_transferToPetty", "패티캐시 매장")}</Label>
                  <Select
                    value={transferToPettyStore || "__none__"}
                    onValueChange={(v) => setTransferToPettyStore(v === "__none__" ? "" : v)}
                    disabled={isBankLinkMode}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder={tt("wm_transferToPetty", "패티캐시 매장")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {pettyCashStoreOptions.map((st) => (
                        <SelectItem key={st} value={st}>{st}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {tt("pettyBankLinkJournalHint", "분개: 차변·대변 현금(1010) — 내부 자금 이동")}
                  </p>
                </div>
              )}

              {transferKind === "bank_general" && (
                <>
                  <div className="max-w-md">
                    <Label className="text-xs text-muted-foreground block mb-1.5">{tt("wm_transferAccountSubject", "이체 계정과목")}</Label>
                    <Select value={accountSubjectId || "__none__"} onValueChange={(v) => setAccountSubjectId(v === "__none__" ? "" : v)}>
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue placeholder={tt("wm_transferAccountSubjectPlaceholder", "이체 계정과목 선택")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {transferSubjects.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.code} {getSubjectLabel(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                    <div>
                      <Label className="text-xs text-muted-foreground block mb-1">{tt("inv_account_no", "계좌번호")}</Label>
                      <Input
                        value={transferBankAccountNo}
                        onChange={(e) => setTransferBankAccountNo(e.target.value)}
                        placeholder={tt("wm_transferAccountNoPlaceholder", "계좌번호 입력")}
                        className="h-9"
                        readOnly={isBankLinkMode}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground block mb-1">{tt("wm_transferRecipient", "받는 사람")}</Label>
                      <Input
                        value={transferBankRecipientName}
                        onChange={(e) => setTransferBankRecipientName(e.target.value)}
                        placeholder={tt("wm_transferRecipientPlaceholder", "받는 사람 입력")}
                        className="h-9"
                        readOnly={isBankLinkMode}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tt(
                      "wm_transferGeneralInputHint",
                      "계정과목으로 내부 이체하거나, 외부 계좌·받는 사람을 입력해 외부 이체로 등록할 수 있습니다."
                    )}
                  </p>
                </>
              )}

              {transferKind === "bank_to_card" && !isBankLinkMode && (
                <div className="max-w-md">
                  <Label className="text-xs text-muted-foreground block mb-1.5">{tt("wm_transferToCardCharge", "Card")}</Label>
                  <Select value={transferToCardAccountId || "__none__"} onValueChange={(v) => setTransferToCardAccountId(v === "__none__" ? "" : v)}>
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder={tt("cardManagementSelectCard", "Select Card")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {transferCardAccountsForStore.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name}{a.store ? ` (${a.store})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          </div>

          {categoryMain === "fixed_asset" && (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="block mb-2">{tt("wm_assetName", "Asset Name")}</Label>
                <Input
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  placeholder={tt("wm_assetNamePlaceholder", "Vehicle, equipment, etc.")}
                  className="h-9 w-[160px]"
                />
              </div>
              <div>
                <Label className="block mb-2">{tt("wm_assetCode", "Asset Code")}</Label>
                <Input
                  value={assetCode}
                  onChange={(e) => setAssetCode(e.target.value)}
                  placeholder={tt("wm_assetCodePlaceholder", "FA-001 (optional)")}
                  className="h-9 w-[120px]"
                />
              </div>
              <div>
                <Label className="block mb-2">{tt("wm_usefulLife", "Useful Life (months)")}</Label>
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

          <div className="border-t pt-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3 max-w-6xl">
              {!isLaterPayment && showBankAccountOutsideTransfer && (
                <div className="w-[220px]">
                  <Label>{tt("bankAccount", "Account")}</Label>
                  <Select
                    value={accountId || "__none__"}
                    onValueChange={(v) => setAccountId(v === "__none__" ? "" : v)}
                    disabled={isExistingBankTxMode}
                  >
                    <SelectTrigger className="w-[220px] h-9 mt-1">
                      <SelectValue placeholder={tt("bankAccount", "Select Account")} />
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
              <div className="w-[120px]">
                <Label>
                  {activeFeeVatMode && categoryMain === "expense"
                    ? feeAmountFieldLabel(activeFeeVatMode)
                    : categoryMain === "purchase" || categoryMain === "expense"
                      ? tt("expenseAccrualGrossTotal", "Total (incl. tax)")
                      : tt("amount", "Amount")}
                </Label>
                <Input
                  value={amount}
                  onChange={(e) => handleMoneyInputChange(e.target.value, setAmount)}
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  className={`w-[120px] h-9 mt-1 ${isBankLinkMode ? "bg-muted/50 cursor-default" : ""}`}
                  readOnly={isBankLinkMode}
                />
                {feeAmountPreview ? (
                  <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                    {tt("expenseFeeWithdrawPreview", "Withdrawal")} ฿{feeAmountPreview.gross.toLocaleString()}
                    {feeAmountPreview.vat > 0
                      ? ` (${tt("expenseAccrualVat", "VAT")} ฿${feeAmountPreview.vat.toLocaleString()} · ${tt("expenseFeeNetLabel", "Net")} ฿${feeAmountPreview.net.toLocaleString()})`
                      : ""}
                  </p>
                ) : activeFeeVatMode ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {feeVatModeLabel(activeFeeVatMode)}
                  </p>
                ) : null}
              </div>
              <div className="w-[140px]">
                <Label>{tt("date", "Date")}</Label>
                <Input
                  type="date"
                  value={transDate}
                  onChange={(e) => setTransDate(e.target.value)}
                  className={`w-[140px] h-9 mt-1 ${isBankLinkMode ? "bg-muted/50 cursor-default" : ""}`}
                  readOnly={isBankLinkMode}
                />
              </div>
              <div className="w-[280px]">
                <Label>{tt("memo", "Memo")}</Label>
                <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={tt("memo", "Memo")} className="h-9 w-[280px] mt-1" />
              </div>
              <div className="w-[320px]" title={bankMemo || undefined}>
                <Label>{tt("bankMemoLabel", "Bank Memo")}</Label>
                <Input
                  value={bankMemo}
                  readOnly
                  placeholder={tt("bankMemoFromBank", "Memo from bank transaction")}
                  className="h-9 w-[320px] mt-1 bg-muted/50 cursor-default"
                />
              </div>
            </div>
            {(categoryMain === "purchase" || categoryMain === "expense") && (
              <div className="flex flex-wrap items-end gap-3 max-w-6xl rounded-lg border border-border/50 bg-muted/10 p-3">
                <div className="w-[110px]">
                  <Label className="text-xs text-muted-foreground">{tt("expenseAccrualVat", "VAT")}</Label>
                  <Input
                    value={accrualVatAmount}
                    onChange={(e) => handleMoneyInputChange(e.target.value, setAccrualVatAmount)}
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    className="h-9 mt-1"
                  />
                </div>
                <div className="w-[120px]">
                  <Label className="text-xs text-muted-foreground">
                    {tt("expenseAccrualWhtRate", "WHT rate")}
                  </Label>
                  <Select
                    value={accrualWhtRate == null ? "__none__" : String(accrualWhtRate)}
                    onValueChange={(v) => {
                      if (!v || v === "__none__") {
                        setAccrualWhtRate(null)
                        return
                      }
                      const n = Number(v)
                      setAccrualWhtRate(Number.isFinite(n) && n > 0 ? n : null)
                    }}
                  >
                    <SelectTrigger className="h-9 mt-1">
                      <SelectValue placeholder={tt("expenseAccrualWhtRateNone", "Select")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{tt("expenseAccrualWhtRateNone", "Select")}</SelectItem>
                      {EXPENSE_WHT_RATE_OPTIONS.map((r) => (
                        <SelectItem key={r} value={String(r)}>
                          {r}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-[110px]">
                  <Label className="text-xs text-muted-foreground">{tt("expenseAccrualWithholding", "Withholding Tax")}</Label>
                  <Input
                    value={accrualWithholdingTax}
                    onChange={(e) => handleMoneyInputChange(e.target.value, setAccrualWithholdingTax)}
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    className="h-9 mt-1"
                  />
                </div>
                <div className="min-w-[160px] pb-0.5">
                  <span className="text-xs text-muted-foreground block">{tt("expenseAccrualNetPayableLabel", "Net Payable")}</span>
                  <span className="text-sm font-semibold tabular-nums">
                    ฿{(accrualNetPreview ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>

          {(categoryMain === "purchase" || categoryMain === "expense") ? (
            <ExpenseDocumentAttachPanel
              files={expenseAttachmentFiles}
              onFilesChange={setExpenseAttachmentFiles}
              invoiceReceived={invoiceReceived}
              onInvoiceReceivedChange={setInvoiceReceived}
              documentType={documentType}
              onDocumentTypeChange={applyDocumentType}
              invoiceNo={invoiceNo}
              onInvoiceNoChange={setInvoiceNo}
              onOcrFields={handleExpenseOcrFields}
              disabled={saving}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
              {(categoryMain === "purchase" || categoryMain === "expense") ? (
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none mr-1">
                  <Checkbox
                    checked={autoCreateWhtCert}
                    onCheckedChange={(v) => setAutoCreateWhtCert(v === true)}
                    disabled={saving}
                  />
                  <span className="text-muted-foreground leading-snug max-w-[280px]">
                    {tt(
                      "expenseAccrualAutoWhtCert",
                      "Auto-create withholding tax certificate (50 ทวิ)"
                    )}
                  </span>
                </label>
              ) : null}
              <Button
                onClick={handleSubmit}
                disabled={
                  saving ||
                  !categoryMain ||
                  (isBankLinkMode &&
                    ((categoryMain === "purchase" && !vendorCode.trim()) ||
                      (categoryMain === "expense" &&
                        !(payeeManual ? (payeeCode.trim() || payeeName.trim()) : payeeCode))))
                }
              >
                <Wallet className="h-4 w-4 mr-1" />
                {saving
                  ? tt("loading", "Processing...")
                  : isEditMode
                    ? tt("btnSave", "Save")
                    : isBankLinkMode
                    ? categoryMain === "transfer" && isTransferPrepaymentKind(transferKind)
                      ? tt("wm_transferLinkBank", "통장 연동")
                      : tt("btnSave", "Save")
                    : isLaterPayment
                      ? isEditAccrualMode
                        ? tt("btnSave", "Save")
                        : tt("wm_registerAccrual", "Register Accrual")
                      : tt("wm_execute", "Register Withdrawal")}
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
                {tt("wm_backToBank", "Back to Bank Screen")}
              </Button>
            </div>
        </CardContent>
      </Card>

      <Dialog open={deliveryFeeDialogOpen} onOpenChange={setDeliveryFeeDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tt("pL_expenseSourceDeliveryApps", "배달앱 수수료")}</DialogTitle>
            <DialogDescription>
              {tt(
                "deliveryFeeDialogDesc",
                "앱별 빠른 입력 또는 월별 일괄 등록. 계정과목 5528(배달앱수수료)로 재무제표·손익에 반영됩니다."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {renderFeeVatModePicker(deliveryFeeVatMode, setDeliveryFeeVatMode)}
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <div className="text-sm font-medium">
                {tt("deliveryFeePresetTitle", "배달앱 수수료 (빠른 입력)")}
              </div>
              <div className="flex flex-wrap gap-2">
                {DELIVERY_APP_FEE_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => applyDeliveryFeePreset(preset)}
                  >
                    {preset.name}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {tt(
                  "deliveryFeePresetHint",
                  "앱 버튼을 누르면 거래처·적요가 채워집니다. 금액 입력 후 아래 출금 등록을 진행하세요."
                )}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
              <div className="text-sm font-medium">
                {tt("deliveryFeeBatchTitle", "배달앱 수수료 (월별 일괄)")}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {tt("deliveryFeeBatchMonth", "대상 월")}
                  </Label>
                  <Input
                    type="month"
                    value={deliveryFeeMonth}
                    onChange={(e) => setDeliveryFeeMonth(e.target.value)}
                    className="h-9 w-[140px] mt-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground pb-1">
                  {tt("deliveryFeeBatchDateHint", "전기일은 해당 월 말일(방콕)로 자동 설정됩니다.")}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DELIVERY_APP_FEE_PRESETS.map((preset) => (
                  <div key={`dlg-batch-${preset.id}`}>
                    <Label className="text-xs text-muted-foreground">
                      {preset.name} · {feeAmountFieldLabel(deliveryFeeVatMode)}
                    </Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={deliveryFeeAmounts[preset.id] || ""}
                      onChange={(e) => handleDeliveryFeeAmountChange(preset.id, e.target.value)}
                      placeholder="0"
                      className="h-9 mt-1"
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={handleRegisterDeliveryFeeBatch}
                  disabled={deliveryFeeSaving}
                >
                  {deliveryFeeSaving
                    ? tt("loading", "처리 중...")
                    : tt("deliveryFeeBatchRegister", "월별 배달앱 수수료 등록")}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cardFeeDialogOpen} onOpenChange={setCardFeeDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tt("pL_expenseSourceCardFees", "카드 수수료")}</DialogTitle>
            <DialogDescription>
              {tt(
                "cardFeeDialogDesc",
                "유형별 빠른 입력 또는 월별 일괄 등록. 계정과목 5529(카드수수료)로 재무제표·손익에 반영됩니다."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {renderFeeVatModePicker(cardFeeVatMode, setCardFeeVatMode)}
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <div className="text-sm font-medium">
                {tt("cardFeePresetTitle", "카드 수수료 (빠른 입력)")}
              </div>
              <div className="flex flex-wrap gap-2">
                {CARD_FEE_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => applyCardFeePreset(preset)}
                  >
                    {tt(preset.nameKey, preset.name)}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {tt(
                  "cardFeePresetHint",
                  "유형 버튼을 누르면 거래처·적요가 채워집니다."
                )}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
              <div className="text-sm font-medium">
                {tt("cardFeeBatchTitle", "카드 수수료 (월별 일괄)")}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {tt("cardFeeBatchMonth", "대상 월")}
                  </Label>
                  <Input
                    type="month"
                    value={cardFeeMonth}
                    onChange={(e) => setCardFeeMonth(e.target.value)}
                    className="h-9 w-[140px] mt-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground pb-1">
                  {tt("cardFeeBatchDateHint", "전기일은 해당 월 말일(방콕)로 자동 설정됩니다.")}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CARD_FEE_PRESETS.map((preset) => (
                  <div key={`dlg-card-batch-${preset.id}`}>
                    <Label className="text-xs text-muted-foreground">
                      {tt(preset.nameKey, preset.name)} · {feeAmountFieldLabel(cardFeeVatMode)}
                    </Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={cardFeeAmounts[preset.id] || ""}
                      onChange={(e) => handleCardFeeAmountChange(preset.id, e.target.value)}
                      placeholder="0"
                      className="h-9 mt-1"
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={handleRegisterCardFeeBatch}
                  disabled={cardFeeSaving}
                >
                  {cardFeeSaving
                    ? tt("loading", "처리 중...")
                    : tt("cardFeeBatchRegister", "월별 카드 수수료 등록")}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
