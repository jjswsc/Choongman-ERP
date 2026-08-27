"use client"
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
import { Search, Plus, Pencil, Trash2, CreditCard, Link2, Landmark, ListTree } from "lucide-react"
import {
  AdminDesktopOnly,
  AdminMobileOnly,
  AdminTableScroll,
} from "@/components/erp/admin-responsive-list"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { VendorRdSearchButton } from "@/components/erp/vendor-rd-search"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { useSearchParams, useRouter } from "next/navigation"
import { useErpPageActiveRef } from "@/lib/erp-page-visibility"
import {
  getCardAccounts,
  getCardTransactions,
  saveCardAccount,
  saveCardTransaction,
  deleteCardAccount,
  deleteCardTransaction,
  getAccountSubjects,
  getVendorsForPurchase,
  getBankAccounts,
  getUnlinkedBankWithdrawalsForCard,
  registerCardExpenseFromBankTransaction,
  getCardBillAllocation,
  saveCardBillAllocation,
  translateTexts,
  useStoreList,
  type CardAccount,
  type CardTransaction,
  type AccountSubjectItem,
  type BankAccount,
  type UnlinkedBankWithdrawalForCard,
} from "@/lib/api-client"
import { translateApiMessage } from "@/lib/translate-api-message"
import { formatBankAccountLabel } from "@/lib/bank-account-display"
import { normalizeMoneyInputString, parseMoneyAmount } from "@/lib/money-amount"
import { splitVatFromInclusiveGross } from "@/lib/expense-fee-vat"
import { readLastCardAccountId, writeLastCardAccountId } from "@/lib/card-last-account"

function todayStrBkk() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

type AllocationLineForm = {
  key: string
  id?: number
  accountSubjectId: string
  amount: string
  memo: string
  vatAmount: string
  invoiceReceived: boolean
  invoiceNo: string
  vendorCode: string
}

function newAllocationLine(): AllocationLineForm {
  return {
    key: `line-${Date.now()}-${Math.random()}`,
    accountSubjectId: "",
    amount: "",
    memo: "",
    vatAmount: "",
    invoiceReceived: false,
    invoiceNo: "",
    vendorCode: "",
  }
}

export function CardManagementTab() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pageActiveRef = useErpPageActiveRef()
  const { lang } = useLang()
  const t = useT(lang)
  const tt = React.useCallback((key: string, fallback: string) => {
    const v = t(key)
    if (!v || v === key) return fallback
    return v
  }, [t])
  const { auth } = useAuth()
  const { posStores: rawStores, loading: storesLoading } = useStoreList()
  const stores = React.useMemo(
    () =>
      [...(rawStores || [])]
        .filter((s) => s && String(s).trim())
        .sort((a, b) => {
          const lower = (x: string) => String(x).toLowerCase()
          const aOffice = ["office", "본사", "오피스"].includes(lower(a)) || lower(a).includes("office")
          const bOffice = ["office", "본사", "오피스"].includes(lower(b)) || lower(b).includes("office")
          if (aOffice && !bOffice) return -1
          if (!aOffice && bOffice) return 1
          return a.localeCompare(b)
        }),
    [rawStores]
  )
  const asDisplayName = (a: AccountSubjectItem) => (lang === "ko" ? a.name : (a.nameEn || a.name))

  const [cardAccounts, setCardAccounts] = React.useState<CardAccount[]>([])
  const [transactions, setTransactions] = React.useState<CardTransaction[]>([])
  const [accountSubjects, setAccountSubjects] = React.useState<AccountSubjectItem[]>([])
  const [vendors, setVendors] = React.useState<{ code: string; name: string }[]>([])
  const [loading, setLoading] = React.useState(false)

  const [filterStore, setFilterStore] = React.useState<string>("__all__")
  const [filterCardId, setFilterCardId] = React.useState<string>("__all__")
  const [startStr, setStartStr] = React.useState(todayStrBkk)
  const [endStr, setEndStr] = React.useState(todayStrBkk)

  const [accountDialogOpen, setAccountDialogOpen] = React.useState(false)
  const [editingAccount, setEditingAccount] = React.useState<CardAccount | null>(null)
  const [accountFormName, setAccountFormName] = React.useState("")
  const [accountFormMemo, setAccountFormMemo] = React.useState("")
  const [accountFormStore, setAccountFormStore] = React.useState<string>("__none__")
  const [accountFormCardNumber, setAccountFormCardNumber] = React.useState("")
  const [accountFormHolderName, setAccountFormHolderName] = React.useState("")
  const [accountFormCardCompany, setAccountFormCardCompany] = React.useState("")
  const [accountSaving, setAccountSaving] = React.useState(false)

  const [transDialogOpen, setTransDialogOpen] = React.useState(false)
  const [editingTrans, setEditingTrans] = React.useState<CardTransaction | null>(null)
  const [transFormCardId, setTransFormCardId] = React.useState("")
  const [transFormDate, setTransFormDate] = React.useState(todayStrBkk)
  const [transFormType, setTransFormType] = React.useState<"charge" | "expense">("expense")
  const [transFormAmount, setTransFormAmount] = React.useState("")
  const [transFormMemo, setTransFormMemo] = React.useState("")
  const [transFormVendor, setTransFormVendor] = React.useState("")
  const [transFormSubjectId, setTransFormSubjectId] = React.useState("__none__")
  const [transFormNote, setTransFormNote] = React.useState("")
  const [transSaving, setTransSaving] = React.useState(false)
  const [deletingId, setDeletingId] = React.useState<number | null>(null)
  const [memoTransMap, setMemoTransMap] = React.useState<Record<string, string>>({})

  const [bankAccounts, setBankAccounts] = React.useState<BankAccount[]>([])
  const [bankAccountId, setBankAccountId] = React.useState<string>("")
  const [unlinkedBankRows, setUnlinkedBankRows] = React.useState<UnlinkedBankWithdrawalForCard[]>([])
  const [unlinkedBankLoading, setUnlinkedBankLoading] = React.useState(false)
  const [bankLinkRow, setBankLinkRow] = React.useState<UnlinkedBankWithdrawalForCard | null>(null)
  const [bankLinkCardId, setBankLinkCardId] = React.useState("")
  const [bankLinkSubjectId, setBankLinkSubjectId] = React.useState("__none__")
  const [bankLinkMemo, setBankLinkMemo] = React.useState("")
  const [bankLinkSaving, setBankLinkSaving] = React.useState(false)

  const [allocateParentId, setAllocateParentId] = React.useState<number | null>(null)
  const [allocateHeader, setAllocateHeader] = React.useState<{
    totalAmount: number
    memo: string | null
    transDate: string
  } | null>(null)
  const [allocateLines, setAllocateLines] = React.useState<AllocationLineForm[]>([newAllocationLine()])
  const [allocateLoading, setAllocateLoading] = React.useState(false)
  const [allocateSaving, setAllocateSaving] = React.useState(false)

  React.useEffect(() => {
    const accountMemos = cardAccounts.map((a) => (a.memo || "").trim()).filter(Boolean)
    const transMemos = transactions.map((tx) => (tx.memo || "").trim()).filter(Boolean)
    const memos = [...new Set([...accountMemos, ...transMemos])]
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
  }, [cardAccounts, transactions, lang])

  React.useEffect(() => {
    getBankAccounts({ userRole: auth?.role, userStore: auth?.store })
      .then((list) => {
        const accounts = list || []
        setBankAccounts(accounts)
        setBankAccountId((prev) => prev || (accounts[0]?.id ? String(accounts[0].id) : ""))
      })
      .catch(() => setBankAccounts([]))
  }, [auth?.role, auth?.store])

  const loadUnlinkedBank = React.useCallback(async () => {
    const accountId = Number(bankAccountId || 0)
    if (!accountId || !startStr || !endStr) {
      setUnlinkedBankRows([])
      return
    }
    setUnlinkedBankLoading(true)
    try {
      const res = await getUnlinkedBankWithdrawalsForCard({ accountId, startStr, endStr })
      setUnlinkedBankRows(res.list || [])
    } catch {
      setUnlinkedBankRows([])
    } finally {
      setUnlinkedBankLoading(false)
    }
  }, [bankAccountId, startStr, endStr])

  const selectedBankAccount = React.useMemo(
    () => bankAccounts.find((a) => String(a.id) === String(bankAccountId)) ?? null,
    [bankAccounts, bankAccountId]
  )

  React.useEffect(() => {
    const acc = bankAccounts.find((a) => String(a.id) === String(bankAccountId))
    const store = String(acc?.store || "").trim()
    if (store) setFilterStore(store)
  }, [bankAccountId, bankAccounts])

  React.useEffect(() => {
    void loadUnlinkedBank()
  }, [loadUnlinkedBank])

  const openBankLinkDialog = (row: UnlinkedBankWithdrawalForCard) => {
    setBankLinkRow(row)
    setBankLinkMemo(row.memo || "")
    const last = readLastCardAccountId()
    const defaultCard =
      filterCardId !== "__all__"
        ? filterCardId
        : last && filteredCardAccounts.some((a) => String(a.id) === last)
          ? last
        : filteredCardAccounts[0]?.id
          ? String(filteredCardAccounts[0].id)
          : ""
    setBankLinkCardId(defaultCard)
    const prepay = accountSubjects.find((a) => String(a.code || "").trim() === "1160")
    setBankLinkSubjectId(prepay?.id ? String(prepay.id) : "__none__")
  }

  const handleRegisterBankLink = async () => {
    if (!bankLinkRow?.id) return
    const cardId = Number(bankLinkCardId || 0)
    if (!cardId) {
      await appAlert(tt("cardManagementSelectCard", "Select Card"))
      return
    }
    setBankLinkSaving(true)
    try {
      const res = await registerCardExpenseFromBankTransaction({
        bankTransactionId: bankLinkRow.id,
        cardAccountId: cardId,
        accountSubjectId: bankLinkSubjectId !== "__none__" ? Number(bankLinkSubjectId) : undefined,
        memo: bankLinkMemo.trim() || undefined,
        userName: auth?.user,
        userRole: auth?.role,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
        return
      }
      setBankLinkRow(null)
      writeLastCardAccountId(String(cardId))
      await loadTransactions()
      await loadUnlinkedBank()
      if (res.id) {
        await openAllocation(res.id)
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("success"))
      }
    } finally {
      setBankLinkSaving(false)
    }
  }


  const getMemo = React.useCallback((memo: string | undefined | null) => (memo && memoTransMap[memo]) || memo || "-", [memoTransMap])

  const openAllocation = React.useCallback(async (parentId: number) => {
    setAllocateLoading(true)
    setAllocateParentId(parentId)
    try {
      const res = await getCardBillAllocation(parentId)
      if (!res.success || !res.header) {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
        setAllocateParentId(null)
        return
      }
      setAllocateHeader({
        totalAmount: res.header.totalAmount,
        memo: res.header.memo,
        transDate: res.header.transDate,
      })
      const lines =
        res.lines && res.lines.length > 0
          ? res.lines.map((l) => ({
              key: `line-${l.id}`,
              id: l.id,
              accountSubjectId: String(l.accountSubjectId),
              amount: String(l.amount),
              memo: l.memo || "",
              vatAmount: l.vatAmount != null && l.vatAmount > 0 ? String(l.vatAmount) : "",
              invoiceReceived: Boolean(l.invoiceReceived),
              invoiceNo: l.invoiceNo || "",
              vendorCode: l.vendorCode || "",
            }))
          : [newAllocationLine()]
      setAllocateLines(lines)
    } catch {
      await appAlert(t("processFail"))
      setAllocateParentId(null)
    } finally {
      setAllocateLoading(false)
    }
  }, [t])

  const closeAllocation = React.useCallback(() => {
    setAllocateParentId(null)
    setAllocateHeader(null)
    setAllocateLines([newAllocationLine()])
    const q = new URLSearchParams(searchParams.toString())
    if (q.has("allocateId")) {
      q.delete("allocateId")
      router.replace(`/admin/expense-management?${q.toString()}`, { scroll: false })
    }
  }, [router, searchParams])

  const allocateSum = React.useMemo(
    () =>
      allocateLines.reduce((s, l) => {
        return s + parseMoneyAmount(l.amount)
      }, 0),
    [allocateLines]
  )

  const handleSaveAllocation = async () => {
    if (!allocateParentId || !allocateHeader) return
    const lines = allocateLines
      .map((l) => ({
        id: l.id,
        accountSubjectId: Number(l.accountSubjectId || 0),
        amount: parseMoneyAmount(l.amount),
        memo: l.memo.trim() || undefined,
        vatAmount: parseMoneyAmount(l.vatAmount) || undefined,
        invoiceReceived: l.invoiceReceived,
        invoiceNo: l.invoiceReceived ? l.invoiceNo.trim() || undefined : undefined,
        vendorCode: l.vendorCode && l.vendorCode !== "__none__" ? l.vendorCode.trim() : undefined,
      }))
      .filter((l) => l.accountSubjectId > 0 && l.amount > 0)
    if (lines.length === 0) {
      await appAlert(tt("cardManagementAlertAmount", "Please enter amount."))
      return
    }
    setAllocateSaving(true)
    try {
      const res = await saveCardBillAllocation({
        parentId: allocateParentId,
        lines,
        userName: auth?.user,
        userRole: auth?.role,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
        return
      }
      closeAllocation()
      await loadTransactions()
      await appAlert(translateApiMessage(res.message, t) || res.message || t("success"))
    } finally {
      setAllocateSaving(false)
    }
  }

  React.useEffect(() => {
    if (!pageActiveRef.current) return
    const raw = searchParams.get("allocateId")
    const id = Number(raw || 0)
    if (!id || allocateParentId === id) return
    void openAllocation(id)
  }, [searchParams, allocateParentId, openAllocation, pageActiveRef])

  const pendingBillHeaders = React.useMemo(
    () => transactions.filter((tx) => tx.isBillHeader && !tx.allocationComplete),
    [transactions]
  )

  const loadAccounts = React.useCallback(async () => {
    getCardAccounts()
      .then((list) => setCardAccounts(list || []))
      .catch(() => setCardAccounts([]))
  }, [])

  const filteredCardAccounts = React.useMemo(() => {
    if (!filterStore || filterStore === "__all__") return cardAccounts
    return cardAccounts.filter((a) => (a.store || "") === filterStore)
  }, [cardAccounts, filterStore])

  const loadTransactions = React.useCallback(async () => {
    setLoading(true)
    getCardTransactions({
      cardAccountId: filterCardId && filterCardId !== "__all__" ? Number(filterCardId) : undefined,
      startStr,
      endStr,
    })
      .then((r) => setTransactions(r.list || []))
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false))
  }, [filterCardId, startStr, endStr])

  React.useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  React.useEffect(() => {
    loadTransactions()
  }, [loadTransactions])

  React.useEffect(() => {
    if (filterCardId !== "__all__" && filteredCardAccounts.every((a) => String(a.id) !== filterCardId)) {
      setFilterCardId("__all__")
    }
  }, [filterStore, filteredCardAccounts, filterCardId])

  React.useEffect(() => {
    if (filterStore !== "__all__" && filterStore && !stores.includes(filterStore)) {
      setFilterStore("__all__")
    }
  }, [filterStore, stores])

  React.useEffect(() => {
    Promise.all([
      getAccountSubjects({ forCard: true, excludeHeaders: true }).catch(() => []),
      getVendorsForPurchase().catch(() => []),
    ]).then(([s, v]) => {
      setAccountSubjects(s || [])
      setVendors(v || [])
    })
  }, [])

  const summary = React.useMemo(() => {
    const headers = transactions.filter((tx) => tx.isBillHeader)
    const billTotal = headers.reduce((s, h) => s + (h.amount || 0), 0)
    const allocated = headers.filter((h) => h.allocationComplete).reduce((s, h) => s + (h.amount || 0), 0)
    const pending = headers.filter((h) => !h.allocationComplete).reduce((s, h) => s + (h.amount || 0), 0)
    return { billTotal, allocated, pending }
  }, [transactions])

  const openAccountForm = (a?: CardAccount) => {
    setEditingAccount(a || null)
    setAccountFormName(a?.name || "")
    setAccountFormMemo(a?.memo || "")
    setAccountFormStore(a?.store ? a.store : (filterStore !== "__all__" ? filterStore : "__none__"))
    setAccountFormCardNumber(a?.cardNumber || "")
    setAccountFormHolderName(a?.holderName || "")
    setAccountFormCardCompany(a?.cardCompany || "")
    setAccountDialogOpen(true)
  }

  const handleSaveAccount = async () => {
    if (!accountFormName.trim()) return
    setAccountSaving(true)
    try {
      const res = await saveCardAccount({
        id: editingAccount?.id,
        name: accountFormName.trim(),
        memo: accountFormMemo.trim() || undefined,
        store: accountFormStore && accountFormStore !== "__none__" ? accountFormStore : undefined,
        cardNumber: accountFormCardNumber.trim() || undefined,
        holderName: accountFormHolderName.trim() || undefined,
        cardCompany: accountFormCardCompany.trim() || undefined,
      })
      if (res.success) {
        setAccountDialogOpen(false)
        loadAccounts()
      } else {
        await appAlert(res.message || t("msg_save_fail"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setAccountSaving(false)
    }
  }

  const handleDeleteAccount = async (id: number) => {
    if (!await appConfirm(tt("msg_delete_confirm_check_item", "Delete this item?"))) return
    try {
      const res = await deleteCardAccount({ id })
      if (res.success) {
        loadAccounts()
        loadTransactions()
      } else {
        await appAlert(res.message || t("msg_delete_fail"))
      }
    } catch (e) {
      await appAlert(String(e))
    }
  }

  const openTransForm = (tx?: CardTransaction) => {
    if (tx?.isBillHeader) {
      if (tx.id) void openAllocation(tx.id)
      return
    }
    if (tx?.parentId) {
      void openAllocation(tx.parentId)
      return
    }
    setEditingTrans(tx || null)
    const list = filterStore && filterStore !== "__all__"
      ? cardAccounts.filter((a) => (a.store || "") === filterStore)
      : cardAccounts
    const last = readLastCardAccountId()
    setTransFormCardId(
      tx
        ? String(tx.cardAccountId)
        : last && list.some((a) => String(a.id) === last)
          ? last
          : list[0]
            ? String(list[0].id)
            : ""
    )
    setTransFormDate(tx?.transDate || todayStrBkk())
    setTransFormType(tx?.transType || "expense")
    setTransFormAmount(tx ? String(tx.amount) : "")
    setTransFormMemo(tx?.memo || "")
    setTransFormVendor(tx?.vendorCode || "__none__")
    setTransFormSubjectId(tx?.accountSubjectId ? String(tx.accountSubjectId) : "__none__")
    setTransFormNote(tx?.note || "")
    setTransDialogOpen(true)
  }

  const handleSaveTrans = async () => {
    const cardId = transFormCardId && transFormCardId !== "__all__" ? Number(transFormCardId) : 0
    const amt = Number(String(transFormAmount).replace(/,/g, ""))
    if (!cardId || !transFormDate || amt <= 0) {
      await appAlert(tt("cardManagementAlertCardDateAmount", "Please enter card, date, and amount."))
      return
    }
    setTransSaving(true)
    try {
      const res = await saveCardTransaction({
        id: editingTrans?.id,
        cardAccountId: cardId,
        transDate: transFormDate,
        transType: transFormType,
        amount: amt,
        memo: transFormMemo.trim() || undefined,
        vendorCode: transFormType === "expense" && transFormVendor && transFormVendor !== "__none__" ? transFormVendor.trim() : undefined,
        accountSubjectId: transFormType === "expense" && transFormSubjectId && transFormSubjectId !== "__none__" ? Number(transFormSubjectId) : undefined,
        note: transFormType === "expense" ? transFormNote.trim() || undefined : undefined,
      })
      if (res.success) {
        writeLastCardAccountId(String(cardId))
        setTransDialogOpen(false)
        loadTransactions()
      } else {
        await appAlert(res.message || t("msg_save_fail"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setTransSaving(false)
    }
  }

  const handleDeleteTrans = async (id: number) => {
    if (!await appConfirm(tt("msg_delete_confirm_check_item", "Delete this item?"))) return
    setDeletingId(id)
    try {
      const res = await deleteCardTransaction({ id })
      if (res.success) {
        loadTransactions()
      } else {
        await appAlert(res.message || t("msg_delete_fail"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setDeletingId(null)
    }
  }

  const fmt = (n: number) => `฿${(n ?? 0).toLocaleString()}`

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="font-semibold">{tt("cardManagementAccounts", "Card Accounts")}</div>
            <Button size="sm" onClick={() => openAccountForm()} className="gap-1">
              <Plus className="h-4 w-4" />
              {tt("btn_add", "Add")}
            </Button>
          </div>
          {filteredCardAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{tt("cardManagementNoAccounts", "No cards registered. Add a card with the Add button.")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filteredCardAccounts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 bg-muted/30 hover:bg-muted/50"
                >
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{a.name}</span>
                  {a.memo && <span className="text-xs text-muted-foreground truncate max-w-[120px]">{getMemo(a.memo)}</span>}
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openAccountForm(a)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => a.id && handleDeleteAccount(a.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <div className="font-semibold flex items-center gap-2">
                <Landmark className="h-4 w-4 text-muted-foreground" />
                {tt("cardManagementBankLinkTitle", "Link bank card bill payments")}
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                {tt(
                  "cardManagementBankLinkHint",
                  "Register monthly credit card bill withdrawals from bank CSV as card expenses."
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2 mb-3">
            <div className="min-w-[min(100%,28rem)] flex-1">
              <label className="text-xs text-muted-foreground block mb-0.5">
                {tt("cardManagementBankAccount", "Bank account")}
              </label>
              <Select value={bankAccountId || "__none__"} onValueChange={(v) => setBankAccountId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="w-full min-w-[280px] max-w-xl h-9">
                  <SelectValue placeholder={tt("cardManagementBankAccount", "Bank account")}>
                    {selectedBankAccount ? formatBankAccountLabel(selectedBankAccount) : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-w-[min(100vw-2rem,36rem)]">
                  {bankAccounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)} className="whitespace-normal">
                      {formatBankAccountLabel(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" className="h-9" onClick={() => void loadUnlinkedBank()} disabled={unlinkedBankLoading || !bankAccountId}>
              <Search className="h-4 w-4 mr-1" />
              {unlinkedBankLoading ? "..." : tt("cardManagementBankLinkQuery", "Find unlinked withdrawals")}
            </Button>
          </div>
          {unlinkedBankLoading ? (
            <p className="text-sm text-muted-foreground py-4">{t("loading")}</p>
          ) : unlinkedBankRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">{tt("cardManagementNoUnlinkedBank", "No unlinked withdrawals.")}</p>
          ) : (
            <div className="rounded-lg border overflow-auto max-h-[220px]">
              <AdminDesktopOnly>
              <table className="w-full text-sm min-w-[520px]">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="p-2 text-center">{tt("date", "Date")}</th>
                    <th className="p-2 text-right">{tt("pettyColAmount", "Amount")}</th>
                    <th className="p-2 text-left">{tt("memo", "Memo")}</th>
                    <th className="p-2 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {unlinkedBankRows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-2 text-center whitespace-nowrap">{row.transDate}</td>
                      <td className="p-2 text-right tabular-nums font-medium">{fmt(row.amount)}</td>
                      <td className="p-2 text-muted-foreground text-xs">
                        <span className="line-clamp-2" title={row.memo}>{getMemo(row.memo)}</span>
                        {row.likelyCardBill ? (
                          <Badge variant="secondary" className="mt-1 text-[10px]">
                            {tt("cardManagementLikelyCardBill", "Likely card bill")}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="p-2 text-right">
                        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => openBankLinkDialog(row)} disabled={filteredCardAccounts.length === 0}>
                          <Link2 className="h-3.5 w-3.5" />
                          {tt("cardManagementBankLinkRegister", "Register")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </AdminDesktopOnly>
              <AdminMobileOnly className="divide-y divide-border/60">
                {unlinkedBankRows.map((row) => (
                  <div key={row.id} className="space-y-2 px-3 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold tabular-nums">{fmt(row.amount)}</p>
                        <p className="text-[11px] text-muted-foreground">{row.transDate}</p>
                      </div>
                      {row.likelyCardBill ? (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {tt("cardManagementLikelyCardBill", "Likely card bill")}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{getMemo(row.memo)}</p>
                    <Button
                      size="sm"
                      className="h-9 w-full gap-1 text-xs"
                      onClick={() => openBankLinkDialog(row)}
                      disabled={filteredCardAccounts.length === 0}
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      {tt("cardManagementBankLinkRegister", "Register")}
                    </Button>
                  </div>
                ))}
              </AdminMobileOnly>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <div>
              <label className="text-xs text-muted-foreground block mb-0.5">{tt("store", "Store")}</label>
              <Select value={filterStore} onValueChange={setFilterStore} disabled={storesLoading}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder={storesLoading ? tt("loading", "Loading...") : tt("cardManagementAllStores", "All Stores")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{tt("cardManagementAllStores", "All Stores")}</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-0.5">{tt("cardManagementSelectCard", "Card")}</label>
              <Select value={filterCardId} onValueChange={setFilterCardId}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder={tt("cardManagementSelectCard", "Select Card")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{tt("cardManagementAllCards", "All Cards")}</SelectItem>
                  {filteredCardAccounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
            <Button size="sm" onClick={loadTransactions} disabled={loading} className="h-9">
              <Search className="h-4 w-4 mr-1" />
              {tt("btn_query", "Query")}
            </Button>
            <Button size="sm" onClick={() => openTransForm()} disabled={filteredCardAccounts.length === 0} className="h-9 gap-1">
              <Plus className="h-4 w-4" />
              {tt("cardManagementAddTransaction", "Add Transaction")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            {tt("cardManagementManualTxnHint", "월 대금은 통장 출금 연결로 처리하세요. 여기는 예외 수동 입력용입니다.")}
          </p>

          {pendingBillHeaders.length > 0 ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/30 p-3">
              <div className="text-sm font-medium mb-2">{tt("cardManagementAllocatePending", "Allocation pending")}</div>
              <div className="flex flex-wrap gap-2">
                {pendingBillHeaders.map((h) => (
                  <Button
                    key={h.id}
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1"
                    onClick={() => h.id && void openAllocation(h.id)}
                  >
                    <ListTree className="h-3.5 w-3.5" />
                    {h.transDate} · {fmt(h.amount)}
                    {h.remainingAmount != null && h.remainingAmount > 0 ? (
                      <span className="text-amber-700 dark:text-amber-300 text-xs">
                        ({tt("cardManagementAllocateRemaining", "Unallocated")} {fmt(h.remainingAmount)})
                      </span>
                    ) : null}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{tt("cardManagementKpiBillTotal", "월 대금")}</div>
              <div className="text-lg font-semibold tabular-nums">{fmt(summary.billTotal)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{tt("cardManagementKpiAllocated", "배분 완료")}</div>
              <div className="text-lg font-semibold tabular-nums text-green-600">{fmt(summary.allocated)}</div>
            </div>
            <div className="rounded-lg border p-3 bg-primary/5">
              <div className="text-xs text-muted-foreground">{tt("cardManagementKpiPending", "배분 대기")}</div>
              <div className={`text-lg font-bold tabular-nums ${summary.pending > 0 ? "text-amber-700" : "text-primary"}`}>{fmt(summary.pending)}</div>
            </div>
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
          ) : transactions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{tt("pettyNoData", "No transactions found.")}</p>
          ) : (
            <AdminTableScroll className="rounded-lg border max-h-[400px] overflow-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="p-2 text-center">{tt("date", "Date")}</th>
                    <th className="p-2 text-left whitespace-nowrap">{tt("expenseDocumentNo", "Doc No.")}</th>
                    <th className="p-2 text-center">{tt("cardManagementType", "Type")}</th>
                    <th className="p-2 text-left">{tt("vendor", "Vendor")}</th>
                    <th className="p-2 text-left">{tt("accountSubject", "Account Subject")}</th>
                    <th className="p-2 text-right">{tt("pettyColAmount", "Amount")}</th>
                    <th className="p-2 text-left">{tt("memo", "Memo")}</th>
                    <th className="p-2 text-center">{tt("cardManagementBankLinked", "Bank linked")}</th>
                    <th className="p-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const cardName = cardAccounts.find((c) => c.id === tx.cardAccountId)?.name || "-"
                    const vendor = tx.vendorCode ? vendors.find((v) => v.code === tx.vendorCode) : null
                    const sub = tx.accountSubjectId ? accountSubjects.find((a) => a.id === tx.accountSubjectId) : null
                    const isHeader = Boolean(tx.isBillHeader)
                    const isChild = Boolean(tx.parentId)
                    return (
                      <tr key={tx.id} className={`border-t ${isChild ? "bg-muted/20" : ""}`}>
                        <td className="p-2 text-center">{tx.transDate}</td>
                        <td className="p-2 text-left tabular-nums text-xs whitespace-nowrap">
                          {tx.transType === "expense" && !isHeader ? tx.documentNo || "—" : "—"}
                        </td>
                        <td className="p-2 text-center">
                          {isHeader ? (
                            <span className="text-amber-700 dark:text-amber-300 font-medium">
                              {tt("cardManagementBillHeader", "Card bill")}
                            </span>
                          ) : (
                            <span className={tx.transType === "charge" ? "text-green-600" : "text-orange-600"}>
                              {tx.transType === "charge" ? tt("cardManagementCharge", "Charge") : tt("cardManagementExpense", "Expense")}
                            </span>
                          )}
                          {filterCardId === "__all__" && <span className="text-xs text-muted-foreground ml-1">({cardName})</span>}
                          {isChild ? (
                            <Badge variant="outline" className="ml-1 text-[10px]">{tt("cardManagementAllocateLine", "Allocated line")}</Badge>
                          ) : null}
                        </td>
                        <td className="p-2">{!isHeader && tx.transType === "expense" ? (vendor ? `${vendor.name}` : tx.vendorCode || "-") : "-"}</td>
                        <td className="p-2 text-muted-foreground">
                          {!isHeader && tx.transType === "expense" && sub ? `${sub.code} ${asDisplayName(sub)}` : isHeader ? "—" : "-"}
                        </td>
                        <td className={`p-2 text-right tabular-nums font-medium ${tx.transType === "charge" ? "text-green-600" : "text-orange-600"}`}>
                          {isHeader ? (
                            <span className="text-amber-700 dark:text-amber-300">{fmt(tx.amount)}</span>
                          ) : (
                            <>
                              {tx.transType === "charge" ? "+" : "-"}
                              {fmt(tx.amount)}
                            </>
                          )}
                        </td>
                        <td className="p-2 text-muted-foreground text-xs max-w-[160px] truncate" title={tx.memo || undefined}>
                          {getMemo(tx.memo)}
                          {isHeader && !tx.allocationComplete && tx.remainingAmount != null && tx.remainingAmount > 0 ? (
                            <span className="block text-amber-700 dark:text-amber-300">
                              {tt("cardManagementAllocateRemaining", "Unallocated")}: {fmt(tx.remainingAmount)}
                            </span>
                          ) : null}
                        </td>
                        <td className="p-2 text-center">
                          {tx.bankTransactionId ? (
                            <Badge variant="outline" className="text-[10px]">
                              {tt("cardManagementBankLinked", "Bank linked")}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2">
                          <div className="flex gap-1">
                            {isHeader ? (
                              <Button size="icon" variant="ghost" className="h-7 w-7" title={tt("cardManagementAllocateOpen", "Allocate by account")} onClick={() => tx.id && void openAllocation(tx.id)}>
                                <ListTree className="h-3.5 w-3.5" />
                              </Button>
                            ) : !isChild ? (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openTransForm(tx)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button size="icon" variant="ghost" className="h-7 w-7" title={tt("cardManagementAllocateOpen", "Allocate by account")} onClick={() => tx.parentId && void openAllocation(tx.parentId!)}>
                                <ListTree className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => tx.id && handleDeleteTrans(tx.id)} disabled={deletingId === tx.id}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
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

      <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAccount ? tt("cardManagementEditAccount", "Edit Card") : tt("cardManagementAddAccount", "Add Card")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-sm font-medium">{tt("store", "Store")}</label>
              <Select value={accountFormStore} onValueChange={setAccountFormStore}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={tt("optional", "Optional")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{tt("cardManagementAccountName", "Card Name")}</label>
              <Input value={accountFormName} onChange={(e) => setAccountFormName(e.target.value)} className="mt-1" placeholder={t("cardManagementAccountNamePlaceholder")} />
            </div>
            <div>
              <label className="text-sm font-medium">{tt("cardManagementCardNumber", "Card Number")}</label>
              <Input value={accountFormCardNumber} onChange={(e) => setAccountFormCardNumber(e.target.value)} className="mt-1" placeholder={t("cardManagementCardNumberPlaceholder")} type="text" inputMode="numeric" autoComplete="off" />
            </div>
            <div>
              <label className="text-sm font-medium">{tt("cardManagementHolderName", "Holder Name")}</label>
              <Input value={accountFormHolderName} onChange={(e) => setAccountFormHolderName(e.target.value)} className="mt-1" placeholder={t("cardManagementHolderNamePlaceholder")} />
            </div>
            <div>
              <label className="text-sm font-medium">{tt("cardManagementCardCompany", "Card Company (Bank)")}</label>
              <Input value={accountFormCardCompany} onChange={(e) => setAccountFormCardCompany(e.target.value)} className="mt-1" placeholder={t("cardManagementCardCompanyPlaceholder")} />
            </div>
            <div>
              <label className="text-sm font-medium">{tt("memo", "Memo")}</label>
              <Input value={accountFormMemo} onChange={(e) => setAccountFormMemo(e.target.value)} className="mt-1" placeholder={tt("optional", "Optional")} />
            </div>
            <Button onClick={handleSaveAccount} disabled={accountSaving || !accountFormName.trim()} className="w-full">
              {accountSaving ? "..." : tt("btn_save", "Save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={transDialogOpen} onOpenChange={setTransDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTrans ? tt("cardManagementEditTransaction", "Edit Transaction") : tt("cardManagementAddTransaction", "Add Transaction")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-sm font-medium">{tt("cardManagementSelectCard", "Card")}</label>
              <Select value={transFormCardId} onValueChange={setTransFormCardId}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {filteredCardAccounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{tt("cardManagementTransType", "Type")}</label>
              <Select value={transFormType} onValueChange={(v) => setTransFormType(v as "charge" | "expense")}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="charge">{tt("cardManagementChargeFull", "Charge (Bank -> Card Transfer)")}</SelectItem>
                  <SelectItem value="expense">{tt("cardManagementExpenseFull", "Expense (Card Spending)")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm font-medium">{tt("date", "Date")}</label>
                <Input type="date" value={transFormDate} onChange={(e) => setTransFormDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">{tt("pettyColAmount", "Amount")}</label>
                <Input value={transFormAmount} onChange={(e) => setTransFormAmount(e.target.value)} className="mt-1" type="number" placeholder="0" />
              </div>
            </div>
            {transFormType === "expense" && (
              <>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium">{tt("vendor", "Vendor")}</label>
                    <VendorRdSearchButton
                      triggerSize="sm"
                      triggerVariant="ghost"
                      triggerClassName="h-7 px-2 text-[11px]"
                      onPick={(c) => {
                        const matched = vendors.find((v) => v.name.trim() === c.name.trim())
                        if (matched) setTransFormVendor(matched.code)
                        else {
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
                  <Select value={transFormVendor} onValueChange={setTransFormVendor}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {vendors.map((v) => (
                        <SelectItem key={v.code} value={v.code}>{v.name} ({v.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">{tt("accountSubject", "Account Subject")}</label>
                  <Select value={transFormSubjectId} onValueChange={setTransFormSubjectId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {accountSubjects.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">{tt("bankNoteLabel", "Details")}</label>
                  <Input value={transFormNote} onChange={(e) => setTransFormNote(e.target.value)} className="mt-1" placeholder={tt("optional", "Optional")} />
                </div>
              </>
            )}
            <div>
              <label className="text-sm font-medium">{tt("memo", "Memo")}</label>
              <Input value={transFormMemo} onChange={(e) => setTransFormMemo(e.target.value)} className="mt-1" placeholder={transFormType === "charge" ? t("cardManagementMemoChargePlaceholder") : undefined} />
            </div>
            <Button onClick={handleSaveTrans} disabled={transSaving || !transFormCardId || !transFormAmount || Number(transFormAmount) <= 0} className="w-full">
              {transSaving ? "..." : tt("btn_save", "Save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bankLinkRow} onOpenChange={(open) => { if (!open) setBankLinkRow(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tt("cardManagementBankLinkDialogTitle", "Bank withdrawal → card expense")}</DialogTitle>
          </DialogHeader>
          {bankLinkRow ? (
            <div className="space-y-3 pt-2">
              <p className="text-xs text-muted-foreground">{tt("bankCardExpenseAccountHint", "분개: 차변 선급금(전도금 1160) · 대변 현금")}</p>
              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{tt("date", "Date")}</span>
                  <span>{bankLinkRow.transDate}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{tt("pettyColAmount", "Amount")}</span>
                  <span className="font-semibold tabular-nums">{fmt(bankLinkRow.amount)}</span>
                </div>
                {bankLinkRow.memo ? (
                  <div className="text-xs text-muted-foreground pt-1 border-t">{getMemo(bankLinkRow.memo)}</div>
                ) : null}
              </div>
              <div>
                <label className="text-sm font-medium">{tt("cardManagementSelectCard", "Card")}</label>
                <Select value={bankLinkCardId} onValueChange={(v) => {
                  setBankLinkCardId(v)
                  if (v) writeLastCardAccountId(v)
                }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={tt("cardManagementSelectCard", "Select Card")} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCardAccounts.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{tt("memo", "Memo")}</label>
                <Input value={bankLinkMemo} onChange={(e) => setBankLinkMemo(e.target.value)} className="mt-1" />
              </div>
              <Button onClick={() => void handleRegisterBankLink()} disabled={bankLinkSaving || !bankLinkCardId} className="w-full">
                {bankLinkSaving ? "..." : tt("cardManagementBankLinkRegister", "Register as card expense")}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={allocateParentId != null} onOpenChange={(open) => { if (!open) closeAllocation() }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tt("cardManagementAllocateTitle", "Allocate card expense by account")}</DialogTitle>
            <DialogDescription>{tt("cardManagementAllocateHint", "Split the total across expense accounts.")}</DialogDescription>
          </DialogHeader>
          {allocateLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("loading")}</p>
          ) : allocateHeader ? (
            <div className="space-y-3 pt-2">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{tt("cardManagementAllocateTotal", "Card bill total")}</span>
                  <span className="font-semibold tabular-nums">{fmt(allocateHeader.totalAmount)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{tt("cardManagementAllocateRemaining", "Unallocated")}</span>
                  <span className={`font-semibold tabular-nums ${allocateHeader.totalAmount - allocateSum < -0.01 ? "text-destructive" : Math.abs(allocateHeader.totalAmount - allocateSum) > 0.01 ? "text-amber-700" : "text-green-600"}`}>
                    {allocateHeader.totalAmount - allocateSum < -0.01
                      ? `${tt("cardManagementAllocateOver", "초과")} ${fmt(Math.abs(allocateHeader.totalAmount - allocateSum))}`
                      : fmt(Math.max(0, allocateHeader.totalAmount - allocateSum))}
                  </span>
                </div>
                {allocateHeader.memo ? (
                  <div className="text-xs text-muted-foreground pt-1 border-t">{allocateHeader.memo}</div>
                ) : null}
              </div>
              <div className="space-y-3">
                {allocateLines.map((line, idx) => (
                  <div key={line.key} className="rounded-md border p-3 space-y-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_110px_auto] sm:items-end">
                      <div>
                        <label className="text-xs text-muted-foreground">{tt("accountSubject", "Account Subject")}</label>
                        <Select
                          value={line.accountSubjectId || "__none__"}
                          onValueChange={(v) => {
                            const next = [...allocateLines]
                            next[idx] = { ...line, accountSubjectId: v === "__none__" ? "" : v }
                            setAllocateLines(next)
                          }}
                        >
                          <SelectTrigger className="mt-0.5 h-9">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {accountSubjects.map((a) => (
                              <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">{tt("expenseAccrualGrossTotal", "Total (incl. tax)")}</label>
                        <Input
                          className="mt-0.5 h-9"
                          type="text"
                          inputMode="decimal"
                          value={line.amount}
                          onChange={(e) => {
                            const next = [...allocateLines]
                            next[idx] = { ...line, amount: normalizeMoneyInputString(e.target.value) }
                            setAllocateLines(next)
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 text-destructive shrink-0"
                        disabled={allocateLines.length <= 1}
                        onClick={() => setAllocateLines(allocateLines.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs text-muted-foreground">{tt("vendor", "Vendor")}</label>
                        <VendorRdSearchButton
                          triggerSize="sm"
                          triggerVariant="ghost"
                          triggerClassName="h-7 px-2 text-[11px]"
                          onPick={(c) => {
                            const matched = vendors.find((v) => v.name.trim() === c.name.trim())
                            if (matched) {
                              const next = [...allocateLines]
                              next[idx] = { ...line, vendorCode: matched.code }
                              setAllocateLines(next)
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
                      <Select
                        value={line.vendorCode || "__none__"}
                        onValueChange={(v) => {
                          const next = [...allocateLines]
                          next[idx] = { ...line, vendorCode: v === "__none__" ? "" : v }
                          setAllocateLines(next)
                        }}
                      >
                        <SelectTrigger className="mt-0.5 h-9">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">—</SelectItem>
                          {vendors.map((v) => (
                            <SelectItem key={v.code} value={v.code}>{v.name} ({v.code})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">{tt("memo", "Memo")}</label>
                      <Input
                        className="mt-0.5 h-9"
                        value={line.memo}
                        placeholder={tt("cardManagementAllocateMemoPlaceholder", "Expense title / description")}
                        onChange={(e) => {
                          const next = [...allocateLines]
                          next[idx] = { ...line, memo: e.target.value }
                          setAllocateLines(next)
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="w-[110px]">
                        <label className="text-xs text-muted-foreground">{tt("expenseAccrualVat", "VAT")}</label>
                        <Input
                          className="mt-0.5 h-9"
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          value={line.vatAmount}
                          onChange={(e) => {
                            const next = [...allocateLines]
                            next[idx] = { ...line, vatAmount: normalizeMoneyInputString(e.target.value) }
                            setAllocateLines(next)
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={() => {
                          const { vat } = splitVatFromInclusiveGross(parseMoneyAmount(line.amount))
                          const next = [...allocateLines]
                          next[idx] = { ...line, vatAmount: vat > 0 ? String(vat) : "" }
                          setAllocateLines(next)
                        }}
                      >
                        {tt("cardManagementAllocateVat7", "VAT 7%")}
                      </Button>
                      <label className="flex items-center gap-2 cursor-pointer pb-1.5">
                        <Checkbox
                          checked={line.invoiceReceived}
                          onCheckedChange={(c) => {
                            const next = [...allocateLines]
                            next[idx] = { ...line, invoiceReceived: c === true }
                            setAllocateLines(next)
                          }}
                        />
                        <span className="text-sm">{tt("poInvoiceReceived", "Invoice Received")}</span>
                      </label>
                      {line.invoiceReceived ? (
                        <div className="min-w-[140px] flex-1">
                          <label className="text-xs text-muted-foreground">{tt("wm_invoiceNoLabel", "Invoice Number")}</label>
                          <Input
                            className="mt-0.5 h-9"
                            value={line.invoiceNo}
                            placeholder={t("wm_invoiceNoPlaceholder") || "IV-xxx"}
                            onChange={(e) => {
                              const next = [...allocateLines]
                              next[idx] = { ...line, invoiceNo: e.target.value }
                              setAllocateLines(next)
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="w-full gap-1" onClick={() => setAllocateLines([...allocateLines, newAllocationLine()])}>
                <Plus className="h-4 w-4" />
                {tt("cardManagementAllocateAddLine", "Add line")}
              </Button>
              <Button onClick={() => void handleSaveAllocation()} disabled={allocateSaving} className="w-full">
                {allocateSaving ? "..." : tt("cardManagementAllocateSave", "Save allocation")}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
