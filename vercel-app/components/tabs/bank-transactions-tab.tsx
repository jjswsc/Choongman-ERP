"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { appAlert, appConfirm, appPrompt } from "@/lib/app-message"
import { buildErpExcelHtmlDocument, erpExcelSimpleTableStyle, triggerErpExcelHtmlDownload } from "@/lib/erp-excel-export"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  adminTabsIconCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Plus, Upload, X, List, PenLine, HelpCircle, Trash2, Settings2, Save, Pencil, FileSpreadsheet, AlertCircle } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  useErpAllowUrlSync,
  useErpPageActive,
  useErpPageActiveRef,
  useErpTabActive,
  useErpRefetchOnActivate,
} from "@/lib/erp-page-visibility"
import { useStoreList } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole, canDeleteBankAccount, canViewBankAccountAuditLogs } from "@/lib/permissions"
import {
  BANK_ACCOUNT_HQ_STORE_LABEL,
  bankAccountStoreKeysMatch,
  canonicalBankAccountStore,
  displayBankAccountStore,
  formatBankAccountLabel,
} from "@/lib/bank-account-display"
import {
  approveExpenseAccrual,
  executeExpensePayment,
  getApprovedExpenseAccrualsForBankTx,
  getBankAccounts,
  getBankTransactions,
  lookupBankTransaction,
  addBankTransactionsBulk,
  registerExpenseFromBankTransaction,
  getOpenReceivablesForBankTx,
  getLinkedReceivablesForBankTx,
  linkReceivableFromBankTransaction,
  unlinkReceivableFromBankTransaction,
  addReceivableStoreCredit,
  type OpenReceivableForBankItem,
  type LinkedReceivableForBankItem,
  type LinkedReceivableForBankSummary,
  saveBankAccount,
  deleteBankAccount,
  getBankAccountAuditLogs,
  type BankAccountAuditLogItem,
  getAccountSubjects,
  getVendorsForPurchase,
  getVendorsForRelated,
  getVendorsForSales,
  getCardAccounts,
  updateBankTransactionInvoice,
  updateBankTransaction,
  deleteExpenseRegisterItem,
  invalidateBankTransactionsListCache,
  invalidateReceivablePayableListCache,
  getPurchaseOrders,
  getBankMemoRules,
  saveBankMemoRule,
  deleteBankMemoRule,
  translateTexts,
  type ExpenseAccrualPlanItem,
  type AccountSubjectItem,
  type BankMemoRule,
} from "@/lib/api-client"
import { parseKDepositCsv, type KDepositParsedResult } from "@/lib/parse-kdeposit-csv"
import { compressImageForUpload, cn } from "@/lib/utils"
import {
  coercePosStoreImportDepositCategory,
  filterBankDepositUiCategories,
  isBankDepositWithoutChannelGl,
  bankDepositSavedCategories,
  isPosRevenueDepositCategory,
  isPosStoreBankAccount,
  posStoreLegacyRevenueSavePatch,
} from "@/lib/bank-import-deposit-category"
import { bankDepositLoanCategorySelectValue } from "@/lib/bank-loan-categories"
import { defaultBankDepositSalesDateForRow } from "@/lib/pos-channel-reconcile-match"
import { suggestDepositWithRules, suggestWithdrawWithRules } from "@/lib/suggest-with-custom-rules"
import { useRouter, useSearchParams } from "next/navigation"
import { localizeApiMessage, translateApiMessage } from "@/lib/translate-api-message"
import { sortVendorsByDisplayName } from "@/lib/vendor-sort"
import { ADMIN_BTN_XS_CN, ADMIN_DIALOG_SCROLL_CN } from "@/lib/admin-ui-standards"
import {
  extractExpenseAccrualPrefix,
  extractWithdrawalCategoryFromNote,
  mergeWithdrawalCategoryIntoBankNote,
  bankNoteUserDisplayText,
} from "@/lib/bank-transaction-note-meta"
import {
  BANK_EXPENSE_VIA_EXPENSE_MGMT_MESSAGE,
  BANK_WITHDRAW_UI_CATEGORIES,
  isBankExpenseRelatedWithdrawCategory,
  isBankWithdrawCategoryWithoutSubject,
} from "@/lib/bank-expense-via-expense-mgmt"
import {
  BANK_QUICK_MEMO_DEFAULTS,
  loadBankQuickMemos,
  resetBankQuickMemosStorage,
  saveBankQuickMemos,
} from "@/lib/bank-quick-memos"
import { parsePurchaseDrillNav } from "@/lib/income-statement-purchase-drill-nav"
import {
  readBankQueryViewCache,
  saveBankQueryViewCache,
} from "@/lib/bank-query-view-cache"
import { PosChannelSettlementDialog } from "@/components/erp/pos-channel-settlement-dialog"
import {
  appendBankChipNote,
  bankChannelSettlementRowAction,
  bankChipSavePatch,
  inferPosBankChipKind,
  settlementChannelForPosBankChip,
} from "@/lib/pos-bank-chip-settlement"
import { formatBahtAmountForField, formatBahtInputDisplay, parseBahtAmount } from "@/lib/baht-input-format"
import {
  todayStr,
  bankRowSettleDate,
  formatBankLedgerDepositCell,
  formatBankLedgerWithdrawCell,
  type BankImportRowEdit,
  type BankImportDraft,
  type BankQueryDraft,
  type BankTransactionRow,
} from "./bank-transactions-tab-utils"
import { BankAccountManageDialog } from "./bank-account-manage-dialog"
import { BankRegisterActionDialog } from "./bank-register-action-dialog"
import { BankQuickMemoChipBar, BankMiscDialogs } from "./bank-misc-dialogs"
import { formatMoneyAmountParam, formatMoneyBaht, moneyEqual, normalizeMoneyInputString, parseMoneyAmount } from "@/lib/money-amount"
import { bankWithdrawOpensCardBillRegister, memoLooksLikeCardBill } from "@/lib/card-bill-memo"
import { MetricCard } from "@/components/cost-analysis/metric-card"
import {
  AccountingDataTable,
  AccountingTbodyRow,
  AccountingTh,
  AccountingTheadRow,
} from "@/components/erp/accounting-data-table"
import {
  bankRowNeedsAttention,
  countBankAttentionRows,
  resolveBankRowCategory,
} from "@/lib/bank-transaction-attention"
import {
  bankDepositNeedsReceivableOrderLink,
  canSaveReceivablePickWithMismatch,
  roundReceivableMoney,
  sumOpenReceivablePickAmount,
} from "@/lib/bank-receivable-link"
import {
  RECEIVABLE_BANK_LINK_MISMATCH_REASONS,
  canApproveReceivableBankMismatch,
  classifyReceivableBankLinkMismatch,
} from "@/lib/bank-receivable-link-policy"
import { BankAdvanceTargetCell } from "@/components/erp/bank-advance-target-cell"
import {
  formatBankAdvanceAccountSubjectLabel,
  resolveBankAdvanceTargetLabel,
  resolvePrepaymentAccountSubject,
} from "@/lib/bank-advance-display"
import {
  bankRowMatchesAmountFilter,
  bankRowMatchesKeywordFilter,
  resolveBankQueryFilterAccountSubjects,
  resolveBankQueryFilterCategories,
} from "@/lib/bank-query-filter-options"
import {
  EXPENSE_WITHDRAW_SUBJECT_FETCH,
  TRANSFER_WITHDRAW_SUBJECT_FETCH,
  filterExpenseWithdrawAccountSubjects,
} from "@/lib/account-subject-withdraw-options"

const BANK_EDIT_BTN_CN = `${ADMIN_BTN_XS_CN} shrink-0 h-7 border-primary/30 bg-primary/10 text-primary hover:bg-primary/15`

export function BankTransactionsTab() {
  const router = useRouter()
  const { auth } = useAuth()
  const canApproveReceivableMismatch = React.useMemo(
    () =>
      canApproveReceivableBankMismatch({
        role: auth?.role,
        canManageOfficePayroll: auth?.canManageOfficePayroll,
      }),
    [auth?.role, auth?.canManageOfficePayroll]
  )
  const { lang } = useLang()
  const t = useT(lang)
  const tt = React.useCallback((key: string, fallback: string) => {
    const v = t(key)
    if (!v || v === key) return fallback
    return v
  }, [t])
  const asDisplayName = (a: AccountSubjectItem) => (lang === 'ko' ? a.name : (a.nameEn || a.name))
  const { posStores: storeList } = useStoreList()

  const isOffice = isOfficeRole(auth?.role || "")
  const canDeleteBankAccountUi = canDeleteBankAccount(auth?.role || "")
  const canViewBankAccountAuditUi = canViewBankAccountAuditLogs(auth?.role || "")
  const [accounts, setAccounts] = React.useState<{
    id: number
    name: string
    store: string
    bankName?: string
    openingBalance?: number
    openingBalanceDate?: string | null
  }[]>([])
  const [accountId, setAccountId] = React.useState<string>("")
  const [startStr, setStartStr] = React.useState(todayStr)
  const [endStr, setEndStr] = React.useState(todayStr)
  const [list, setList] = React.useState<{
    id?: number
    transDate: string
    transType: string
    amount: number
    memo: string
    note?: string
    category?: string
    accountSubjectId?: number | null
    salesDate?: string
    expenseDate?: string
    invoiceReceived?: boolean
    invoiceNo?: string
    invoicePhotoUrl?: string
    purchaseOrderId?: number
    vendorCode?: string
    storeName?: string
    withholdingTaxAmount?: number
    withholdingTaxRate?: number
    isLinked?: boolean
    isReceivableLinked?: boolean
    isChannelSettled?: boolean
    isCardLinked?: boolean
  }[]>([])
  const [summary, setSummary] = React.useState<{
    openingBalance: number
    beginningBalance: number
    periodDeposits: number
    periodWithdrawals: number
    calculatedBalance: number
  } | null>(null)
  const [actualBalance, setActualBalance] = React.useState("")
  /** 조회 버튼(또는 복원)으로 목록을 불러온 적 있음 — 탭 전환 후에도 유지 */
  const [hasSearched, setHasSearched] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  const [accountSubjectOptions, setAccountSubjectOptions] = React.useState<AccountSubjectItem[]>([])
  const [assetAccountOptions, setAssetAccountOptions] = React.useState<AccountSubjectItem[]>([])
  const [cardAccounts, setCardAccounts] = React.useState<{ id: number; name: string }[]>([])
  const [vendorOptions, setVendorOptions] = React.useState<{ code: string; name: string }[]>([])
  const [relatedVendorOptions, setRelatedVendorOptions] = React.useState<{ code: string; name: string }[]>([])
  const [salesVendorOptions, setSalesVendorOptions] = React.useState<{ name: string }[]>([])

  const [newAccountName, setNewAccountName] = React.useState("")
  const [newAccountBankName, setNewAccountBankName] = React.useState("")
  const [newAccountStore, setNewAccountStore] = React.useState("")
  const [addAccountSaving, setAddAccountSaving] = React.useState(false)
  const [accountManageOpen, setAccountManageOpen] = React.useState(false)
  const [editingAccountId, setEditingAccountId] = React.useState<number | null>(null)
  const [editAccountForm, setEditAccountForm] = React.useState<{ name: string; bankName: string; store: string; openingBalance: string; openingBalanceDate: string }>({ name: "", bankName: "", store: "", openingBalance: "", openingBalanceDate: "" })
  const [accountManageSaving, setAccountManageSaving] = React.useState(false)
  const [accountDeletingId, setAccountDeletingId] = React.useState<number | null>(null)
  const [accountAuditLogs, setAccountAuditLogs] = React.useState<BankAccountAuditLogItem[]>([])
  const [accountAuditLoading, setAccountAuditLoading] = React.useState(false)

  const [importPreview, setImportPreview] = React.useState<KDepositParsedResult | null>(null)
  const [importRowEdits, setImportRowEdits] = React.useState<Record<number, BankImportRowEdit>>({})
  const [memoPreviewText, setMemoPreviewText] = React.useState<string | null>(null)
  const [updatingInvoiceId, setUpdatingInvoiceId] = React.useState<number | null>(null)
  const [invoiceLinkRow, setInvoiceLinkRow] = React.useState<(typeof list)[0] | null>(null)
  const [invoiceLinkPOList, setInvoiceLinkPOList] = React.useState<{ id?: number; po_no?: string; vendor_name?: string; total?: number; created_at?: string }[]>([])
  const [invoiceLinkSelectedPO, setInvoiceLinkSelectedPO] = React.useState<string>("")
  const [, setInvoicePhotoUploadingId] = React.useState<number | null>(null)
  const [invoicePhotoPreviewUrl, setInvoicePhotoPreviewUrl] = React.useState<string | null>(null)
  const [memoRules, setMemoRules] = React.useState<BankMemoRule[]>([])
  const [newRuleKeyword, setNewRuleKeyword] = React.useState("")
  const [newRuleTransType, setNewRuleTransType] = React.useState<"deposit" | "withdraw">("withdraw")
  const [newRuleCategory, setNewRuleCategory] = React.useState("")
  const [newRuleAccountSubjectId, setNewRuleAccountSubjectId] = React.useState<string>("")
  const [savingMemoRule, setSavingMemoRule] = React.useState(false)
  const [editingMemoRuleId, setEditingMemoRuleId] = React.useState<number | null>(null)
  const [filterTransType, setFilterTransType] = React.useState<string>("")
  const [filterCategory, setFilterCategory] = React.useState<string>("")
  const [filterVendorCode, setFilterVendorCode] = React.useState<string>("")
  const [filterAccountSubjectId, setFilterAccountSubjectId] = React.useState<string>("")
  const [filterAccountSubjectEmpty, setFilterAccountSubjectEmpty] = React.useState(false)
  const [filterPlExpenseOnly, setFilterPlExpenseOnly] = React.useState(false)
  const [filterNeedsAttention, setFilterNeedsAttention] = React.useState(false)
  const [filterInvoiceNotReceived, setFilterInvoiceNotReceived] = React.useState(false)
  const [filterAmount, setFilterAmount] = React.useState("")
  const [filterKeyword, setFilterKeyword] = React.useState("")
  const [importSaving, setImportSaving] = React.useState(false)
  const [applyCarryOverSaving, setApplyCarryOverSaving] = React.useState(false)
  const [importVendorSearch, setImportVendorSearch] = React.useState("")
  const [importStoreSearch, setImportStoreSearch] = React.useState("")
  type QueryRowEdit = Partial<{
    category: string
    accountSubjectId: string
    note: string
    salesDate: string
    expenseDate: string
    vendorCode: string
    storeName: string
    withholdingTaxAmount: string
    withholdingTaxRate: string
  }>
  const [queryRowEdits, setQueryRowEdits] = React.useState<Record<number, QueryRowEdit>>({})
  const [queryVendorSearch, setQueryVendorSearch] = React.useState("")
  const [queryStoreSearch, setQueryStoreSearch] = React.useState("")
  const [querySavingId, setQuerySavingId] = React.useState<number | null>(null)
  const [deletingBankTxId, setDeletingBankTxId] = React.useState<number | null>(null)
  const [registerExpenseRow, setRegisterExpenseRow] = React.useState<(typeof list)[0] | null>(null)
  const [registerEditMode, setRegisterEditMode] = React.useState(false)
  const [registerPayeeCode, setRegisterPayeeCode] = React.useState("")
  const [registerPayeeName, setRegisterPayeeName] = React.useState("")
  const [registerPayeeManual, setRegisterPayeeManual] = React.useState(false)
  const [registerAccountSubjectId, setRegisterAccountSubjectId] = React.useState<string>("")
  const [registerSaving, setRegisterSaving] = React.useState(false)
  const [registerActionRow, setRegisterActionRow] = React.useState<(typeof list)[0] | null>(null)
  const [approvedPickRow, setApprovedPickRow] = React.useState<(typeof list)[0] | null>(null)
  const [approvedPickList, setApprovedPickList] = React.useState<ExpenseAccrualPlanItem[]>([])
  const [approvedPickIds, setApprovedPickIds] = React.useState<number[]>([])
  const [approvedPickLoading, setApprovedPickLoading] = React.useState(false)
  const [approvedPickSaving, setApprovedPickSaving] = React.useState(false)
  const [receivablePickRow, setReceivablePickRow] = React.useState<(typeof list)[0] | null>(null)
  const [receivablePickList, setReceivablePickList] = React.useState<OpenReceivableForBankItem[]>([])
  const [receivablePickSelectedIds, setReceivablePickSelectedIds] = React.useState<number[]>([])
  const [receivablePickLoading, setReceivablePickLoading] = React.useState(false)
  const [receivablePickSaving, setReceivablePickSaving] = React.useState(false)
  const [receivablePickStoreCreditAvailable, setReceivablePickStoreCreditAvailable] = React.useState(0)
  const [receivablePickCreditApply, setReceivablePickCreditApply] = React.useState(0)
  const [receivablePickMismatchReason, setReceivablePickMismatchReason] = React.useState("")
  const [receivablePickMismatchNote, setReceivablePickMismatchNote] = React.useState("")
  const [receivableLinkedRow, setReceivableLinkedRow] = React.useState<(typeof list)[0] | null>(null)
  const [receivableLinkedList, setReceivableLinkedList] = React.useState<LinkedReceivableForBankItem[]>([])
  const [receivableLinkedSummary, setReceivableLinkedSummary] =
    React.useState<LinkedReceivableForBankSummary | null>(null)
  const [receivableLinkedLoading, setReceivableLinkedLoading] = React.useState(false)
  const [receivableLinkedUnlinking, setReceivableLinkedUnlinking] = React.useState(false)
  const [expenseSubjectEnglishNames, setExpenseSubjectEnglishNames] = React.useState<Record<number, string>>({})
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  /** 미리보기 표의 메모 입력에 포커스가 있을 때의 행 인덱스 (빠른 메모 칩 삽입용) */
  const importMemoFocusIdxRef = React.useRef<number | null>(null)
  /** 조회 탭 메모 입력 포커스 시 해당 통장 거래 id */
  const queryMemoFocusIdRef = React.useRef<number | null>(null)
  const [bankQuickMemos, setBankQuickMemos] = React.useState<string[]>(() => [...BANK_QUICK_MEMO_DEFAULTS])
  const [bankQuickMemosEditOpen, setBankQuickMemosEditOpen] = React.useState(false)
  const [channelSettleRow, setChannelSettleRow] = React.useState<(typeof list)[0] | null>(null)
  const [bankQuickMemosDraft, setBankQuickMemosDraft] = React.useState<string[]>([])
  const selectedAccountStore = (accounts.find((a) => String(a.id) === String(accountId))?.store || "").trim()
  const hidePosRevenueCategories = React.useMemo(
    () => isPosStoreBankAccount(selectedAccountStore, storeList),
    [selectedAccountStore, storeList]
  )
  const [memoTransMap, setMemoTransMap] = React.useState<Record<string, string>>({})
  const importRestoreKey = "bank_import_pending_restore"
  const importDraftStorageKey = "bank_import_input_draft_v1"
  const queryDraftStorageKey = React.useMemo(() => {
    const uid = String(auth?.user || "anon")
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 64)
    return `bank_query_input_draft_v1:${uid}`
  }, [auth?.user])
  const restoreQueryListRef = React.useRef(false)
  const hasBankInputDraft = Boolean(
    importPreview?.rows?.length ||
    newAccountName.trim() ||
    newAccountBankName.trim() ||
    newAccountStore.trim()
  )

  const restoreBankImportDraft = React.useCallback((data: BankImportDraft | null | undefined) => {
    if (!data) return false
    const hasImportPreview = Boolean(data.importPreview?.rows?.length)
    const hasNewAccountDraft = Boolean(
      data.newAccountName?.trim() ||
      data.newAccountBankName?.trim() ||
      data.newAccountStore?.trim()
    )
    if (!hasImportPreview && !hasNewAccountDraft) return false
    if (hasImportPreview) {
      setImportPreview(data.importPreview || null)
      setImportRowEdits(data.importRowEdits || {})
      if (data.accountId) setAccountId(data.accountId)
      if (data.startStr && /^\d{4}-\d{2}-\d{2}$/.test(data.startStr)) setStartStr(data.startStr)
      if (data.endStr && /^\d{4}-\d{2}-\d{2}$/.test(data.endStr)) setEndStr(data.endStr)
    }
    if (typeof data.newAccountName === "string") setNewAccountName(data.newAccountName)
    if (typeof data.newAccountBankName === "string") setNewAccountBankName(data.newAccountBankName)
    if (typeof data.newAccountStore === "string") setNewAccountStore(data.newAccountStore)
    setActiveBankTab("input")
    return true
  }, [])

  const clearBankImportDraft = React.useCallback(() => {
    try {
      sessionStorage.removeItem(importDraftStorageKey)
      sessionStorage.removeItem(importRestoreKey)
    } catch {}
  }, [])

  const allMemos = React.useMemo(() => {
    const fromList = list.map((r) => (r.memo || "").trim()).filter(Boolean)
    const fromImport = (importPreview?.rows || []).map((r) => (r.memo || "").trim()).filter(Boolean)
    return [...new Set([...fromList, ...fromImport])]
  }, [list, importPreview?.rows])
  React.useEffect(() => {
    if (allMemos.length === 0) {
      setMemoTransMap({})
      return
    }
    let cancelled = false
    translateTexts(allMemos, lang)
      .then((translated) => {
        if (cancelled) return
        const map: Record<string, string> = {}
        allMemos.forEach((m, i) => {
          map[m] = translated[i] ?? m
        })
        setMemoTransMap(map)
      })
      .catch(() => setMemoTransMap({}))
    return () => { cancelled = true }
  }, [allMemos, lang])

  const getMemo = React.useCallback((memo: string | undefined) => (memo && memoTransMap[(memo || "").trim()]) || memo || "-", [memoTransMap])
  const getAccountSubjectLabel = React.useCallback((a: AccountSubjectItem) => {
    return a.nameEn || (a.id != null ? expenseSubjectEnglishNames[a.id] : undefined) || a.name
  }, [expenseSubjectEnglishNames])

  const setQueryRowEdit = (rowId: number, field: string, value: string | undefined) => {
    setQueryRowEdits((prev) => ({
      ...prev,
      [rowId]: { ...prev[rowId], [field]: value },
    }))
  }

  const handleDeleteBankRow = async (r: (typeof list)[0]) => {
    if (!r.id || !isOffice) return
    if (r.transType !== "withdraw" && r.transType !== "deposit") return
    const base = tt("bankTxRowDeleteConfirm", "Delete this bank transaction row? (deposit/withdrawal/CSV duplicate, etc.)")
    const msg = base
    if (!(await appConfirm(msg))) return
    setDeletingBankTxId(r.id)
    try {
      const res = await deleteExpenseRegisterItem({
        bankTransactionId: r.id,
        userRole: auth?.role,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || tt("msg_delete_fail", "Delete failed"))
        return
      }
      await Promise.all([
        invalidateBankTransactionsListCache({ accountId, startStr, endStr }),
        invalidateReceivablePayableListCache(),
      ])
      await loadData()
    } catch (e) {
      await appAlert(`${tt("msg_delete_fail", "Delete failed")}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setDeletingBankTxId(null)
    }
  }

  const handleQueryRowSave = async (r: (typeof list)[0], overrideEdits?: QueryRowEdit) => {
    if (!r.id) return
    const edits = overrideEdits ?? queryRowEdits[r.id]
    if (!edits || Object.keys(edits).length === 0) return
    setQuerySavingId(r.id)
    try {
      const payload: Parameters<typeof updateBankTransaction>[0] = { bankTransactionId: r.id }
      if (edits.category !== undefined) payload.category = edits.category
      if (edits.accountSubjectId !== undefined) payload.accountSubjectId = edits.accountSubjectId === "__none__" || !edits.accountSubjectId ? null : Number(edits.accountSubjectId)
      if (edits.note !== undefined) payload.note = edits.note ?? ""
      if (edits.salesDate !== undefined) payload.salesDate = edits.salesDate || undefined
      if (edits.expenseDate !== undefined) payload.expenseDate = edits.expenseDate || undefined
      if (edits.vendorCode !== undefined) payload.vendorCode = edits.vendorCode || undefined
      if (edits.storeName !== undefined) payload.storeName = edits.storeName === "__none__" ? "" : edits.storeName || undefined
      if (r.transType === "deposit" && edits.withholdingTaxAmount !== undefined) {
        const w = Math.max(0, Number(String(edits.withholdingTaxAmount).replace(/,/g, "")) || 0)
        payload.withholdingTaxAmount = w > 0 ? w : null
      }
      if (r.transType === "deposit" && edits.withholdingTaxRate !== undefined) {
        const rate = Number(String(edits.withholdingTaxRate).replace(/,/g, ""))
        payload.withholdingTaxRate = Number.isFinite(rate) && rate > 0 ? rate : null
      }
      if (String(r.category || "").toLowerCase() === "fixed" && payload.category === undefined) {
        payload.category = "expense"
      }
      const posPatch = posStoreLegacyRevenueSavePatch({
        transType: r.transType,
        hidePosRevenue: hidePosRevenueCategories,
        category: String(edits.category ?? r.category ?? ""),
        storeName: edits.storeName === "__none__" ? "" : edits.storeName ?? r.storeName,
        accountStore: selectedAccountStore,
      })
      if (posPatch) {
        payload.category = posPatch.category
        if (payload.storeName === undefined && posPatch.storeName) {
          payload.storeName = posPatch.storeName
        }
      }
      const res = await updateBankTransaction(payload)
      if (res.success) {
        await Promise.all([
          invalidateBankTransactionsListCache({ accountId, startStr, endStr }),
          invalidateReceivablePayableListCache(),
        ])
        const nextCategory =
          edits.category !== undefined
            ? edits.category
            : payload.category !== undefined
              ? payload.category
              : r.category
        setQueryRowEdits((prev) => {
          const next = { ...prev }
          delete next[r.id!]
          return next
        })
        setList((prev) =>
          prev.map((x) =>
            x.id === r.id
              ? {
                  ...x,
                  category: nextCategory,
                  accountSubjectId: edits.accountSubjectId !== undefined ? (edits.accountSubjectId === "__none__" || !edits.accountSubjectId ? null : Number(edits.accountSubjectId)) : x.accountSubjectId,
                  note:
                    edits.note !== undefined
                      ? (() => {
                          const cat = extractWithdrawalCategoryFromNote(x.note || "")
                          if (!cat) return edits.note
                          const prefix = extractExpenseAccrualPrefix(x.note || "")
                          const body = mergeWithdrawalCategoryIntoBankNote(edits.note ?? "", cat)
                          return prefix ? `${prefix}${body}` : body
                        })()
                      : x.note,
                  salesDate: edits.salesDate ?? x.salesDate,
                  expenseDate: edits.expenseDate ?? x.expenseDate,
                  vendorCode: edits.vendorCode ?? x.vendorCode,
                  storeName:
                    edits.storeName !== undefined
                      ? edits.storeName === "__none__"
                        ? ""
                        : edits.storeName
                      : payload.storeName !== undefined
                        ? payload.storeName
                        : x.storeName,
                  withholdingTaxAmount:
                    edits.withholdingTaxAmount !== undefined
                      ? (() => {
                          const w = Math.max(0, Number(String(edits.withholdingTaxAmount).replace(/,/g, "")) || 0)
                          return w > 0 ? w : undefined
                        })()
                      : x.withholdingTaxAmount,
                  withholdingTaxRate:
                    edits.withholdingTaxRate !== undefined
                      ? (() => {
                          const rate = Number(String(edits.withholdingTaxRate).replace(/,/g, ""))
                          return Number.isFinite(rate) && rate > 0 ? rate : undefined
                        })()
                      : x.withholdingTaxRate,
                }
              : x
          )
        )
      } else {
        await appAlert(
          localizeApiMessage(
            res.message,
            t,
            tt("bankPosRevenueDepositSaveHint", "POS 매장 Grab·카드·QR 입금은 「매출 수령」으로 바꾼 뒤 저장하세요."),
            lang
          ) || res.message || t("processFail")
        )
      }
    } catch (e) {
      await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setQuerySavingId(null)
    }
  }

  const openApprovedPick = React.useCallback(async (row: (typeof list)[0]) => {
    if (!row?.id) return
    setApprovedPickRow(row)
    setApprovedPickLoading(true)
    setApprovedPickIds([])
    try {
      const res = await getApprovedExpenseAccrualsForBankTx({
        bankTransactionId: Number(row.id),
        userRole: auth?.role,
        storeFilter: (row.storeName || "").trim() || selectedAccountStore || undefined,
      })
      const listRows = res.list || []
      setApprovedPickList(listRows)
      const exact = listRows.filter((p) => p.amountMatch)
      if (exact.length === 1 && exact[0]) setApprovedPickIds([exact[0].id])
      if (!res.success) {
        setApprovedPickRow(null)
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
        return
      }
      // 이미 연결된 통장은 list=[] + message 만 옴 → 「연결 가능한 지급예정 없음」으로 오인되지 않게 안내
      if (listRows.length === 0 && res.message) {
        const msg = translateApiMessage(res.message, t) || res.message
        setApprovedPickRow(null)
        await appAlert(msg)
      }
    } catch (e) {
      setApprovedPickList([])
      setApprovedPickRow(null)
      await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setApprovedPickLoading(false)
    }
  }, [auth?.role, selectedAccountStore, t])

  const openReceivableLinkedView = React.useCallback(async (row: (typeof list)[0]) => {
    if (!row?.id) return
    setReceivableLinkedRow(row)
    setReceivableLinkedLoading(true)
    setReceivableLinkedList([])
    setReceivableLinkedSummary(null)
    try {
      const res = await getLinkedReceivablesForBankTx({ bankTransactionId: Number(row.id) })
      if (!res.success) {
        setReceivableLinkedList([])
        setReceivableLinkedSummary(null)
        return
      }
      setReceivableLinkedList(res.items || [])
      setReceivableLinkedSummary(res.summary)
    } catch {
      setReceivableLinkedList([])
      setReceivableLinkedSummary(null)
    } finally {
      setReceivableLinkedLoading(false)
    }
  }, [])

  const openReceivablePick = React.useCallback(async (row: (typeof list)[0]) => {
    if (!row?.id) return
    setReceivablePickLoading(true)
    setReceivablePickSelectedIds([])
    setReceivablePickCreditApply(0)
    setReceivablePickMismatchReason("")
    setReceivablePickMismatchNote("")
    setReceivablePickStoreCreditAvailable(0)
    try {
      const res = await getOpenReceivablesForBankTx({ bankTransactionId: Number(row.id) })
      if (res.alreadyLinked) {
        setReceivablePickRow(null)
        setReceivablePickList([])
        setList((prev) =>
          prev.map((r) => (Number(r.id) === Number(row.id) ? { ...r, isReceivableLinked: true } : r))
        )
        await openReceivableLinkedView({ ...row, isReceivableLinked: true })
        return
      }
      setReceivablePickRow(row)
      setReceivablePickList(res.list || [])
      setReceivablePickStoreCreditAvailable(Math.max(0, Number(res.storeCreditAvailable) || 0))
    } catch {
      setReceivablePickRow(row)
      setReceivablePickList([])
      setReceivablePickStoreCreditAvailable(0)
    } finally {
      setReceivablePickLoading(false)
    }
  }, [openReceivableLinkedView])

  React.useEffect(() => {
    if (!registerExpenseRow) {
      setExpenseSubjectEnglishNames({})
      return
    }
    const candidates = filterExpenseWithdrawAccountSubjects(accountSubjectOptions)
      .filter((a) => !a.nameEn && (a.name || "").trim())
    if (candidates.length === 0) {
      setExpenseSubjectEnglishNames({})
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const src = candidates.map((a) => a.name.trim())
        const translated = await translateTexts(src, "en")
        if (cancelled) return
        const mapped: Record<number, string> = {}
        candidates.forEach((a, idx) => {
          const txt = String(translated[idx] || "").trim()
          if (txt && a.id != null) mapped[a.id] = txt
        })
        setExpenseSubjectEnglishNames(mapped)
      } catch {
        if (!cancelled) setExpenseSubjectEnglishNames({})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [registerExpenseRow, accountSubjectOptions])

  const searchParams = useSearchParams()
  const allowBankUrlSync = useErpAllowUrlSync("/admin/bank-transactions")
  const pageActiveRef = useErpPageActiveRef()
  const tabParam = searchParams.get("tab")
  const openRegisterTxIdParam = searchParams.get("openRegisterTxId")
  const [activeBankTab, setActiveBankTab] = React.useState(
    tabParam === "input" ? "input" : tabParam === "query" ? "query" : "input"
  )
  const hasBankQueryDraft = Boolean(
    hasSearched ||
    activeBankTab === "query" ||
    Object.keys(queryRowEdits).length > 0 ||
    actualBalance.trim() ||
    filterTransType ||
    filterCategory ||
    filterVendorCode ||
    filterAccountSubjectId ||
    filterAccountSubjectEmpty ||
    filterPlExpenseOnly ||
    filterInvoiceNotReceived ||
    filterAmount.trim() ||
    filterKeyword.trim()
  )
  const urlParamsApplied = React.useRef(false)
  const plDrillNavReadyRef = React.useRef(false)
  const plDrillAutoFetchRef = React.useRef(false)
  const plDrillStoreRef = React.useRef<string | undefined>(undefined)
  const restoreOpenRegisterTxIdRef = React.useRef<number | null>(
    openRegisterTxIdParam && Number(openRegisterTxIdParam) > 0 ? Number(openRegisterTxIdParam) : null
  )
  const restoreListLoadedRef = React.useRef(false)
  const viewCacheRestoredRef = React.useRef(false)
  const queryDraftRestoredRef = React.useRef(false)
  /** loadData로 가져온 list/summary에 대응하는 계좌·기간 (필터만 바꾼 뒤 캐시가 어긋나지 않게) */
  const lastFetchedQueryRef = React.useRef<{
    accountId: string
    startStr: string
    endStr: string
    list: BankTransactionRow[]
    summary: {
      openingBalance: number
      beginningBalance: number
      periodDeposits: number
      periodWithdrawals: number
      calculatedBalance: number
    } | null
  } | null>(null)
  const [restoredHighlightTxId, setRestoredHighlightTxId] = React.useState<number | null>(null)

  const restoreBankQueryDraft = React.useCallback((data: BankQueryDraft | null | undefined) => {
    if (!data) return false
    const hasDraft =
      data.hasSearched === true ||
      data.activeBankTab === "query" ||
      Boolean(data.actualBalance?.trim()) ||
      Boolean(data.filterTransType) ||
      Boolean(data.filterCategory) ||
      Boolean(data.filterAccountSubjectId) ||
      Boolean(data.filterAccountSubjectEmpty) ||
      Boolean(data.filterInvoiceNotReceived) ||
      Boolean(data.filterAmount?.trim()) ||
      Boolean(data.filterKeyword?.trim()) ||
      Object.keys(data.queryRowEdits || {}).length > 0
    if (!hasDraft) return false
    if (data.accountId) setAccountId(data.accountId)
    if (data.startStr && /^\d{4}-\d{2}-\d{2}$/.test(data.startStr)) setStartStr(data.startStr)
    if (data.endStr && /^\d{4}-\d{2}-\d{2}$/.test(data.endStr)) setEndStr(data.endStr)
    if (typeof data.actualBalance === "string") setActualBalance(data.actualBalance)
    if (typeof data.filterTransType === "string") setFilterTransType(data.filterTransType)
    if (typeof data.filterCategory === "string") setFilterCategory(data.filterCategory)
    if (typeof data.filterAccountSubjectId === "string") setFilterAccountSubjectId(data.filterAccountSubjectId)
    setFilterAccountSubjectEmpty(Boolean(data.filterAccountSubjectEmpty))
    setFilterInvoiceNotReceived(Boolean(data.filterInvoiceNotReceived))
    if (typeof data.filterAmount === "string") setFilterAmount(data.filterAmount)
    if (typeof data.filterKeyword === "string") setFilterKeyword(data.filterKeyword)
    // filterVendorCode · filterPlExpenseOnly — 손익/매입 드릴다운 전용(URL). 세션 복원 시 입금이 숨겨져 혼란을 줌.
    setQueryRowEdits((data.queryRowEdits || {}) as Record<number, QueryRowEdit>)
    setActiveBankTab(data.activeBankTab === "input" || data.activeBankTab === "explanation" ? data.activeBankTab : "query")
    if (data.hasSearched) {
      setHasSearched(true)
      restoreQueryListRef.current = true
    } else if (data.activeBankTab === "query" || !data.activeBankTab) {
      restoreQueryListRef.current = true
    }
    return true
  }, [])
  React.useEffect(() => {
    if (!allowBankUrlSync) return
    if (tabParam === "account-subjects") {
      router.replace("/admin/chart-of-accounts")
      return
    }
    if (tabParam === "input") setActiveBankTab("input")
    else if (tabParam === "query") setActiveBankTab("query")
    if (openRegisterTxIdParam && Number(openRegisterTxIdParam) > 0) setActiveBankTab("query")
  }, [allowBankUrlSync, tabParam, openRegisterTxIdParam, router])

  const lastAppliedOpenTxIdRef = React.useRef<number | null>(null)
  const pendingOpenTxAccountLookupRef = React.useRef(false)
  const openRegisterAccountIdParam = searchParams.get("accountId")
  const openRegisterStartParam = searchParams.get("startStr") || searchParams.get("start")
  const openRegisterEndParam = searchParams.get("endStr") || searchParams.get("end")
  React.useEffect(() => {
    if (!allowBankUrlSync) return
    const txId =
      openRegisterTxIdParam && Number(openRegisterTxIdParam) > 0 ? Number(openRegisterTxIdParam) : null
    if (!txId) {
      lastAppliedOpenTxIdRef.current = null
      pendingOpenTxAccountLookupRef.current = false
      return
    }
    setActiveBankTab("query")
    const start = openRegisterStartParam
    const end = openRegisterEndParam
    if (start && /^\d{4}-\d{2}-\d{2}$/.test(start.slice(0, 10))) setStartStr(start.slice(0, 10))
    if (end && /^\d{4}-\d{2}-\d{2}$/.test(end.slice(0, 10))) setEndStr(end.slice(0, 10))
    restoreOpenRegisterTxIdRef.current = txId
    restoreListLoadedRef.current = false
    const aid = openRegisterAccountIdParam
    if (aid && Number(aid) > 0) {
      pendingOpenTxAccountLookupRef.current = false
      if (lastAppliedOpenTxIdRef.current !== txId) {
        lastAppliedOpenTxIdRef.current = txId
        setAccountId(String(aid))
      }
      return
    }
    if (lastAppliedOpenTxIdRef.current === txId) return
    lastAppliedOpenTxIdRef.current = txId
    pendingOpenTxAccountLookupRef.current = true
    let cancelled = false
    lookupBankTransaction(txId)
      .then((row) => {
        if (cancelled) return
        pendingOpenTxAccountLookupRef.current = false
        if (row?.accountId) {
          setAccountId(String(row.accountId))
          if (row.transDate && /^\d{4}-\d{2}-\d{2}$/.test(row.transDate)) {
            setStartStr(row.transDate)
            setEndStr(row.transDate)
          }
        }
      })
      .catch(() => {
        if (!cancelled) pendingOpenTxAccountLookupRef.current = false
      })
    return () => {
      cancelled = true
      pendingOpenTxAccountLookupRef.current = false
      lastAppliedOpenTxIdRef.current = null
    }
  }, [
    allowBankUrlSync,
    openRegisterAccountIdParam,
    openRegisterEndParam,
    openRegisterStartParam,
    openRegisterTxIdParam,
  ])

  React.useEffect(() => {
    if (!pageActiveRef.current) return
    if (urlParamsApplied.current) return
    const nav = parsePurchaseDrillNav(searchParams)
    const aid = searchParams.get("accountId")
    const start = nav.startStr ?? searchParams.get("startStr")
    const end = nav.endStr ?? searchParams.get("endStr")
    if (nav.fromPlDrill) {
      if (start && /^\d{4}-\d{2}-\d{2}$/.test(start)) setStartStr(start)
      if (end && /^\d{4}-\d{2}-\d{2}$/.test(end)) setEndStr(end)
      if (nav.filterTransType) setFilterTransType(nav.filterTransType)
      if (nav.filterCategory) setFilterCategory(nav.filterCategory)
      if (nav.filterVendorCode) setFilterVendorCode(nav.filterVendorCode)
      if (nav.filterAccountSubjectId) setFilterAccountSubjectId(nav.filterAccountSubjectId)
      if (nav.filterAccountSubjectUnclassified) setFilterAccountSubjectEmpty(true)
      if (nav.filterPlExpenseOnly) setFilterPlExpenseOnly(true)
      if (
        nav.filterAccountSubjectId ||
        nav.filterAccountSubjectUnclassified ||
        nav.filterPlExpenseOnly
      ) {
        setActiveBankTab("query")
      }
      if (nav.store) plDrillStoreRef.current = nav.store
      plDrillNavReadyRef.current = true
      urlParamsApplied.current = true
      return
    }
    if (aid) {
      setAccountId(aid)
      urlParamsApplied.current = true
    }
    if (start && /^\d{4}-\d{2}-\d{2}$/.test(start)) setStartStr(start)
    if (end && /^\d{4}-\d{2}-\d{2}$/.test(end)) setEndStr(end)
  }, [searchParams, pageActiveRef])

  React.useEffect(() => {
    if (!allowBankUrlSync) return
    if (parsePurchaseDrillNav(searchParams).fromPlDrill) return
    setFilterPlExpenseOnly(false)
    setFilterVendorCode("")
    try {
      const raw = sessionStorage.getItem(queryDraftStorageKey)
      if (!raw) return
      const data = JSON.parse(raw) as BankQueryDraft
      if (!data.filterPlExpenseOnly && !data.filterVendorCode) return
      delete data.filterPlExpenseOnly
      delete data.filterVendorCode
      sessionStorage.setItem(queryDraftStorageKey, JSON.stringify(data))
    } catch {}
  }, [allowBankUrlSync, searchParams, queryDraftStorageKey])

  /** remount 시 메모리 스냅샷으로 조회 조건·결과 즉시 복구 (검색 재클릭 불필요). paint 전 복원해 빈 화면 깜빡임 완화 */
  React.useLayoutEffect(() => {
    if (viewCacheRestoredRef.current) return
    // 숨김 keep-alive면 스킵 — allowBankUrlSync가 true로 바뀌며 복귀 시 다시 시도
    if (!pageActiveRef.current || !allowBankUrlSync) return
    viewCacheRestoredRef.current = true
    if (parsePurchaseDrillNav(searchParams).fromPlDrill) return
    const openTxId = searchParams.get("openRegisterTxId")
    if (openTxId && Number(openTxId) > 0) {
      // 미수금 등에서 연 딥링크 — 이전 조회 계좌로 덮지 않음
      queryDraftRestoredRef.current = true
      return
    }
    const snap = readBankQueryViewCache()
    if (!snap || !snap.hasSearched) return
    if (snap.accountId) setAccountId(snap.accountId)
    if (snap.startStr && /^\d{4}-\d{2}-\d{2}$/.test(snap.startStr)) setStartStr(snap.startStr)
    if (snap.endStr && /^\d{4}-\d{2}-\d{2}$/.test(snap.endStr)) setEndStr(snap.endStr)
    setActualBalance(snap.actualBalance || "")
    setFilterTransType(snap.filterTransType || "")
    setFilterCategory(snap.filterCategory || "")
    setFilterVendorCode(snap.filterVendorCode || "")
    setFilterAccountSubjectId(snap.filterAccountSubjectId || "")
    setFilterAccountSubjectEmpty(Boolean(snap.filterAccountSubjectEmpty))
    setFilterPlExpenseOnly(Boolean(snap.filterPlExpenseOnly))
    setFilterNeedsAttention(Boolean(snap.filterNeedsAttention))
    setFilterInvoiceNotReceived(Boolean(snap.filterInvoiceNotReceived))
    setFilterAmount(snap.filterAmount || "")
    setFilterKeyword(snap.filterKeyword || "")
    const edits: Record<number, QueryRowEdit> = {}
    for (const [k, v] of Object.entries(snap.queryRowEdits || {})) {
      const id = Number(k)
      if (Number.isFinite(id) && v) edits[id] = v as QueryRowEdit
    }
    setQueryRowEdits(edits)
    setList(snap.list || [])
    setSummary(snap.summary || null)
    setHasSearched(true)
    lastFetchedQueryRef.current = {
      accountId: snap.accountId || "",
      startStr: snap.startStr,
      endStr: snap.endStr,
      list: snap.list || [],
      summary: snap.summary || null,
    }
    setActiveBankTab(
      snap.activeBankTab === "input" || snap.activeBankTab === "explanation"
        ? snap.activeBankTab
        : "query"
    )
    queryDraftRestoredRef.current = true
  }, [allowBankUrlSync, searchParams, pageActiveRef])

  React.useEffect(() => {
    if (!pageActiveRef.current) return
    if (queryDraftRestoredRef.current) return
    try {
      const draftRaw = sessionStorage.getItem(importDraftStorageKey)
      if (draftRaw) {
        const data = JSON.parse(draftRaw) as BankImportDraft
        if (restoreBankImportDraft(data)) {
          queryDraftRestoredRef.current = true
          return
        }
        sessionStorage.removeItem(importDraftStorageKey)
      }
      const raw = sessionStorage.getItem(importRestoreKey)
      if (raw) {
        const data = JSON.parse(raw) as BankImportDraft
        sessionStorage.removeItem(importRestoreKey)
        if (restoreBankImportDraft(data)) {
          queryDraftRestoredRef.current = true
          return
        }
      }
      // URL에 tab=query 등만 있어도 초안 복원은 허용 (예전엔 searchParams가 있으면 통째로 skip)
      if (parsePurchaseDrillNav(searchParams).fromPlDrill) return
      const queryDraftRaw = sessionStorage.getItem(queryDraftStorageKey)
      if (!queryDraftRaw) return
      const queryDraft = JSON.parse(queryDraftRaw) as BankQueryDraft
      queryDraftRestoredRef.current = true
      if (!restoreBankQueryDraft(queryDraft)) {
        sessionStorage.removeItem(queryDraftStorageKey)
      }
    } catch {
      clearBankImportDraft()
      try {
        sessionStorage.removeItem(queryDraftStorageKey)
      } catch {}
    }
  }, [clearBankImportDraft, importDraftStorageKey, importRestoreKey, queryDraftStorageKey, restoreBankImportDraft, restoreBankQueryDraft, searchParams, pageActiveRef])

  React.useEffect(() => {
    try {
      if (!hasBankInputDraft) {
        sessionStorage.removeItem(importDraftStorageKey)
        return
      }
      const draft: BankImportDraft = {
        importPreview,
        importRowEdits,
        accountId,
        startStr,
        endStr,
        newAccountName,
        newAccountBankName,
        newAccountStore,
      }
      sessionStorage.setItem(importDraftStorageKey, JSON.stringify(draft))
    } catch {}
  }, [
    accountId,
    endStr,
    hasBankInputDraft,
    importPreview,
    importRowEdits,
    importDraftStorageKey,
    newAccountBankName,
    newAccountName,
    newAccountStore,
    startStr,
  ])

  const prevHadBankQueryDraftRef = React.useRef(false)
  React.useEffect(() => {
    try {
      if (!hasBankQueryDraft) {
        // remount 직후 hasBankQueryDraft=false인데 setState 복원 전이면 초안을 지우면 안 됨
        if (prevHadBankQueryDraftRef.current) {
          sessionStorage.removeItem(queryDraftStorageKey)
        }
        prevHadBankQueryDraftRef.current = false
        return
      }
      prevHadBankQueryDraftRef.current = true
      const draft: BankQueryDraft = {
        accountId,
        startStr,
        endStr,
        actualBalance,
        activeBankTab,
        hasSearched,
        filterTransType,
        filterCategory,
        filterAccountSubjectId,
        filterAccountSubjectEmpty,
        filterInvoiceNotReceived,
        filterAmount,
        filterKeyword,
        queryRowEdits,
      }
      sessionStorage.setItem(queryDraftStorageKey, JSON.stringify(draft))
    } catch {}
  }, [
    accountId,
    activeBankTab,
    actualBalance,
    endStr,
    filterAccountSubjectEmpty,
    filterAccountSubjectId,
    filterAmount,
    filterCategory,
    filterInvoiceNotReceived,
    filterKeyword,
    filterTransType,
    hasBankQueryDraft,
    hasSearched,
    queryDraftStorageKey,
    queryRowEdits,
    startStr,
  ])

  React.useEffect(() => {
    // remount 시 초기 hasSearched=false로 캐시를 clear하면 복원 effect가 읽은 직후/직전에
    // 스냅샷이 사라져 조회 결과가 빈 화면으로 남는다. 미조회 상태에서는 저장만 생략.
    if (!hasSearched) return
    const fetched = lastFetchedQueryRef.current
    if (!fetched) return
    const sameQuery =
      fetched.accountId === accountId &&
      fetched.startStr === startStr &&
      fetched.endStr === endStr
    const listToSave = sameQuery ? (list as BankTransactionRow[]) : fetched.list
    const summaryToSave = sameQuery ? summary : fetched.summary
    if (sameQuery) {
      lastFetchedQueryRef.current = {
        ...fetched,
        list: listToSave,
        summary: summaryToSave,
      }
    }
    const edits: Record<string, Record<string, string | undefined>> = {}
    for (const [k, v] of Object.entries(queryRowEdits)) {
      edits[k] = { ...(v as QueryRowEdit) }
    }
    saveBankQueryViewCache({
      accountId: sameQuery ? accountId : fetched.accountId,
      startStr: sameQuery ? startStr : fetched.startStr,
      endStr: sameQuery ? endStr : fetched.endStr,
      actualBalance,
      activeBankTab,
      filterTransType,
      filterCategory,
      filterVendorCode,
      filterAccountSubjectId,
      filterAccountSubjectEmpty,
      filterPlExpenseOnly,
      filterNeedsAttention,
      filterInvoiceNotReceived,
      filterAmount,
      filterKeyword,
      queryRowEdits: edits,
      list: listToSave,
      summary: summaryToSave,
      hasSearched: true,
    })
  }, [
    accountId,
    activeBankTab,
    actualBalance,
    endStr,
    filterAccountSubjectEmpty,
    filterAccountSubjectId,
    filterAmount,
    filterCategory,
    filterInvoiceNotReceived,
    filterKeyword,
    filterNeedsAttention,
    filterPlExpenseOnly,
    filterTransType,
    filterVendorCode,
    hasSearched,
    list,
    queryRowEdits,
    startStr,
    summary,
  ])
  React.useEffect(() => {
    getBankAccounts({
      userStore: auth?.store,
      userRole: auth?.role,
    })
      .then((r) => setAccounts(r || []))
      .catch(() => setAccounts([]))
  }, [auth?.store, auth?.role])

  React.useEffect(() => {
    if (!accountManageOpen || !canViewBankAccountAuditUi) {
      if (!accountManageOpen) setAccountAuditLogs([])
      return
    }
    const storeFilter = isOffice ? "" : String(auth?.store || "").trim()
    setAccountAuditLoading(true)
    getBankAccountAuditLogs({ store: storeFilter || undefined, limit: 40 })
      .then((r) => setAccountAuditLogs(r.list || []))
      .catch(() => setAccountAuditLogs([]))
      .finally(() => setAccountAuditLoading(false))
  }, [accountManageOpen, auth?.store, canViewBankAccountAuditUi, isOffice])

  React.useEffect(() => {
    if (accounts.length > 0 && !accountId) {
      if (pendingOpenTxAccountLookupRef.current) return
      setAccountId(String(accounts[0].id))
    }
  }, [accounts, accountId])

  React.useEffect(() => {
    const storeWant = plDrillStoreRef.current
    if (!storeWant || !accounts.length) return
    const match = accounts.find((a) => bankAccountStoreKeysMatch(a.store, storeWant))
    if (match?.id) setAccountId(String(match.id))
  }, [accounts])

  const loadData = React.useCallback((): Promise<void> => {
    if (!accountId) return Promise.resolve()
    setLoading(true)
    return getBankTransactions({
      accountId,
      startStr,
      endStr,
    })
      .then((r) => {
        const nextList = (r.list || []) as BankTransactionRow[]
        const nextSummary = r.summary || null
        setList(nextList)
        setSummary(nextSummary)
        setHasSearched(true)
        lastFetchedQueryRef.current = {
          accountId,
          startStr,
          endStr,
          list: nextList,
          summary: nextSummary,
        }
      })
      .catch(() => {
        setList([])
        setSummary(null)
        setHasSearched(true)
        lastFetchedQueryRef.current = {
          accountId,
          startStr,
          endStr,
          list: [],
          summary: null,
        }
      })
      .finally(() => setLoading(false))
  }, [accountId, startStr, endStr])

  const beginReceivableLinkEdit = React.useCallback(async () => {
    const row = receivableLinkedRow
    if (!row?.id) return
    const ok = await appConfirm(
      tt(
        "bankReceivableLinkedUnlinkConfirm",
        "이 통장 입금의 미수 연결을 해제하고 다시 선택하시겠습니까?"
      )
    )
    if (!ok) return
    setReceivableLinkedUnlinking(true)
    try {
      const res = await unlinkReceivableFromBankTransaction({ bankTransactionId: Number(row.id) })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
        return
      }
      setReceivableLinkedRow(null)
      setReceivableLinkedList([])
      setReceivableLinkedSummary(null)
      await invalidateReceivablePayableListCache()
      loadData()
      await openReceivablePick(row)
    } finally {
      setReceivableLinkedUnlinking(false)
    }
  }, [loadData, openReceivablePick, receivableLinkedRow, t, tt])

  const reloadBankTransactionsFresh = React.useCallback(async (): Promise<void> => {
    if (accountId) {
      await invalidateBankTransactionsListCache({ accountId, startStr, endStr })
    }
    await loadData()
  }, [accountId, startStr, endStr, loadData])

  React.useEffect(() => {
    if (!restoreQueryListRef.current || !accountId) return
    restoreQueryListRef.current = false
    void loadData()
  }, [accountId, loadData])

  React.useEffect(() => {
    if (!plDrillNavReadyRef.current || plDrillAutoFetchRef.current || !accountId) return
    plDrillAutoFetchRef.current = true
    void loadData()
  }, [accountId, loadData])

  React.useEffect(() => {
    if (!restoreOpenRegisterTxIdRef.current || !accountId || restoreListLoadedRef.current) return
    restoreListLoadedRef.current = true
    loadData()
  }, [accountId, loadData])

  const hasSearchedRef = React.useRef(hasSearched)
  hasSearchedRef.current = hasSearched
  useErpRefetchOnActivate(() => {
    // 조회한 적 있을 때만 복귀 시 갱신 — 빈 화면에서 불필요 호출·레이스 방지
    if (!hasSearchedRef.current || !accountId) return
    void loadData()
  })

  React.useEffect(() => {
    const txId = restoreOpenRegisterTxIdRef.current
    if (!txId || loading) return
    const row = list.find((x) => Number(x.id) === txId)
    if (!row) return
    setRestoredHighlightTxId(txId)
    requestAnimationFrame(() => {
      const el = document.getElementById(`bank-tx-row-${txId}`)
      const listEl = document.getElementById("bank-query-list-wrap")
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
      else if (listEl) listEl.scrollIntoView({ behavior: "smooth", block: "start" })
    })
    const clearTimer = window.setTimeout(() => {
      setRestoredHighlightTxId((prev) => (prev === txId ? null : prev))
    }, 2200)
    window.setTimeout(() => {
      try {
        const next = new URLSearchParams(searchParams.toString())
        next.delete("openRegisterTxId")
        const q = next.toString()
        router.replace(q ? `/admin/bank-transactions?${q}` : "/admin/bank-transactions")
      } catch {}
    }, 100)
    restoreOpenRegisterTxIdRef.current = null
    return () => window.clearTimeout(clearTimer)
  }, [list, loading, router, searchParams])

  React.useEffect(() => {
    getVendorsForSales().then((r) => setSalesVendorOptions(r || []))
  }, [])
  React.useEffect(() => {
    getBankMemoRules().then((r) => setMemoRules(r || [])).catch(() => setMemoRules([]))
  }, [])

  const receivableOptions = React.useMemo(() => {
    const stores = (storeList || []).filter((s) => s && s !== "All")
    const salesNames = (salesVendorOptions || []).map((v) => v.name).filter(Boolean)
    const seen = new Set<string>()
    return [...stores, ...salesNames].filter((n) => {
      if (!n || seen.has(n)) return false
      seen.add(n)
      return true
    })
  }, [storeList, salesVendorOptions])
  const [revenueAccountOptions, setRevenueAccountOptions] = React.useState<AccountSubjectItem[]>([])
  const normalizePurchaseVendorOptions = React.useCallback((rows: unknown): { code: string; name: string }[] => {
    if (!Array.isArray(rows)) return []
    const seen = new Set<string>()
    const deduped = rows
      .map((row) => {
        const item = row as { code?: string; name?: string }
        return {
          code: String(item.code || "").trim(),
          name: String(item.name || "").trim(),
        }
      })
      .filter((row) => row.code)
      .filter((row) => {
        if (seen.has(row.code)) return false
        seen.add(row.code)
        return true
      })
    return sortVendorsByDisplayName(deduped)
  }, [])
  const loadPurchaseVendorOptions = React.useCallback(async (forceFresh = false) => {
    if (!forceFresh) {
      const cachedRows = normalizePurchaseVendorOptions(await getVendorsForPurchase().catch(() => []))
      if (cachedRows.length > 0) {
        setVendorOptions(cachedRows)
        return
      }
    }
    try {
      const res = await fetch("/api/getVendorsForPurchase", { cache: "no-store" })
      if (!res.ok) throw new Error(`getVendorsForPurchase failed: ${res.status}`)
      const freshRows = normalizePurchaseVendorOptions(await res.json())
      setVendorOptions(freshRows)
    } catch {
      if (forceFresh) setVendorOptions([])
    }
  }, [normalizePurchaseVendorOptions])
  React.useEffect(() => {
    void loadPurchaseVendorOptions()
    getVendorsForRelated()
      .catch(() => [])
      .then((rows) =>
        setRelatedVendorOptions(
          (rows || []).map((r) => ({ code: String(r.code), name: String(r.name || r.code) }))
        )
      )
  }, [loadPurchaseVendorOptions])
  const reloadAccountSubjectOptions = React.useCallback(() => {
    Promise.all([
      getAccountSubjects(EXPENSE_WITHDRAW_SUBJECT_FETCH),
      getAccountSubjects(TRANSFER_WITHDRAW_SUBJECT_FETCH),
      getAccountSubjects({ forRevenue: true, excludeHeaders: true }),
      getAccountSubjects({ type: "asset", excludeHeaders: true }),
    ])
      .then(([expense, transfer, revenue, asset]) => {
        setAccountSubjectOptions([...transfer, ...(expense || [])])
        setRevenueAccountOptions(revenue || [])
        setAssetAccountOptions(asset || [])
      })
      .catch(() => {
        setAccountSubjectOptions([])
        setAssetAccountOptions([])
      })
  }, [])

  const prepaymentSubject = React.useMemo(
    () =>
      resolvePrepaymentAccountSubject([
        ...assetAccountOptions,
        ...accountSubjectOptions,
        ...revenueAccountOptions,
      ]),
    [assetAccountOptions, accountSubjectOptions, revenueAccountOptions]
  )

  const patchCategoryEditsForAdvance = React.useCallback(
    (edits: QueryRowEdit, category: string): QueryRowEdit => {
      if (category !== "advance") return { ...edits, category }
      const next: QueryRowEdit = { ...edits, category: "advance" }
      if (prepaymentSubject?.id) next.accountSubjectId = String(prepaymentSubject.id)
      return next
    },
    [prepaymentSubject]
  )

  React.useEffect(() => {
    getCardAccounts()
      .then((rows) =>
        setCardAccounts(
          (rows || [])
            .map((c) => ({ id: Number(c.id), name: String(c.name || "").trim() }))
            .filter((c) => c.id > 0 && c.name)
        )
      )
      .catch(() => setCardAccounts([]))
  }, [])

  React.useEffect(() => {
    reloadAccountSubjectOptions()
  }, [reloadAccountSubjectOptions])

  const bankPageActive = useErpPageActive()
  const bankTabActive = useErpTabActive()
  React.useEffect(() => {
    if (!bankPageActive || !bankTabActive) return
    const onVis = () => {
      if (document.visibilityState === "visible") reloadAccountSubjectOptions()
    }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [bankPageActive, bankTabActive, reloadAccountSubjectOptions])

  const getDefaultImportCategory = React.useCallback((row: KDepositParsedResult["rows"][number]) => {
    return row.transType === "deposit" ? "receivable_receive" : "unclassified"
  }, [])

  React.useEffect(() => {
    if (!importPreview || revenueAccountOptions.length === 0 || accountSubjectOptions.length === 0) return
    setImportRowEdits((prev) => {
      const next = { ...prev }
      importPreview.rows.forEach((r, idx) => {
        if (r.transType === "deposit" && r.memo) {
          const explicitCategory = String(next[idx]?.category ?? "").trim().toLowerCase()
          const defaultCategory = getDefaultImportCategory(r)
          const hasUserSelectedNonDefaultCategory = Boolean(
            explicitCategory && explicitCategory !== defaultCategory
          )
          if (hasUserSelectedNonDefaultCategory) return
          const sug = suggestDepositWithRules(r.memo, memoRules, revenueAccountOptions)
          if (sug) {
            const d = new Date(r.transDate)
            d.setDate(d.getDate() - 1)
            const coerced = coercePosStoreImportDepositCategory({
              category: sug.category,
              accountStore: selectedAccountStore,
              accountSubjectId: sug.accountSubjectId,
              revenueSubjects: revenueAccountOptions,
            })
            next[idx] = {
              ...next[idx],
              category: coerced.category,
              accountSubjectId:
                coerced.category === "receivable_receive"
                  ? undefined
                  : sug.accountSubjectId
                    ? String(sug.accountSubjectId)
                    : undefined,
              autoAssigned: true,
              storeName: coerced.storeName ?? next[idx]?.storeName,
              salesDate:
                coerced.category === "receivable_receive" ? undefined : d.toISOString().slice(0, 10),
            }
          }
        } else if (r.transType === "withdraw" && r.memo) {
          const explicitCategory = String(next[idx]?.category ?? "").trim().toLowerCase()
          const defaultCategory = getDefaultImportCategory(r)
          const hasUserSelectedNonDefaultCategory = Boolean(
            explicitCategory && explicitCategory !== defaultCategory
          )
          if (hasUserSelectedNonDefaultCategory) return
          const sug = suggestWithdrawWithRules(r.memo, memoRules, accountSubjectOptions)
          if (sug) {
            next[idx] = {
              ...next[idx],
              category: sug.category,
              autoAssigned: true,
              ...(sug.accountSubjectId ? { accountSubjectId: String(sug.accountSubjectId) } : {}),
            }
          }
        }
      })
      return next
    })
  }, [
    getDefaultImportCategory,
    importPreview,
    revenueAccountOptions,
    accountSubjectOptions,
    memoRules,
    selectedAccountStore,
  ])

  React.useEffect(() => {
    if (!importPreview) importMemoFocusIdxRef.current = null
  }, [importPreview])

  React.useEffect(() => {
    queryMemoFocusIdRef.current = null
  }, [accountId, startStr, endStr])

  React.useEffect(() => {
    if (list.length === 0) queryMemoFocusIdRef.current = null
  }, [list.length])

  React.useEffect(() => {
    setBankQuickMemos(loadBankQuickMemos())
  }, [])

  const fmt = (n: number) => `฿${(n ?? 0).toLocaleString()}`
  const diff = summary && actualBalance.trim() !== ""
    ? (Number(actualBalance.replace(/,/g, "")) || 0) - summary.calculatedBalance
    : null

  const handleBankInvoiceChange = React.useCallback(
    (r: (typeof list)[0], newChecked: boolean) => {
      if (!r.id || r.category !== "purchase_payment") return
      // 체크 해제: 바로 업데이트
      if (!newChecked) {
        setUpdatingInvoiceId(r.id)
        updateBankTransactionInvoice({
          bankTransactionId: r.id,
          invoiceReceived: false,
          purchaseOrderId: r.purchaseOrderId,
        })
          .then(async (res) => {
            if (res.success) await reloadBankTransactionsFresh()
            else await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
          })
          .catch(async (e) => {
            await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
          })
          .finally(() => setUpdatingInvoiceId(null))
        return
      }
      // 체크: 이미 발주서 연동된 건은 바로 업데이트
      if (r.purchaseOrderId) {
        setUpdatingInvoiceId(r.id)
        updateBankTransactionInvoice({
          bankTransactionId: r.id,
          invoiceReceived: true,
          purchaseOrderId: r.purchaseOrderId,
        })
          .then(async (res) => {
            if (res.success) await reloadBankTransactionsFresh()
            else await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
          })
          .catch(async (e) => {
            await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
          })
          .finally(() => setUpdatingInvoiceId(null))
        return
      }
      // 미연동: 발주서 연동 선택 모달
      setInvoiceLinkRow(r)
      setInvoiceLinkSelectedPO("")
    },
    [reloadBankTransactionsFresh, t]
  )

  React.useEffect(() => {
    if (!invoiceLinkRow?.vendorCode?.trim()) {
      setInvoiceLinkPOList([])
      return
    }
    getPurchaseOrders({ vendorCode: invoiceLinkRow.vendorCode })
      .then((rows) => setInvoiceLinkPOList(rows || []))
      .catch(() => setInvoiceLinkPOList([]))
  }, [invoiceLinkRow?.vendorCode])

  const handleInvoiceLinkConfirm = React.useCallback(async () => {
    const r = invoiceLinkRow
    if (!r?.id) return
    setUpdatingInvoiceId(r.id)
    setInvoiceLinkRow(null)
    const poId = invoiceLinkSelectedPO && invoiceLinkSelectedPO !== "__none__" ? Number(invoiceLinkSelectedPO) : undefined
    try {
      const res = await updateBankTransactionInvoice({
        bankTransactionId: r.id,
        invoiceReceived: !r.invoiceReceived,
        purchaseOrderId: poId ?? undefined,
      })
      if (res.success) await reloadBankTransactionsFresh()
      else await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
    } catch (e) {
      await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setUpdatingInvoiceId(null)
    }
  }, [invoiceLinkRow, invoiceLinkSelectedPO, reloadBankTransactionsFresh, t])

  const invoicePhotoInputRef = React.useRef<HTMLInputElement>(null)
  const invoicePhotoTargetRowRef = React.useRef<(typeof list)[0] | null>(null)
  const handleInvoicePhotoUpload = React.useCallback(
    async (r: (typeof list)[0], file: File) => {
      if (!r.id || r.category !== "purchase_payment") return
      setInvoicePhotoUploadingId(r.id)
      try {
        const dataUrl = await compressImageForUpload(file, 1024, 0.7)
        const res = await updateBankTransactionInvoice({
          bankTransactionId: r.id,
          invoicePhotoUrl: dataUrl,
        })
        if (res.success) await reloadBankTransactionsFresh()
        else await appAlert(translateApiMessage(res.message, t) || res.message || t("msg_upload_fail"))
      } catch (e) {
        await appAlert(t("msg_upload_fail") + ": " + (e instanceof Error ? e.message : String(e)))
      } finally {
        setInvoicePhotoUploadingId(null)
        if (invoicePhotoInputRef.current) invoicePhotoInputRef.current.value = ""
      }
    },
    [reloadBankTransactionsFresh, t]
  )

  const handleAddAccount = async () => {
    if (!newAccountName.trim()) {
      await appAlert(t("bankAddAccount") || "Please enter account name.")
      return
    }
    const store = canonicalBankAccountStore(
      isOffice && newAccountStore ? newAccountStore : auth?.store || ""
    ) || undefined
    setAddAccountSaving(true)
    try {
      const res = await saveBankAccount({
        name: newAccountName.trim(),
        store: store || undefined,
        bankName: newAccountBankName.trim() || undefined,
      })
      if (res.success) {
        setNewAccountName("")
        setNewAccountBankName("")
        getBankAccounts({ userStore: auth?.store, userRole: auth?.role }).then(setAccounts)
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || tt("msg_save_fail", "Save failed"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setAddAccountSaving(false)
    }
  }

  const handleSaveAccountEdit = async () => {
    if (!editingAccountId || !editAccountForm.name.trim()) return
    setAccountManageSaving(true)
    try {
      const rawStore = isOffice
        ? editAccountForm.store.trim() || BANK_ACCOUNT_HQ_STORE_LABEL
        : auth?.store || ""
      const store = canonicalBankAccountStore(rawStore) || undefined
      const ob = editAccountForm.openingBalance.trim() ? parseBahtAmount(editAccountForm.openingBalance) : 0
      const obDate = editAccountForm.openingBalanceDate.trim() && /^\d{4}-\d{2}-\d{2}$/.test(editAccountForm.openingBalanceDate) ? editAccountForm.openingBalanceDate : null
      const res = await saveBankAccount({
        id: editingAccountId,
        name: editAccountForm.name.trim(),
        bankName: editAccountForm.bankName.trim() || undefined,
        store,
        openingBalance: !isNaN(ob) ? ob : 0,
        openingBalanceDate: obDate,
      })
      if (res.success) {
        setEditingAccountId(null)
        getBankAccounts({ userStore: auth?.store, userRole: auth?.role }).then(setAccounts)
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
      }
    } catch (e) {
      await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setAccountManageSaving(false)
    }
  }

  const handleDeleteAccount = async (id: number) => {
    if (!canDeleteBankAccountUi) {
      await appAlert(t("bankAccountDeleteOfficeOnly"))
      return
    }
    const confirmMsg = [
      t("bankAccountDeleteConfirm"),
      t("bankAccountDeleteAuditNote"),
    ].filter(Boolean).join("\n\n")
    if (!await appConfirm(confirmMsg)) return
    setAccountDeletingId(id)
    try {
      const res = await deleteBankAccount({ id })
      if (res.success) {
        const fresh = await getBankAccounts({ userStore: auth?.store, userRole: auth?.role }) || []
        setAccounts(fresh)
        if (String(accountId) === String(id) && fresh.length > 0) setAccountId(String(fresh[0].id))
        else if (String(accountId) === String(id)) setAccountId("")
        setEditingAccountId(null)
        setAccountManageOpen(false)
        if (canViewBankAccountAuditUi) {
          const storeFilter = isOffice ? "" : String(auth?.store || "").trim()
          getBankAccountAuditLogs({ store: storeFilter || undefined, limit: 40 })
            .then((r) => setAccountAuditLogs(r.list || []))
            .catch(() => {})
        }
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
      }
    } catch (e) {
      await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setAccountDeletingId(null)
    }
  }

  const storeOptions = isOffice ? (storeList || []) : [auth?.store || ""].filter(Boolean)
  const storeOptionsDeduped = React.useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    const add = (s: string) => {
      const canonical = canonicalBankAccountStore(s)
      if (!canonical || seen.has(canonical)) return
      seen.add(canonical)
      result.push(canonical)
    }
    for (const s of storeOptions || []) {
      if (s === "All") continue
      add(s)
    }
    return result.length ? result : [BANK_ACCOUNT_HQ_STORE_LABEL]
  }, [storeOptions])

  const handleEditMemoRule = (rule: BankMemoRule) => {
    setEditingMemoRuleId(rule.id ?? null)
    setNewRuleKeyword(rule.keyword || "")
    setNewRuleTransType((rule.transType || "withdraw") as "deposit" | "withdraw")
    setNewRuleCategory(rule.category === "fixed" ? "expense" : rule.category || "")
    setNewRuleAccountSubjectId(rule.accountSubjectId != null ? String(rule.accountSubjectId) : "")
  }

  const handleCancelEditMemoRule = () => {
    setEditingMemoRuleId(null)
    setNewRuleKeyword("")
    setNewRuleTransType("withdraw")
    setNewRuleCategory("")
    setNewRuleAccountSubjectId("")
  }

  const handleAddMemoRule = async () => {
    if (!newRuleKeyword.trim() || !newRuleCategory) {
      await appAlert(t("bankMemoRuleKeywordRequired") || "Please enter keyword and category.")
      return
    }
    setSavingMemoRule(true)
    try {
      const res = await saveBankMemoRule({
        ...(editingMemoRuleId ? { id: editingMemoRuleId } : {}),
        keyword: newRuleKeyword.trim(),
        transType: newRuleTransType,
        category: newRuleCategory === "fixed" ? "expense" : newRuleCategory,
        accountSubjectId: newRuleAccountSubjectId ? Number(newRuleAccountSubjectId) : null,
      })
      if (res.success) {
        handleCancelEditMemoRule()
        getBankMemoRules().then((r) => setMemoRules(r || [])).catch(() => setMemoRules([]))
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
      }
    } catch (e) {
      await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSavingMemoRule(false)
    }
  }

  const handleDeleteMemoRule = async (id: number) => {
    if (!await appConfirm(t("bankMemoRuleDeleteConfirm") || "Delete this rule?")) return
    try {
      const res = await deleteBankMemoRule({ id })
      if (res.success) getBankMemoRules().then((r) => setMemoRules(r || [])).catch(() => setMemoRules([]))
      else await appAlert(res.message)
    } catch (e) {
      await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
    }
  }

  const filteredList = React.useMemo(() => {
    return list.filter((r) => {
      const edits = r.id ? queryRowEdits[r.id] : undefined
      if (filterNeedsAttention) {
        if (!bankRowNeedsAttention(r, edits).needsAttention) return false
      }
      if (filterTransType && r.transType !== filterTransType) return false
      if (filterCategory && resolveBankRowCategory(r, edits) !== filterCategory) return false
      if (filterVendorCode && String(r.vendorCode || "").trim() !== filterVendorCode) return false
      if (filterAccountSubjectId) {
        const subId = r.accountSubjectId ?? 0
        if (String(subId) !== filterAccountSubjectId) return false
      }
      if (filterAccountSubjectEmpty) {
        if (r.accountSubjectId != null && r.accountSubjectId !== 0) return false
      }
      if (filterInvoiceNotReceived && r.transType === "withdraw") {
        const hasInvoice = r.invoiceReceived === true || (r.invoiceNo && String(r.invoiceNo).trim() !== "") || (r.invoicePhotoUrl && String(r.invoicePhotoUrl).trim() !== "")
        if (hasInvoice) return false
      }
      if (filterPlExpenseOnly && r.transType === "withdraw") {
        const cat = resolveBankRowCategory(r, edits)
        if (
          ["transfer", "correction", "loan", "advance", "unclassified", "purchase_payment"].includes(
            cat
          )
        ) {
          return false
        }
      }
      if (!bankRowMatchesAmountFilter(r.amount, filterAmount)) return false
      const noteText =
        edits?.note !== undefined
          ? String(edits.note || "")
          : bankNoteUserDisplayText(r.note || "")
      const vendorCode = String(edits?.vendorCode ?? r.vendorCode ?? "").trim()
      const vendorName = vendorOptions.find((v) => v.code === vendorCode)?.name || ""
      const storeName = String(edits?.storeName ?? r.storeName ?? "").trim()
      if (
        !bankRowMatchesKeywordFilter(
          [r.memo || "", noteText, vendorCode, vendorName, storeName],
          filterKeyword
        )
      ) {
        return false
      }
      return true
    })
  }, [
    list,
    filterTransType,
    filterCategory,
    filterVendorCode,
    filterAccountSubjectId,
    filterAccountSubjectEmpty,
    filterInvoiceNotReceived,
    filterPlExpenseOnly,
    filterNeedsAttention,
    filterAmount,
    filterKeyword,
    queryRowEdits,
    vendorOptions,
  ])

  const listFilterActive = Boolean(
    filterTransType ||
      filterCategory ||
      filterVendorCode ||
      filterAccountSubjectId ||
      filterAccountSubjectEmpty ||
      filterInvoiceNotReceived ||
      filterPlExpenseOnly ||
      filterNeedsAttention ||
      filterAmount.trim() ||
      filterKeyword.trim()
  )

  const clearListFilters = React.useCallback(() => {
    setFilterTransType("")
    setFilterCategory("")
    setFilterVendorCode("")
    setFilterAccountSubjectId("")
    setFilterAccountSubjectEmpty(false)
    setFilterInvoiceNotReceived(false)
    setFilterPlExpenseOnly(false)
    setFilterNeedsAttention(false)
    setFilterAmount("")
    setFilterKeyword("")
  }, [])

  const displayPeriodDeposits = React.useMemo(() => {
    if (!listFilterActive) return summary?.periodDeposits ?? 0
    return filteredList.filter((r) => r.transType === "deposit").reduce((s, r) => s + (r.amount ?? 0), 0)
  }, [filteredList, listFilterActive, summary?.periodDeposits])

  const displayPeriodWithdrawals = React.useMemo(() => {
    if (!listFilterActive) return summary?.periodWithdrawals ?? 0
    return filteredList
      .filter((r) => r.transType === "withdraw")
      .reduce((s, r) => s + Math.abs(r.amount ?? 0), 0)
  }, [filteredList, listFilterActive, summary?.periodWithdrawals])

  const listTypeCounts = React.useMemo(() => {
    const countType = (rows: typeof list, type: "deposit" | "withdraw") =>
      rows.filter((r) => r.transType === type).length
    return {
      total: list.length,
      deposits: countType(list, "deposit"),
      withdraws: countType(list, "withdraw"),
      shownTotal: filteredList.length,
      shownDeposits: countType(filteredList, "deposit"),
      shownWithdraws: countType(filteredList, "withdraw"),
    }
  }, [filteredList, list])

  const bankAttentionCounts = React.useMemo(
    () =>
      countBankAttentionRows(list, queryRowEdits, (row) => (row as { id?: number }).id),
    [list, queryRowEdits]
  )

  const depositsHiddenByFilter =
    listTypeCounts.deposits > 0 && listTypeCounts.shownDeposits === 0 && listTypeCounts.shownTotal > 0

  const filterCategoryOptions = React.useMemo(
    () => resolveBankQueryFilterCategories(filterTransType),
    [filterTransType]
  )

  const filterAccountSubjectOptionsFiltered = React.useMemo(
    () =>
      resolveBankQueryFilterAccountSubjects({
        filterTransType,
        filterCategory,
        accountSubjectOptions,
        revenueAccountOptions,
        prepaymentSubject,
      }),
    [filterTransType, filterCategory, accountSubjectOptions, revenueAccountOptions, prepaymentSubject]
  )

  const pickRowAccountSubjectOptions = React.useCallback(
    (transType: string, category: string) =>
      resolveBankQueryFilterAccountSubjects({
        filterTransType: transType,
        filterCategory: category,
        accountSubjectOptions,
        revenueAccountOptions,
        prepaymentSubject,
      }),
    [accountSubjectOptions, revenueAccountOptions, prepaymentSubject]
  )

  React.useEffect(() => {
    if (list.length === 0) return
    if (
      filterCategory &&
      !list.some(
        (r) =>
          (!filterTransType || r.transType === filterTransType) &&
          resolveBankRowCategory(r, r.id ? queryRowEdits[r.id] : undefined) === filterCategory
      )
    ) {
      setFilterCategory("")
    }
    if (
      filterAccountSubjectId &&
      !list.some(
        (r) =>
          (!filterTransType || r.transType === filterTransType) &&
          (!filterCategory ||
            resolveBankRowCategory(r, r.id ? queryRowEdits[r.id] : undefined) === filterCategory) &&
          String(r.accountSubjectId ?? 0) === filterAccountSubjectId
      )
    ) {
      setFilterAccountSubjectId("")
    }
  }, [list, filterTransType, filterCategory, filterAccountSubjectId, queryRowEdits])

  const getCategoryLabel = (cat: string, transType: string) => {
    const depositMap: Record<string, string> = {
      revenue_delivery: t("bankRevenueDelivery") || "Delivery App",
      revenue_card: t("bankRevenueCard") || "Card",
      revenue_qr: t("bankRevenueQr") || "QR/Transfer",
      revenue_cash: t("bankRevenueCash") || "Cash",
      receivable_receive: t("bankCategoryReceivableReceive") || "Sales Collection",
      other_income: t("bankCategoryOtherIncome") || "Other income",
      cash_to_bank: t("bankCategoryCashToBank") || "Cash to bank",
      loan: t("bankCategoryLoanBorrow") || "차입 수령",
      loan_borrow: t("bankCategoryLoanBorrow") || "차입 수령",
      advance: t("bankCategoryAdvance") || "Advance",
      unclassified: t("bankCategoryUnclassified") || "Unclassified",
      correction: t("bankCategoryCorrection") || "Correction",
    }
    const withdrawMap: Record<string, string> = {
      transfer: t("bankCategoryTransfer") || "Transfer",
      expense: t("bankCategoryExpense") || "Expense",
      fixed: t("bankCategoryExpense") || "Expense",
      purchase_payment: t("bankCategoryPurchasePayment") || "Purchase Payment",
      tax: t("bankCategoryTax") || t("wm_tax") || "Tax",
      loan: t("wm_loan_repayment") || t("bankCategoryLoan") || "Loan",
      advance: t("bankCategoryAdvance") || "Advance",
      unclassified: t("bankCategoryUnclassified") || "Unclassified",
      correction: t("bankCategoryCorrection") || "Correction",
    }
    return transType === "deposit" ? (depositMap[cat] ?? cat) : (withdrawMap[cat] ?? cat)
  }

  const renderDepositCategorySelectItems = (currentCategory: string, hidePosRevenue: boolean) => (
    <>
      {filterBankDepositUiCategories({ hidePosRevenue, currentCategory }).map((value) => (
        <SelectItem key={value} value={value}>
          {getCategoryLabel(value, "deposit")}
        </SelectItem>
      ))}
    </>
  )

  const posStoreCategoryBanner = hidePosRevenueCategories ? (
    <div
      className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
      role="note"
    >
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <p className="leading-relaxed">
        {t("bankPosStoreCategoryLockedHint") ||
          "이 통장은 POS 매장입니다. 배달앱·카드·QR·현금 용도는 고르지 마세요. 입금은 「매출 수령」으로 두고 Grab·Shopee·QR·카드는 오른쪽 「채널 정산」을 누르세요."}
      </p>
    </div>
  ) : null

  const activeFilterChips = React.useMemo(() => {
    const chips: string[] = []
    if (filterTransType === "deposit") chips.push(t("bankDeposit") || "입금")
    else if (filterTransType === "withdraw") chips.push(t("bankWithdraw") || "출금")
    if (filterCategory) chips.push(getCategoryLabel(filterCategory, filterTransType || "withdraw"))
    if (filterVendorCode) {
      const vendor = vendorOptions.find((v) => v.code === filterVendorCode)
      chips.push(`${t("vendor") || "거래처"}: ${vendor?.name || filterVendorCode}`)
    }
    if (filterAccountSubjectId) {
      const sub = [...accountSubjectOptions, ...revenueAccountOptions].find(
        (a) => String(a.id) === filterAccountSubjectId
      )
      chips.push(sub ? `${sub.code} ${asDisplayName(sub)}` : filterAccountSubjectId)
    }
    if (filterAccountSubjectEmpty) chips.push(t("bankFilterAccountSubjectEmpty") || "계정과목 미입력만")
    if (filterInvoiceNotReceived) chips.push(t("poInvoiceNotReceived") || "인보이스 미수령만")
    if (filterPlExpenseOnly) chips.push(tt("bankFilterPlExpenseActive", "손익 비용(출금)만"))
    if (filterNeedsAttention) chips.push(t("acct_bank_attention_filter"))
    if (filterAmount.trim()) {
      chips.push(`${t("bankFilterAmount") || "금액"}: ${filterAmount.trim()}`)
    }
    if (filterKeyword.trim()) {
      chips.push(`${t("bankFilterKeyword") || "검색어"}: ${filterKeyword.trim()}`)
    }
    return chips
  }, [
    accountSubjectOptions,
    asDisplayName,
    filterAccountSubjectEmpty,
    filterAccountSubjectId,
    filterAmount,
    filterCategory,
    filterInvoiceNotReceived,
    filterKeyword,
    filterPlExpenseOnly,
    filterNeedsAttention,
    filterTransType,
    filterVendorCode,
    revenueAccountOptions,
    t,
    tt,
    vendorOptions,
  ])

  const exportBankTransactionsExcel = React.useCallback(async () => {
    if (filteredList.length === 0) {
      await appAlert(t("pettyNoData") || "No data to export.")
      return
    }
    const escapeXml = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    const headers = [
      t("date") || "날짜",
      t("pettyColType") || "유형",
      t("bankCategoryLabel") || "용도",
      t("accountSubject") || "계정과목",
      t("bankColDepositAmount") || "입금액",
      t("bankColWithdrawAmount") || "출금액",
      t("bankAttributedDate") || "인식일",
      t("bankMemoLabel") || "은행 적요",
      t("bankNoteLabel") || "메모",
    ]
    const rows: (string | number)[][] = [headers]
    for (const r of filteredList) {
      const cat = r.category ?? "expense"
      const catLabel = getCategoryLabel(cat, r.transType || "withdraw")
      const normalizedCat =
        r.transType === "withdraw" && String(cat).toLowerCase() === "fixed" ? "expense" : String(cat).toLowerCase()
      let subLabel = "—"
      if (normalizedCat === "advance") {
        const targetLabel = resolveBankAdvanceTargetLabel({
          storeName: r.storeName,
          vendorCode: r.vendorCode,
          vendors: vendorOptions,
          cardAccounts,
          storeLabel: t("store") || "매장",
          vendorLabel: t("vendor") || "거래처",
          cardLabel: tt("bankAdvanceTargetCardGroup", "카드"),
        })
        subLabel = formatBankAdvanceAccountSubjectLabel(prepaymentSubject, targetLabel)
      } else {
        const sub = (r.transType === "deposit" ? revenueAccountOptions : accountSubjectOptions).find(
          (a) => a.id === r.accountSubjectId
        )
        subLabel = sub ? `${sub.code} ${asDisplayName(sub)}` : "—"
      }
      const attrDate = r.transType === "deposit" && r.salesDate ? r.salesDate : r.transType === "withdraw" && r.expenseDate ? r.expenseDate : "—"
      const transType = r.transType || "withdraw"
      rows.push([
        r.transDate || "",
        transType === "deposit" ? (t("bankDeposit") || "입금") : (t("bankWithdraw") || "출금"),
        catLabel,
        subLabel,
        transType === "deposit" ? Math.abs(r.amount ?? 0) : "",
        transType === "withdraw" ? Math.abs(r.amount ?? 0) : "",
        attrDate,
        r.memo || "",
        bankNoteUserDisplayText(r.note || ""),
      ])
    }
    const tableBody = `<table>
<tr class="head">${rows[0].map((c) => `<th>${escapeXml(String(c))}</th>`).join("")}</tr>
${rows.slice(1).map((row) => `<tr>${row.map((c) => `<td>${escapeXml(String(c))}</td>`).join("")}</tr>`).join("")}
</table>`
    const html = buildErpExcelHtmlDocument(
      tableBody,
      erpExcelSimpleTableStyle({ includeTh: true, withHead: true })
    )
    triggerErpExcelHtmlDownload(html, `bank_transactions_${startStr}_${endStr}.xls`)
  }, [filteredList, startStr, endStr, accountSubjectOptions, revenueAccountOptions, vendorOptions, cardAccounts, prepaymentSubject, asDisplayName, t, tt, getCategoryLabel])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const text = (reader.result as string) || ""
        const parsed = parseKDepositCsv(text)
        if (parsed.rows.length === 0) {
          await appAlert(tt("bankParseNoRows", "파싱된 거래가 없습니다. K-DEPOSIT 형식인지 확인하세요."))
          return
        }
        setImportPreview(parsed)
        const initialEdits: Record<number, BankImportRowEdit> = {}
        parsed.rows.forEach((r, idx) => {
          if (r.transType === "deposit") {
            const d = new Date(r.transDate)
            d.setDate(d.getDate() - 1)
            initialEdits[idx] = {
              category: "receivable_receive",
              salesDate: d.toISOString().slice(0, 10),
              ...(selectedAccountStore ? { storeName: selectedAccountStore } : {}),
            }
          } else if (r.transType === "withdraw") {
            initialEdits[idx] = { category: "unclassified" }
          }
        })
        setImportRowEdits(initialEdits)
        if (parsed.periodStart && parsed.periodEnd) {
          setStartStr(parsed.periodStart)
          setEndStr(parsed.periodEnd)
        }
      } catch (err) {
        await appAlert(`${tt("bankParseFailPrefix", "파일 파싱 실패:")} ${String(err)}`)
      }
    }
    reader.readAsText(file, "UTF-8")
    e.target.value = ""
  }

  const setImportRowEdit = (idx: number, field: "category" | "accountSubjectId" | "note" | "salesDate" | "expenseDate" | "vendorCode" | "storeName", value: string) => {
    setImportRowEdits((prev) => {
      const isManualClassificationEdit = field === "category" || field === "accountSubjectId"
      const nextRow: BankImportRowEdit = {
        ...prev[idx],
        [field]: value || undefined,
        ...(isManualClassificationEdit ? { autoAssigned: false } : {}),
      }
      if (field === "category" && value === "advance" && prepaymentSubject?.id) {
        nextRow.accountSubjectId = String(prepaymentSubject.id)
      }
      return {
        ...prev,
        [idx]: nextRow,
      }
    })
  }

  const applyImportQuickMemo = React.useCallback(
    (phrase: string) => {
      const idx = importMemoFocusIdxRef.current
      if (idx !== null && idx >= 0) {
        const row = importPreview?.rows?.[idx]
        setImportRowEdits((prev) => {
          const cur = (prev[idx]?.note ?? "").trim()
          const next = appendBankChipNote(cur, phrase)
          const chipPatch = bankChipSavePatch({
            phrase,
            transType: row?.transType,
            accountStore: selectedAccountStore,
          })
          return {
            ...prev,
            [idx]: {
              ...prev[idx],
              note: next,
              ...(chipPatch.category ? { category: chipPatch.category } : {}),
              ...(chipPatch.storeName ? { storeName: chipPatch.storeName } : {}),
            },
          }
        })
        return
      }
      void navigator.clipboard.writeText(phrase).then(
        () => {
          void appAlert(tt("bankImportQuickMemoCopied", "Copied to clipboard."))
        },
        () => {
          void appAlert(tt("bankImportQuickMemoCopyFailed", "Could not copy."))
        }
      )
    },
    [tt, importPreview, selectedAccountStore]
  )

  const applyQueryQuickMemo = React.useCallback(
    (phrase: string) => {
      const rowId = queryMemoFocusIdRef.current
      if (rowId != null && rowId > 0) {
        const r = list.find((x) => x.id === rowId)
        if (r) {
          setQueryRowEdits((prev) => {
            const edits = prev[rowId]
            const base =
              edits?.note !== undefined ? edits.note ?? "" : bankNoteUserDisplayText(r.note ?? "")
            const next = appendBankChipNote(base, phrase)
            const currentCat = String(edits?.category ?? r.category ?? "")
            const chipPatch = bankChipSavePatch({
              phrase,
              transType: r.transType,
              accountStore: selectedAccountStore,
            })
            const posPatch = posStoreLegacyRevenueSavePatch({
              transType: r.transType,
              hidePosRevenue: hidePosRevenueCategories,
              category: chipPatch.category || currentCat,
              storeName: edits?.storeName === "__none__" ? "" : edits?.storeName ?? r.storeName,
              accountStore: selectedAccountStore,
            })
            return {
              ...prev,
              [rowId]: {
                ...prev[rowId],
                note: next,
                ...(chipPatch.category ? { category: chipPatch.category } : {}),
                ...(chipPatch.storeName ? { storeName: chipPatch.storeName } : {}),
                ...(posPatch && !chipPatch.category
                  ? {
                      category: posPatch.category,
                      ...(posPatch.storeName ? { storeName: posPatch.storeName } : {}),
                    }
                  : {}),
              },
            }
          })
          return
        }
      }
      void navigator.clipboard.writeText(phrase).then(
        () => {
          void appAlert(tt("bankImportQuickMemoCopied", "Copied to clipboard."))
        },
        () => {
          void appAlert(tt("bankImportQuickMemoCopyFailed", "Could not copy."))
        }
      )
    },
    [list, tt, hidePosRevenueCategories, selectedAccountStore]
  )

  const openBankQuickMemosEdit = React.useCallback(() => {
    setBankQuickMemosDraft(bankQuickMemos.length ? [...bankQuickMemos] : [...BANK_QUICK_MEMO_DEFAULTS])
    setBankQuickMemosEditOpen(true)
  }, [bankQuickMemos])

  const saveBankQuickMemosFromDialog = React.useCallback(async () => {
    const cleaned = bankQuickMemosDraft.map((s) => s.trim()).filter(Boolean)
    if (cleaned.length === 0) {
      await appAlert(tt("bankQuickMemosNeedOne", "한 줄 이상 입력해 주세요."))
      return
    }
    saveBankQuickMemos(cleaned)
    setBankQuickMemos(cleaned)
    setBankQuickMemosEditOpen(false)
  }, [bankQuickMemosDraft, tt])

  const resetBankQuickMemosToDefault = React.useCallback(async () => {
    if (!(await appConfirm(tt("bankQuickMemosResetConfirm", "저장된 목록을 지우고 기본 문구로 되돌릴까요?")))) return
    resetBankQuickMemosStorage()
    const next = loadBankQuickMemos()
    setBankQuickMemos(next)
    setBankQuickMemosDraft([...next])
  }, [tt])

  const handleImportSave = async () => {
    if (!importPreview || !accountId) return
    const acc = accounts.find((a) => String(a.id) === accountId)
    const depositCats = bankDepositSavedCategories()
    const withdrawCats = ["transfer", "expense", "purchase_payment", "correction", "loan", "advance", "unclassified"] as const
    const items = importPreview.rows.map((r, idx) => {
      const edit = importRowEdits[idx]
      const rawWithdrawCat =
        r.transType === "withdraw" && edit?.category
          ? edit.category === "fixed"
            ? "expense"
            : edit.category
          : undefined
      let category =
        r.transType === "withdraw"
          ? (rawWithdrawCat && (withdrawCats as readonly string[]).includes(rawWithdrawCat) ? rawWithdrawCat : "unclassified")
          : edit?.category && (depositCats as readonly string[]).includes(edit.category)
            ? edit.category
            : "receivable_receive"

      let storeName: string | undefined
      if (r.transType === "deposit") {
        const coerced = coercePosStoreImportDepositCategory({
          category,
          accountStore: selectedAccountStore,
          accountSubjectId: edit?.accountSubjectId,
          revenueSubjects: revenueAccountOptions,
        })
        category = coerced.category
        storeName =
          category === "receivable_receive"
            ? coerced.storeName || edit?.storeName?.trim() || selectedAccountStore || undefined
            : undefined
      }

      let accountSubjectId: number | undefined
      if (category === "advance" && prepaymentSubject?.id) {
        accountSubjectId = prepaymentSubject.id
      } else if (r.transType === "deposit" && !isBankDepositWithoutChannelGl(category)) {
        if (edit?.accountSubjectId && edit.accountSubjectId !== "__none__") accountSubjectId = Number(edit.accountSubjectId)
      } else if (r.transType === "withdraw" && !["correction", "loan", "advance", "unclassified", "purchase_payment"].includes(category)) {
        if (edit?.accountSubjectId && edit.accountSubjectId !== "__none__") accountSubjectId = Number(edit.accountSubjectId)
      }

      const note = edit?.note?.trim() || undefined
      const salesDate =
        r.transType === "deposit" && !isBankDepositWithoutChannelGl(category)
          ? edit?.salesDate ||
            defaultBankDepositSalesDateForRow({
              transDate: r.transDate,
              category,
              accountSubjectCode: revenueAccountOptions.find((s) => Number(s.id) === Number(accountSubjectId))?.code,
            })
          : undefined
      const expenseDate =
        r.transType === "withdraw" && category === "expense"
          ? edit?.expenseDate || r.transDate
          : undefined
      const vendorCode =
        category === "advance"
          ? edit?.vendorCode?.trim() || undefined
          : r.transType === "withdraw" && category === "purchase_payment"
            ? edit?.vendorCode?.trim() || undefined
            : r.transType === "deposit" && (category === "loan" || category === "loan_borrow")
              ? edit?.vendorCode?.trim() || undefined
            : undefined
      const advanceStoreName =
        category === "advance" ? edit?.storeName?.trim() || undefined : undefined
      const effectiveStoreName =
        category === "advance"
          ? advanceStoreName
          : storeName
      return {
        transDate: r.transDate,
        transType: r.transType,
        amount: r.amount,
        memo: r.memo.slice(0, 500),
        note: note ? note.slice(0, 500) : undefined,
        category: category ?? undefined,
        accountSubjectId,
        salesDate,
        expenseDate,
        vendorCode,
        storeName: effectiveStoreName,
      }
    })
    setImportSaving(true)
    try {
      const res = await addBankTransactionsBulk({
        accountId: Number(accountId),
        store: acc?.store,
        userName: auth?.user,
        items,
      })
      if (res.queued) {
        await appAlert(
          t("bankImportQueuedForSync") ||
            "네트워크 문제로 이 브라우저에만 임시 저장되었습니다. 연결 후 자동 전송됩니다. 입금이 배달앱/카드 매출(revenue_*)로 되어 있으면 매출 수령(receivable_receive)으로 바꾼 뒤 다시 저장하세요."
        )
        return
      }
      if (res.success) {
        const periodStart = importPreview.periodStart
        const periodEnd = importPreview.periodEnd
        const refreshStart = periodStart || startStr
        const refreshEnd = periodEnd || endStr
        clearBankImportDraft()
        setImportPreview(null)
        setImportRowEdits({})
        if (periodStart && periodEnd) {
          setStartStr(periodStart)
          setEndStr(periodEnd)
        }
        await Promise.all([
          invalidateBankTransactionsListCache({
            accountId: Number(accountId),
            startStr: refreshStart,
            endStr: refreshEnd,
          }),
          invalidateReceivablePayableListCache(),
        ])
        const fresh = await getBankTransactions({
          accountId: Number(accountId),
          startStr: refreshStart,
          endStr: refreshEnd,
        })
        setList(fresh.list || [])
        setSummary(fresh.summary || null)
        setHasSearched(true)
        lastFetchedQueryRef.current = {
          accountId: String(accountId),
          startStr: refreshStart,
          endStr: refreshEnd,
          list: (fresh.list || []) as BankTransactionRow[],
          summary: fresh.summary || null,
        }
        setActiveBankTab("query")
        const importMessage =
          (res.policySkipped ?? 0) > 0 || (res.policyAdjusted ?? 0) > 0 || (res.taxMerged ?? 0) > 0
            ? (() => {
                const parts = [`${res.inserted ?? 0}건 등록`]
                if ((res.duplicateSkipped ?? 0) > 0) parts.push(`중복 ${res.duplicateSkipped ?? 0}건 제외`)
                if ((res.taxMerged ?? 0) > 0) {
                  parts.push(
                    (t("bankImportTaxMerged") || "세금 납부 {count}건 Statement와 합침").replace(
                      "{count}",
                      String(res.taxMerged ?? 0)
                    )
                  )
                }
                if ((res.policyAdjusted ?? 0) > 0) parts.push(`정책 ${res.policyAdjusted ?? 0}건 자동전환`)
                if ((res.policySkipped ?? 0) > 0) parts.push(`정책 ${res.policySkipped ?? 0}건 제외`)
                let detail = ""
                if ((res.policyAdjusted ?? 0) > 0) {
                  detail += "\n\nPOS 자동분개 매장의 Grab·카드·QR 입금은 매출 수령(receivable_receive)으로 자동 저장했습니다."
                }
                if ((res.policySkipped ?? 0) > 0) {
                  detail += `${detail ? "\n" : "\n\n"}POS 자동분개 매장은 Grab·카드·QR 입금을 revenue_*로 저장하지 않습니다. 매출 수령(receivable_receive) 또는 채널 정산을 사용하세요.`
                }
                return `${parts.join(', ')}.${detail}`
              })()
            : (translateApiMessage(res.message, t) || res.message || (t("bankImportSavedGoToQuery") || "저장되었습니다. 조회 탭에서 내역을 확인·추가 작업할 수 있습니다."))
        await appAlert(importMessage)
      } else {
        const failMsg = translateApiMessage(res.message, t) || res.message || tt("msg_save_fail", "저장 실패")
        const hadRevenueInImport = importPreview.rows.some(
          (row, rowIdx) =>
            row.transType === "deposit" &&
            isPosRevenueDepositCategory(importRowEdits[rowIdx]?.category)
        )
        const posHint =
          hadRevenueInImport || String(res.message || "").includes("이중 인식")
            ? `\n\n${t("bankImportPosRevenueHint") || "POS 매장: Grab·카드·QR 입금은 「매출 수령(receivable_receive)」+ 매장·매출일을 사용하세요. 수수료는 채널 정산으로 처리합니다."}`
            : ""
        await appAlert(`${failMsg}${posHint}`)
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setImportSaving(false)
    }
  }

  const balanceMatch =
    importPreview &&
    summary &&
    importPreview.periodEnd === endStr &&
    Math.abs(importPreview.endingBalance - summary.calculatedBalance) < 0.02

  const handleApplyCarryOver = async () => {
    if (!importPreview || !accountId || !summary) return
    const acc = accounts.find((a) => String(a.id) === accountId)
    if (!acc) return
    const csvBeginning = importPreview.beginningBalance ?? 0
    const newOpeningBalance = summary.openingBalance + (csvBeginning - summary.beginningBalance)
    setApplyCarryOverSaving(true)
    try {
      const periodStart = importPreview.periodStart || startStr
      const res = await saveBankAccount({
        id: acc.id,
        name: acc.name,
        store: acc.store || undefined,
        bankName: acc.bankName || undefined,
        openingBalance: newOpeningBalance,
        openingBalanceDate: periodStart,
      })
      if (res.success) {
        const fresh = await getBankTransactions({ accountId: Number(accountId), startStr: periodStart, endStr: importPreview.periodEnd || endStr })
        setSummary(fresh.summary || null)
        getBankAccounts({ userStore: auth?.store, userRole: auth?.role }).then(setAccounts)
        await appAlert(t("bankCarryOverApplied") || "이월금액이 적용되었습니다.")
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setApplyCarryOverSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <input
        ref={invoicePhotoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          const target = invoicePhotoTargetRowRef.current
          if (file && target) handleInvoicePhotoUpload(target, file)
          invoicePhotoTargetRowRef.current = null
          e.target.value = ""
        }}
      />
      <Tabs
        value={activeBankTab}
        onValueChange={setActiveBankTab}
        preserveInactiveTabs={false}
        className={adminTabsRootCn}
      >
        <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
              <TabsTrigger value="input" className={adminTabsTriggerCn}>
                <PenLine className={adminTabsIconCn} aria-hidden />
                {t("bankTabInput") || "입력"}
              </TabsTrigger>
              <TabsTrigger value="query" className={adminTabsTriggerCn}>
                <List className={adminTabsIconCn} aria-hidden />
                {t("bankTabQuery") || "조회"}
              </TabsTrigger>
              <TabsTrigger value="explanation" className={adminTabsTriggerCn}>
                <HelpCircle className={adminTabsIconCn} aria-hidden />
                {t("bankTabExplanation") || "설명"}
              </TabsTrigger>
            </TabsList>
          </AdminTabsBarWithHelp>

        <TabsContent value="query" className="mt-0">
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="w-[160px] h-9">
                    <SelectValue placeholder={t("bankAccount")} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {formatBankAccountLabel(a)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="date" value={startStr} onChange={(e) => setStartStr(e.target.value)} className="w-[130px] h-9" />
                <Input type="date" value={endStr} onChange={(e) => setEndStr(e.target.value)} className="w-[130px] h-9" />
                <Input
                  type="text"
                  placeholder={t("bankActualBalance")}
                  value={actualBalance}
                  onChange={(e) => setActualBalance(e.target.value)}
                  className="w-[120px] h-9 text-right"
                  title={t("bankVerifyHint")}
                />
                <Button size="sm" onClick={loadData} disabled={loading || !accountId}>
                  <Search className="h-4 w-4 mr-1" />
                  {t("btn_query")}
                </Button>
              </div>

              {accounts.length === 0 ? (
                <div className="border rounded-lg p-4 space-y-3">
                  <p className="text-sm text-muted-foreground">{t("bankAddAccount")} - {t("bankNoAccountHint")}</p>
                </div>
              ) : (
                <>
                  {summary && (
                    <div className="mb-4 space-y-3">
                      <div
                        className={cn(
                          "grid grid-cols-2 gap-2",
                          diff !== null ? "md:grid-cols-3 lg:grid-cols-5" : "md:grid-cols-4"
                        )}
                      >
                        <MetricCard
                          size="sm"
                          label={t("bankDeposit")}
                          value={fmt(displayPeriodDeposits)}
                          variant="success"
                        />
                        <MetricCard
                          size="sm"
                          label={t("bankWithdraw")}
                          value={fmt(displayPeriodWithdrawals)}
                          variant="warning"
                        />
                        <MetricCard
                          size="sm"
                          variant="primary"
                          label={t("acct_kpi_bank_balance")}
                          value={fmt(summary.calculatedBalance)}
                          subLabel={`${t("bankOpeningBalance")} ${fmt(summary.beginningBalance ?? summary.openingBalance)}`}
                        />
                        <MetricCard
                          size="sm"
                          label={tt("bankListCountLabel", "조회 / 표시")}
                          value={tt("bankListCountShown", "표시 {shown}건").replace("{shown}", String(listTypeCounts.shownTotal))}
                          subLabel={tt(
                            "bankListCountBreakdownShort",
                            "조회 {total}건 · 입금 {deposits} · 출금 {withdraws}"
                          )
                            .replace("{total}", String(listTypeCounts.total))
                            .replace("{deposits}", String(listTypeCounts.deposits))
                            .replace("{withdraws}", String(listTypeCounts.withdraws))}
                          variant="default"
                        />
                        {diff !== null ? (
                          <MetricCard
                            size="sm"
                            label={t("bankDifference")}
                            value={`${diff >= 0 ? "+" : ""}${fmt(diff)}`}
                            variant={diff === 0 ? "success" : "warning"}
                          />
                        ) : null}
                      </div>
                      {listFilterActive ? (
                        <p className="text-xs text-muted-foreground">
                          {tt("bankSummaryFilteredHint", "입·출금 합계는 아래 목록 필터 기준")}
                        </p>
                      ) : null}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 mb-3 p-3 rounded-lg bg-muted/20 border">
                    <span className="text-sm font-medium text-muted-foreground mr-1">{t("bankFilterLabel") || "필터"}:</span>
                    {activeFilterChips.map((chip) => (
                      <span
                        key={chip}
                        className="text-xs rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-foreground"
                      >
                        {chip}
                      </span>
                    ))}
                    <Select
                      value={filterTransType || "__all__"}
                      onValueChange={(v) => {
                        const next = v === "__all__" ? "" : v
                        setFilterTransType(next)
                        if (next) {
                          setFilterCategory("")
                          setFilterAccountSubjectId("")
                        }
                      }}
                    >
                      <SelectTrigger className="w-[110px] h-9">
                        <SelectValue placeholder={t("pettyColType") || "유형"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">— {t("pettyColType") || "유형"}</SelectItem>
                        <SelectItem value="deposit">{t("bankDeposit")}</SelectItem>
                        <SelectItem value="withdraw">{t("bankWithdraw")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={filterCategory || "__all__"}
                      onValueChange={(v) => {
                        const next = v === "__all__" ? "" : v
                        setFilterCategory(next)
                        if (next) setFilterAccountSubjectId("")
                      }}
                    >
                      <SelectTrigger className="w-[130px] h-9">
                        <SelectValue placeholder={t("bankCategoryLabel") || "용도"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">— {t("bankCategoryLabel") || "용도"}</SelectItem>
                        {filterCategoryOptions.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {getCategoryLabel(cat, filterTransType || "withdraw")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={filterAccountSubjectId || "__all__"} onValueChange={(v) => setFilterAccountSubjectId(v === "__all__" ? "" : v)}>
                      <SelectTrigger className="w-[160px] h-9">
                        <SelectValue placeholder={t("accountSubject") || "계정과목"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">— {t("accountSubject") || "계정과목"}</SelectItem>
                        {filterAccountSubjectOptionsFiltered.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.code} {asDisplayName(a)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={filterAmount}
                      onChange={(e) => setFilterAmount(normalizeMoneyInputString(e.target.value))}
                      placeholder={t("bankFilterAmountPh") || "금액"}
                      title={t("bankFilterAmountHint") || "입·출금 절대 금액으로 검색"}
                      className="w-[110px] h-9"
                    />
                    <Input
                      type="search"
                      value={filterKeyword}
                      onChange={(e) => setFilterKeyword(e.target.value)}
                      placeholder={t("bankFilterKeywordPh") || "적요·메모 검색"}
                      title={t("bankFilterKeywordHint") || "은행 적요, 메모, 거래처, 매장명"}
                      className="w-[180px] h-9 min-w-[140px]"
                    />
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filterAccountSubjectEmpty}
                        onChange={(e) => setFilterAccountSubjectEmpty(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm whitespace-nowrap">{t("bankFilterAccountSubjectEmpty") || "계정과목 미입력만"}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filterInvoiceNotReceived}
                        onChange={(e) => setFilterInvoiceNotReceived(e.target.checked)}
                        className="rounded"
                        title={tt(
                          "bankFilterInvoiceNotReceivedHint",
                          "출금 중 인보이스 미수령만 목록에서 줄입니다. 입금은 그대로 표시됩니다."
                        )}
                      />
                      <span className="text-sm whitespace-nowrap">{t("poInvoiceNotReceived") || "인보이스 미수령만"}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filterNeedsAttention}
                        onChange={(e) => setFilterNeedsAttention(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm whitespace-nowrap">{t("acct_bank_attention_filter")}</span>
                    </label>
                    <Button size="sm" variant="ghost" onClick={clearListFilters}>
                      {t("btn_reset") || "초기화"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={exportBankTransactionsExcel} disabled={filteredList.length === 0} title={t("excelBtn") || "엑셀"}>
                      <FileSpreadsheet className="h-4 w-4 mr-1" />
                      {t("excelBtn") || "엑셀"}
                    </Button>
                  </div>

                  {!loading && depositsHiddenByFilter ? (
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-300/80 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                      <span>
                        {tt(
                          "bankDepositsHiddenWarning",
                          "입금 {n}건이 조회됐지만 목록 필터 때문에 숨겨져 있습니다. 「초기화」를 누르세요."
                        ).replace("{n}", String(listTypeCounts.deposits))}
                      </span>
                      <Button size="sm" variant="outline" className="h-7" onClick={clearListFilters}>
                        {t("btn_reset") || "초기화"}
                      </Button>
                    </div>
                  ) : null}

                  {!loading && bankAttentionCounts.total > 0 ? (
                    <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                      <MetricCard
                        size="sm"
                        variant="warning"
                        label={t("acct_bank_attention_receivable_link")}
                        value={String(bankAttentionCounts.receivableLinkPending)}
                      />
                      <MetricCard
                        size="sm"
                        variant="warning"
                        label={t("acct_bank_attention_expense_link")}
                        value={String(bankAttentionCounts.expenseLinkPending)}
                      />
                      <MetricCard
                        size="sm"
                        variant="warning"
                        label={t("acct_bank_attention_unclassified")}
                        value={String(bankAttentionCounts.unclassified)}
                      />
                      <MetricCard
                        size="sm"
                        variant="warning"
                        label={t("acct_bank_attention_no_subject")}
                        value={String(bankAttentionCounts.noSubject)}
                      />
                    </div>
                  ) : null}

                  {!loading && accountId && accounts.length > 0 && (
                    <>
                      {posStoreCategoryBanner}
                    <BankQuickMemoChipBar
                      className="mb-3"
                      phrases={bankQuickMemos}
                      title={t("bankImportQuickMemosTitle") || "자주 쓰는 메모"}
                      hint={
                        t("bankImportQuickMemoHint") ||
                        "메모 칸을 먼저 선택한 뒤 누르면 해당 줄에 붙고, 아니면 클립보드로 복사됩니다."
                      }
                      onPhrase={applyQueryQuickMemo}
                      onManageClick={openBankQuickMemosEdit}
                      manageLabel={t("bankQuickMemosManage") || "편집"}
                    />
                    </>
                  )}

                  <AccountingDataTable
                    id="bank-query-list-wrap"
                    className="max-h-[70vh] min-h-[320px]"
                    minWidthClass="min-w-[1335px] table-fixed"
                  >
                    {loading ? (
                      <tbody>
                        <tr>
                          <td colSpan={12} className="py-8 text-center text-sm text-muted-foreground">
                            {t("loadingItems")}
                          </td>
                        </tr>
                      </tbody>
                    ) : filteredList.length === 0 ? (
                      <tbody>
                        <tr>
                          <td colSpan={12} className="py-8 text-center text-sm text-muted-foreground">
                            {list.length === 0 ? (t("pettyNoData") || "데이터 없음") : (t("bankNoMatchFilter") || "조건에 맞는 거래가 없습니다.")}
                          </td>
                        </tr>
                      </tbody>
                    ) : (
                      <>
                        <colgroup>
                          <col style={{ width: "108px" }} />
                          <col style={{ width: "64px" }} />
                          <col style={{ width: "130px" }} />
                          <col style={{ width: "130px" }} />
                          <col style={{ width: "88px" }} />
                          <col style={{ width: "88px" }} />
                          <col style={{ width: "120px" }} />
                          <col style={{ width: "168px" }} />
                          <col style={{ width: "32px" }} />
                          <col style={{ width: "158px" }} />
                          <col style={{ width: "158px" }} />
                          <col style={{ width: "76px" }} />
                        </colgroup>
                        <AccountingTheadRow sticky>
                          <AccountingTh align="center">{t("date") || "날짜"}</AccountingTh>
                          <AccountingTh align="center">{t("pettyColType") || "유형"}</AccountingTh>
                          <AccountingTh align="center">{t("bankCategoryLabel") || "용도"}</AccountingTh>
                          <AccountingTh align="center">{t("accountSubject") || "계정과목"}</AccountingTh>
                          <AccountingTh align="right">{t("bankColDepositAmount") || "입금액"}</AccountingTh>
                          <AccountingTh align="right">{t("bankColWithdrawAmount") || "출금액"}</AccountingTh>
                          <AccountingTh align="center">{t("bankAttributedDate") || "인식일"}</AccountingTh>
                          <AccountingTh align="center">{t("acct_bank_link_col") || "연동"}</AccountingTh>
                          <AccountingTh align="center" title={t("poInvoiceReceived") || "인보이스 수령"}>Iv</AccountingTh>
                          <AccountingTh>{t("bankMemoLabel") || "은행 적요"}</AccountingTh>
                          <AccountingTh align="center">{t("bankNoteLabel") || "메모"}</AccountingTh>
                          <AccountingTh align="center" className="w-11"></AccountingTh>
                        </AccountingTheadRow>
                        <tbody>
                          {filteredList.map((r, i) => {
                            const edits = r.id ? queryRowEdits[r.id] : undefined
                            const rawCat = String(edits?.category ?? r.category ?? "expense").toLowerCase()
                            const cat =
                              r.transType === "withdraw" && rawCat === "fixed" ? "expense" : rawCat
                            const hasEdits = r.id && edits && Object.keys(edits).length > 0
                            const isSaving = querySavingId === r.id
                            const attention = bankRowNeedsAttention(
                              {
                                ...r,
                                category: cat,
                                storeName: edits?.storeName ?? r.storeName,
                                isReceivableLinked: r.isReceivableLinked,
                                isChannelSettled: r.isChannelSettled,
                                memo: r.memo,
                                note: edits?.note !== undefined ? edits.note : r.note,
                              },
                              edits
                            )
                            return (
                            <AccountingTbodyRow
                              id={r.id ? `bank-tx-row-${r.id}` : undefined}
                              key={r.id ?? i}
                              className={cn(
                                rawCat === "correction" && "bg-pink-50 dark:bg-pink-950/20",
                                r.id && restoredHighlightTxId === r.id && "bg-primary/10 ring-2 ring-primary/60",
                                attention.needsAttention &&
                                  "bg-amber-50/80 dark:bg-amber-950/35 border-l-2 border-l-amber-500"
                              )}
                            >
                              <td className="p-2 align-middle text-center whitespace-nowrap text-sm tabular-nums">{r.transDate}</td>
                              <td className="p-2 align-middle text-center">{r.transType === "deposit" ? t("bankDeposit") : t("bankWithdraw")}</td>
                              <td className="p-2 align-middle">
                                {r.transType === "withdraw" ? (
                                  <Select
                                    value={cat}
                                    onValueChange={(v) => {
                                      if (!r.id) return
                                      const mergedEdits = patchCategoryEditsForAdvance(
                                        { ...(queryRowEdits[r.id] || {}), category: v },
                                        v
                                      )
                                      setQueryRowEdits((prev) => ({ ...prev, [r.id!]: mergedEdits }))
                                      if (v === "advance" && prepaymentSubject?.id) {
                                        void handleQueryRowSave(r, mergedEdits)
                                      } else if (v === "purchase_payment") {
                                        const effectiveVendor = String(mergedEdits.vendorCode ?? r.vendorCode ?? "").trim()
                                        if (effectiveVendor) void handleQueryRowSave(r, mergedEdits)
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {BANK_WITHDRAW_UI_CATEGORIES.map((value) => (
                                        <SelectItem key={value} value={value}>
                                          {getCategoryLabel(value, "withdraw")}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Select
                                    value={bankDepositLoanCategorySelectValue(cat)}
                                    onValueChange={(v) => {
                                      if (!r.id) return
                                      const mergedEdits = patchCategoryEditsForAdvance(
                                        { ...(queryRowEdits[r.id] || {}), category: v },
                                        v
                                      )
                                      setQueryRowEdits((prev) => ({ ...prev, [r.id!]: mergedEdits }))
                                      const effectiveStoreName = (mergedEdits.storeName ?? r.storeName ?? "").trim()
                                      if (v === "receivable_receive" && effectiveStoreName) {
                                        void handleQueryRowSave(r, mergedEdits)
                                      } else if (v === "advance" && prepaymentSubject?.id) {
                                        void handleQueryRowSave(r, mergedEdits)
                                      }
                                    }}
                                  >
                                    <SelectTrigger
                                      className="h-8 text-xs"
                                      title={
                                        hidePosRevenueCategories
                                          ? t("bankPosStoreCategorySelectTitle") ||
                                            "POS 매장: 배달앱·카드·QR·현금은 숨김. 오른쪽 「채널 정산」을 사용하세요."
                                          : undefined
                                      }
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {renderDepositCategorySelectItems(cat, hidePosRevenueCategories)}
                                    </SelectContent>
                                  </Select>
                                )}
                              </td>
                              <td className="p-2 align-middle">
                                {(r.transType === "withdraw" && cat === "purchase_payment") ||
                                (r.transType === "deposit" && (cat === "loan" || cat === "loan_borrow")) ? (
                                  <Select
                                    value={(edits?.vendorCode ?? r.vendorCode ?? "") || "__none__"}
                                    onValueChange={(v) => {
                                      if (!r.id) return
                                      const vendorCode = v === "__none__" ? "" : v
                                      const mergedEdits: QueryRowEdit = { ...(queryRowEdits[r.id] || {}), vendorCode }
                                      setQueryRowEdits((prev) => ({ ...prev, [r.id!]: mergedEdits }))
                                      if (vendorCode) void handleQueryRowSave(r, mergedEdits)
                                    }}
                              onOpenChange={(open) => {
                                if (!open) {
                                  setQueryVendorSearch("")
                                  return
                                }
                                if (vendorOptions.length === 0) void loadPurchaseVendorOptions(true)
                              }}
                                  >
                                    <SelectTrigger className="h-8 text-xs max-w-[140px]">
                                      <SelectValue placeholder={t("inVendorPlaceholder") || "거래처"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <div className="p-1.5 border-b" onClick={(e) => e.stopPropagation()}>
                                        <Input
                                          placeholder={t("search") || "검색"}
                                          value={queryVendorSearch}
                                          onChange={(e) => setQueryVendorSearch(e.target.value)}
                                          onKeyDown={(e) => e.stopPropagation()}
                                          className="h-7 text-xs"
                                        />
                                      </div>
                                      <SelectItem value="__none__">—</SelectItem>
                                      {(r.transType === "deposit" && (cat === "loan" || cat === "loan_borrow")
                                        ? relatedVendorOptions
                                        : vendorOptions)
                                        .filter((v) => !queryVendorSearch.trim() || (v.name || v.code || "").toLowerCase().includes(queryVendorSearch.trim().toLowerCase()))
                                        .map((v) => (
                                          <SelectItem key={v.code} value={v.code}>{v.name || v.code}</SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                ) : r.transType === "deposit" && cat === "receivable_receive" ? (
                                  <Select
                                    value={(edits?.storeName ?? r.storeName ?? "") || "__none__"}
                                    onValueChange={(v) => {
                                      if (!r.id) return
                                      const storeName = v === "__none__" ? "" : v
                                      const mergedEdits: QueryRowEdit = { ...(queryRowEdits[r.id] || {}), storeName }
                                      setQueryRowEdits((prev) => ({ ...prev, [r.id!]: mergedEdits }))
                                      if (storeName) {
                                        void handleQueryRowSave(r, mergedEdits)
                                      }
                                    }}
                                    onOpenChange={(open) => !open && setQueryStoreSearch("")}
                                  >
                                    <SelectTrigger className="h-8 text-xs max-w-[120px]">
                                      <SelectValue placeholder={t("store") || "매장"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <div className="p-1.5 border-b" onClick={(e) => e.stopPropagation()}>
                                        <Input
                                          placeholder={t("search") || "검색"}
                                          value={queryStoreSearch}
                                          onChange={(e) => setQueryStoreSearch(e.target.value)}
                                          onKeyDown={(e) => e.stopPropagation()}
                                          className="h-7 text-xs"
                                        />
                                      </div>
                                      <SelectItem value="__none__">—</SelectItem>
                                      {receivableOptions
                                        .filter((s) => !queryStoreSearch.trim() || (s || "").toLowerCase().includes(queryStoreSearch.trim().toLowerCase()))
                                        .map((s) => (
                                          <SelectItem key={s} value={s}>{s}</SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                ) : cat === "advance" ? (
                                  <BankAdvanceTargetCell
                                    storeName={edits?.storeName ?? r.storeName}
                                    vendorCode={edits?.vendorCode ?? r.vendorCode}
                                    prepaymentSubject={prepaymentSubject}
                                    stores={receivableOptions}
                                    vendors={vendorOptions}
                                    cardAccounts={cardAccounts}
                                    storeSearch={queryStoreSearch}
                                    onStoreSearchChange={setQueryStoreSearch}
                                    vendorSearch={queryVendorSearch}
                                    onVendorSearchChange={setQueryVendorSearch}
                                    onVendorDropdownOpen={() => {
                                      if (vendorOptions.length === 0) void loadPurchaseVendorOptions(true)
                                    }}
                                    asDisplayName={asDisplayName}
                                    t={t}
                                    tt={tt}
                                    onChange={(next) => {
                                      if (!r.id) return
                                      const mergedEdits: QueryRowEdit = {
                                        ...(queryRowEdits[r.id] || {}),
                                        storeName: next.storeName,
                                        vendorCode: next.vendorCode,
                                        ...(prepaymentSubject?.id
                                          ? { accountSubjectId: String(prepaymentSubject.id) }
                                          : {}),
                                      }
                                      setQueryRowEdits((prev) => ({ ...prev, [r.id!]: mergedEdits }))
                                      void handleQueryRowSave(r, mergedEdits)
                                    }}
                                  />
                                ) : r.transType === "withdraw" && !isBankWithdrawCategoryWithoutSubject(cat) ? (
                                  <Select
                                    value={(edits?.accountSubjectId !== undefined ? edits.accountSubjectId : r.accountSubjectId != null ? String(r.accountSubjectId) : "__none__") || "__none__"}
                                    onValueChange={(v) => r.id && setQueryRowEdit(r.id, "accountSubjectId", v === "__none__" ? "" : v)}
                                  >
                                    <SelectTrigger className="h-8 text-xs max-w-[140px]">
                                      <SelectValue placeholder="—" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">—</SelectItem>
                                      {pickRowAccountSubjectOptions(r.transType, cat).map((a) => (
                                        <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : r.transType === "deposit" && !isBankDepositWithoutChannelGl(cat) ? (
                                  <Select
                                    value={(edits?.accountSubjectId !== undefined ? edits.accountSubjectId : r.accountSubjectId != null ? String(r.accountSubjectId) : "__none__") || "__none__"}
                                    onValueChange={(v) => r.id && setQueryRowEdit(r.id, "accountSubjectId", v === "__none__" ? "" : v)}
                                  >
                                    <SelectTrigger className="h-8 text-xs max-w-[120px]">
                                      <SelectValue placeholder="—" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">—</SelectItem>
                                      {revenueAccountOptions.map((a) => (
                                        <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                              <td
                                className={cn(
                                  "p-2 align-middle text-right whitespace-nowrap tabular-nums",
                                  r.transType === "deposit"
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-muted-foreground"
                                )}
                              >
                                {formatBankLedgerDepositCell(r.transType || "withdraw", r.amount)}
                              </td>
                              <td
                                className={cn(
                                  "p-2 align-middle text-right whitespace-nowrap tabular-nums",
                                  r.transType === "withdraw"
                                    ? "text-orange-600 dark:text-orange-400"
                                    : "text-muted-foreground"
                                )}
                              >
                                {formatBankLedgerWithdrawCell(r.transType || "withdraw", r.amount)}
                              </td>
                              <td className="p-2 align-middle text-center">
                                {r.transType === "deposit" && !isBankDepositWithoutChannelGl(cat) ? (
                                  <Input
                                    type="date"
                                    value={
                                      edits?.salesDate ??
                                      r.salesDate ??
                                      defaultBankDepositSalesDateForRow({
                                        transDate: r.transDate,
                                        category: cat,
                                        accountSubjectCode: revenueAccountOptions.find(
                                          (s) =>
                                            Number(s.id) ===
                                            Number(
                                              edits?.accountSubjectId !== undefined
                                                ? edits.accountSubjectId
                                                : r.accountSubjectId
                                            )
                                        )?.code,
                                      })
                                    }
                                    onChange={(e) => r.id && setQueryRowEdit(r.id, "salesDate", e.target.value)}
                                    className="h-8 text-xs min-w-[112px] w-full max-w-[112px] mx-auto"
                                  />
                                ) : r.transType === "withdraw" && cat === "expense" ? (
                                  <Input
                                    type="date"
                                    value={edits?.expenseDate ?? r.expenseDate ?? r.transDate}
                                    onChange={(e) => r.id && setQueryRowEdit(r.id, "expenseDate", e.target.value)}
                                    className="h-8 text-xs min-w-[112px] w-full max-w-[112px] mx-auto"
                                  />
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="p-2 align-middle">
                                <div className="flex items-center justify-center gap-1 flex-wrap">
                                {r.transType === "withdraw" && isBankExpenseRelatedWithdrawCategory(cat) && !memoLooksLikeCardBill(r.memo || "") ? (
                                  r.isLinked ? (
                                    <>
                                      <span
                                        className="inline-flex rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-950/50 dark:text-green-400 whitespace-nowrap"
                                        title={t("acct_bank_expense_linked")}
                                      >
                                        {t("acct_bank_expense_linked")}
                                      </span>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className={BANK_EDIT_BTN_CN}
                                        onClick={() => {
                                      const amt = Math.abs(r.amount ?? 0)
                                      const bankMemo = (r.memo || "").trim().slice(0, 500)
                                      const bankNote = bankNoteUserDisplayText((r.note || "").trim()).slice(0, 500)
                                      const q = new URLSearchParams({ tab: "expenseRegister", updateExisting: "1" })
                                      if (r.id) q.set("bankTransactionId", String(r.id))
                                      if (amt > 0) q.set("amount", formatMoneyAmountParam(amt))
                                      if (bankMemo) q.set("bankMemo", bankMemo)
                                      if (bankNote) q.set("bankNote", bankNote)
                                      if (r.transDate) q.set("transDate", r.transDate)
                                      if (accountId) q.set("accountId", accountId)
                                      if (selectedAccountStore) q.set("storeName", selectedAccountStore)
                                      if (cat) q.set("category", cat)
                                      if (r.vendorCode) q.set("vendorCode", r.vendorCode)
                                      if (r.accountSubjectId != null) q.set("accountSubjectId", String(r.accountSubjectId))
                                      q.set("startStr", startStr)
                                      q.set("endStr", endStr)
                                      q.set("returnTab", "query")
                                      if (r.id) q.set("openRegisterTxId", String(r.id))
                                      router.push(`/admin/expense-management?${q.toString()}`)
                                    }}
                                      >
                                        {t("bankRegisterEdit") || "수정"}
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <span
                                        className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-300 whitespace-nowrap"
                                        title={t("acct_bank_expense_unlinked")}
                                      >
                                        <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
                                        {t("acct_bank_expense_unlinked")}
                                      </span>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className={ADMIN_BTN_XS_CN}
                                        onClick={() => setRegisterActionRow({ ...r, category: cat })}
                                      >
                                        {t("bankRegisterLinkExpenseMgmt") || tt("bankRegisterLinkExpenseMgmt", "연결")}
                                      </Button>
                                    </>
                                  )
                                ) : r.transType === "withdraw" && r.id && bankWithdrawOpensCardBillRegister(cat, r.memo || "") ? (
                                  r.isCardLinked ? (
                                    <span
                                      className="inline-flex rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-950/50 dark:text-green-400 whitespace-nowrap"
                                      title={tt("bankCardExpenseLinked", "카드 연동")}
                                    >
                                      {tt("bankCardExpenseLinked", "카드 연동")}
                                    </span>
                                  ) : r.isLinked ? (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className={ADMIN_BTN_XS_CN}
                                      onClick={() => {
                                        const amt = Math.abs(r.amount ?? 0)
                                        const bankMemo = (r.memo || "").trim().slice(0, 500)
                                        const bankNote = bankNoteUserDisplayText((r.note || "").trim()).slice(0, 500)
                                        const cardBill = memoLooksLikeCardBill(bankMemo) || cat === "bank_card_bill"
                                        const q = new URLSearchParams({
                                          tab: "expenseRegister",
                                          category: cardBill ? "bank_card_bill" : "transfer",
                                        })
                                        q.set("bankTransactionId", String(r.id))
                                        if (amt > 0) q.set("amount", formatMoneyAmountParam(amt))
                                        if (bankMemo) q.set("bankMemo", bankMemo)
                                        if (bankNote) q.set("bankNote", bankNote)
                                        if (r.transDate) q.set("transDate", r.transDate)
                                        if (accountId) q.set("accountId", accountId)
                                        if (selectedAccountStore) q.set("storeName", selectedAccountStore)
                                        q.set("startStr", startStr)
                                        q.set("endStr", endStr)
                                        q.set("returnTab", "query")
                                        q.set("openRegisterTxId", String(r.id))
                                        router.push(`/admin/expense-management?${q.toString()}`)
                                      }}
                                    >
                                      {memoLooksLikeCardBill(r.memo || "") || cat === "bank_card_bill"
                                        ? tt("bankRegisterCardExpense", "카드 지출")
                                        : t("bankRegisterLink") || "지출 등록"}
                                    </Button>
                                  )
                                ) : r.transType === "deposit" && cat === "receivable_receive" && r.id ? (
                                  (() => {
                                    const rowEdits = r.id ? queryRowEdits[r.id] : undefined
                                    const store = (
                                      rowEdits?.storeName ??
                                      r.storeName ??
                                      selectedAccountStore ??
                                      ""
                                    ).trim()
                                    const depositLinkCtx = {
                                      transType: r.transType,
                                      category: cat,
                                      storeName: store,
                                      memo: r.memo,
                                      note: rowEdits?.note !== undefined ? rowEdits.note : r.note,
                                      isReceivableLinked: r.isReceivableLinked,
                                      isChannelSettled: r.isChannelSettled,
                                    }
                                    const needsReceivableLink = bankDepositNeedsReceivableOrderLink(depositLinkCtx)
                                    if (needsReceivableLink && r.isReceivableLinked) {
                                      return (
                                        <>
                                          <span
                                            className="inline-flex rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-950/50 dark:text-green-400 whitespace-nowrap"
                                            title={t("acct_bank_receivable_linked")}
                                          >
                                            {t("acct_bank_receivable_linked")}
                                          </span>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className={`${ADMIN_BTN_XS_CN} shrink-0 h-7 px-1.5`}
                                            onClick={() => void openReceivableLinkedView(r)}
                                          >
                                            {tt("bankReceivableLinkedView", "연결 보기")}
                                          </Button>
                                        </>
                                      )
                                    }
                                    if (needsReceivableLink && !r.isReceivableLinked) {
                                      return (
                                        <>
                                          <span
                                            className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-300 whitespace-nowrap"
                                            title={t("acct_bank_receivable_unlinked")}
                                          >
                                            <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
                                            {t("acct_bank_receivable_unlinked")}
                                          </span>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className={ADMIN_BTN_XS_CN}
                                            onClick={() => void openReceivablePick(r)}
                                          >
                                            {tt("bankRegisterLinkReceivable", "미수 연결")}
                                          </Button>
                                        </>
                                      )
                                    }
                                    const settleAction = bankChannelSettlementRowAction({
                                      memo: r.memo,
                                      note: depositLinkCtx.note,
                                      storeName: store,
                                      isChannelSettled: r.isChannelSettled,
                                    })
                                    if (settleAction === "post" || settleAction === "edit") {
                                      return (
                                        <Button
                                          size="sm"
                                          variant={settleAction === "edit" ? "ghost" : "outline"}
                                          className={ADMIN_BTN_XS_CN}
                                          onClick={() => setChannelSettleRow(r)}
                                          title={
                                            settleAction === "edit"
                                              ? tt("bankPosChannelSettleEditBtn", "수수료 수정")
                                              : tt("bankPosChannelSettleRowBtn", "채널 정산 (수수료 분개)")
                                          }
                                        >
                                          {settleAction === "edit"
                                            ? tt("bankPosChannelSettleEditBtn", "수수료 수정")
                                            : tt("bankPosChannelSettleRowBtn", "채널 정산")}
                                        </Button>
                                      )
                                    }
                                    return <span className="text-muted-foreground">—</span>
                                  })()
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                                </div>
                              </td>
                              <td className="p-2 align-middle text-center">
                                {r.transType === "withdraw" ? (
                                  (() => {
                                  const hasInvoice = r.invoiceReceived === true || (r.invoiceNo && String(r.invoiceNo).trim() !== "") || (r.invoicePhotoUrl && String(r.invoicePhotoUrl).trim() !== "")
                                  const isPurchasePayment = cat === "purchase_payment" && r.isLinked
                                  return isPurchasePayment ? (
                                    <Checkbox
                                      checked={!!r.invoiceReceived}
                                      onCheckedChange={(checked) => {
                                        if (checked === "indeterminate") return
                                        handleBankInvoiceChange(r, checked === true)
                                      }}
                                      disabled={updatingInvoiceId === r.id}
                                      title={t("poInvoiceReceived") || "인보이스 수령"}
                                      className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 shrink-0 mx-auto"
                                    />
                                  ) : (
                                    <Checkbox checked={!!hasInvoice} disabled className="shrink-0 mx-auto pointer-events-none" title={hasInvoice ? (t("poInvoiceReceived") || "인보이스 수령") : (t("poInvoiceNotReceived") || "인보이스 미수령")} />
                                  )
                                })()
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td
                                className="p-2 align-middle text-left truncate max-w-[158px] text-muted-foreground text-sm cursor-pointer hover:bg-muted/50 rounded"
                                onClick={() => r.memo?.trim() && setMemoPreviewText(r.memo)}
                                title={r.memo?.trim() ? r.memo : undefined}
                              >
                                {getMemo(r.memo)}
                              </td>
                              <td className="p-2 align-middle">
                                <Input
                                  placeholder={t("bankNotePlaceholder") || "메모 입력"}
                                  value={
                                    edits?.note !== undefined
                                      ? edits.note
                                      : bankNoteUserDisplayText(r.note ?? "")
                                  }
                                  onChange={(e) => r.id && setQueryRowEdit(r.id, "note", e.target.value)}
                                  onFocus={() => {
                                    if (r.id) queryMemoFocusIdRef.current = r.id
                                  }}
                                  className="h-8 text-xs min-w-[140px] w-full max-w-[158px]"
                                />
                              </td>
                              <td className="p-2 align-middle text-center">
                                <div className="flex items-center justify-center gap-0.5">
                                  {hasEdits && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0"
                                      onClick={() => handleQueryRowSave(r)}
                                      disabled={isSaving}
                                      title={t("btn_save") || "저장"}
                                    >
                                      {isSaving ? <span className="text-xs">...</span> : <Save className="h-4 w-4" />}
                                    </Button>
                                  )}
                                  {isOffice && r.id && (r.transType === "withdraw" || r.transType === "deposit") ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                      onClick={() => void handleDeleteBankRow(r)}
                                      disabled={deletingBankTxId === r.id}
                                      title={tt("bankTxRowDeleteTitle", "거래 삭제")}
                                    >
                                      {deletingBankTxId === r.id ? (
                                        <span className="text-xs">...</span>
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </Button>
                                  ) : null}
                                </div>
                              </td>
                            </AccountingTbodyRow>
                          );
                          })}
                        </tbody>
                      </>
                    )}
                  </AccountingDataTable>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="input" className="mt-0">
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {accounts.length > 0 && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setAccountManageOpen(true); setEditingAccountId(null); }}
                    >
                      <Settings2 className="h-4 w-4 mr-1" />
                      {t("bankAccountManage")}
                    </Button>
                    <Select value={accountId} onValueChange={setAccountId}>
                      <SelectTrigger className="w-[160px] h-9">
                        <SelectValue placeholder={t("bankAccount")} />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {formatBankAccountLabel(a)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!accountId}
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      {t("bankUploadCsv")}
                    </Button>
                  </>
                )}
                <div className={`flex flex-wrap items-center gap-2 ${accounts.length > 0 ? "border-l pl-3 ml-1" : ""}`}>
                    <Input
                      placeholder={t("bankName") || "은행명"}
                      value={newAccountBankName}
                      onChange={(e) => setNewAccountBankName(e.target.value)}
                      className="max-w-[120px] h-9"
                    />
                    <Input
                      placeholder={t("bankAccount")}
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      className="max-w-[160px] h-9"
                    />
                    {isOffice && (
                      <Select value={newAccountStore || BANK_ACCOUNT_HQ_STORE_LABEL} onValueChange={setNewAccountStore}>
                        <SelectTrigger className="w-[110px] h-9">
                          <SelectValue placeholder={t("store") || "매장"} />
                        </SelectTrigger>
                        <SelectContent>
                          {storeOptionsDeduped.map((s) => (
                            <SelectItem key={s} value={s}>
                              {displayBankAccountStore(s)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button size="sm" variant={accounts.length === 0 ? "default" : "outline"} onClick={handleAddAccount} disabled={addAccountSaving}>
                      <Plus className="h-4 w-4 mr-1" />
                      {t("bankAddAccount")}
                    </Button>
                  </div>
              </div>
              {accounts.length === 0 && (
                <p className="text-sm text-muted-foreground mb-4">{t("bankAddAccount")} - {t("bankNoAccountHintShort")}</p>
              )}
              {accounts.length > 0 && (
                <p className="text-sm text-muted-foreground mb-4">{t("bankAddSecondAccountHint")}</p>
              )}

              {importPreview && (
            <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-4 mb-4 space-y-3">
              <div className="flex justify-between items-center">
                <p className="font-medium text-amber-800 dark:text-amber-200">{t("bankImportPreview")}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    clearBankImportDraft()
                    setImportPreview(null)
                    setImportRowEdits({})
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <span>{importPreview.periodStart} ~ {importPreview.periodEnd}</span>
                <span>{t("bankStatementBalance")}: {fmt(importPreview.endingBalance)}</span>
                <span>{importPreview.rows.length} {t("receivPayCount")}</span>
              </div>
              {summary && importPreview.periodEnd === endStr && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className={`text-sm font-medium ${balanceMatch ? "text-green-600" : "text-destructive"}`}>
                    {t("bankStatementBalance")}: {fmt(importPreview.endingBalance)} | {t("bankErpBalance")}: {fmt(summary.calculatedBalance)}{" "}
                    {balanceMatch ? `✓ ${t("bankBalanceMatch")}` : `✗ ${t("bankBalanceMismatch")}`}
                  </div>
                  {!balanceMatch && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleApplyCarryOver}
                      disabled={applyCarryOverSaving}
                      className="shrink-0"
                    >
                      {applyCarryOverSaving ? "..." : (t("bankApplyCarryOver") || "이월금액 적용")}
                    </Button>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {t("bankImportDupHint") ||
                  "같은 계좌·날짜·입출금·금액이면 DB에 이미 있는 줄과만 비교해 중복을 제외합니다. 메모(사용자)가 다르면 별개 건으로 저장됩니다."}
              </p>
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                {t("bankImportWithdrawCoaHint") || "※ 출금: 아래 표에서 용도·계정과목(매입 대금이면 거래처)을 선택하면 저장 시 통장에 반영됩니다. 적요 규칙으로 자동 채워집니다."}
              </p>
              {posStoreCategoryBanner}
              <BankQuickMemoChipBar
                phrases={bankQuickMemos}
                title={t("bankImportQuickMemosTitle") || "자주 쓰는 메모"}
                hint={
                  t("bankImportQuickMemoHint") ||
                  "메모 칸을 먼저 선택한 뒤 누르면 해당 줄에 붙고, 아니면 클립보드로 복사됩니다."
                }
                onPhrase={applyImportQuickMemo}
                onManageClick={openBankQuickMemosEdit}
                manageLabel={t("bankQuickMemosManage") || "편집"}
              />
              <AdminTableScroll className="max-h-[520px] overflow-x-auto overflow-y-auto border rounded" hint={false}>
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="p-2 text-center min-w-[96px]">{t("date")}</th>
                      <th className="p-2 text-center min-w-[64px]">{t("pettyColType")}</th>
                      <th className="p-2 text-center">{t("bankCategoryLabel")}</th>
                      <th className="p-2 text-center">{t("accountSubject")}</th>
                      <th className="p-2 text-right">{t("bankColDepositAmount") || "입금액"}</th>
                      <th className="p-2 text-right">{t("bankColWithdrawAmount") || "출금액"}</th>
                      <th className="p-2 text-center min-w-[220px]">{t("bankMemoLabel") || "은행 적요"}</th>
                      <th className="p-2 text-center min-w-[150px]">{t("bankNoteLabel") || "메모"}</th>
                      <th className="p-2 text-center whitespace-nowrap">{t("bankAttributedDate") || "인식일"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map((r, idx) => {
                      const impRaw = importRowEdits[idx]?.category || getDefaultImportCategory(r)
                      const impCat = r.transType === "withdraw" && impRaw === "fixed" ? "expense" : impRaw
                      const isAutoAssigned = importRowEdits[idx]?.autoAssigned === true
                      return (
                      <tr key={idx} className={`border-t ${importRowEdits[idx]?.category === "correction" ? "bg-pink-50 dark:bg-pink-950/20" : ""}`}>
                        <td className="p-2 whitespace-nowrap">{r.transDate}</td>
                        <td className="p-2 text-center whitespace-nowrap">{r.transType === "deposit" ? t("bankDeposit") : t("bankWithdraw")}</td>
                        <td className="p-2">
                          {r.transType === "withdraw" ? (
                            <div className="space-y-1">
                              <Select
                                value={impCat}
                                onValueChange={(v) => setImportRowEdit(idx, "category", v)}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                  <SelectContent>
                                  {BANK_WITHDRAW_UI_CATEGORIES.map((value) => (
                                    <SelectItem key={value} value={value}>
                                      {getCategoryLabel(value, "withdraw")}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {isAutoAssigned ? (
                                <div className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                                  {tt("bankAutoAssignedBadge", "Auto")}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <Select
                                value={bankDepositLoanCategorySelectValue(impRaw)}
                                onValueChange={(v) => setImportRowEdit(idx, "category", v)}
                              >
                                <SelectTrigger
                                  className="h-8 text-xs"
                                  title={
                                    hidePosRevenueCategories
                                      ? t("bankPosStoreCategorySelectTitle") ||
                                        "POS 매장: 배달앱·카드·QR·현금은 숨김. 오른쪽 「채널 정산」을 사용하세요."
                                      : undefined
                                  }
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {renderDepositCategorySelectItems(impRaw, hidePosRevenueCategories)}
                                </SelectContent>
                              </Select>
                              {isAutoAssigned ? (
                                <div className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                                  {tt("bankAutoAssignedBadge", "Auto")}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="p-2">
                          {r.transType === "withdraw" && impCat === "purchase_payment" ? (
                            <Select
                              value={(importRowEdits[idx]?.vendorCode ?? "") || "__none__"}
                              onValueChange={(v) => setImportRowEdit(idx, "vendorCode", v === "__none__" ? "" : v)}
                              onOpenChange={(open) => {
                                if (!open) {
                                  setImportVendorSearch("")
                                  return
                                }
                                if (vendorOptions.length === 0) void loadPurchaseVendorOptions(true)
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs max-w-[140px]">
                                <SelectValue placeholder={t("inVendorPlaceholder") || "거래처"} />
                              </SelectTrigger>
                              <SelectContent>
                                <div className="p-1.5 border-b" onClick={(e) => e.stopPropagation()}>
                                  <Input
                                    placeholder={t("search") || "검색"}
                                    value={importVendorSearch}
                                    onChange={(e) => setImportVendorSearch(e.target.value)}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    className="h-7 text-xs"
                                  />
                                </div>
                                <SelectItem value="__none__">—</SelectItem>
                                {vendorOptions
                                  .filter((v) => !importVendorSearch.trim() || (v.name || v.code || "").toLowerCase().includes(importVendorSearch.trim().toLowerCase()))
                                  .map((v) => (
                                    <SelectItem key={v.code} value={v.code}>{v.name || v.code}</SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          ) : r.transType === "deposit" && (impCat === "loan" || impCat === "loan_borrow") ? (
                            <Select
                              value={(importRowEdits[idx]?.vendorCode ?? "") || "__none__"}
                              onValueChange={(v) => setImportRowEdit(idx, "vendorCode", v === "__none__" ? "" : v)}
                              onOpenChange={(open) => {
                                if (!open) {
                                  setImportVendorSearch("")
                                  return
                                }
                                if (relatedVendorOptions.length === 0) {
                                  void getVendorsForRelated()
                                    .catch(() => [])
                                    .then((rows) =>
                                      setRelatedVendorOptions(
                                        (rows || []).map((x) => ({
                                          code: String(x.code),
                                          name: String(x.name || x.code),
                                        }))
                                      )
                                    )
                                }
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs max-w-[140px]">
                                <SelectValue placeholder={t("wm_loan_party") || "관련당사자"} />
                              </SelectTrigger>
                              <SelectContent>
                                <div className="p-1.5 border-b" onClick={(e) => e.stopPropagation()}>
                                  <Input
                                    placeholder={t("search") || "검색"}
                                    value={importVendorSearch}
                                    onChange={(e) => setImportVendorSearch(e.target.value)}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    className="h-7 text-xs"
                                  />
                                </div>
                                <SelectItem value="__none__">—</SelectItem>
                                {relatedVendorOptions
                                  .filter((v) => !importVendorSearch.trim() || (v.name || v.code || "").toLowerCase().includes(importVendorSearch.trim().toLowerCase()))
                                  .map((v) => (
                                    <SelectItem key={v.code} value={v.code}>{v.name || v.code}</SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          ) : impCat === "advance" ? (
                            <BankAdvanceTargetCell
                              storeName={importRowEdits[idx]?.storeName}
                              vendorCode={importRowEdits[idx]?.vendorCode}
                              prepaymentSubject={prepaymentSubject}
                              stores={receivableOptions}
                              vendors={vendorOptions}
                              cardAccounts={cardAccounts}
                              storeSearch={importStoreSearch}
                              onStoreSearchChange={setImportStoreSearch}
                              vendorSearch={importVendorSearch}
                              onVendorSearchChange={setImportVendorSearch}
                              onVendorDropdownOpen={() => {
                                if (vendorOptions.length === 0) void loadPurchaseVendorOptions(true)
                              }}
                              asDisplayName={asDisplayName}
                              t={t}
                              tt={tt}
                              onChange={(next) => {
                                setImportRowEdits((prev) => ({
                                  ...prev,
                                  [idx]: {
                                    ...prev[idx],
                                    storeName: next.storeName || undefined,
                                    vendorCode: next.vendorCode || undefined,
                                    ...(prepaymentSubject?.id
                                      ? { accountSubjectId: String(prepaymentSubject.id) }
                                      : {}),
                                    autoAssigned: false,
                                  },
                                }))
                              }}
                            />
                          ) : r.transType === "withdraw" &&
                            !isBankWithdrawCategoryWithoutSubject(impCat) ? (
                            <Select
                              value={
                                (importRowEdits[idx]?.accountSubjectId !== undefined
                                  ? importRowEdits[idx]?.accountSubjectId
                                  : "__none__") || "__none__"
                              }
                              onValueChange={(v) => setImportRowEdit(idx, "accountSubjectId", v === "__none__" ? "" : v)}
                            >
                              <SelectTrigger className="h-8 text-xs max-w-[140px]">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">—</SelectItem>
                                {pickRowAccountSubjectOptions(r.transType, impCat).map((a) => (
                                  <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : r.transType === "deposit" && impCat === "receivable_receive" ? (
                            <Select
                              value={importRowEdits[idx]?.storeName || selectedAccountStore || "__none__"}
                              onValueChange={(v) => setImportRowEdit(idx, "storeName", v === "__none__" ? "" : v)}
                              onOpenChange={(open) => !open && setImportStoreSearch("")}
                            >
                              <SelectTrigger className="h-8 text-xs max-w-[120px]">
                                <SelectValue placeholder={t("store") || "매장"} />
                              </SelectTrigger>
                              <SelectContent>
                                <div className="p-1.5 border-b" onClick={(e) => e.stopPropagation()}>
                                  <Input
                                    placeholder={t("search") || "검색"}
                                    value={importStoreSearch}
                                    onChange={(e) => setImportStoreSearch(e.target.value)}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    className="h-7 text-xs"
                                  />
                                </div>
                                <SelectItem value="__none__">—</SelectItem>
                                {receivableOptions
                                  .filter((s) => !importStoreSearch.trim() || (s || "").toLowerCase().includes(importStoreSearch.trim().toLowerCase()))
                                  .map((s) => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          ) : r.transType === "deposit" && !isBankDepositWithoutChannelGl(impCat) ? (
                            <Select
                              value={importRowEdits[idx]?.accountSubjectId || "__none__"}
                              onValueChange={(v) => setImportRowEdit(idx, "accountSubjectId", v === "__none__" ? "" : v)}
                            >
                              <SelectTrigger className="h-8 text-xs max-w-[120px]">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">—</SelectItem>
                                {revenueAccountOptions.map((a) => (
                                  <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : "—"}
                        </td>
                        <td
                          className={cn(
                            "p-2 text-right whitespace-nowrap tabular-nums",
                            r.transType === "deposit"
                              ? "text-green-600 dark:text-green-400"
                              : "text-muted-foreground"
                          )}
                        >
                          {formatBankLedgerDepositCell(r.transType, r.amount)}
                        </td>
                        <td
                          className={cn(
                            "p-2 text-right whitespace-nowrap tabular-nums",
                            r.transType === "withdraw"
                              ? "text-orange-600 dark:text-orange-400"
                              : "text-muted-foreground"
                          )}
                        >
                          {formatBankLedgerWithdrawCell(r.transType, r.amount)}
                        </td>
                        <td
                          className="p-2 min-w-[220px] max-w-[280px] truncate text-muted-foreground text-sm cursor-pointer hover:bg-muted/50 rounded"
                          onClick={() => r.memo?.trim() && setMemoPreviewText(r.memo)}
                          title={r.memo?.trim() ? r.memo : undefined}
                        >
                          {getMemo(r.memo)}
                        </td>
                        <td className="p-2">
                          <Input
                            placeholder={t("bankNotePlaceholder") || "메모 입력"}
                            value={importRowEdits[idx]?.note ?? ""}
                            onChange={(e) => setImportRowEdit(idx, "note", e.target.value)}
                            onFocus={() => {
                              importMemoFocusIdxRef.current = idx
                            }}
                            className="h-8 text-xs min-w-[150px]"
                          />
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {r.transType === "deposit" && !isBankDepositWithoutChannelGl(impCat) ? (
                            <Input
                              type="date"
                              value={
                                importRowEdits[idx]?.salesDate ||
                                defaultBankDepositSalesDateForRow({
                                  transDate: r.transDate,
                                  category: impCat,
                                  accountSubjectCode: revenueAccountOptions.find(
                                    (s) => Number(s.id) === Number(importRowEdits[idx]?.accountSubjectId)
                                  )?.code,
                                })
                              }
                              onChange={(e) => setImportRowEdit(idx, "salesDate", e.target.value)}
                              className="h-8 text-xs w-[110px]"
                            />
                          ) : r.transType === "withdraw" && impCat === "expense" ? (
                            <Input
                              type="date"
                              value={importRowEdits[idx]?.expenseDate ?? r.transDate}
                              onChange={(e) => setImportRowEdit(idx, "expenseDate", e.target.value)}
                              className="h-8 text-xs w-[110px]"
                            />
                          ) : "—"}
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </AdminTableScroll>
              <Button size="sm" onClick={handleImportSave} disabled={importSaving || !accountId}>
                {importSaving ? "..." : t("bankImportSave")}
              </Button>
            </div>
          )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="explanation" className="mt-0">
          <Card>
            <CardContent className="pt-4">
              <div className="prose prose-sm dark:prose-invert max-w-none space-y-5 text-sm">
                <h3 className="text-lg font-semibold border-b pb-2">{t("bankManualTitle")}</h3>
                <p className="text-muted-foreground">{t("bankManualDesc")}</p>

                <div className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                  <p className="font-medium">{t("bankPosReceivableDepositTitle")}</p>
                  <p className="mt-1 leading-relaxed">{t("bankPosStoreCategoryLockedHint")}</p>
                  <p className="mt-1 leading-relaxed text-muted-foreground dark:text-amber-100/80">
                    {t("bankPosReceivableDepositBody")}
                  </p>
                </div>

                <div className="rounded-lg bg-muted/30 p-4 space-y-2">
                  <h4 className="font-medium">■ {t("bankManualScreenLayout")}</h4>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    <li>{t("bankManualScreenInput")}</li>
                    <li>{t("bankManualScreenQuery")}</li>
                    <li>{t("bankManualScreenAccountSubjects")}</li>
                    <li>{t("bankManualScreenExplanation")}</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-medium pt-2">■ {t("bankManualS1Title")}</h4>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2">
                    <li>{t("bankManualS1_1")}</li>
                    <li>{t("bankManualS1_2")}</li>
                    <li>{t("bankManualS1_3")}</li>
                    <li>{t("bankManualS1_4")}</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-medium pt-2">■ {t("bankManualS2Title")}</h4>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2">
                    <li>{t("bankManualS2_1")}</li>
                    <li>{t("bankManualS2_2")}</li>
                    <li>{t("bankManualS2_3")}</li>
                    <li>{t("bankManualS2_4")}</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-medium pt-2">■ {t("bankManualS3Title")}</h4>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2">
                    <li>{t("bankManualS3_1")}</li>
                    <li>{t("bankManualS3_2")}</li>
                    <li>{t("bankManualS3_3")}</li>
                    <li>{t("bankManualS3_4")}</li>
                    <li>{t("bankManualS3PosReceivable")}</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-medium pt-2">■ {t("bankManualS4Title")}</h4>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2">
                    <li>{t("bankManualS4_1")}</li>
                    <li>{t("bankManualS4_2")}</li>
                    <li>{t("bankManualS4_3")}</li>
                    <li>{t("bankManualS4_4")}</li>
                    <li>{t("bankManualS4_5")}</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-medium pt-2">■ {t("bankManualS5Title")}</h4>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2">
                    <li>{t("bankManualS5_1")}</li>
                    <li>{t("bankManualS5_2")}</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-medium pt-2">■ {t("bankManualS6Title")}</h4>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2">
                    <li>{t("bankManualS6_1")}</li>
                    <li>{t("bankManualS6_2")}</li>
                    <li>{t("bankManualS6_3")}</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-medium pt-2">■ {t("bankManualS7Title")}</h4>
                  <p className="text-muted-foreground mt-1">{t("bankManualS7_1")}</p>
                </div>

                <h4 className="font-medium pt-4 border-t mt-6 pt-4">■ {t("bankManualS8Title")}</h4>
                <p className="text-muted-foreground">{t("bankManualS8_1")}</p>
                <div className="space-y-3 pt-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">{t("bankMemoRuleKeyword") || "키워드"}</label>
                      <Input
                        placeholder={t("bankMemoRuleKeywordPh")}
                        value={newRuleKeyword}
                        onChange={(e) => setNewRuleKeyword(e.target.value)}
                        className="w-[140px] h-9"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">{t("pettyColType") || "유형"}</label>
                      <Select value={newRuleTransType} onValueChange={(v) => {
                        setNewRuleTransType(v as "deposit" | "withdraw")
                        setNewRuleCategory("")
                        setNewRuleAccountSubjectId("")
                      }}>
                        <SelectTrigger className="w-[90px] h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="deposit">{t("bankDeposit")}</SelectItem>
                          <SelectItem value="withdraw">{t("bankWithdraw")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">{t("bankCategoryLabel") || "용도"}</label>
                      <Select
                        value={
                          newRuleTransType === "deposit"
                            ? bankDepositLoanCategorySelectValue(newRuleCategory)
                            : newRuleCategory
                        }
                        onValueChange={setNewRuleCategory}
                      >
                        <SelectTrigger className="w-[130px] h-9">
                          <SelectValue placeholder={t("optional")} />
                        </SelectTrigger>
                        <SelectContent>
                          {newRuleTransType === "deposit" ? (
                            renderDepositCategorySelectItems(newRuleCategory, true)
                          ) : (
                            <>
                              {BANK_WITHDRAW_UI_CATEGORIES.map((value) => (
                                <SelectItem key={value} value={value}>
                                  {getCategoryLabel(value, "withdraw")}
                                </SelectItem>
                              ))}
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">{t("accountSubject") || "계정과목"}</label>
                      <Select value={newRuleAccountSubjectId || "__none__"} onValueChange={(v) => setNewRuleAccountSubjectId(v === "__none__" ? "" : v)}>
                        <SelectTrigger className="w-[160px] h-9">
                          <SelectValue placeholder={t("placeholderOptional")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— {t("accountSubject") || "계정과목"}</SelectItem>
                          {(newRuleTransType === "deposit" ? revenueAccountOptions : accountSubjectOptions).map((a) => (
                            <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" onClick={handleAddMemoRule} disabled={savingMemoRule || !newRuleKeyword.trim()}>
                      {savingMemoRule ? "..." : editingMemoRuleId ? <Save className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                      {editingMemoRuleId ? (t("btn_save") || "저장") : t("btn_add")}
                    </Button>
                    {editingMemoRuleId && (
                      <Button size="sm" variant="outline" onClick={handleCancelEditMemoRule} disabled={savingMemoRule}>
                        {t("cancel")}
                      </Button>
                    )}
                  </div>
                  {memoRules.length > 0 && (
                    <div className="rounded border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="p-2 text-left">{t("bankMemoRuleKeyword") || "키워드"}</th>
                            <th className="p-2 text-left">{t("pettyColType") || "유형"}</th>
                            <th className="p-2 text-left">{t("bankCategoryLabel") || "용도"}</th>
                            <th className="p-2 text-left">{t("accountSubject") || "계정과목"}</th>
                            <th className="p-2 w-20"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {memoRules.map((rule) => {
                            const isEditing = editingMemoRuleId === (rule.id ?? 0)
                            const catLabel = getCategoryLabel(String(rule.category || ""), rule.transType)
                            const sub = (rule.transType === "deposit" ? revenueAccountOptions : accountSubjectOptions).find((a) => a.id === rule.accountSubjectId)
                            return (
                              <tr key={rule.id} className={`border-t ${isEditing ? "bg-primary/5" : ""}`}>
                                <td className="p-2 font-mono text-sm">{rule.keyword}</td>
                                <td className="p-2">
                                  {isEditing ? (
                                    <Select value={newRuleTransType} onValueChange={(v) => { setNewRuleTransType(v as "deposit" | "withdraw"); setNewRuleCategory(""); setNewRuleAccountSubjectId("") }}>
                                      <SelectTrigger className="h-8 w-[90px]">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="deposit">{t("bankDeposit")}</SelectItem>
                                        <SelectItem value="withdraw">{t("bankWithdraw")}</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    rule.transType === "deposit" ? t("bankDeposit") : t("bankWithdraw")
                                  )}
                                </td>
                                <td className="p-2">
                                  {isEditing ? (
                                    <Select
                                      value={
                                        newRuleTransType === "deposit"
                                          ? bankDepositLoanCategorySelectValue(newRuleCategory)
                                          : newRuleCategory
                                      }
                                      onValueChange={setNewRuleCategory}
                                    >
                                      <SelectTrigger className="h-8 w-[130px]">
                                        <SelectValue placeholder={t("optional")} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {newRuleTransType === "deposit" ? (
                                          renderDepositCategorySelectItems(newRuleCategory, true)
                                        ) : (
                                          <>
                                            {BANK_WITHDRAW_UI_CATEGORIES.map((value) => (
                                              <SelectItem key={value} value={value}>
                                                {getCategoryLabel(value, "withdraw")}
                                              </SelectItem>
                                            ))}
                                          </>
                                        )}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    catLabel
                                  )}
                                </td>
                                <td className="p-2">
                                  {isEditing ? (
                                    <Select value={newRuleAccountSubjectId || "__none__"} onValueChange={(v) => setNewRuleAccountSubjectId(v === "__none__" ? "" : v)}>
                                      <SelectTrigger className="h-8 w-[160px]">
                                        <SelectValue placeholder={t("placeholderOptional")} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__none__">— {t("accountSubject") || "계정과목"}</SelectItem>
                                        {(newRuleTransType === "deposit" ? revenueAccountOptions : accountSubjectOptions).map((a) => (
                                          <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <span className="text-muted-foreground">{sub ? `${sub.code} ${asDisplayName(sub)}` : "—"}</span>
                                  )}
                                </td>
                                <td className="p-2">
                                  <div className="flex items-center gap-1">
                                    {isEditing ? (
                                      <>
                                        <Button size="sm" variant="default" className="h-8 gap-1 text-xs" onClick={handleAddMemoRule} disabled={savingMemoRule || !newRuleCategory}>
                                          {savingMemoRule ? "..." : <><Save className="h-3.5 w-3.5" />{t("btn_save") || "저장"}</>}
                                        </Button>
                                        <Button size="sm" variant="outline" className="h-8" onClick={handleCancelEditMemoRule} disabled={savingMemoRule}>
                                          {t("cancel")}
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button size="sm" variant="outline" className="h-8 w-8 border-primary/30 bg-primary/10 p-0 text-primary hover:bg-primary/15" onClick={() => handleEditMemoRule(rule)} title={t("btn_edit") || "수정"}>
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => rule.id && handleDeleteMemoRule(rule.id)} title={t("delete")}>
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4 mt-6">
                  <h4 className="font-medium text-amber-800 dark:text-amber-200">■ {t("bankManualNotesTitle")}</h4>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2 text-xs">
                    <li>{t("bankManualNotes_1")}</li>
                    <li>{t("bankManualNotes_2")}</li>
                    <li>{t("bankManualNotes_3")}</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <BankAccountManageDialog
        open={accountManageOpen}
        onOpenChange={setAccountManageOpen}
        accounts={accounts}
        editingAccountId={editingAccountId}
        setEditingAccountId={setEditingAccountId}
        editAccountForm={editAccountForm}
        setEditAccountForm={setEditAccountForm}
        isOffice={isOffice}
        storeOptionsDeduped={storeOptionsDeduped}
        accountManageSaving={accountManageSaving}
        canDeleteBankAccountUi={canDeleteBankAccountUi}
        accountDeletingId={accountDeletingId}
        canViewBankAccountAuditUi={canViewBankAccountAuditUi}
        accountAuditLoading={accountAuditLoading}
        accountAuditLogs={accountAuditLogs}
        handleSaveAccountEdit={handleSaveAccountEdit}
        handleDeleteAccount={handleDeleteAccount}
        t={t}
        tt={tt}
      />

      <BankMiscDialogs
        bankQuickMemosEditOpen={bankQuickMemosEditOpen}
        setBankQuickMemosEditOpen={setBankQuickMemosEditOpen}
        bankQuickMemosDraft={bankQuickMemosDraft}
        setBankQuickMemosDraft={setBankQuickMemosDraft}
        saveBankQuickMemosFromDialog={saveBankQuickMemosFromDialog}
        resetBankQuickMemosToDefault={resetBankQuickMemosToDefault}
        memoPreviewText={memoPreviewText}
        setMemoPreviewText={setMemoPreviewText}
        getMemo={getMemo}
        invoicePhotoPreviewUrl={invoicePhotoPreviewUrl}
        setInvoicePhotoPreviewUrl={setInvoicePhotoPreviewUrl}
        invoiceLinkRow={invoiceLinkRow}
        setInvoiceLinkRow={setInvoiceLinkRow}
        invoiceLinkPOList={invoiceLinkPOList}
        invoiceLinkSelectedPO={invoiceLinkSelectedPO}
        setInvoiceLinkSelectedPO={setInvoiceLinkSelectedPO}
        updatingInvoiceId={updatingInvoiceId}
        handleInvoiceLinkConfirm={handleInvoiceLinkConfirm}
        registerExpenseRow={registerExpenseRow}
        setRegisterExpenseRow={setRegisterExpenseRow}
        registerEditMode={registerEditMode}
        setRegisterEditMode={setRegisterEditMode}
        registerPayeeManual={registerPayeeManual}
        setRegisterPayeeManual={setRegisterPayeeManual}
        registerPayeeCode={registerPayeeCode}
        setRegisterPayeeCode={setRegisterPayeeCode}
        registerPayeeName={registerPayeeName}
        setRegisterPayeeName={setRegisterPayeeName}
        registerAccountSubjectId={registerAccountSubjectId}
        setRegisterAccountSubjectId={setRegisterAccountSubjectId}
        registerSaving={registerSaving}
        setRegisterSaving={setRegisterSaving}
        vendorOptions={vendorOptions}
        accountSubjectOptions={accountSubjectOptions}
        getAccountSubjectLabel={getAccountSubjectLabel}
        auth={auth}
        loadData={loadData}
        t={t}
        tt={tt}
      />

      <BankRegisterActionDialog
        registerActionRow={registerActionRow}
        setRegisterActionRow={setRegisterActionRow}
        openApprovedPick={openApprovedPick}
        approvedPickRow={approvedPickRow}
        setApprovedPickRow={setApprovedPickRow}
        approvedPickList={approvedPickList}
        setApprovedPickList={setApprovedPickList}
        approvedPickIds={approvedPickIds}
        setApprovedPickIds={setApprovedPickIds}
        approvedPickLoading={approvedPickLoading}
        approvedPickSaving={approvedPickSaving}
        setApprovedPickSaving={setApprovedPickSaving}
        receivableLinkedRow={receivableLinkedRow}
        setReceivableLinkedRow={setReceivableLinkedRow}
        receivableLinkedList={receivableLinkedList}
        setReceivableLinkedList={setReceivableLinkedList}
        receivableLinkedSummary={receivableLinkedSummary}
        setReceivableLinkedSummary={setReceivableLinkedSummary}
        receivableLinkedLoading={receivableLinkedLoading}
        receivableLinkedUnlinking={receivableLinkedUnlinking}
        beginReceivableLinkEdit={beginReceivableLinkEdit}
        receivablePickRow={receivablePickRow}
        setReceivablePickRow={setReceivablePickRow}
        receivablePickList={receivablePickList}
        setReceivablePickList={setReceivablePickList}
        receivablePickSelectedIds={receivablePickSelectedIds}
        setReceivablePickSelectedIds={setReceivablePickSelectedIds}
        receivablePickLoading={receivablePickLoading}
        receivablePickSaving={receivablePickSaving}
        setReceivablePickSaving={setReceivablePickSaving}
        receivablePickStoreCreditAvailable={receivablePickStoreCreditAvailable}
        setReceivablePickStoreCreditAvailable={setReceivablePickStoreCreditAvailable}
        receivablePickCreditApply={receivablePickCreditApply}
        setReceivablePickCreditApply={setReceivablePickCreditApply}
        receivablePickMismatchReason={receivablePickMismatchReason}
        setReceivablePickMismatchReason={setReceivablePickMismatchReason}
        receivablePickMismatchNote={receivablePickMismatchNote}
        setReceivablePickMismatchNote={setReceivablePickMismatchNote}
        accountId={accountId}
        selectedAccountStore={selectedAccountStore}
        startStr={startStr}
        endStr={endStr}
        auth={auth}
        canApproveReceivableMismatch={canApproveReceivableMismatch}
        loadData={loadData}
        t={t}
        tt={tt}
      />

      {(() => {
        if (!channelSettleRow?.id) return null
        const csEdits = queryRowEdits[channelSettleRow.id]
        const csStore = (
          csEdits?.storeName ??
          channelSettleRow.storeName ??
          selectedAccountStore ??
          ""
        ).trim()
        if (!csStore) return null
        const csSettleDate = bankRowSettleDate({
          transDate: channelSettleRow.transDate,
          salesDate: csEdits?.salesDate ?? channelSettleRow.salesDate,
        })
        return (
          <PosChannelSettlementDialog
            open={!!channelSettleRow}
            onOpenChange={(open) => {
              if (!open) setChannelSettleRow(null)
            }}
            t={(key) => tt(key, key)}
            storeCode={csStore}
            settleDate={csSettleDate}
            initialNet={Math.abs(channelSettleRow.amount ?? 0)}
            bankTransactionId={channelSettleRow.id}
            initialChannel={
              settlementChannelForPosBankChip(
                inferPosBankChipKind(
                  channelSettleRow.memo,
                  csEdits?.note !== undefined ? csEdits.note : channelSettleRow.note
                )
              ) ?? undefined
            }
            onPosted={() => {
              setChannelSettleRow(null)
              void loadData()
            }}
          />
        )
      })()}
    </div>
  )
}
