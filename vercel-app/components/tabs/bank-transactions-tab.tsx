"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert, appConfirm } from "@/lib/app-message"

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
  adminTabsBarCn,
  adminTabsIconCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Search, Plus, Upload, X, List, PenLine, HelpCircle, Trash2, Settings2, Save, Pencil, FileSpreadsheet } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useStoreList } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole, OFFICE_STORES } from "@/lib/permissions"
import {
  executeExpensePayment,
  getApprovedExpenseAccrualsForBankTx,
  getBankAccounts,
  getBankTransactions,
  addBankTransactionsBulk,
  registerExpenseFromBankTransaction,
  registerPurchaseFromBankTransaction,
  saveBankAccount,
  deleteBankAccount,
  getAccountSubjects,
  getVendorsForPurchase,
  getVendorsForSales,
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
import { compressImageForUpload } from "@/lib/utils"
import { suggestDepositWithRules, suggestWithdrawWithRules } from "@/lib/suggest-with-custom-rules"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ImageViewerWithRotate } from "@/components/ui/image-viewer-with-rotate"
import { translateApiMessage } from "@/lib/translate-api-message"
import {
  extractExpenseAccrualPrefix,
  extractWithdrawalCategoryFromNote,
  mergeWithdrawalCategoryIntoBankNote,
  stripWithdrawalCategoryMetaFromNote,
} from "@/lib/bank-transaction-note-meta"
import {
  BANK_QUICK_MEMO_DEFAULTS,
  loadBankQuickMemos,
  resetBankQuickMemosStorage,
  saveBankQuickMemos,
} from "@/lib/bank-quick-memos"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function BankQuickMemoChipBar({
  title,
  hint,
  phrases,
  onPhrase,
  onManageClick,
  manageLabel,
  className,
}: {
  title: string
  hint: string
  phrases: string[]
  onPhrase: (phrase: string) => void
  onManageClick?: () => void
  manageLabel?: string
  className?: string
}) {
  return (
    <div
      className={`rounded-md border border-amber-200/80 dark:border-amber-800/60 bg-background/80 px-3 py-2 space-y-2 ${className ?? ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>
        </div>
        {onManageClick ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1 px-2 text-xs"
            onClick={onManageClick}
            title={manageLabel}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">{manageLabel}</span>
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {phrases.map((phrase, i) => (
          <Button
            key={`${i}-${phrase.slice(0, 48)}`}
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 text-xs font-normal px-2.5"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPhrase(phrase)}
            title={phrase}
          >
            {phrase}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function BankTransactionsTab() {
  const router = useRouter()
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const tt = React.useCallback((key: string, fallback: string) => {
    const v = t(key)
    if (!v || v === key) return fallback
    return v
  }, [t])
  const asDisplayName = (a: AccountSubjectItem) => (lang === 'ko' ? a.name : (a.nameEn || a.name))
  const { stores: storeList } = useStoreList()

  const isOffice = isOfficeRole(auth?.role || "")
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
    isLinked?: boolean
  }[]>([])
  const [summary, setSummary] = React.useState<{
    openingBalance: number
    beginningBalance: number
    periodDeposits: number
    periodWithdrawals: number
    calculatedBalance: number
  } | null>(null)
  const [actualBalance, setActualBalance] = React.useState("")
  const [loading, setLoading] = React.useState(false)

  const [accountSubjectOptions, setAccountSubjectOptions] = React.useState<AccountSubjectItem[]>([])
  const [vendorOptions, setVendorOptions] = React.useState<{ code: string; name: string }[]>([])
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

  const [importPreview, setImportPreview] = React.useState<KDepositParsedResult | null>(null)
  const [importRowEdits, setImportRowEdits] = React.useState<Record<number, { category?: string; accountSubjectId?: string; note?: string; salesDate?: string; expenseDate?: string; vendorCode?: string; storeName?: string }>>({})
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
  const [filterAccountSubjectId, setFilterAccountSubjectId] = React.useState<string>("")
  const [filterAccountSubjectEmpty, setFilterAccountSubjectEmpty] = React.useState(false)
  const [filterInvoiceNotReceived, setFilterInvoiceNotReceived] = React.useState(false)
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
  }>
  const [queryRowEdits, setQueryRowEdits] = React.useState<Record<number, QueryRowEdit>>({})
  const [queryVendorSearch, setQueryVendorSearch] = React.useState("")
  const [queryStoreSearch, setQueryStoreSearch] = React.useState("")
  const [querySavingId, setQuerySavingId] = React.useState<number | null>(null)
  const [deletingBankTxId, setDeletingBankTxId] = React.useState<number | null>(null)
  const [registerExpenseRow, setRegisterExpenseRow] = React.useState<(typeof list)[0] | null>(null)
  const [registerPurchaseRow, setRegisterPurchaseRow] = React.useState<(typeof list)[0] | null>(null)
  const [registerEditMode, setRegisterEditMode] = React.useState(false)
  const [registerPayeeCode, setRegisterPayeeCode] = React.useState("")
  const [registerPayeeName, setRegisterPayeeName] = React.useState("")
  const [registerPayeeManual, setRegisterPayeeManual] = React.useState(false)
  const [registerVendorCode, setRegisterVendorCode] = React.useState("")
  const [registerVendorManual, setRegisterVendorManual] = React.useState(false)
  const [registerPurchaseLinkedOrderId, setRegisterPurchaseLinkedOrderId] = React.useState("")
  const [registerAccountSubjectId, setRegisterAccountSubjectId] = React.useState<string>("")
  const [registerSaving, setRegisterSaving] = React.useState(false)
  const [registerActionRow, setRegisterActionRow] = React.useState<(typeof list)[0] | null>(null)
  const [approvedPickRow, setApprovedPickRow] = React.useState<(typeof list)[0] | null>(null)
  const [approvedPickList, setApprovedPickList] = React.useState<ExpenseAccrualPlanItem[]>([])
  const [approvedPickId, setApprovedPickId] = React.useState<string>("")
  const [approvedPickLoading, setApprovedPickLoading] = React.useState(false)
  const [approvedPickSaving, setApprovedPickSaving] = React.useState(false)
  const [expenseSubjectEnglishNames, setExpenseSubjectEnglishNames] = React.useState<Record<number, string>>({})
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  /** 미리보기 표의 메모 입력에 포커스가 있을 때의 행 인덱스 (빠른 메모 칩 삽입용) */
  const importMemoFocusIdxRef = React.useRef<number | null>(null)
  /** 조회 탭 메모 입력 포커스 시 해당 통장 거래 id */
  const queryMemoFocusIdRef = React.useRef<number | null>(null)
  const [bankQuickMemos, setBankQuickMemos] = React.useState<string[]>(() => [...BANK_QUICK_MEMO_DEFAULTS])
  const [bankQuickMemosEditOpen, setBankQuickMemosEditOpen] = React.useState(false)
  const [bankQuickMemosDraft, setBankQuickMemosDraft] = React.useState<string[]>([])
  const selectedAccountStore = (accounts.find((a) => String(a.id) === String(accountId))?.store || "").trim()
  const [memoTransMap, setMemoTransMap] = React.useState<Record<string, string>>({})

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
      if (String(r.category || "").toLowerCase() === "fixed" && payload.category === undefined) {
        payload.category = "expense"
      }
      const res = await updateBankTransaction(payload)
      if (res.success) {
        await invalidateReceivablePayableListCache()
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
                  storeName: edits.storeName !== undefined ? (edits.storeName === "__none__" ? "" : edits.storeName) : x.storeName,
                }
              : x
          )
        )
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
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
    setApprovedPickId("")
    try {
      const res = await getApprovedExpenseAccrualsForBankTx({
        bankTransactionId: Number(row.id),
        userRole: auth?.role,
        storeFilter: selectedAccountStore || undefined,
      })
      setApprovedPickList(res.list || [])
    } catch {
      setApprovedPickList([])
    } finally {
      setApprovedPickLoading(false)
    }
  }, [auth?.role, selectedAccountStore])

  React.useEffect(() => {
    if (!registerExpenseRow) {
      setExpenseSubjectEnglishNames({})
      return
    }
    const candidates = accountSubjectOptions
      .filter((a) => a.type === "expense")
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
  const tabParam = searchParams.get("tab")
  const openRegisterTxIdParam = searchParams.get("openRegisterTxId")
  const [activeBankTab, setActiveBankTab] = React.useState(
    tabParam === "input" ? "input" : tabParam === "query" ? "query" : "input"
  )
  const urlParamsApplied = React.useRef(false)
  const restoreOpenRegisterTxIdRef = React.useRef<number | null>(
    openRegisterTxIdParam && Number(openRegisterTxIdParam) > 0 ? Number(openRegisterTxIdParam) : null
  )
  const restoreListLoadedRef = React.useRef(false)
  const [restoredHighlightTxId, setRestoredHighlightTxId] = React.useState<number | null>(null)
  React.useEffect(() => {
    if (tabParam === "account-subjects") {
      router.replace("/admin/chart-of-accounts")
      return
    }
    if (tabParam === "input") setActiveBankTab("input")
    else if (tabParam === "query") setActiveBankTab("query")
    if (openRegisterTxIdParam && Number(openRegisterTxIdParam) > 0) setActiveBankTab("query")
  }, [tabParam, openRegisterTxIdParam, router])
  React.useEffect(() => {
    if (urlParamsApplied.current) return
    const aid = searchParams.get("accountId")
    const start = searchParams.get("startStr")
    const end = searchParams.get("endStr")
    if (aid) {
      setAccountId(aid)
      urlParamsApplied.current = true
    }
    if (start && /^\d{4}-\d{2}-\d{2}$/.test(start)) setStartStr(start)
    if (end && /^\d{4}-\d{2}-\d{2}$/.test(end)) setEndStr(end)
  }, [searchParams])

  const importRestoreKey = "bank_import_pending_restore"
  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem(importRestoreKey)
      if (!raw) return
      const data = JSON.parse(raw) as { importPreview?: KDepositParsedResult; importRowEdits?: Record<number, Record<string, string>>; accountId?: string; startStr?: string; endStr?: string }
      sessionStorage.removeItem(importRestoreKey)
      if (data.importPreview?.rows?.length) {
        setImportPreview(data.importPreview)
        setImportRowEdits(data.importRowEdits || {})
        if (data.accountId) setAccountId(data.accountId)
        if (data.startStr && /^\d{4}-\d{2}-\d{2}$/.test(data.startStr)) setStartStr(data.startStr)
        if (data.endStr && /^\d{4}-\d{2}-\d{2}$/.test(data.endStr)) setEndStr(data.endStr)
        setActiveBankTab("input")
      }
    } catch {
      sessionStorage.removeItem(importRestoreKey)
    }
  }, [])

  React.useEffect(() => {
    getBankAccounts({
      userStore: auth?.store,
      userRole: auth?.role,
    })
      .then((r) => setAccounts(r || []))
      .catch(() => setAccounts([]))
  }, [auth?.store, auth?.role])

  React.useEffect(() => {
    if (accounts.length > 0 && !accountId) {
      setAccountId(String(accounts[0].id))
    }
  }, [accounts, accountId])

  const loadData = React.useCallback((): Promise<void> => {
    if (!accountId) return Promise.resolve()
    setLoading(true)
    setQueryRowEdits({})
    return getBankTransactions({
      accountId,
      startStr,
      endStr,
    })
      .then((r) => {
        setList(r.list || [])
        setSummary(r.summary || null)
      })
      .catch(() => {
        setList([])
        setSummary(null)
      })
      .finally(() => setLoading(false))
  }, [accountId, startStr, endStr])

  React.useEffect(() => {
    if (!restoreOpenRegisterTxIdRef.current || !accountId || restoreListLoadedRef.current) return
    restoreListLoadedRef.current = true
    loadData()
  }, [accountId, loadData])

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
    getVendorsForPurchase().then((r) => setVendorOptions(r || []))
  }, [])
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
  const reloadAccountSubjectOptions = React.useCallback(() => {
    Promise.all([
      getAccountSubjects({ forExpense: true, excludeHeaders: true }),
      getAccountSubjects({ forTransfer: true, excludeHeaders: true }),
      getAccountSubjects({ forRevenue: true, excludeHeaders: true }),
    ])
      .then(([expense, transfer, revenue]) => {
        setAccountSubjectOptions([...transfer, ...(expense || [])])
        setRevenueAccountOptions(revenue || [])
      })
      .catch(() => setAccountSubjectOptions([]))
  }, [])

  React.useEffect(() => {
    reloadAccountSubjectOptions()
  }, [reloadAccountSubjectOptions])

  React.useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") reloadAccountSubjectOptions()
    }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [reloadAccountSubjectOptions])

  React.useEffect(() => {
    if (!importPreview || revenueAccountOptions.length === 0 || accountSubjectOptions.length === 0) return
    setImportRowEdits((prev) => {
      const next = { ...prev }
      importPreview.rows.forEach((r, idx) => {
        if (r.transType === "deposit" && r.memo) {
          const sug = suggestDepositWithRules(r.memo, memoRules, revenueAccountOptions)
          if (sug) {
            const d = new Date(r.transDate)
            d.setDate(d.getDate() - 1)
            next[idx] = { ...next[idx], category: sug.category, accountSubjectId: sug.accountSubjectId ? String(sug.accountSubjectId) : undefined, salesDate: d.toISOString().slice(0, 10) }
          }
        } else if (r.transType === "withdraw" && r.memo) {
          const sug = suggestWithdrawWithRules(r.memo, memoRules, accountSubjectOptions)
          if (sug) {
            next[idx] = {
              ...next[idx],
              category: sug.category,
              ...(sug.accountSubjectId ? { accountSubjectId: String(sug.accountSubjectId) } : {}),
            }
          }
        }
      })
      return next
    })
  }, [importPreview, revenueAccountOptions, accountSubjectOptions, memoRules])

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
            if (res.success) loadData()
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
            if (res.success) loadData()
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
    [loadData, t]
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
      if (res.success) loadData()
      else await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
    } catch (e) {
      await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setUpdatingInvoiceId(null)
    }
  }, [invoiceLinkRow, invoiceLinkSelectedPO, loadData, t])

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
        if (res.success) loadData()
        else await appAlert(translateApiMessage(res.message, t) || res.message || t("msg_upload_fail"))
      } catch (e) {
        await appAlert(t("msg_upload_fail") + ": " + (e instanceof Error ? e.message : String(e)))
      } finally {
        setInvoicePhotoUploadingId(null)
        if (invoicePhotoInputRef.current) invoicePhotoInputRef.current.value = ""
      }
    },
    [loadData, t]
  )

  const handleAddAccount = async () => {
    if (!newAccountName.trim()) {
      await appAlert(t("bankAddAccount") || "Please enter account name.")
      return
    }
    const store = isOffice && newAccountStore ? newAccountStore : auth?.store || ""
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
      const store = isOffice ? (editAccountForm.store.trim() || undefined) : (auth?.store || undefined)
      const ob = editAccountForm.openingBalance.trim() ? Number(String(editAccountForm.openingBalance).replace(/,/g, "")) : 0
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
    if (!await appConfirm(t("bankAccountDeleteConfirm") || "All transactions linked to this account will be deleted. Continue?")) return
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
    const officeSet = new Set(OFFICE_STORES.map((s) => s.trim().toLowerCase()))
    const seen = new Set<string>()
    const result: string[] = []
    const add = (s: string) => {
      const key = s.trim().toLowerCase()
      if (officeSet.has(key)) {
        if (!seen.has("본사")) { seen.add("본사"); result.push("본사") }
      } else if (s && !seen.has(s)) {
        seen.add(s)
        result.push(s)
      }
    }
    for (const s of storeOptions || []) {
      if (s === "All") continue
      add(s)
    }
    return result.length ? result : ["본사"]
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
      if (filterTransType && r.transType !== filterTransType) return false
      if (filterCategory && r.category !== filterCategory) return false
      if (filterAccountSubjectId) {
        const subId = r.accountSubjectId ?? 0
        if (String(subId) !== filterAccountSubjectId) return false
      }
      if (filterAccountSubjectEmpty) {
        if (r.accountSubjectId != null && r.accountSubjectId !== 0) return false
      }
      if (filterInvoiceNotReceived) {
        if (r.transType !== "withdraw") return false
        const hasInvoice = r.invoiceReceived === true || (r.invoiceNo && String(r.invoiceNo).trim() !== "") || (r.invoicePhotoUrl && String(r.invoicePhotoUrl).trim() !== "")
        if (hasInvoice) return false
      }
      return true
    })
  }, [list, filterTransType, filterCategory, filterAccountSubjectId, filterAccountSubjectEmpty, filterInvoiceNotReceived])

  const listForCategoryOptions = React.useMemo(() => {
    if (!filterTransType) return list
    return list.filter((r) => r.transType === filterTransType)
  }, [list, filterTransType])

  const listForAccountSubjectOptions = React.useMemo(() => {
    if (!filterCategory) return listForCategoryOptions
    return listForCategoryOptions.filter((r) => r.category === filterCategory)
  }, [listForCategoryOptions, filterCategory])

  const filterTransTypeOptions = React.useMemo(() => {
    const types = [...new Set(list.map((r) => r.transType).filter(Boolean))] as string[]
    return types
  }, [list])

  const filterCategoryOptions = React.useMemo(() => {
    const cats = [...new Set(listForCategoryOptions.map((r) => r.category).filter(Boolean))] as string[]
    return cats.sort((a, b) => a.localeCompare(b))
  }, [listForCategoryOptions])

  const filterAccountSubjectOptionsFiltered = React.useMemo(() => {
    const ids = new Set(listForAccountSubjectOptions.map((r) => r.accountSubjectId).filter((id) => id != null && id !== 0))
    const all = [...accountSubjectOptions, ...revenueAccountOptions]
    return all.filter((a) => ids.has(a.id))
  }, [listForAccountSubjectOptions, accountSubjectOptions, revenueAccountOptions])

  React.useEffect(() => {
    if (filterCategory && !list.some((r) => (!filterTransType || r.transType === filterTransType) && r.category === filterCategory)) setFilterCategory("")
    if (filterAccountSubjectId && !list.some((r) => (!filterTransType || r.transType === filterTransType) && (!filterCategory || r.category === filterCategory) && String(r.accountSubjectId ?? 0) === filterAccountSubjectId)) setFilterAccountSubjectId("")
  }, [list, filterTransType, filterCategory, filterAccountSubjectId])

  const getCategoryLabel = (cat: string, transType: string) => {
    const depositMap: Record<string, string> = {
      revenue_delivery: t("bankRevenueDelivery") || "Delivery App",
      revenue_card: t("bankRevenueCard") || "Card",
      revenue_qr: t("bankRevenueQr") || "QR/Transfer",
      revenue_cash: t("bankRevenueCash") || "Cash",
      receivable_receive: t("bankCategoryReceivableReceive") || "Sales Collection",
      loan: t("bankCategoryLoan") || "Loan",
      advance: t("bankCategoryAdvance") || "Advance",
      unclassified: t("bankCategoryUnclassified") || "Unclassified",
      correction: t("bankCategoryCorrection") || "Correction",
    }
    const withdrawMap: Record<string, string> = {
      transfer: t("bankCategoryTransfer") || "Transfer",
      expense: t("bankCategoryExpense") || "Expense",
      fixed: t("bankCategoryExpense") || "Expense",
      purchase_payment: t("bankCategoryPurchasePayment") || "Purchase Payment",
      loan: t("bankCategoryLoan") || "Loan",
      advance: t("bankCategoryAdvance") || "Advance",
      unclassified: t("bankCategoryUnclassified") || "Unclassified",
      correction: t("bankCategoryCorrection") || "Correction",
    }
    return transType === "deposit" ? (depositMap[cat] ?? cat) : (withdrawMap[cat] ?? cat)
  }

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
      t("pettyColAmount") || "금액",
      t("bankAttributedDate") || "인식일",
      t("bankMemoLabel") || "은행 적요",
      t("bankNoteLabel") || "메모",
    ]
    const rows: (string | number)[][] = [headers]
    for (const r of filteredList) {
      const cat = r.category ?? "expense"
      const catLabel = getCategoryLabel(cat, r.transType || "withdraw")
      const sub = (r.transType === "deposit" ? revenueAccountOptions : accountSubjectOptions).find((a) => a.id === r.accountSubjectId)
      const subLabel = sub ? `${sub.code} ${asDisplayName(sub)}` : "—"
      const attrDate = r.transType === "deposit" && r.salesDate ? r.salesDate : r.transType === "withdraw" && r.expenseDate ? r.expenseDate : "—"
      rows.push([
        r.transDate || "",
        r.transType === "deposit" ? (t("bankDeposit") || "입금") : (t("bankWithdraw") || "출금"),
        catLabel,
        subLabel,
        r.amount ?? 0,
        attrDate,
        r.memo || "",
        stripWithdrawalCategoryMetaFromNote(r.note || ""),
      ])
    }
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"/><style>td,th{border:1px solid #ccc;padding:4px 8px;font-size:11px}.head{font-weight:bold;background:#f0f0f0}table{border-collapse:collapse;width:100%}</style></head>
<body>
<table>
<tr class="head">${rows[0].map((c) => `<th>${escapeXml(String(c))}</th>`).join("")}</tr>
${rows.slice(1).map((row) => `<tr>${row.map((c) => `<td>${escapeXml(String(c))}</td>`).join("")}</tr>`).join("")}
</table>
</body>
</html>`
    const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `bank_transactions_${startStr}_${endStr}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredList, startStr, endStr, accountSubjectOptions, revenueAccountOptions, t])

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
        const initialEdits: Record<number, { category?: string; accountSubjectId?: string; salesDate?: string; expenseDate?: string; note?: string; vendorCode?: string; storeName?: string }> = {}
        parsed.rows.forEach((r, idx) => {
          if (r.transType === "deposit") {
            const d = new Date(r.transDate)
            d.setDate(d.getDate() - 1)
            initialEdits[idx] = { category: "revenue_delivery", salesDate: d.toISOString().slice(0, 10) }
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
    setImportRowEdits((prev) => ({
      ...prev,
      [idx]: { ...prev[idx], [field]: value || undefined },
    }))
  }

  const applyImportQuickMemo = React.useCallback(
    (phrase: string) => {
      const idx = importMemoFocusIdxRef.current
      if (idx !== null && idx >= 0) {
        setImportRowEdits((prev) => {
          const cur = (prev[idx]?.note ?? "").trim()
          const next = cur ? `${cur} | ${phrase}` : phrase
          return { ...prev, [idx]: { ...prev[idx], note: next } }
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
    [tt]
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
              edits?.note !== undefined ? edits.note ?? "" : stripWithdrawalCategoryMetaFromNote(r.note ?? "")
            const cur = base.trim()
            const next = cur ? `${cur} | ${phrase}` : phrase
            return { ...prev, [rowId]: { ...prev[rowId], note: next } }
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
    [list, tt]
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
    const depositCats = ["revenue_delivery", "revenue_card", "revenue_qr", "revenue_cash", "receivable_receive", "correction", "loan", "advance", "unclassified"] as const
    const withdrawCats = ["transfer", "expense", "purchase_payment", "correction", "loan", "advance", "unclassified"] as const
    const items = importPreview.rows.map((r, idx) => {
      const edit = importRowEdits[idx]
      const rawWithdrawCat =
        r.transType === "withdraw" && edit?.category
          ? edit.category === "fixed"
            ? "expense"
            : edit.category
          : undefined
      const category =
        r.transType === "withdraw"
          ? (rawWithdrawCat && (withdrawCats as readonly string[]).includes(rawWithdrawCat) ? rawWithdrawCat : "unclassified")
          : edit?.category && (depositCats as readonly string[]).includes(edit.category)
            ? edit.category
            : "revenue_delivery"

      let accountSubjectId: number | undefined
      if (r.transType === "deposit" && !["correction", "loan", "advance", "unclassified", "receivable_receive"].includes(category)) {
        if (edit?.accountSubjectId && edit.accountSubjectId !== "__none__") accountSubjectId = Number(edit.accountSubjectId)
      } else if (r.transType === "withdraw" && !["correction", "loan", "advance", "unclassified", "purchase_payment"].includes(category)) {
        if (edit?.accountSubjectId && edit.accountSubjectId !== "__none__") accountSubjectId = Number(edit.accountSubjectId)
      }

      const note = edit?.note?.trim() || undefined
      const salesDate =
        r.transType === "deposit" && !["correction", "loan", "advance", "unclassified", "receivable_receive"].includes(category)
          ? edit?.salesDate || (() => { const d = new Date(r.transDate); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) })()
          : undefined
      const expenseDate =
        r.transType === "withdraw" && category === "expense"
          ? edit?.expenseDate || r.transDate
          : undefined
      const vendorCode = r.transType === "withdraw" && category === "purchase_payment" ? edit?.vendorCode?.trim() || undefined : undefined
      const storeName = r.transType === "deposit" && category === "receivable_receive" ? edit?.storeName?.trim() || undefined : undefined
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
        storeName,
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
      if (res.success) {
        const periodStart = importPreview.periodStart
        const periodEnd = importPreview.periodEnd
        setImportPreview(null)
        setImportRowEdits({})
        if (periodStart && periodEnd) {
          setStartStr(periodStart)
          setEndStr(periodEnd)
        }
        const fresh = await getBankTransactions({
          accountId: Number(accountId),
          startStr: periodStart || startStr,
          endStr: periodEnd || endStr,
        })
        setList(fresh.list || [])
        setSummary(fresh.summary || null)
        setActiveBankTab("query")
        await appAlert(translateApiMessage(res.message, t) || res.message || (t("bankImportSavedGoToQuery") || "저장되었습니다. 조회 탭에서 내역을 확인·추가 작업할 수 있습니다."))
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || tt("msg_save_fail", "저장 실패"))
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
      <p className="text-xs text-muted-foreground">
        <Link href="/admin/chart-of-accounts" className="text-primary underline-offset-2 hover:underline font-medium">
          {tt("bankCoaManageLink", "계정과목 추가·수정: 계정과목표")}
        </Link>
        <span className="font-normal">{` · ${tt("bankCoaUsedForBankHint", "통장·적요 규칙·분개는 동일 DB(account_subjects)를 사용합니다")}`}</span>
      </p>
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
                        {a.bankName ? `[${a.bankName}] ` : ""}{a.name} {a.store ? `(${a.store})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="date" value={startStr} onChange={(e) => setStartStr(e.target.value)} className="w-[130px] h-9" />
                <Input type="date" value={endStr} onChange={(e) => setEndStr(e.target.value)} className="w-[130px] h-9" />
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
                    <div className="rounded-lg border bg-muted/30 px-4 py-2 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                      <span className="text-muted-foreground">{t("bankOpeningBalance")}: <span className="font-mono font-medium">{fmt(summary.openingBalance)}</span></span>
                      <span className="text-muted-foreground">+ {t("bankDeposit")}: <span className="font-mono text-green-600">{fmt(summary.periodDeposits)}</span></span>
                      <span className="text-muted-foreground">- {t("bankWithdraw")}: <span className="font-mono text-destructive">{fmt(summary.periodWithdrawals)}</span></span>
                      <span className="font-medium">{t("bankCalculatedBalance")}: <span className="font-mono font-bold">{fmt(summary.calculatedBalance)}</span></span>
                      <div className="flex-1" />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground text-xs">{t("bankVerifyHint")}</span>
                        <Input
                          type="text"
                          placeholder={t("bankActualBalance")}
                          value={actualBalance}
                          onChange={(e) => setActualBalance(e.target.value)}
                          className="w-[140px] h-8 text-right"
                        />
                        {diff !== null && (
                          <span className={diff === 0 ? "text-green-600 font-medium" : "text-destructive font-medium"}>
                            {t("bankDifference")}: {diff >= 0 ? "+" : ""}{fmt(diff)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 mb-3 p-3 rounded-lg bg-muted/20 border">
                    <span className="text-sm font-medium text-muted-foreground mr-1">{t("bankFilterLabel") || "필터"}:</span>
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
                        {filterTransTypeOptions.includes("deposit") && <SelectItem value="deposit">{t("bankDeposit")}</SelectItem>}
                        {filterTransTypeOptions.includes("withdraw") && <SelectItem value="withdraw">{t("bankWithdraw")}</SelectItem>}
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
                      />
                      <span className="text-sm whitespace-nowrap">{t("poInvoiceNotReceived") || "인보이스 미수령만"}</span>
                    </label>
                    {(filterTransType || filterCategory || filterAccountSubjectId || filterAccountSubjectEmpty || filterInvoiceNotReceived) && (
                      <Button size="sm" variant="ghost" onClick={() => { setFilterTransType(""); setFilterCategory(""); setFilterAccountSubjectId(""); setFilterAccountSubjectEmpty(false); setFilterInvoiceNotReceived(false) }}>
                        {t("btn_reset") || "초기화"}
                      </Button>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {filteredList.length} {t("receivPayCount")}
                    </span>
                    <Button size="sm" variant="outline" onClick={exportBankTransactionsExcel} disabled={filteredList.length === 0} title={t("excelBtn") || "엑셀"}>
                      <FileSpreadsheet className="h-4 w-4 mr-1" />
                      {t("excelBtn") || "엑셀"}
                    </Button>
                  </div>

                  {!loading && accountId && accounts.length > 0 && (
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
                  )}

                  <div id="bank-query-list-wrap" className="rounded-lg border max-h-[70vh] min-h-[320px] overflow-auto">
                    {loading ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">{t("loadingItems")}</p>
                    ) : filteredList.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">{list.length === 0 ? (t("pettyNoData") || "데이터 없음") : (t("bankNoMatchFilter") || "조건에 맞는 거래가 없습니다.")}</p>
                    ) : (
                      <table className="w-full text-sm min-w-[1100px] table-fixed">
                        <colgroup>
                          <col style={{ width: "92px" }} />
                          <col style={{ width: "64px" }} />
                          <col style={{ width: "130px" }} />
                          <col style={{ width: "130px" }} />
                          <col style={{ width: "95px" }} />
                          <col style={{ width: "108px" }} />
                          <col style={{ width: "150px" }} />
                          <col style={{ width: "40px" }} />
                          <col style={{ width: "180px" }} />
                          <col style={{ width: "140px" }} />
                          <col style={{ width: "76px" }} />
                        </colgroup>
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="p-2 text-center whitespace-nowrap">{t("date") || "날짜"}</th>
                            <th className="p-2 text-center whitespace-nowrap">{t("pettyColType") || "유형"}</th>
                            <th className="p-2 text-center whitespace-nowrap">{t("bankCategoryLabel") || "용도"}</th>
                            <th className="p-2 text-center whitespace-nowrap">{t("accountSubject") || "계정과목"}</th>
                            <th className="p-2 text-right whitespace-nowrap">{t("pettyColAmount") || "금액"}</th>
                            <th className="p-2 text-center whitespace-nowrap">{t("bankAttributedDate") || "인식일"}</th>
                            <th className="p-2 text-center whitespace-nowrap">{t("bankRegisterLabel") || "지출 등록"}</th>
                            <th className="p-2 text-center whitespace-nowrap" title={t("poInvoiceReceived") || "인보이스 수령"}>Iv</th>
                            <th className="p-2 text-left whitespace-nowrap">{t("bankMemoLabel") || "은행 적요"}</th>
                            <th className="p-2 text-center whitespace-nowrap">{t("bankNoteLabel") || "메모"}</th>
                            <th className="p-2 text-center w-11"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredList.map((r, i) => {
                            const edits = r.id ? queryRowEdits[r.id] : undefined
                            const rawCat = String(edits?.category ?? r.category ?? "expense").toLowerCase()
                            const cat =
                              r.transType === "withdraw" && rawCat === "fixed" ? "expense" : rawCat
                            const hasEdits = r.id && edits && Object.keys(edits).length > 0
                            const isSaving = querySavingId === r.id
                            return (
                            <tr
                              id={r.id ? `bank-tx-row-${r.id}` : undefined}
                              key={r.id ?? i}
                              className={`border-t ${rawCat === "correction" ? "bg-pink-50 dark:bg-pink-950/20" : ""} ${r.id && restoredHighlightTxId === r.id ? "bg-primary/10 ring-2 ring-primary/60" : ""}`}
                            >
                              <td className="p-2 align-middle text-center">{r.transDate}</td>
                              <td className="p-2 align-middle text-center">{r.transType === "deposit" ? t("bankDeposit") : t("bankWithdraw")}</td>
                              <td className="p-2 align-middle">
                                {r.transType === "withdraw" ? (
                                  <Select value={cat} onValueChange={(v) => r.id && setQueryRowEdit(r.id, "category", v)}>
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="transfer">{t("bankCategoryTransfer")}</SelectItem>
                                      <SelectItem value="expense">{t("bankCategoryExpense")}</SelectItem>
                                      <SelectItem value="purchase_payment">{t("bankCategoryPurchasePayment") || "매입 대금"}</SelectItem>
                                      <SelectItem value="loan">{t("bankCategoryLoan")}</SelectItem>
                                      <SelectItem value="advance">{t("bankCategoryAdvance")}</SelectItem>
                                      <SelectItem value="unclassified">{t("bankCategoryUnclassified")}</SelectItem>
                                      <SelectItem value="correction">{t("bankCategoryCorrection")}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Select
                                    value={cat}
                                    onValueChange={(v) => {
                                      if (!r.id) return
                                      const mergedEdits: QueryRowEdit = { ...(queryRowEdits[r.id] || {}), category: v }
                                      setQueryRowEdits((prev) => ({ ...prev, [r.id!]: mergedEdits }))
                                      const effectiveStoreName = (mergedEdits.storeName ?? r.storeName ?? "").trim()
                                      if (v === "receivable_receive" && effectiveStoreName) {
                                        void handleQueryRowSave(r, mergedEdits)
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="revenue_delivery">{t("bankRevenueDelivery") || "배달앱"}</SelectItem>
                                      <SelectItem value="revenue_card">{t("bankRevenueCard") || "카드"}</SelectItem>
                                      <SelectItem value="revenue_qr">{t("bankRevenueQr") || "QR/이체"}</SelectItem>
                                      <SelectItem value="revenue_cash">{t("bankRevenueCash") || "현금"}</SelectItem>
                                      <SelectItem value="receivable_receive">{t("bankCategoryReceivableReceive") || "매출 수령"}</SelectItem>
                                      <SelectItem value="loan">{t("bankCategoryLoan")}</SelectItem>
                                      <SelectItem value="advance">{t("bankCategoryAdvance")}</SelectItem>
                                      <SelectItem value="unclassified">{t("bankCategoryUnclassified")}</SelectItem>
                                      <SelectItem value="correction">{t("bankCategoryCorrection")}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                              </td>
                              <td className="p-2 align-middle">
                                {r.transType === "withdraw" && cat === "purchase_payment" ? (
                                  <Select
                                    value={(edits?.vendorCode ?? r.vendorCode ?? "") || "__none__"}
                                    onValueChange={(v) => r.id && setQueryRowEdit(r.id, "vendorCode", v === "__none__" ? "" : v)}
                                    onOpenChange={(open) => !open && setQueryVendorSearch("")}
                                  >
                                    <SelectTrigger className="h-8 text-xs max-w-[140px]">
                                      <SelectValue placeholder={t("inVendorPlaceholder") || "거래처"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <div className="p-1.5 border-b" onClick={(e) => e.stopPropagation()}>
                                        <Input placeholder={t("search") || "검색"} value={queryVendorSearch} onChange={(e) => setQueryVendorSearch(e.target.value)} className="h-7 text-xs" />
                                      </div>
                                      <SelectItem value="__none__">—</SelectItem>
                                      {vendorOptions
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
                                        <Input placeholder={t("search") || "검색"} value={queryStoreSearch} onChange={(e) => setQueryStoreSearch(e.target.value)} className="h-7 text-xs" />
                                      </div>
                                      <SelectItem value="__none__">—</SelectItem>
                                      {receivableOptions
                                        .filter((s) => !queryStoreSearch.trim() || (s || "").toLowerCase().includes(queryStoreSearch.trim().toLowerCase()))
                                        .map((s) => (
                                          <SelectItem key={s} value={s}>{s}</SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                ) : r.transType === "withdraw" && !["correction", "loan", "advance", "unclassified", "purchase_payment"].includes(cat) ? (
                                  <Select
                                    value={(edits?.accountSubjectId !== undefined ? edits.accountSubjectId : r.accountSubjectId != null ? String(r.accountSubjectId) : "__none__") || "__none__"}
                                    onValueChange={(v) => r.id && setQueryRowEdit(r.id, "accountSubjectId", v === "__none__" ? "" : v)}
                                  >
                                    <SelectTrigger className="h-8 text-xs max-w-[140px]">
                                      <SelectValue placeholder="—" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">—</SelectItem>
                                      {(cat === "transfer"
                                        ? accountSubjectOptions.filter((a) => a.type === "transfer")
                                        : accountSubjectOptions.filter((a) => a.type === "expense" && a.pAndLSection !== "cost")
                                      ).map((a) => (
                                        <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : r.transType === "deposit" && !["correction", "loan", "advance", "unclassified", "receivable_receive"].includes(cat) ? (
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
                              <td className={`p-2 align-middle text-right whitespace-nowrap tabular-nums ${r.amount >= 0 ? "text-green-600" : "text-orange-600 dark:text-orange-400"}`}>
                                {(r.amount ?? 0).toLocaleString()}
                              </td>
                              <td className="p-2">
                                {r.transType === "deposit" && !["correction", "loan", "advance", "unclassified", "receivable_receive"].includes(cat) ? (
                                  <Input
                                    type="date"
                                    value={edits?.salesDate ?? r.salesDate ?? (() => { const d = new Date(r.transDate); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) })()}
                                    onChange={(e) => r.id && setQueryRowEdit(r.id, "salesDate", e.target.value)}
                                    className="h-8 text-xs min-w-[110px] w-[110px]"
                                  />
                                ) : r.transType === "withdraw" && cat === "expense" ? (
                                  <Input
                                    type="date"
                                    value={edits?.expenseDate ?? r.expenseDate ?? r.transDate}
                                    onChange={(e) => r.id && setQueryRowEdit(r.id, "expenseDate", e.target.value)}
                                    className="h-8 text-xs min-w-[110px] w-[110px]"
                                  />
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="p-2 align-middle">
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                {r.transType === "withdraw" && !r.isLinked ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs px-2"
                                    onClick={() => setRegisterActionRow(r)}
                                  >
                                    {t("bankRegisterLink") || "지출등록"}
                                  </Button>
                                ) : r.transType === "withdraw" && r.isLinked ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs px-2 shrink-0"
                                    onClick={() => {
                                      const amt = Math.abs(r.amount ?? 0)
                                      const bankMemo = (r.memo || "").trim().slice(0, 500)
                                      const bankNote = stripWithdrawalCategoryMetaFromNote((r.note || "").trim()).slice(0, 500)
                                      const q = new URLSearchParams({ tab: "expenseRegister", updateExisting: "1" })
                                      if (r.id) q.set("bankTransactionId", String(r.id))
                                      if (amt > 0) q.set("amount", String(amt))
                                      if (bankMemo) q.set("bankMemo", bankMemo)
                                      if (bankNote) q.set("bankNote", bankNote)
                                      if (r.transDate) q.set("transDate", r.transDate)
                                      if (accountId) q.set("accountId", accountId)
                                      if (selectedAccountStore) q.set("storeName", selectedAccountStore)
                                      if (r.category) q.set("category", r.category)
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
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                                </div>
                              </td>
                              <td className="p-2 align-middle text-center">
                                {r.transType === "withdraw" ? (() => {
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
                                })() : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td
                                className="p-2 align-middle text-left truncate max-w-[180px] text-muted-foreground text-xs cursor-pointer hover:bg-muted/50 rounded"
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
                                      : stripWithdrawalCategoryMetaFromNote(r.note ?? "")
                                  }
                                  onChange={(e) => r.id && setQueryRowEdit(r.id, "note", e.target.value)}
                                  onFocus={() => {
                                    if (r.id) queryMemoFocusIdRef.current = r.id
                                  }}
                                  className="h-8 text-xs min-w-[120px] max-w-[160px]"
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
                            </tr>
                          );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
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
                            {a.bankName ? `[${a.bankName}] ` : ""}{a.name} {a.store ? `(${a.store})` : ""}
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
                {((accounts.length === 0) || (accounts.length > 0 && isOffice)) && (
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
                      <Select value={newAccountStore || "본사"} onValueChange={setNewAccountStore}>
                        <SelectTrigger className="w-[110px] h-9">
                          <SelectValue placeholder={t("store") || "매장"} />
                        </SelectTrigger>
                        <SelectContent>
                          {storeOptionsDeduped.map((s) => (
                            <SelectItem key={s} value={s}>
                              {OFFICE_STORES.map((o) => o.trim().toLowerCase()).includes(s.trim().toLowerCase()) ? (t("pettyScopeOffice") || "본사") : s}
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
                )}
              </div>
              {accounts.length === 0 && (
                <p className="text-sm text-muted-foreground mb-4">{t("bankAddAccount")} - {t("bankNoAccountHintShort")}</p>
              )}

              {importPreview && (
            <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-4 mb-4 space-y-3">
              <div className="flex justify-between items-center">
                <p className="font-medium text-amber-800 dark:text-amber-200">{t("bankImportPreview")}</p>
                <Button size="sm" variant="ghost" onClick={() => setImportPreview(null)}>
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
              <p className="text-xs text-muted-foreground">{t("bankImportDupHint") || "이미 등록된 거래(날짜·금액·적요 동일)는 자동으로 제외됩니다."}</p>
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                {t("bankImportWithdrawCoaHint") || "※ 출금: 아래 표에서 용도·계정과목(매입 대금이면 거래처)을 선택하면 저장 시 통장에 반영됩니다. 적요 규칙으로 자동 채워집니다."}
              </p>
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
              <div className="max-h-[520px] overflow-x-auto overflow-y-auto border rounded">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="p-2 text-center min-w-[96px]">{t("date")}</th>
                      <th className="p-2 text-center min-w-[64px]">{t("pettyColType")}</th>
                      <th className="p-2 text-center">{t("bankCategoryLabel")}</th>
                      <th className="p-2 text-center">{t("accountSubject")}</th>
                      <th className="p-2 text-center">{t("pettyColAmount")}</th>
                      <th className="p-2 text-center min-w-[220px]">{t("bankMemoLabel") || "은행 적요"}</th>
                      <th className="p-2 text-center min-w-[150px]">{t("bankNoteLabel") || "메모"}</th>
                      <th className="p-2 text-center whitespace-nowrap">{t("bankAttributedDate") || "인식일"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map((r, idx) => {
                      const impRaw = importRowEdits[idx]?.category || "unclassified"
                      const impCat = r.transType === "withdraw" && impRaw === "fixed" ? "expense" : impRaw
                      return (
                      <tr key={idx} className={`border-t ${importRowEdits[idx]?.category === "correction" ? "bg-pink-50 dark:bg-pink-950/20" : ""}`}>
                        <td className="p-2 whitespace-nowrap">{r.transDate}</td>
                        <td className="p-2 text-center whitespace-nowrap">{r.transType === "deposit" ? t("bankDeposit") : t("bankWithdraw")}</td>
                        <td className="p-2">
                          {r.transType === "withdraw" ? (
                            <Select
                              value={impCat}
                              onValueChange={(v) => setImportRowEdit(idx, "category", v)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="transfer">{t("bankCategoryTransfer")}</SelectItem>
                                <SelectItem value="expense">{t("bankCategoryExpense")}</SelectItem>
                                <SelectItem value="purchase_payment">{t("bankCategoryPurchasePayment") || "매입 대금"}</SelectItem>
                                <SelectItem value="loan">{t("bankCategoryLoan")}</SelectItem>
                                <SelectItem value="advance">{t("bankCategoryAdvance")}</SelectItem>
                                <SelectItem value="unclassified">{t("bankCategoryUnclassified")}</SelectItem>
                                <SelectItem value="correction">{t("bankCategoryCorrection")}</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Select
                              value={importRowEdits[idx]?.category || "revenue_delivery"}
                              onValueChange={(v) => setImportRowEdit(idx, "category", v)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="revenue_delivery">{t("bankRevenueDelivery") || "배달앱"}</SelectItem>
                                <SelectItem value="revenue_card">{t("bankRevenueCard") || "카드"}</SelectItem>
                                <SelectItem value="revenue_qr">{t("bankRevenueQr") || "QR/이체"}</SelectItem>
                                <SelectItem value="revenue_cash">{t("bankRevenueCash") || "현금"}</SelectItem>
                                <SelectItem value="receivable_receive">{t("bankCategoryReceivableReceive") || "매출 수령"}</SelectItem>
                                <SelectItem value="loan">{t("bankCategoryLoan")}</SelectItem>
                                <SelectItem value="advance">{t("bankCategoryAdvance")}</SelectItem>
                                <SelectItem value="unclassified">{t("bankCategoryUnclassified")}</SelectItem>
                                <SelectItem value="correction">{t("bankCategoryCorrection")}</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                        <td className="p-2">
                          {r.transType === "withdraw" && importRowEdits[idx]?.category === "purchase_payment" ? (
                            <Select
                              value={(importRowEdits[idx]?.vendorCode ?? "") || "__none__"}
                              onValueChange={(v) => setImportRowEdit(idx, "vendorCode", v === "__none__" ? "" : v)}
                              onOpenChange={(open) => !open && setImportVendorSearch("")}
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
                          ) : r.transType === "withdraw" &&
                            !["correction", "loan", "advance", "unclassified", "purchase_payment"].includes(impCat) ? (
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
                                {(impCat === "transfer"
                                  ? accountSubjectOptions.filter((a) => a.type === "transfer")
                                  : accountSubjectOptions.filter((a) => a.type === "expense" && a.pAndLSection !== "cost")
                                ).map((a) => (
                                  <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : r.transType === "deposit" && importRowEdits[idx]?.category === "receivable_receive" ? (
                            <Select
                              value={importRowEdits[idx]?.storeName || "__none__"}
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
                          ) : r.transType === "deposit" && !["correction", "loan", "advance", "unclassified", "receivable_receive"].includes(importRowEdits[idx]?.category || "") ? (
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
                        <td className={`p-2 text-right whitespace-nowrap ${r.amount >= 0 ? "text-green-600" : "text-orange-600 dark:text-orange-400"}`}>
                          {(r.amount ?? 0).toLocaleString()}
                        </td>
                        <td
                          className="p-2 min-w-[220px] max-w-[280px] truncate text-muted-foreground text-xs cursor-pointer hover:bg-muted/50 rounded"
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
                          {r.transType === "deposit" && !["correction", "loan", "advance", "unclassified", "receivable_receive"].includes(importRowEdits[idx]?.category || "") ? (
                            <Input
                              type="date"
                              value={importRowEdits[idx]?.salesDate || (() => { const d = new Date(r.transDate); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) })()}
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
              </div>
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
                      <Select value={newRuleCategory} onValueChange={setNewRuleCategory}>
                        <SelectTrigger className="w-[130px] h-9">
                          <SelectValue placeholder={t("optional")} />
                        </SelectTrigger>
                        <SelectContent>
                          {newRuleTransType === "deposit" ? (
                            <>
                              <SelectItem value="revenue_delivery">{t("bankRevenueDelivery") || "배달앱"}</SelectItem>
                              <SelectItem value="revenue_card">{t("bankRevenueCard") || "카드"}</SelectItem>
                              <SelectItem value="revenue_qr">{t("bankRevenueQr") || "QR/이체"}</SelectItem>
                              <SelectItem value="revenue_cash">{t("bankRevenueCash") || "현금"}</SelectItem>
                              <SelectItem value="receivable_receive">{t("bankCategoryReceivableReceive") || "매출 수령"}</SelectItem>
                              <SelectItem value="loan">{t("bankCategoryLoan")}</SelectItem>
                              <SelectItem value="advance">{t("bankCategoryAdvance")}</SelectItem>
                              <SelectItem value="unclassified">{t("bankCategoryUnclassified")}</SelectItem>
                              <SelectItem value="correction">{t("bankCategoryCorrection")}</SelectItem>
                            </>
                          ) : (
                            <>
                              <SelectItem value="transfer">{t("bankCategoryTransfer")}</SelectItem>
                              <SelectItem value="expense">{t("bankCategoryExpense")}</SelectItem>
                              <SelectItem value="purchase_payment">{t("bankCategoryPurchasePayment") || "매입 대금"}</SelectItem>
                              <SelectItem value="loan">{t("bankCategoryLoan")}</SelectItem>
                              <SelectItem value="advance">{t("bankCategoryAdvance")}</SelectItem>
                              <SelectItem value="unclassified">{t("bankCategoryUnclassified")}</SelectItem>
                              <SelectItem value="correction">{t("bankCategoryCorrection")}</SelectItem>
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
                            const catLabel = rule.transType === "deposit"
                              ? (rule.category === "revenue_delivery" ? (t("bankRevenueDelivery") || "배달앱") : rule.category === "revenue_card" ? (t("bankRevenueCard") || "카드") : rule.category === "revenue_qr" ? (t("bankRevenueQr") || "QR/이체") : rule.category === "revenue_cash" ? (t("bankRevenueCash") || "현금") : rule.category === "receivable_receive" ? (t("bankCategoryReceivableReceive") || "매출 수령") : rule.category)
                              : (rule.category === "transfer" ? t("bankCategoryTransfer") : rule.category === "expense" || rule.category === "fixed" ? t("bankCategoryExpense") : rule.category === "purchase_payment" ? (t("bankCategoryPurchasePayment") || "매입 대금") : rule.category)
                            const sub = (rule.transType === "deposit" ? revenueAccountOptions : accountSubjectOptions).find((a) => a.id === rule.accountSubjectId)
                            return (
                              <tr key={rule.id} className={`border-t ${isEditing ? "bg-primary/5" : ""}`}>
                                <td className="p-2 font-mono text-xs">{rule.keyword}</td>
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
                                    <Select value={newRuleCategory} onValueChange={setNewRuleCategory}>
                                      <SelectTrigger className="h-8 w-[130px]">
                                        <SelectValue placeholder={t("optional")} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {newRuleTransType === "deposit" ? (
                                          <>
                                            <SelectItem value="revenue_delivery">{t("bankRevenueDelivery") || "배달앱"}</SelectItem>
                                            <SelectItem value="revenue_card">{t("bankRevenueCard") || "카드"}</SelectItem>
                                            <SelectItem value="revenue_qr">{t("bankRevenueQr") || "QR/이체"}</SelectItem>
                                            <SelectItem value="revenue_cash">{t("bankRevenueCash") || "현금"}</SelectItem>
                                            <SelectItem value="receivable_receive">{t("bankCategoryReceivableReceive") || "매출 수령"}</SelectItem>
                                            <SelectItem value="loan">{t("bankCategoryLoan")}</SelectItem>
                                            <SelectItem value="advance">{t("bankCategoryAdvance")}</SelectItem>
                                            <SelectItem value="unclassified">{t("bankCategoryUnclassified")}</SelectItem>
                                            <SelectItem value="correction">{t("bankCategoryCorrection")}</SelectItem>
                                          </>
                                        ) : (
                                          <>
                                            <SelectItem value="transfer">{t("bankCategoryTransfer")}</SelectItem>
                                            <SelectItem value="expense">{t("bankCategoryExpense")}</SelectItem>
                                            <SelectItem value="purchase_payment">{t("bankCategoryPurchasePayment") || "매입 대금"}</SelectItem>
                                            <SelectItem value="loan">{t("bankCategoryLoan")}</SelectItem>
                                            <SelectItem value="advance">{t("bankCategoryAdvance")}</SelectItem>
                                            <SelectItem value="unclassified">{t("bankCategoryUnclassified")}</SelectItem>
                                            <SelectItem value="correction">{t("bankCategoryCorrection")}</SelectItem>
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
                                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => handleEditMemoRule(rule)} title={t("btn_edit") || "수정"}>
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

      <Dialog open={accountManageOpen} onOpenChange={(open) => { setAccountManageOpen(open); if (!open) { setEditingAccountId(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("bankAccountManage")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-auto">
            {accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">{t("bankNoAccountHintShort")}</p>
            ) : (
              accounts.map((a) => (
                <div key={a.id} className="rounded-lg border p-3 space-y-2">
                  {editingAccountId === a.id ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground block mb-0.5">{t("bankName") || "은행명"}</label>
                          <Input
                            value={editAccountForm.bankName}
                            onChange={(e) => setEditAccountForm((p) => ({ ...p, bankName: e.target.value }))}
                            className="h-8 text-sm"
                            placeholder={t("bankName")}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-0.5">{t("bankAccount")}</label>
                          <Input
                            value={editAccountForm.name}
                            onChange={(e) => setEditAccountForm((p) => ({ ...p, name: e.target.value }))}
                            className="h-8 text-sm"
                            placeholder={t("bankAccount")}
                          />
                        </div>
                      </div>
                      {isOffice && (
                        <div>
                          <label className="text-xs text-muted-foreground block mb-0.5">{t("store")}</label>
                          <Select value={editAccountForm.store || "본사"} onValueChange={(v) => setEditAccountForm((p) => ({ ...p, store: v }))}>
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {storeOptionsDeduped.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {OFFICE_STORES.map((o) => o.trim().toLowerCase()).includes(s.trim().toLowerCase()) ? (t("pettyScopeOffice") || "본사") : s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground block mb-0.5">{t("bankCarryOverAmount") || "이월금액"}</label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={editAccountForm.openingBalance}
                            onChange={(e) => setEditAccountForm((p) => ({ ...p, openingBalance: e.target.value.replace(/\D/g, "") }))}
                            className="h-8 text-sm text-right"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-0.5">{t("bankCarryOverDate") || "기준일"}</label>
                          <Input
                            type="date"
                            value={editAccountForm.openingBalanceDate}
                            onChange={(e) => setEditAccountForm((p) => ({ ...p, openingBalanceDate: e.target.value }))}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="outline" onClick={() => { setEditingAccountId(null); }} disabled={accountManageSaving}>
                          {t("cancel")}
                        </Button>
                        <Button size="sm" onClick={handleSaveAccountEdit} disabled={accountManageSaving || !editAccountForm.name.trim()}>
                          {accountManageSaving ? "..." : t("btn_save")}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {a.bankName ? `[${a.bankName}] ` : ""}{a.name} {a.store ? `(${a.store})` : ""}
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => {
                              setEditingAccountId(a.id)
                              setEditAccountForm({
                                name: a.name,
                                bankName: a.bankName || "",
                                store: a.store || "본사",
                                openingBalance: a.openingBalance != null && a.openingBalance !== 0 ? String(a.openingBalance) : "",
                                openingBalanceDate: a.openingBalanceDate || "",
                              })
                            }}
                          >
                            <PenLine className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteAccount(a.id)}
                            disabled={accountDeletingId !== null}
                          >
                            {accountDeletingId === a.id ? "..." : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bankQuickMemosEditOpen} onOpenChange={setBankQuickMemosEditOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("bankQuickMemosEditTitle") || "자주 쓰는 메모 편집"}</DialogTitle>
            <DialogDescription className="text-left">
              {t("bankQuickMemosEditHint") ||
                "이 브라우저에만 저장됩니다. 다른 PC나 브라우저와는 공유되지 않습니다."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 overflow-y-auto flex-1 min-h-0 max-h-[min(420px,50vh)] py-1 pr-1">
            {bankQuickMemosDraft.map((line, i) => (
              <div key={`draft-${i}`} className="flex gap-2 items-center">
                <Input
                  value={line}
                  onChange={(e) => {
                    const v = e.target.value
                    setBankQuickMemosDraft((prev) => prev.map((x, j) => (j === i ? v : x)))
                  }}
                  placeholder={t("bankQuickMemosLinePlaceholder") || "문구"}
                  className="h-9 text-sm flex-1 min-w-0"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground"
                  onClick={() => setBankQuickMemosDraft((prev) => prev.filter((_, j) => j !== i))}
                  title={t("delete") || "삭제"}
                  aria-label={t("delete") || "삭제"}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start shrink-0"
            onClick={() => setBankQuickMemosDraft((p) => [...p, ""])}
          >
            <Plus className="h-4 w-4 mr-1" aria-hidden />
            {t("bankQuickMemosAddLine") || "항목 추가"}
          </Button>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
            <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => void resetBankQuickMemosToDefault()}>
              {t("bankQuickMemosResetDefault") || "기본값으로 되돌리기"}
            </Button>
            <div className="flex gap-2 justify-end w-full sm:w-auto">
              <Button type="button" variant="outline" onClick={() => setBankQuickMemosEditOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="button" onClick={() => void saveBankQuickMemosFromDialog()}>
                {t("btn_save")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!memoPreviewText} onOpenChange={(open) => !open && setMemoPreviewText(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("bankMemoLabel") || "은행 적요"}</DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap break-words text-sm py-2">{getMemo(memoPreviewText ?? undefined) || memoPreviewText || ""}</p>
        </DialogContent>
      </Dialog>

      <Dialog open={!!invoicePhotoPreviewUrl} onOpenChange={(open) => !open && setInvoicePhotoPreviewUrl(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("poInvoice") || "인보이스"}</DialogTitle>
          </DialogHeader>
          <ImageViewerWithRotate
            src={invoicePhotoPreviewUrl || ""}
            alt=""
            imgClassName="max-h-[70vh] w-full object-contain rounded"
            rotateLeftLabel={t("imageRotateLeft") || "반시계"}
            rotateRightLabel={t("imageRotateRight") || "시계"}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!invoiceLinkRow} onOpenChange={(open) => !open && setInvoiceLinkRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("bankInvoiceCheckTitle") || "인보이스 수령 체크"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {invoiceLinkRow?.vendorCode
              ? (t("bankInvoiceLinkPrompt") || "이 건을 발주서와 연동하시겠습니까? 연동 시 발주서 인보이스 상태와 동기화됩니다.")
              : (t("bankInvoiceCheckOnly") || "인보이스 수령 체크만 합니다. (발주서 연동 없음)")}
          </p>
          {invoiceLinkRow?.vendorCode && invoiceLinkPOList.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground block">{t("bankLinkPO") || "발주서 연동"}</label>
              <Select value={invoiceLinkSelectedPO} onValueChange={setInvoiceLinkSelectedPO}>
                <SelectTrigger>
                  <SelectValue placeholder={t("bankLinkPOSelect") || "선택 (연동 없으면 체크만)"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— {t("bankInvoiceCheckOnly") || "연동 없이 체크만"}</SelectItem>
                  {invoiceLinkPOList.map((po) => (
                    <SelectItem key={po.id} value={String(po.id)}>
                      {po.po_no || `#${po.id}`} {po.vendor_name || ""} ฿{(po.total ?? 0).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {invoiceLinkRow?.vendorCode && invoiceLinkPOList.length === 0 && (
            <p className="text-xs text-muted-foreground">{t("bankNoPOForVendor") || "해당 거래처 발주서가 없습니다. 연동 없이 체크만 합니다."}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setInvoiceLinkRow(null)}>{t("cancel")}</Button>
            <Button size="sm" onClick={handleInvoiceLinkConfirm} disabled={updatingInvoiceId !== null}>
              {updatingInvoiceId !== null ? "..." : t("msg_done")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!registerActionRow} onOpenChange={(open) => !open && setRegisterActionRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("bankRegisterLabel") || "지출 등록"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {registerActionRow ? `${registerActionRow.transDate} · ฿${Math.abs(registerActionRow.amount || 0).toLocaleString()}` : ""}
          </p>
          <div className="grid grid-cols-1 gap-2 pt-2">
            <Button
              type="button"
              onClick={() => {
                if (!registerActionRow) return
                setRegisterActionRow(null)
                openApprovedPick(registerActionRow)
              }}
            >
              {tt("expensePlanTab", "지급예정")} {tt("btnSelect", "선택")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!registerActionRow) return
                const r = registerActionRow
                const amt = Math.abs(r.amount ?? 0)
                const bankMemo = (r.memo || "").trim().slice(0, 500)
                const bankNote = stripWithdrawalCategoryMetaFromNote((r.note || "").trim()).slice(0, 500)
                const q = new URLSearchParams({ tab: "expenseRegister" })
                if (r.id) q.set("bankTransactionId", String(r.id))
                if (amt > 0) q.set("amount", String(amt))
                if (bankMemo) q.set("bankMemo", bankMemo)
                if (bankNote) q.set("bankNote", bankNote)
                if (r.transDate) q.set("transDate", r.transDate)
                if (accountId) q.set("accountId", accountId)
                if (selectedAccountStore) q.set("storeName", selectedAccountStore)
                if (r.category) q.set("category", r.category)
                q.set("startStr", startStr)
                q.set("endStr", endStr)
                q.set("returnTab", "query")
                if (r.id) q.set("openRegisterTxId", String(r.id))
                setRegisterActionRow(null)
                router.push(`/admin/expense-management?${q.toString()}`)
              }}
            >
              {t("bankRegisterLink") || "신규 지출 등록"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!approvedPickRow}
        onOpenChange={(open) => {
          if (!open) {
            setApprovedPickRow(null)
            setApprovedPickList([])
            setApprovedPickId("")
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tt("expensePlanTab", "지급예정")} {tt("btnSelect", "선택")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            {approvedPickRow ? `${approvedPickRow.transDate} · ฿${Math.abs(approvedPickRow.amount || 0).toLocaleString()}` : ""}
          </p>
          {approvedPickLoading ? (
            <p className="text-sm text-muted-foreground py-4">{t("loading") || "로딩..."}</p>
          ) : approvedPickList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              {t("payableEmpty") || "해당 일자 승인 지급예정이 없습니다."}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {(t("date") || "날짜")}: {approvedPickRow?.transDate || "-"} / {(t("amount") || "금액")}: ฿{Math.abs(Number(approvedPickRow?.amount || 0)).toLocaleString()}
              </p>
              <Select value={approvedPickId || "__none__"} onValueChange={(v) => setApprovedPickId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={`${tt("expensePlanTab", "지급예정")} ${tt("btnSelect", "선택")}`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {approvedPickList.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {(p.dueDate || p.expenseDate || "-")} · {p.payeeName} ({p.payeeCode || "-"}) / ฿{(p.remainingAmount || 0).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(() => {
                const selected = approvedPickList.find((x) => String(x.id) === String(approvedPickId))
                if (!selected || !approvedPickRow) return null
                const bankAmt = Math.abs(Number(approvedPickRow.amount || 0))
                const remain = Math.abs(Number(selected.remainingAmount || 0))
                if (Math.abs(bankAmt - remain) <= 0.01) return null
                return (
                  <p className="text-xs text-destructive">
                    통장 금액과 선택한 지급예정 잔액이 다릅니다. (통장 ฿{bankAmt.toLocaleString()} / 잔액 ฿{remain.toLocaleString()})
                  </p>
                )
              })()}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setApprovedPickRow(null)}>
                  {t("cancel") || "취소"}
                </Button>
                <Button
                  onClick={async () => {
                    if (!approvedPickRow?.id || !approvedPickId) return
                    const selected = approvedPickList.find((x) => String(x.id) === String(approvedPickId))
                    const bankAmt = Math.abs(Number(approvedPickRow.amount || 0))
                    const remain = Math.abs(Number(selected?.remainingAmount || 0))
                    if (!selected || Math.abs(bankAmt - remain) > 0.01) {
                      await appAlert(tt("bankPlanAmountMismatch", "통장 금액과 선택한 지급예정 잔액이 일치해야 합니다."))
                      return
                    }
                    setApprovedPickSaving(true)
                    try {
                      const res = await executeExpensePayment({
                        expenseAccrualId: Number(approvedPickId),
                        paymentMethod: "bank",
                        amount: Math.abs(Number(approvedPickRow.amount || 0)),
                        transDate: String(approvedPickRow.transDate || "").slice(0, 10),
                        memo: stripWithdrawalCategoryMetaFromNote(
                          (approvedPickRow.note || approvedPickRow.memo || "").trim()
                        ),
                        bankTransactionId: Number(approvedPickRow.id),
                        userName: auth?.user,
                        userRole: auth?.role,
                      })
                      if (!res.success) {
                        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
                        return
                      }
                      setApprovedPickRow(null)
                      setApprovedPickList([])
                      setApprovedPickId("")
                      loadData()
                    } finally {
                      setApprovedPickSaving(false)
                    }
                  }}
                  disabled={!approvedPickId || approvedPickSaving || (() => {
                    const selected = approvedPickList.find((x) => String(x.id) === String(approvedPickId))
                    const bankAmt = Math.abs(Number(approvedPickRow?.amount || 0))
                    const remain = Math.abs(Number(selected?.remainingAmount || 0))
                    return !selected || Math.abs(bankAmt - remain) > 0.01
                  })()}
                >
                  {approvedPickSaving ? "..." : (t("btnSave") || "저장")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!registerExpenseRow} onOpenChange={(open) => !open && (setRegisterExpenseRow(null), setRegisterEditMode(false))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("bankRegisterExpense") || "지출 발생으로 등록"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            {registerExpenseRow ? `${registerExpenseRow.transDate} · ฿${Math.abs(registerExpenseRow.amount || 0).toLocaleString()}` : ""}
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("vendor") || "지급처"}</label>
              <Select value={registerPayeeManual ? "__manual__" : (registerPayeeCode || "__none__")} onValueChange={(v) => { setRegisterPayeeManual(v === "__manual__"); if (v !== "__manual__" && v !== "__none__") { setRegisterPayeeCode(v); setRegisterPayeeName(vendorOptions.find((x) => x.code === v)?.name || v) } else if (v === "__manual__") { setRegisterPayeeCode(""); setRegisterPayeeName("") } }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("vendor") || "거래처 선택 또는 직접 입력"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual__">{t("bankRegisterPayeeManual") || "직접 입력"}</SelectItem>
                  <SelectItem value="__none__">—</SelectItem>
                  {vendorOptions.map((v) => (
                    <SelectItem key={v.code} value={v.code}>{v.name || v.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {registerPayeeManual ? (
                <div className="flex gap-2 mt-2">
                  <Input placeholder={t("expensePayeeCode") || "지급처 코드"} value={registerPayeeCode} onChange={(e) => setRegisterPayeeCode(e.target.value)} className="flex-1" />
                  <Input placeholder={t("expensePayeeName") || "지급처명"} value={registerPayeeName} onChange={(e) => setRegisterPayeeName(e.target.value)} className="flex-1" />
                </div>
              ) : null}
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("accountSubject") || "계정과목"}</label>
              <Select value={registerAccountSubjectId || "__none__"} onValueChange={(v) => setRegisterAccountSubjectId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("accountSubject") || "계정과목"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {accountSubjectOptions.filter((a) => a.type === "expense").map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.code} {getAccountSubjectLabel(a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setRegisterExpenseRow(null)}>{t("cancel")}</Button>
            <Button
              disabled={registerSaving || !(registerPayeeManual ? (registerPayeeCode.trim() || registerPayeeName.trim()) : registerPayeeCode)}
              onClick={async () => {
                if (!registerExpenseRow?.id) return
                const code = (registerPayeeCode || "").trim()
                const name = (registerPayeeName || code).trim()
                if (!code && !name) return
                setRegisterSaving(true)
                try {
                  const res = await registerExpenseFromBankTransaction({
                    bankTransactionId: registerExpenseRow.id,
                    payeeCode: code || name,
                    payeeName: name || code,
                    accountSubjectId: registerAccountSubjectId ? Number(registerAccountSubjectId) : null,
                    userName: auth?.user,
                    userRole: auth?.role,
                    updateExisting: registerEditMode,
                  })
                  if (res.success) {
                    setRegisterExpenseRow(null)
                    setRegisterEditMode(false)
                    loadData()
                    await appAlert(translateApiMessage(res.message, t) || res.message || t("success"))
                  } else {
                    await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
                  }
                } finally {
                  setRegisterSaving(false)
                }
              }}
            >
              {registerSaving ? "..." : (t("btnSave") || "저장")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!registerPurchaseRow}
        onOpenChange={(open) =>
          !open && (setRegisterPurchaseRow(null), setRegisterEditMode(false), setRegisterPurchaseLinkedOrderId(""))
        }
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("bankRegisterPurchase") || "매입 발생으로 등록"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            {registerPurchaseRow ? `${registerPurchaseRow.transDate} · ฿${Math.abs(registerPurchaseRow.amount || 0).toLocaleString()}` : ""}
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("vendor") || "거래처"}</label>
              <Select value={registerVendorManual ? "__manual__" : (registerVendorCode || "__none__")} onValueChange={(v) => { setRegisterVendorManual(v === "__manual__"); if (v === "__manual__") setRegisterVendorCode(""); else if (v !== "__none__") setRegisterVendorCode(v) }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("vendor") || "거래처 선택 또는 직접 입력"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual__">{t("bankRegisterPayeeManual") || "직접 입력"}</SelectItem>
                  <SelectItem value="__none__">—</SelectItem>
                  {vendorOptions.map((v) => (
                    <SelectItem key={v.code} value={v.code}>{v.name || v.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {registerVendorManual && (
                <Input placeholder={t("vendor") || "거래처 코드"} value={registerVendorCode} onChange={(e) => setRegisterVendorCode(e.target.value)} className="mt-2" />
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("bankRegisterLinkedOrderId")}</label>
              <Input
                inputMode="numeric"
                placeholder={t("bankRegisterLinkedOrderIdPlaceholder")}
                value={registerPurchaseLinkedOrderId}
                onChange={(e) => setRegisterPurchaseLinkedOrderId(e.target.value.replace(/\D/g, ""))}
                className="font-mono"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setRegisterPurchaseRow(null)}>{t("cancel")}</Button>
            <Button
              disabled={registerSaving || !registerVendorCode.trim()}
              onClick={async () => {
                if (!registerPurchaseRow?.id) return
                setRegisterSaving(true)
                try {
                  const oid = registerPurchaseLinkedOrderId.trim()
                  const linkedOrderId = oid ? Number(oid) : undefined
                  const res = await registerPurchaseFromBankTransaction({
                    bankTransactionId: registerPurchaseRow.id,
                    vendorCode: registerVendorCode.trim() || "",
                    linkedOrderId: linkedOrderId != null && !isNaN(linkedOrderId) && linkedOrderId > 0 ? linkedOrderId : undefined,
                    userName: auth?.user,
                    userRole: auth?.role,
                    updateExisting: registerEditMode,
                  })
                  if (res.success) {
                    setRegisterPurchaseRow(null)
                    setRegisterEditMode(false)
                    setRegisterPurchaseLinkedOrderId("")
                    loadData()
                    await appAlert(translateApiMessage(res.message, t) || res.message || t("success"))
                  } else {
                    await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
                  }
                } finally {
                  setRegisterSaving(false)
                }
              }}
            >
              {registerSaving ? "..." : (t("btnSave") || "저장")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
