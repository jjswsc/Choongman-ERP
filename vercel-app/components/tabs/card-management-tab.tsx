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
import { Search, Plus, Pencil, Trash2, CreditCard } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getCardAccounts,
  getCardTransactions,
  saveCardAccount,
  saveCardTransaction,
  deleteCardAccount,
  deleteCardTransaction,
  getAccountSubjects,
  getVendorsForPurchase,
  translateTexts,
  useStoreList,
  type CardAccount,
  type CardTransaction,
  type AccountSubjectItem,
} from "@/lib/api-client"

function todayStrBkk() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

export function CardManagementTab() {
  const { lang } = useLang()
  const t = useT(lang)
  const tt = React.useCallback((key: string, fallback: string) => {
    const v = t(key)
    if (!v || v === key) return fallback
    return v
  }, [t])
  const { stores: rawStores, loading: storesLoading } = useStoreList()
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

  const getMemo = React.useCallback((memo: string | undefined | null) => (memo && memoTransMap[memo]) || memo || "-", [memoTransMap])

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
    let totalCharge = 0
    let totalExpense = 0
    for (const tx of transactions) {
      if (tx.transType === "charge") totalCharge += tx.amount
      else totalExpense += tx.amount
    }
    return { totalCharge, totalExpense, balance: totalCharge - totalExpense }
  }, [transactions])

  const openAccountForm = (a?: CardAccount) => {
    setEditingAccount(a || null)
    setAccountFormName(a?.name || "")
    setAccountFormMemo(a?.memo || "")
    setAccountFormStore(a?.store ? a.store : (filterStore !== "__all__" ? filterStore : "__none__"))
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
    setEditingTrans(tx || null)
    const list = filterStore && filterStore !== "__all__"
      ? cardAccounts.filter((a) => (a.store || "") === filterStore)
      : cardAccounts
    setTransFormCardId(tx ? String(tx.cardAccountId) : list[0] ? String(list[0].id) : "")
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
      await appAlert(tt("cardManagementAlertAmount", "Please enter card, date, and amount."))
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

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{tt("cardManagementTotalCharge", "Total Charge")}</div>
              <div className="text-lg font-semibold tabular-nums text-green-600">{fmt(summary.totalCharge)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{tt("cardManagementTotalExpense", "Total Expense")}</div>
              <div className="text-lg font-semibold tabular-nums text-orange-600">{fmt(summary.totalExpense)}</div>
            </div>
            <div className="rounded-lg border p-3 bg-primary/5">
              <div className="text-xs text-muted-foreground">{tt("cardManagementBalance", "Unsettled Balance")}</div>
              <div className={`text-lg font-bold tabular-nums ${summary.balance >= 0 ? "text-primary" : "text-destructive"}`}>{fmt(summary.balance)}</div>
            </div>
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
          ) : transactions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{tt("pettyNoData", "No transactions found.")}</p>
          ) : (
            <div className="rounded-lg border overflow-auto max-h-[400px]">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="p-2 text-center">{tt("date", "Date")}</th>
                    <th className="p-2 text-center">{tt("cardManagementType", "Type")}</th>
                    <th className="p-2 text-left">{tt("vendor", "Vendor")}</th>
                    <th className="p-2 text-left">{tt("accountSubject", "Account Subject")}</th>
                    <th className="p-2 text-right">{tt("pettyColAmount", "Amount")}</th>
                    <th className="p-2 text-left">{tt("memo", "Memo")}</th>
                    <th className="p-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const cardName = cardAccounts.find((c) => c.id === tx.cardAccountId)?.name || "-"
                    const vendor = tx.vendorCode ? vendors.find((v) => v.code === tx.vendorCode) : null
                    const sub = tx.accountSubjectId ? accountSubjects.find((a) => a.id === tx.accountSubjectId) : null
                    return (
                      <tr key={tx.id} className="border-t">
                        <td className="p-2 text-center">{tx.transDate}</td>
                        <td className="p-2 text-center">
                          <span className={tx.transType === "charge" ? "text-green-600" : "text-orange-600"}>
                            {tx.transType === "charge" ? tt("cardManagementCharge", "Charge") : tt("cardManagementExpense", "Expense")}
                          </span>
                          {filterCardId === "__all__" && <span className="text-xs text-muted-foreground ml-1">({cardName})</span>}
                        </td>
                        <td className="p-2">{tx.transType === "expense" ? (vendor ? `${vendor.name}` : tx.vendorCode || "-") : "-"}</td>
                        <td className="p-2 text-muted-foreground">{tx.transType === "expense" && sub ? `${sub.code} ${asDisplayName(sub)}` : "-"}</td>
                        <td className={`p-2 text-right tabular-nums font-medium ${tx.transType === "charge" ? "text-green-600" : "text-orange-600"}`}>
                          {tx.transType === "charge" ? "+" : "-"}
                          {fmt(tx.amount)}
                        </td>
                        <td className="p-2 text-muted-foreground text-xs max-w-[160px] truncate" title={tx.memo || undefined}>{getMemo(tx.memo)}</td>
                        <td className="p-2">
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openTransForm(tx)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
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
            </div>
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
                  <label className="text-sm font-medium">{tt("vendor", "Vendor")}</label>
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
    </div>
  )
}
