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
import { Wallet, Camera, ArrowLeft, CreditCard } from "lucide-react"
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
  getAdminEmployeeList,
  getInboundBatchesForLink,
  saveBankTransactionInboundLinks,
  markBankTransactionForCardBill,
  getBankWithdrawalsForCardBillQueueMark,
  markBankTransactionForPettyCash,
  getBankWithdrawalsForPettyQueueMark,
  type UnlinkedBankWithdrawalForCard,
  type UnlinkedBankWithdrawalForPetty,
  translateTexts,
  type AccountSubjectItem,
  type BankAccount,
  type CardAccount,
  type InboundBatchForLink,
} from "@/lib/api-client"
import { translateApiMessage } from "@/lib/translate-api-message"
import { stripWithdrawalCategoryMetaFromNote } from "@/lib/bank-transaction-note-meta"
import { PURCHASE_PAYMENT_VIA_EXPENSE_ONLY_MESSAGE } from "@/lib/bank-purchase-payment-via-expense"
import { storesMatchForGradeLookup } from "@/lib/grade-store-key-variants"
import { compressImageForUpload } from "@/lib/utils"
import { formatEmployeeDisplayName } from "@/lib/employee-display-name"
import { useSearchParams, useRouter } from "next/navigation"
import { isOfficeStore } from "@/lib/permissions"
import { moneyInputStringFromAmount, normalizeMoneyInputString, parseMoneyAmount } from "@/lib/money-amount"
import { getBangkokMonthRange } from "@/lib/bangkok-time"
import { encodeCardPayeeCode } from "@/lib/prepayment-accrual-categories"
import {
  resolveExpenseFeeAmounts,
  type ExpenseFeeVatMode,
} from "@/lib/expense-fee-vat"

function todayStrBkk() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

async function fileToAccrualAttachmentDataUrl(file: File): Promise<string> {
  if (file.type.startsWith("image/")) {
    return compressImageForUpload(file, 1200, 0.65)
  }
  const max = 1.5 * 1024 * 1024
  if (file.size > max) {
    throw new Error("FILE_TOO_LARGE")
  }
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ""))
    r.onerror = () => reject(new Error("read_fail"))
    r.readAsDataURL(file)
  })
}

/** 퇴사일(resign_date) 기준 재직(방콕): 퇴사일 **다음 날**부터 목록 제외(퇴사 당일까지는 표시). 미입력·형식 이상이면 표시 유지 */
function isActiveEmployeeByResignBangkok(resign: string | undefined): boolean {
  const r = String(resign ?? "").trim().slice(0, 10)
  if (!r) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r)) return true
  const today = todayStrBkk()
  return r >= today
}

/** 이체→패티캐시: 직원 store와 상단 매장 선택값이 본사 계열이면 표기만 달라도(Office vs CM Office) 같은 매장으로 본다 */
function storeMatchesForPettyTransfer(empStore: string, selectedStore: string): boolean {
  const a = String(empStore || "").trim()
  const b = String(selectedStore || "").trim()
  if (!a || !b) return false
  if (a === b) return true
  if (a.toLowerCase() === b.toLowerCase()) return true
  return isOfficeStore(a) && isOfficeStore(b)
}

const PETTY_TRANSFER_JOB_JUNK = new Set(["매장명", "Store", "직급", "Job", "부서"])
const IGNORED_STORE_OPTION_VALUES = new Set(["store", "매장명"])

function isSelectableStoreOption(value: unknown): value is string {
  const raw = String(value || "").trim()
  if (!raw) return false
  return !IGNORED_STORE_OPTION_VALUES.has(raw.toLowerCase())
}

/** 이체→패티캐시 첫 셀렉트: 매장은 job→role, 본사(CM Office 등)는 job→grade→role로 직무 그룹 */
function pettyTransferGroupKey(emp: { store: string; job: string; grade: string; role: string }): string {
  const officeEmp = isOfficeStore(emp.store || "")
  const candidates = officeEmp ? [emp.job, emp.grade, emp.role] : [emp.job, emp.role]
  for (const c of candidates) {
    const s = String(c || "").trim()
    if (s && !PETTY_TRANSFER_JOB_JUNK.has(s)) return s
  }
  return String(emp.role || "Staff").trim() || "Staff"
}

type TransferKind =
  | "petty_replenish_claim"
  | "bank_card_bill_claim"
  | "bank_petty_link"
  | "bank_card_link"
  | "bank_petty_new"
  | "bank_external"
  | "bank_card_charge"
  | "petty_bank"

function paymentMethodFromTransferKind(kind: TransferKind): "bank" | "petty" | "card" {
  if (kind === "petty_bank") return "petty"
  if (kind === "bank_card_charge") return "card"
  return "bank"
}

function transferBankDestFromKind(kind: TransferKind): "external" | "petty" | null {
  if (kind === "bank_external") return "external"
  if (kind === "bank_petty_new") return "petty"
  return null
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

const DELIVERY_APP_FEE_PRESETS = [
  { id: "grab", code: "GRAB_FEE", name: "Grab", memo: "Delivery App fee - Grab" },
  { id: "lineman", code: "LINEMAN_FEE", name: "Line-man", memo: "Delivery App fee - Line-man" },
  { id: "shopee", code: "SHOPEE_FEE", name: "Shopee", memo: "Delivery App fee - Shopee" },
  { id: "robinhood", code: "ROBINHOOD_FEE", name: "Robinhood", memo: "Delivery App fee - Robinhood" },
] as const

const CARD_FEE_PRESETS = [
  { id: "card", code: "CARD_FEE", nameKey: "wm_cardFeeLabel", name: "Card Fee", memo: "Card fee" },
  {
    id: "card_installment",
    code: "CARD_INSTALLMENT_FEE",
    nameKey: "wm_cardInstallmentFeeLabel",
    name: "Card Installment Fee",
    memo: "Card installment fee",
  },
] as const

function resolveMonthEndDate(month: string): string | null {
  const src = String(month || "").trim()
  if (!/^\d{4}-\d{2}$/.test(src)) return null
  const [yRaw, mRaw] = src.split("-")
  const year = Number(yRaw)
  const monthNum = Number(mRaw)
  if (!Number.isFinite(year) || !Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) return null
  const last = new Date(year, monthNum, 0).getDate()
  return `${src}-${String(last).padStart(2, "0")}`
}

type WithdrawalManagementTabProps = {
  /** 지출 발생(지급 예정) 저장 후 상위에서 지급예정 탭·기간 동기화 */
  onAccrualSaved?: (opts: { expenseDate: string }) => void
  /** 월별 수수료 일괄 등록 후 상위에서 지출 검색 탭·해당 월 기간 동기화 */
  onBatchWithdrawalSaved?: (opts: { startStr: string; endStr: string }) => void
}

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

  const [transferKind, setTransferKind] = React.useState<TransferKind>("petty_replenish_claim")
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
  const [transferToPettyStore, setTransferToPettyStore] = React.useState("")
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
  /** 지출 등록(지급 예정만) 시 첨부 — 인보이스·영수증 이미지/PDF */
  const [accrualAttachmentFiles, setAccrualAttachmentFiles] = React.useState<File[]>([])
  const [accrualVatAmount, setAccrualVatAmount] = React.useState("")
  const [accrualWithholdingTax, setAccrualWithholdingTax] = React.useState("")
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
  const [cardBillQueueOpen, setCardBillQueueOpen] = React.useState(false)
  const [cardBillQueueLoading, setCardBillQueueLoading] = React.useState(false)
  const [cardBillQueueSaving, setCardBillQueueSaving] = React.useState(false)
  const [cardBillQueueRows, setCardBillQueueRows] = React.useState<UnlinkedBankWithdrawalForCard[]>([])
  const [pettyQueueOpen, setPettyQueueOpen] = React.useState(false)
  const [pettyQueueLoading, setPettyQueueLoading] = React.useState(false)
  const [pettyQueueSaving, setPettyQueueSaving] = React.useState(false)
  const [pettyQueueRows, setPettyQueueRows] = React.useState<UnlinkedBankWithdrawalForPetty[]>([])
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

  const [vendors, setVendors] = React.useState<{ code: string; name: string; bankAccountNo?: string | null }[]>([])
  const [bankAccounts, setBankAccounts] = React.useState<BankAccount[]>([])
  const [cardAccounts, setCardAccounts] = React.useState<CardAccount[]>([])
  const [subjects, setSubjects] = React.useState<AccountSubjectItem[]>([])
  const [subjectEnglishNames, setSubjectEnglishNames] = React.useState<Record<number, string>>({})
  const [employeeList, setEmployeeList] = React.useState<
    {
      rowId?: number
      employeeCode?: string
      store: string
      job: string
      name: string
      nameTitle?: string
      accountNumber: string
      bankName: string
    }[]
  >([])

  const pettyTransferFirstSelectLabel = React.useMemo(
    () => (isOfficeStore(storeName) ? tt("wm_transferToJob", "Job") : tt("wm_transferToDept", "Department")),
    [storeName, tt]
  )

  const effectivePaymentMethod = categoryMain === "transfer" ? paymentMethodFromTransferKind(transferKind) : "bank"
  const effectiveTransferBankDest =
    categoryMain === "transfer" ? transferBankDestFromKind(transferKind) : null
  const isTransferPrepaymentClaim =
    categoryMain === "transfer" &&
    (transferKind === "petty_replenish_claim" || transferKind === "bank_card_bill_claim")
  const isTransferLinkOnly =
    categoryMain === "transfer" && (transferKind === "bank_petty_link" || transferKind === "bank_card_link")
  const transferKindUsesBank =
    categoryMain !== "transfer" ||
    (!isTransferPrepaymentClaim && transferKind !== "petty_bank")
  const showBankAccountForTransfer =
    categoryMain === "transfer"
      ? transferKindUsesBank
      : effectivePaymentMethod === "bank" || effectivePaymentMethod === "card"

  React.useEffect(() => {
    if (categoryMain === "transfer" && transferKind === "bank_petty_new" && storeName) {
      setTransferToPettyStore(storeName)
    }
  }, [categoryMain, transferKind, storeName])

  const pettyCashStoreOptions = React.useMemo(
    () => stores.filter((s) => s && s !== "All"),
    [stores]
  )

  const employeeSelectKey = React.useCallback((e: { employeeCode?: string; rowId?: number }) => {
    const code = String(e.employeeCode || "").trim()
    if (code) return `code:${code}`
    const rowId = Number(e.rowId)
    if (Number.isFinite(rowId) && rowId > 0) return `row:${rowId}`
    return ""
  }, [])

  const selectedTransferEmployeeRow = React.useMemo(() => {
    if (!transferToEmployee || transferToEmployee === "__none__") return null
    return (
      employeeList.find(
        (e) =>
          storeMatchesForPettyTransfer(e.store, storeName) &&
          e.job === transferToDept &&
          employeeSelectKey(e) === transferToEmployee
      ) || null
    )
  }, [employeeList, storeName, transferToDept, transferToEmployee, employeeSelectKey])

  const selectedTransferEmployeeLabel = React.useMemo(() => {
    const e = selectedTransferEmployeeRow
    if (!e) return transferToEmployee
    return formatEmployeeDisplayName(e.name, e.nameTitle)
  }, [selectedTransferEmployeeRow, transferToEmployee])

  const searchParams = useSearchParams()
  const router = useRouter()
  const hasAppliedParams = React.useRef(false)
  const bankLinkStorePinned = React.useRef(false)
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

  React.useEffect(() => {
    if (categoryMain === "purchase") setExpensePayMode("later")
  }, [categoryMain])

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
        setMemo(memoParam || stripWithdrawalCategoryMetaFromNote(bankNoteParam || "") || "")
      }
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
      if (invoiceReceivedParam === "1" || invoiceReceivedParam === "true") setInvoiceReceived(true)
      if (invoiceNoParam) setInvoiceNo(invoiceNoParam)
    }
  }, [searchParams, mapCategoryToMainSub])

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

  const availableStores = React.useMemo(() => {
    const merged = Array.from(
      new Set(
        [...(stores || []), String(auth?.store || "").trim()]
          .map((s) => String(s || "").trim())
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
    if (categoryMain === "transfer" && transferKind === "petty_bank" && auth?.role) {
      getAdminEmployeeList({
        userStore: auth?.store || "",
        userRole: auth?.role || "",
        forPettyTransfer: true,
      })
        .then((r) =>
          setEmployeeList(
            (r.list || [])
              .filter((e) => isActiveEmployeeByResignBangkok(e.resign))
              .map((e) => ({
                rowId: Number.isFinite(Number(e.row)) ? Number(e.row) : undefined,
                employeeCode: String(e.employeeCode || "").trim() || undefined,
                store: e.store || "",
                job: pettyTransferGroupKey({
                  store: e.store || "",
                  job: e.job || "",
                  grade: e.grade || "",
                  role: e.role || "",
                }),
                name: e.name || "",
                nameTitle: e.nameTitle,
                accountNumber: e.accountNumber || "",
                bankName: e.bankName || "",
              }))
          )
        )
        .catch(() => setEmployeeList([]))
    }
  }, [categoryMain, transferKind, auth?.store, auth?.role])

  React.useEffect(() => {
    const list = availableStores
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
  }, [storeName, auth?.role, auth?.store, availableStores, pickOfficeStore])

  const currentMain = CATEGORY_MAIN_OPTIONS.find((c) => c.value === categoryMain)
  const hasSub = currentMain && currentMain.sub.length > 0
  const hasTaxSub = categoryMain === "tax"
  const hasLoanSub = categoryMain === "loan"

  const isLaterPayment =
    isTransferPrepaymentClaim ||
    ((categoryMain === "purchase" || categoryMain === "expense") && expensePayMode === "later")

  const accrualNetPreview = React.useMemo(() => {
    if (!isLaterPayment || (categoryMain !== "purchase" && categoryMain !== "expense")) return null
    const g = parseMoneyAmount(amount)
    const w = Math.max(0, Math.abs(Number(String(accrualWithholdingTax).replace(/,/g, "")) || 0))
    return Math.max(0, g - w)
  }, [isLaterPayment, categoryMain, amount, accrualWithholdingTax])

  const sumInboundLinkAmounts = React.useCallback(() => {
    return Object.values(inboundLinkAmounts).reduce((sum, raw) => {
      const n = Number(String(raw).replace(/,/g, ""))
      return sum + (Number.isFinite(n) && n > 0 ? n : 0)
    }, 0)
  }, [inboundLinkAmounts])

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
        ? transferKind === "petty_replenish_claim"
          ? "transfer_to_petty"
          : transferKind === "bank_card_bill_claim"
            ? "bank_card_bill"
            : resolveWithdrawalCategory(categoryMain, categorySub)
        : resolveWithdrawalCategory(categoryMain, categorySub)
    let code = payeeCode.trim()
    let name = payeeName.trim()
    if (categoryMain === "purchase") {
      if (!vendorCode.trim()) {
        await appAlert(tt("inAlertSelectVendor", "Please select a vendor."))
        return
      }
      code = vendorCode.trim()
      if (!name) {
        const found = vendors.find((v) => v.code === code)
        name = found?.name || code
      }
    } else if (categoryMain === "expense") {
      if (!code && !name) {
        await appAlert(tt("expensePayeeRequired", "Please select or enter a payee."))
        return
      }
      if (!code) code = name
      if (!name) name = code
    } else if (categoryMain === "transfer") {
      if (transferKind === "petty_replenish_claim") {
        if (!storeName) {
          await appAlert(tt("expenseStoreSelect", "Please select a store."))
          return
        }
        code = storeName
        name = `${storeName} · ${tt("wm_transferKindPettyReplenishClaim", "패티 보충 청구")}`
      } else if (transferKind === "bank_card_bill_claim") {
        if (!transferToCardAccountId) {
          await appAlert(tt("wm_transferCardRequired", "Please select a card to charge."))
          return
        }
        code = encodeCardPayeeCode(Number(transferToCardAccountId))
        const card = cardAccounts.find((a) => String(a.id) === transferToCardAccountId)
        name = card?.name
          ? `${card.name}${card.store ? ` (${card.store})` : ""}`
          : tt("wm_transferKindBankCardBillClaim", "카드 대금 청구")
      } else {
        code = code || `auto_${withdrawalCategory}`
        name = name || getAutoPayeeName(withdrawalCategory)
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
    if (feeResolved) {
      amt = feeResolved.gross
      submitInvoiceReceived = feeResolved.invoiceReceived
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
    if (
      (categoryMain === "purchase" || categoryMain === "expense") &&
      accrualAttachmentFiles.length > 0
    ) {
      try {
        const urls: string[] = []
        for (const f of accrualAttachmentFiles.slice(0, 3)) {
          urls.push(await fileToAccrualAttachmentDataUrl(f))
        }
        attachmentUrls = urls
      } catch (e) {
        const msg =
          e instanceof Error && e.message === "FILE_TOO_LARGE"
            ? tt("expenseAccrualAttachTooLarge", "Attachment is too large. Please upload PDF files under 1.5MB.")
            : tt("expenseAccrualAttachFail", "Failed to process attachment.")
        await appAlert(msg)
        return
      }
    }

    let accrualInvoicePhotoUrl: string | undefined
    if (
      (categoryMain === "purchase" || categoryMain === "expense") &&
      invoicePhotoFile
    ) {
      try {
        accrualInvoicePhotoUrl = await compressImageForUpload(invoicePhotoFile, 1024, 0.7)
      } catch {
        accrualInvoicePhotoUrl = undefined
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
                invoiceNo: invoiceNo.trim() || undefined,
                ...(accrualInvoicePhotoUrl ? { invoicePhotoUrl: accrualInvoicePhotoUrl } : {}),
              }
            : {}),
        })
        if (!res.success) {
          await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
          return
        }
        setAmount("")
        setMemo("")
        setPayeeCode("")
        setPayeeName("")
        setAccrualAttachmentFiles([])
        setAccrualVatAmount("")
        setAccrualWithholdingTax("")
        setInvoiceReceived(false)
        setInvoiceNo("")
        setInvoicePhotoFile(null)
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
        setAmount("")
        setMemo("")
        setPayeeCode("")
        setPayeeName("")
        setAccrualAttachmentFiles([])
        setAccrualVatAmount("")
        setAccrualWithholdingTax("")
        setInvoiceReceived(false)
        setInvoiceNo("")
        setInvoicePhotoFile(null)
        setActiveFeeVatMode(null)
        setInvoicePhotoFile(null)
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
    if (!accountId) {
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
    if (isTransferLinkOnly) {
      await appAlert(
        tt(
          "wm_transferUseLinkButton",
          "이 유형은 아래 「통장 출금 선택」버튼으로 처리합니다. 저장 버튼을 누르지 마세요."
        )
      )
      return
    }
    if (effectivePaymentMethod === "bank" && !accountId) {
      await appAlert(tt("bankAccount", "Please select an account."))
      return
    }
    if (effectivePaymentMethod === "petty" && !storeName) {
      await appAlert(tt("recFilterStoreSelect", "Please select a store."))
      return
    }
    if (!storeName) {
      await appAlert(tt("expenseStoreSelect", "Please select a store."))
      return
    }
    if (categoryMain === "transfer" && effectivePaymentMethod === "bank") {
      if (effectiveTransferBankDest === "petty") {
        if (!transferToPettyStore.trim()) {
          await appAlert(tt("wm_transferToPetty", "패티캐시 매장") + tt("msg_enter_required_suffix", " is required."))
          return
        }
      } else if (effectiveTransferBankDest === "external") {
        if (!transferBankAccountNo.trim() || !transferBankRecipientName.trim()) {
          await appAlert(tt("wm_transferBankRequired", "Please enter account number and recipient."))
          return
        }
      }
    }
    if (categoryMain === "transfer" && effectivePaymentMethod === "card" && !transferToCardAccountId) {
      await appAlert(tt("wm_transferCardRequired", "Please select a card to charge."))
      return
    }
    if (categoryMain === "transfer" && effectivePaymentMethod === "petty") {
      if (!transferToDept || !transferToEmployee) {
        await appAlert(tt("wm_pettyTransferRecipientRequired", "Please select department and employee."))
        return
      }
      if (!transferToAccountNo.trim()) {
        await appAlert(tt("inv_account_no", "Account Number") + tt("msg_enter_required_suffix", " is required."))
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

    const feeResolved =
      categoryMain === "expense" ? resolveFeeSubmitAmounts(amt, activeFeeVatMode) : null
    const submitAmt = feeResolved?.gross ?? amt
    const submitVat = feeResolved
      ? feeResolved.vat
      : Math.max(0, Number(String(accrualVatAmount).replace(/,/g, "")) || 0)
    const submitInvoiceReceived = feeResolved ? feeResolved.invoiceReceived : invoiceReceived

    setSaving(true)
    try {
      const memoText = memo.trim() || (showAdvanceInstallments && advanceInstallments
        ? `Advance ${advanceInstallmentCurrent || "1"}/${advanceInstallments} installments`
        : undefined)
      const transferMemo =
        categoryMain === "transfer" && effectivePaymentMethod === "petty" && (storeName || transferToDept || transferToEmployee)
          ? [
              memoText,
              storeName && `매장: ${storeName}`,
              transferToDept && transferToDept !== "__none__" && `${pettyTransferFirstSelectLabel}: ${transferToDept}`,
              transferToEmployee && transferToEmployee !== "__none__" && `직원: ${selectedTransferEmployeeLabel}`,
            ]
            .filter(Boolean)
            .join(" ")
          : memoText

      const res = await executeWithdrawal({
        paymentMethod: effectivePaymentMethod === "card" ? "bank" : effectivePaymentMethod,
        amount: submitAmt,
        transDate,
        memo: transferMemo || undefined,
        storeName: storeName || undefined,
        categoryMain,
        categorySub: (hasSub || hasTaxSub || hasLoanSub) ? categorySub : undefined,
        vendorCode:
          categoryMain === "purchase"
            ? vendorCode || undefined
            : categoryMain === "expense" && payeeCode.trim()
              ? payeeCode.trim()
              : undefined,
        accountSubjectId: categoryMain === "expense" && accountSubjectId ? Number(accountSubjectId) : undefined,
        accountSubjectCode: categoryMain === "expense" ? subjects.find((s) => String(s.id) === accountSubjectId)?.code : undefined,
        accountSubjectName: categoryMain === "expense" ? (() => {
          const subject = subjects.find((s) => String(s.id) === accountSubjectId)
          return subject ? getSubjectLabel(subject) : undefined
        })() : undefined,
        transferToAccountNo: categoryMain === "transfer" && effectivePaymentMethod === "petty" && transferToAccountNo.trim() ? transferToAccountNo.trim() : undefined,
        transferToCardAccountId: categoryMain === "transfer" && effectivePaymentMethod === "card" && transferToCardAccountId ? Number(transferToCardAccountId) : undefined,
        transferBankAccountNo:
          categoryMain === "transfer" && effectivePaymentMethod === "bank" && effectiveTransferBankDest === "external"
            ? transferBankAccountNo.trim()
            : undefined,
        transferBankRecipientName:
          categoryMain === "transfer" && effectivePaymentMethod === "bank" && effectiveTransferBankDest === "external"
            ? transferBankRecipientName.trim()
            : undefined,
        transferToPettyStore:
          categoryMain === "transfer" && effectivePaymentMethod === "bank" && effectiveTransferBankDest === "petty"
            ? transferToPettyStore.trim()
            : undefined,
        accountId: showBankAccountForTransfer ? Number(accountId) : undefined,
        assetName: categoryMain === "fixed_asset" ? assetName || undefined : undefined,
        assetCode: categoryMain === "fixed_asset" ? assetCode || undefined : undefined,
        usefulLifeMonths: categoryMain === "fixed_asset" ? Number(usefulLifeMonths) || 60 : undefined,
        invoiceReceived: (categoryMain === "purchase" || categoryMain === "expense") ? submitInvoiceReceived : undefined,
        invoiceNo: (categoryMain === "purchase" || categoryMain === "expense") ? invoiceNo.trim() || undefined : undefined,
        invoicePhotoUrl,
        vatAmount:
          categoryMain === "purchase" || categoryMain === "expense"
            ? submitVat > 0 ? submitVat : undefined
            : undefined,
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

  const cardBillQueueRange = React.useMemo(() => {
    const end = transDate && /^\d{4}-\d{2}-\d{2}$/.test(transDate) ? transDate : todayStrBkk()
    const d = new Date(`${end}T12:00:00+07:00`)
    d.setMonth(d.getMonth() - 3)
    const start = d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
    return { startStr: start, endStr: end }
  }, [transDate])

  const handleMarkBankForCardBill = React.useCallback(
    async (bankTransactionId: number) => {
      setCardBillQueueSaving(true)
      try {
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
      } finally {
        setCardBillQueueSaving(false)
      }
    },
    [auth?.role, auth?.user, t, tt]
  )

  const openCardBillQueueFlow = React.useCallback(async () => {
    if (transferKind !== "bank_card_link") return
    const btId = Number(bankTransactionIdParam || 0)
    if (btId > 0) {
      const ok = await handleMarkBankForCardBill(btId)
      if (ok) router.push("/admin/expense-management?tab=card")
      return
    }
    if (!accountId) {
      await appAlert(tt("expenseRegisterCardBillNeedAccount", "통장 계좌를 먼저 선택해 주세요."))
      return
    }
    setCardBillQueueOpen(true)
    setCardBillQueueLoading(true)
    try {
      const amt = parseMoneyAmount(amount)
      const res = await getBankWithdrawalsForCardBillQueueMark({
        accountId: Number(accountId),
        startStr: startStrParam || cardBillQueueRange.startStr,
        endStr: endStrParam || cardBillQueueRange.endStr,
        amount: amt > 0 ? amt : undefined,
        transDate: transDate || undefined,
      })
      setCardBillQueueRows(res.list || [])
    } catch {
      setCardBillQueueRows([])
    } finally {
      setCardBillQueueLoading(false)
    }
  }, [
    accountId,
    amount,
    bankTransactionIdParam,
    cardBillQueueRange.endStr,
    cardBillQueueRange.startStr,
    transferKind,
    endStrParam,
    handleMarkBankForCardBill,
    router,
    startStrParam,
    transDate,
    tt,
  ])

  const handlePickCardBillQueueRow = React.useCallback(
    async (row: UnlinkedBankWithdrawalForCard) => {
      const ok = await handleMarkBankForCardBill(row.id)
      if (!ok) return
      setCardBillQueueOpen(false)
      router.push("/admin/expense-management?tab=card")
    },
    [handleMarkBankForCardBill, router]
  )

  const handleMarkBankForPetty = React.useCallback(
    async (bankTransactionId: number) => {
      setPettyQueueSaving(true)
      try {
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
      } finally {
        setPettyQueueSaving(false)
      }
    },
    [auth?.role, auth?.user, t, tt]
  )

  const openPettyQueueFlow = React.useCallback(async () => {
    if (transferKind !== "bank_petty_link") return
    const btId = Number(bankTransactionIdParam || 0)
    if (btId > 0) {
      const ok = await handleMarkBankForPetty(btId)
      if (ok) router.push("/admin/petty-cash")
      return
    }
    if (!accountId) {
      await appAlert(tt("expenseRegisterCardBillNeedAccount", "통장 계좌를 먼저 선택해 주세요."))
      return
    }
    setPettyQueueOpen(true)
    setPettyQueueLoading(true)
    try {
      const amt = parseMoneyAmount(amount)
      const res = await getBankWithdrawalsForPettyQueueMark({
        accountId: Number(accountId),
        startStr: startStrParam || cardBillQueueRange.startStr,
        endStr: endStrParam || cardBillQueueRange.endStr,
        amount: amt > 0 ? amt : undefined,
        transDate: transDate || undefined,
      })
      setPettyQueueRows(res.list || [])
    } catch {
      setPettyQueueRows([])
    } finally {
      setPettyQueueLoading(false)
    }
  }, [
    accountId,
    amount,
    bankTransactionIdParam,
    cardBillQueueRange.endStr,
    cardBillQueueRange.startStr,
    transferKind,
    endStrParam,
    handleMarkBankForPetty,
    router,
    startStrParam,
    transDate,
    tt,
  ])

  const handlePickPettyQueueRow = React.useCallback(
    async (row: UnlinkedBankWithdrawalForPetty) => {
      const ok = await handleMarkBankForPetty(row.id)
      if (!ok) return
      setPettyQueueOpen(false)
      router.push("/admin/petty-cash")
    },
    [handleMarkBankForPetty, router]
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
      setInvoiceReceived(false)
      return
    }
    const resolved = resolveExpenseFeeAmounts(raw, activeFeeVatMode)
    setAccrualVatAmount(resolved.vat > 0 ? String(resolved.vat) : "")
    setInvoiceReceived(resolved.invoiceReceived)
  }, [activeFeeVatMode, amount, categoryMain])

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
      if (!accountId) {
        await appAlert(tt("bankAccount", "Please select an account."))
        return
      }
      if (!storeName) {
        await appAlert(tt("expenseStoreSelect", "Please select a store."))
        return
      }

      let invoicePhotoUrl: string | undefined
      if (invoicePhotoFile) {
        try {
          invoicePhotoUrl = await compressImageForUpload(invoicePhotoFile, 1024, 0.7)
        } catch {
          invoicePhotoUrl = undefined
        }
      }

      await appAlert(tt("purchasePaymentViaExpenseOnly", PURCHASE_PAYMENT_VIA_EXPENSE_ONLY_MESSAGE))

      setSaving(true)
      try {
        const res = await updateExpenseRegisterItem({
          bankTransactionId: bankTxId,
          accountId: Number(accountId),
          transDate,
          amount: amt,
          memo: memo.trim() || undefined,
          storeName: storeName || undefined,
          categoryMain,
          categorySub: (hasSub || hasTaxSub || hasLoanSub) ? categorySub : undefined,
          vendorCode: vendorCode.trim(),
          invoiceReceived,
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

    const amt = parseMoneyAmount(amount)
    if (!amt || amt <= 0) {
      await appAlert(tt("pettyAlertAmount", "Please enter amount."))
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
    if (categoryMain === "transfer" && effectivePaymentMethod === "petty") {
      if (!transferToDept || transferToDept === "__none__" || !transferToEmployee || transferToEmployee === "__none__") {
        await appAlert(tt("wm_pettyTransferRecipientRequired", "Please select department and employee."))
        return
      }
      if (!transferToAccountNo.trim()) {
        await appAlert(`${tt("inv_account_no", "Account Number")}${tt("msg_enter_required_suffix", " is required.")}`)
        return
      }
    }
    if (categoryMain === "transfer" && effectivePaymentMethod === "bank") {
      if (effectiveTransferBankDest === "petty") {
        if (!transferToPettyStore.trim()) {
          await appAlert(tt("wm_transferToPetty", "패티캐시 매장") + tt("msg_enter_required_suffix", " is required."))
          return
        }
      } else if (effectiveTransferBankDest === "external") {
        if (!transferBankAccountNo.trim() || !transferBankRecipientName.trim()) {
          await appAlert(tt("wm_transferBankRequired", "Please enter account number and recipient."))
          return
        }
      }
    }
    if (categoryMain === "transfer" && effectivePaymentMethod === "card" && !transferToCardAccountId) {
      await appAlert(tt("wm_transferCardRequired", "Please select a card to charge."))
      return
    }

    const memoText = memo.trim() || undefined
    let classifyMemo = memoText
    if (categoryMain === "transfer" && effectivePaymentMethod === "petty" && (storeName || transferToDept || transferToEmployee)) {
      classifyMemo =
        [
          memoText,
          storeName && `매장: ${storeName}`,
          transferToDept && transferToDept !== "__none__" && `${pettyTransferFirstSelectLabel}: ${transferToDept}`,
          transferToEmployee && transferToEmployee !== "__none__" && `직원: ${selectedTransferEmployeeLabel}`,
          transferToAccountNo.trim() && `입금계좌: ${transferToAccountNo.trim()}`,
        ]
          .filter(Boolean)
          .join(" ") || memoText
    } else if (categoryMain === "transfer" && effectivePaymentMethod === "bank" && effectiveTransferBankDest === "petty" && transferToPettyStore) {
      classifyMemo =
        [memoText, transferToPettyStore && `패티보충: ${transferToPettyStore}`].filter(Boolean).join(" / ") || memoText
    } else if (categoryMain === "transfer" && effectivePaymentMethod === "bank" && effectiveTransferBankDest === "external") {
      classifyMemo =
        [memoText, transferBankRecipientName && `받는사람: ${transferBankRecipientName}`, transferBankAccountNo && `계좌: ${transferBankAccountNo}`]
          .filter(Boolean)
          .join(" / ") || memoText
    }

    setSaving(true)
    try {
      const res = await updateExpenseRegisterItem({
        bankTransactionId: bankTxId,
        accountId: Number(accountId),
        transDate,
        amount: amt,
        memo: classifyMemo,
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
                if (v !== storeName) {
                  setTransferToDept("")
                  setTransferToEmployee("")
                }
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
                  if (opt.value === "transfer") setTransferKind("petty_replenish_claim")
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
                  <div className="flex items-end gap-2">
                    <Label className="pb-2.5 shrink-0">{tt("vendor", "Vendor")}</Label>
                    <Select value={vendorCode} onValueChange={(v) => setVendorCode(v)}>
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
                <>
                  <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
                    {expensePayMode === "immediate" && (
                      <>
                        {isBankLinkMode && (
                          <div className="flex items-end gap-2">
                            <Label className="pb-2.5 shrink-0">{tt("vendor", "Payee")}</Label>
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
                                <Input value={payeeCode} onChange={(e) => setPayeeCode(e.target.value)} placeholder={tt("expensePayeeCode", "Code")} className="h-9 w-[100px]" />
                                <Input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder={tt("expensePayeeName", "Payee Name")} className="h-9 w-[140px]" />
                              </>
                            ) : (
                              <Input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder={tt("expensePayeeName", "Payee Name")} className="h-9 w-[140px]" />
                            )}
                          </div>
                        )}
                        <div className="flex items-end gap-2">
                          <Label className="pb-2.5 shrink-0">{tt("wm_accountSubject", "Account Subject")}</Label>
                          <Select value={accountSubjectId} onValueChange={setAccountSubjectId}>
                            <SelectTrigger className="h-9 w-[200px]">
                              <SelectValue placeholder={tt("wm_accountSubjectPlaceholder", "Select Account Subject")} />
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
                        </div>
                        <div className="flex items-end gap-2">
                          <Label className="pb-2.5 shrink-0">{tt("wm_accountSubject", "Account Subject")}</Label>
                          <Select value={accountSubjectId || "__none__"} onValueChange={(v) => setAccountSubjectId(v === "__none__" ? "" : v)}>
                            <SelectTrigger className="h-9 w-[200px]">
                              <SelectValue placeholder={tt("wm_accountSubjectPlaceholder", "Select Account Subject")} />
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
            <div className="rounded-lg border border-border/60 bg-muted/15 p-4 space-y-3 max-w-3xl">
              <div>
                <Label className="font-medium">{tt("wm_transferKind", "이체 유형")}</Label>
                <Select
                  value={transferKind}
                  onValueChange={(v) => {
                    setTransferKind(v as TransferKind)
                    if (v !== "bank_card_charge" && v !== "bank_card_bill_claim") setTransferToCardAccountId("")
                  }}
                >
                  <SelectTrigger className="h-9 w-full max-w-xl mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="petty_replenish_claim">{tt("wm_transferKindPettyReplenishClaim", "패티 보충 청구 (지급예정 → 통장 연동)")}</SelectItem>
                    <SelectItem value="bank_card_bill_claim">{tt("wm_transferKindBankCardBillClaim", "카드 대금 청구 (지급예정 → 통장 연동)")}</SelectItem>
                    <SelectItem value="bank_petty_link">{tt("wm_transferKindBankPettyLink", "통장 출금 → 패티캐시 (기존 출금 연동)")}</SelectItem>
                    <SelectItem value="bank_card_link">{tt("wm_transferKindBankCardLink", "통장 출금 → 카드대금 (기존 출금 연동)")}</SelectItem>
                    <SelectItem value="bank_petty_new">{tt("wm_transferKindBankPettyNew", "통장 → 패티캐시 보충 (신규 등록)")}</SelectItem>
                    <SelectItem value="bank_external">{tt("wm_transferKindBankExternal", "통장 → 외부 계좌")}</SelectItem>
                    <SelectItem value="bank_card_charge">{tt("wm_transferKindBankCardCharge", "통장 → 카드 충전")}</SelectItem>
                    <SelectItem value="petty_bank">{tt("wm_transferKindPettyBank", "패티캐시 → 통장")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1.5">
                  {transferKind === "petty_replenish_claim" &&
                    tt(
                      "wm_transferKindHintPettyReplenishClaim",
                      "직원이 사용한 만큼 청구합니다. 금액·매장 입력 후 지급예정 등록 → 승인 → 통장 거래에서 같은 금액으로 연동하세요. (분개: 연동 시 1160/1010)"
                    )}
                  {transferKind === "bank_card_bill_claim" &&
                    tt(
                      "wm_transferKindHintBankCardBillClaim",
                      "카드 월 대금을 먼저 청구합니다. 지급예정 등록 → 승인 → 통장 송금 건과 연동 후 카드 탭에서 배분하세요."
                    )}
                  {transferKind === "bank_petty_link" &&
                    tt("wm_transferKindHintBankPettyLink", "이미 통장에서 나간 출금을 패티캐시 보충 대기열에 넣습니다. 아래 「통장 출금 선택」을 누르세요.")}
                  {transferKind === "bank_card_link" &&
                    tt("wm_transferKindHintBankCardLink", "이미 통장에서 나간 출금을 카드대금 연동 대기열에 넣습니다. 아래 「통장 출금 선택」을 누르세요.")}
                  {transferKind === "bank_petty_new" &&
                    tt("wm_transferKindHintBankPettyNew", "통장에서 패티캐시로 바로 보충합니다. 매장·금액 입력 후 저장하세요.")}
                  {transferKind === "bank_external" &&
                    tt("wm_transferKindHintBankExternal", "통장에서 외부 계좌로 이체합니다. 받는 분·계좌번호를 입력 후 저장하세요.")}
                  {transferKind === "bank_card_charge" &&
                    tt("wm_transferKindHintBankCardCharge", "통장에서 카드 한도 충전합니다. 카드를 선택한 뒤 저장하세요.")}
                  {transferKind === "petty_bank" &&
                    tt("wm_transferKindHintPettyBank", "패티캐시에서 직원 통장으로 이체합니다. 부서·직원·입금계좌를 입력 후 저장하세요.")}
                </p>
              </div>

              {transferKindUsesBank && (
                <div className="max-w-md">
                  <Label className="text-xs text-muted-foreground">{tt("bankAccount", "Account")}</Label>
                  <Select value={accountId || "__none__"} onValueChange={(v) => setAccountId(v === "__none__" ? "" : v)} disabled={isBankLinkMode}>
                    <SelectTrigger className="h-9 w-full mt-1">
                      <SelectValue placeholder={tt("bankAccount", "Select Account")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {bankAccounts.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.bankName ? `[${a.bankName}] ` : ""}{a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {transferKind === "bank_card_bill_claim" && (
                <div className="max-w-md">
                  <Label className="text-xs text-muted-foreground block mb-1.5">{tt("wm_transferToCardCharge", "Card to Charge")}</Label>
                  <Select value={transferToCardAccountId || "__none__"} onValueChange={(v) => setTransferToCardAccountId(v === "__none__" ? "" : v)}>
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder={tt("cardManagementSelectCard", "Select Card")} />
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
              )}

              {transferKind === "bank_petty_link" && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    className="h-9 gap-1"
                    onClick={() => void openPettyQueueFlow()}
                    disabled={pettyQueueSaving}
                    title={tt("pettyBankLinkJournalHint", "분개: 차변·대변 현금(1010) — 내부 자금 이동")}
                  >
                    <Wallet className="h-4 w-4 shrink-0" />
                    {pettyQueueSaving ? "..." : tt("wm_transferPickBankWithdrawal", "통장 출금 선택")}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {tt("wm_transferPettyLinkAfterHint", "선택 후 패티 캐쉬 탭에서 보충 등록을 완료하세요.")}
                  </span>
                </div>
              )}

              {transferKind === "bank_card_link" && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    className="h-9 gap-1"
                    onClick={() => void openCardBillQueueFlow()}
                    disabled={cardBillQueueSaving}
                    title={tt("bankCardExpenseAccountHint", "분개: 차변 선급금(전도금 1160) · 대변 현금")}
                  >
                    <CreditCard className="h-4 w-4 shrink-0" />
                    {cardBillQueueSaving ? "..." : tt("wm_transferPickBankWithdrawal", "통장 출금 선택")}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {tt("wm_transferCardLinkAfterHint", "선택 후 카드 관리 탭에서 연동을 완료하세요.")}
                  </span>
                </div>
              )}

              {transferKind === "bank_petty_new" && (
                <div className="max-w-md">
                  <Label className="text-xs text-muted-foreground block mb-1">{tt("wm_transferToPetty", "패티캐시 매장")}</Label>
                  <Select value={transferToPettyStore || "__none__"} onValueChange={(v) => setTransferToPettyStore(v === "__none__" ? "" : v)}>
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

              {transferKind === "bank_external" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                  <div>
                    <Label className="text-xs text-muted-foreground block mb-1">{tt("inv_account_no", "Account Number")}</Label>
                    <Input
                      value={transferBankAccountNo}
                      onChange={(e) => setTransferBankAccountNo(e.target.value)}
                      placeholder={tt("wm_transferAccountNoPlaceholder", "Enter account number")}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground block mb-1">{tt("wm_transferRecipient", "Recipient")}</Label>
                    <Input
                      value={transferBankRecipientName}
                      onChange={(e) => setTransferBankRecipientName(e.target.value)}
                      placeholder={tt("wm_transferRecipientPlaceholder", "Enter recipient name")}
                      className="h-9"
                    />
                  </div>
                </div>
              )}

              {transferKind === "bank_card_charge" && (
                <div className="max-w-md">
                  <Label className="text-xs text-muted-foreground block mb-1.5">{tt("wm_transferToCardCharge", "Card to Charge")}</Label>
                  <Select value={transferToCardAccountId || "__none__"} onValueChange={(v) => setTransferToCardAccountId(v === "__none__" ? "" : v)}>
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder={tt("cardManagementSelectCard", "Select Card")} />
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
              )}

              {transferKind === "petty_bank" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end max-w-4xl">
                    <div>
                      <Label className="text-xs text-muted-foreground block mb-1.5">{pettyTransferFirstSelectLabel}</Label>
                      <Select
                        value={transferToDept || "__none__"}
                        onValueChange={(v) => { setTransferToDept(v === "__none__" ? "" : v); setTransferToEmployee(""); setTransferToAccountNo(""); }}
                        disabled={!storeName}
                      >
                        <SelectTrigger className="h-9 w-full">
                          <SelectValue placeholder={pettyTransferFirstSelectLabel} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">—</SelectItem>
                          {[...new Set(employeeList.filter((e) => storeMatchesForPettyTransfer(e.store, storeName)).map((e) => e.job).filter(Boolean))].sort().map((j) => (
                            <SelectItem key={j} value={j}>{j}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground block mb-1.5">{tt("wm_transferToEmployee", "Employee")}</Label>
                      <Select
                        value={transferToEmployee || "__none__"}
                        onValueChange={(v) => {
                          setTransferToEmployee(v === "__none__" ? "" : v)
                          if (v && v !== "__none__") {
                            const emp = employeeList.find(
                              (e) =>
                                storeMatchesForPettyTransfer(e.store, storeName) &&
                                e.job === transferToDept &&
                                employeeSelectKey(e) === v
                            )
                            setTransferToAccountNo(emp?.accountNumber || "")
                          } else {
                            setTransferToAccountNo("")
                          }
                        }}
                        disabled={!transferToDept}
                      >
                        <SelectTrigger className="h-9 w-full">
                          <SelectValue placeholder={tt("wm_transferToEmployee", "Employee")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">—</SelectItem>
                          {employeeList
                            .filter((e) => storeMatchesForPettyTransfer(e.store, storeName) && e.job === transferToDept)
                            .map((e) => ({ e, key: employeeSelectKey(e) }))
                            .filter((x) => Boolean(x.key))
                            .map(({ e, key }) => (
                              <SelectItem key={key} value={key}>
                                {formatEmployeeDisplayName(e.name, e.nameTitle)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground block mb-1.5">{tt("wm_transferToEmployeeAccount", "Employee Account")}</Label>
                      {transferToEmployee && transferToEmployee !== "__none__" ? (() => {
                        const emp = selectedTransferEmployeeRow
                        const hasAccount = emp?.accountNumber
                        return (
                          <div className="h-9 flex items-center text-sm font-medium">
                            {hasAccount ? (emp?.bankName ? `[${emp.bankName}] ` : "") + (emp?.accountNumber || "") : tt("wm_noAccountNumber", "No Account Number")}
                          </div>
                        )
                      })() : (
                        <div className="h-9 flex items-center text-sm text-muted-foreground">—</div>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground block mb-1.5">{tt("wm_transferAccountDirectInput", "Account Number (Manual Input)")}</Label>
                      <Input
                        value={transferToAccountNo}
                        onChange={(e) => setTransferToAccountNo(e.target.value)}
                        placeholder={tt("wm_transferAccountNoPlaceholder", "Enter account number")}
                        className="h-9"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tt("wm_pettyTransferStoreNote", "Store follows the selected store above.")}
                  </p>
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
              {!isLaterPayment && showBankAccountForTransfer && categoryMain !== "transfer" && (
                <div className="w-[220px]">
                  <Label>{effectivePaymentMethod === "card" ? tt("wm_transferFromBank", "Source Bank Account") : tt("bankAccount", "Account")}</Label>
                  <Select value={accountId} onValueChange={setAccountId} disabled={isBankLinkMode}>
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
              {!isLaterPayment && effectivePaymentMethod === "petty" && categoryMain !== "transfer" && (
                <div className="w-[140px]">
                  <Label>{tt("recFilterStoreSelect", "Store")}</Label>
                  <Select value={storeName} onValueChange={setStoreName}>
                    <SelectTrigger className="w-[140px] h-9 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableStores.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="w-[120px]">
                <Label>
                  {activeFeeVatMode && categoryMain === "expense"
                    ? feeAmountFieldLabel(activeFeeVatMode)
                    : isLaterPayment && (categoryMain === "purchase" || categoryMain === "expense")
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
            {(categoryMain === "purchase" || categoryMain === "expense") &&
              (isLaterPayment || (!isLaterPayment && (effectivePaymentMethod === "bank" || effectivePaymentMethod === "petty"))) && (
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
                {isLaterPayment ? (
                  <>
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
                  </>
                ) : null}
              </div>
            )}
            {isLaterPayment && (categoryMain === "purchase" || categoryMain === "expense") && (
              <div className="max-w-xl space-y-2 rounded-lg border border-border/60 bg-muted/15 p-3">
                <Label className="text-sm font-medium">
                  {tt("expenseAccrualAttachLabel", "Attach Invoice/Receipt")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {tt("expenseAccrualAttachHint", "Images or PDF, up to 3 files (non-image files recommended under 1.5MB each)")}
                </p>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="block w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-primary/10 file:px-2 file:py-1"
                  onChange={(e) => setAccrualAttachmentFiles(Array.from(e.target.files || []).slice(0, 3))}
                />
                {accrualAttachmentFiles.length > 0 ? (
                  <ul className="list-disc pl-5 text-xs text-muted-foreground">
                    {accrualAttachmentFiles.map((f, i) => (
                      <li key={`${f.name}-${i}`}>{f.name}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
            {(categoryMain === "purchase" || categoryMain === "expense") && (isLaterPayment || effectivePaymentMethod === "bank" || effectivePaymentMethod === "petty") && (
              <div className="space-y-2 p-3 rounded-lg border bg-muted/20">
                <div className="text-sm font-medium">{tt("poInvoice", "Invoice")}</div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={invoiceReceived} onCheckedChange={(c) => setInvoiceReceived(c === true)} />
                    <span className="text-sm">{tt("poInvoiceReceived", "Invoice Received")}</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">{tt("wm_invoiceNoLabel", "Invoice Number")}</Label>
                    <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder={t("wm_invoiceNoPlaceholder") || "IV-xxx"} className="w-[140px] h-9" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">{tt("bankInvoicePhotoUpload", "Invoice Image")}</Label>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="wm-invoice-photo"
                      onChange={(e) => setInvoicePhotoFile(e.target.files?.[0] || null)}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById("wm-invoice-photo")?.click()} className="h-9">
                      <Camera className="h-4 w-4 mr-1" />
                      {invoicePhotoFile ? invoicePhotoFile.name.slice(0, 12) + "..." : tt("wm_invoicePhotoSelect", "Select")}
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
                  isTransferLinkOnly ||
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
                    ? tt("btnSave", "Save")
                    : isLaterPayment
                      ? tt("wm_registerAccrual", "Register Accrual")
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

      <Dialog open={cardBillQueueOpen} onOpenChange={setCardBillQueueOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tt("expenseRegisterCardBillPickTitle", "카드대금 연동할 통장 출금 선택")}</DialogTitle>
            <DialogDescription>
              {tt("expenseRegisterCardBillPickHint", "이체 구분 미연결 출금 중 카드 월 대금으로 처리할 건을 선택하세요.")}
            </DialogDescription>
          </DialogHeader>
          {cardBillQueueLoading ? (
            <p className="text-sm text-muted-foreground py-4">{t("loading")}</p>
          ) : cardBillQueueRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              {tt("expenseRegisterCardBillPickEmpty", "대기열에 넣을 이체 출금이 없습니다.")}
            </p>
          ) : (
            <div className="max-h-[280px] overflow-y-auto space-y-2">
              {cardBillQueueRows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-2 p-2 rounded border hover:bg-muted/50 cursor-pointer"
                  onClick={() => void handlePickCardBillQueueRow(row)}
                >
                  <span className="text-sm whitespace-nowrap">
                    {row.transDate} · ฿{row.amount.toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground truncate max-w-[240px]">{row.memo || "—"}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={pettyQueueOpen} onOpenChange={setPettyQueueOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tt("expenseRegisterPettyPickTitle", "패티캐시 보충할 통장 출금 선택")}</DialogTitle>
            <DialogDescription>
              {tt("expenseRegisterPettyPickHint", "이체 구분 미연결 출금 중 패티캐시 보충으로 처리할 건을 선택하세요.")}
            </DialogDescription>
          </DialogHeader>
          {pettyQueueLoading ? (
            <p className="text-sm text-muted-foreground py-4">{t("loading")}</p>
          ) : pettyQueueRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              {tt("expenseRegisterPettyPickEmpty", "대기열에 넣을 이체 출금이 없습니다.")}
            </p>
          ) : (
            <div className="max-h-[280px] overflow-y-auto space-y-2">
              {pettyQueueRows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-2 p-2 rounded border hover:bg-muted/50 cursor-pointer"
                  onClick={() => void handlePickPettyQueueRow(row)}
                >
                  <span className="text-sm whitespace-nowrap">
                    {row.transDate} · ฿{row.amount.toLocaleString()}
                    {row.likelyPettyCash ? (
                      <span className="ml-1 text-[10px] text-amber-700">{tt("pettyLikelyReplenish", "보충 추정")}</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground truncate max-w-[240px]">{row.memo || "—"}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
