"use client"

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Search, Plus, Upload, X, List, PenLine, HelpCircle } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useStoreList } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import {
  getBankAccounts,
  getBankTransactions,
  addBankTransaction,
  addBankTransactionsBulk,
  saveBankAccount,
  getFixedExpenses,
  getAccountSubjects,
  getVendorsForPurchase,
  type AccountSubjectItem,
} from "@/lib/api-client"
import { parseKDepositCsv, type KDepositParsedResult } from "@/lib/parse-kdeposit-csv"
import { suggestDepositFromMemo } from "@/lib/suggest-deposit-from-memo"
import { suggestWithdrawFromMemo } from "@/lib/suggest-withdraw-from-memo"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function BankTransactionsTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const asDisplayName = (a: AccountSubjectItem) => (lang === 'ko' ? a.name : (a.nameEn || a.name))
  const { stores: storeList } = useStoreList()

  const isOffice = isOfficeRole(auth?.role || "")
  const [accounts, setAccounts] = React.useState<{ id: number; name: string; store: string; bankName?: string }[]>([])
  const [accountId, setAccountId] = React.useState<string>("")
  const [startStr, setStartStr] = React.useState(todayStr)
  const [endStr, setEndStr] = React.useState(todayStr)
  const [list, setList] = React.useState<{ id?: number; transDate: string; transType: string; amount: number; memo: string; note?: string; category?: string; accountSubjectId?: number | null; salesDate?: string; expenseDate?: string }[]>([])
  const [summary, setSummary] = React.useState<{
    openingBalance: number
    beginningBalance: number
    periodDeposits: number
    periodWithdrawals: number
    calculatedBalance: number
  } | null>(null)
  const [actualBalance, setActualBalance] = React.useState("")
  const [loading, setLoading] = React.useState(false)

  const [addTransType, setAddTransType] = React.useState<"deposit" | "withdraw">("withdraw")
  const [addCategory, setAddCategory] = React.useState<"transfer" | "expense" | "fixed" | "purchase_payment" | "correction" | "loan" | "advance" | "unclassified" | "revenue_delivery" | "revenue_card" | "revenue_qr" | "revenue_cash" | "receivable_receive">("revenue_delivery")
  const [addFixedExpenseId, setAddFixedExpenseId] = React.useState<string>("")
  const [addAccountSubjectId, setAddAccountSubjectId] = React.useState<string>("")
  const [fixedExpenseOptions, setFixedExpenseOptions] = React.useState<{ id: number; name: string; store: string }[]>([])
  const [accountSubjectOptions, setAccountSubjectOptions] = React.useState<AccountSubjectItem[]>([])
  const [addDate, setAddDate] = React.useState(todayStr)
  const [addSalesDate, setAddSalesDate] = React.useState("")
  const [addExpenseDate, setAddExpenseDate] = React.useState("")
  const [addAmount, setAddAmount] = React.useState("")
  const [addMemo, setAddMemo] = React.useState("")
  const [addNote, setAddNote] = React.useState("")
  const [addVendorCode, setAddVendorCode] = React.useState("")
  const [addStoreNameForReceivable, setAddStoreNameForReceivable] = React.useState("")
  const [addSaving, setAddSaving] = React.useState(false)
  const [vendorOptions, setVendorOptions] = React.useState<{ code: string; name: string }[]>([])

  const [newAccountName, setNewAccountName] = React.useState("")
  const [newAccountBankName, setNewAccountBankName] = React.useState("")
  const [newAccountStore, setNewAccountStore] = React.useState("")
  const [addAccountSaving, setAddAccountSaving] = React.useState(false)

  const [importPreview, setImportPreview] = React.useState<KDepositParsedResult | null>(null)
  const [importRowEdits, setImportRowEdits] = React.useState<Record<number, { category?: string; accountSubjectId?: string; note?: string; salesDate?: string; expenseDate?: string; vendorCode?: string; storeName?: string }>>({})
  const [memoPreviewText, setMemoPreviewText] = React.useState<string | null>(null)
  const [importSaving, setImportSaving] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

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

  const loadData = React.useCallback(() => {
    if (!accountId) return
    setLoading(true)
    getBankTransactions({
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
    getVendorsForPurchase().then((r) => setVendorOptions(r || []))
  }, [])
  React.useEffect(() => {
    getFixedExpenses({ userStore: auth?.store, userRole: auth?.role })
      .then((r) => setFixedExpenseOptions((r || []).filter((fe) => fe.id != null).map((fe) => ({ id: fe.id!, name: fe.name, store: fe.store }))))
      .catch(() => setFixedExpenseOptions([]))
  }, [auth?.store, auth?.role])

  const [revenueAccountOptions, setRevenueAccountOptions] = React.useState<AccountSubjectItem[]>([])
  React.useEffect(() => {
    const fetch = async () => {
      const [expense, fixed, transfer, revenue] = await Promise.all([
        getAccountSubjects({ forExpense: true }),
        getAccountSubjects({ forFixed: true }),
        getAccountSubjects({ forTransfer: true }),
        getAccountSubjects({ forRevenue: true }),
      ])
      setAccountSubjectOptions([...transfer, ...fixed, ...expense])
      setRevenueAccountOptions(revenue || [])
    }
    fetch().catch(() => setAccountSubjectOptions([]))
  }, [])

  const applyDepositSuggestion = React.useCallback((memo: string) => {
    const sug = suggestDepositFromMemo(memo, revenueAccountOptions)
    if (sug) {
      setAddCategory(sug.category)
      if (sug.accountSubjectId) setAddAccountSubjectId(String(sug.accountSubjectId))
    }
  }, [revenueAccountOptions])

  React.useEffect(() => {
    if (!importPreview || revenueAccountOptions.length === 0 || accountSubjectOptions.length === 0) return
    setImportRowEdits((prev) => {
      const next = { ...prev }
      importPreview.rows.forEach((r, idx) => {
        if (r.transType === "deposit" && r.memo) {
          const sug = suggestDepositFromMemo(r.memo, revenueAccountOptions)
          if (sug) {
            const d = new Date(r.transDate)
            d.setDate(d.getDate() - 1)
            next[idx] = { ...next[idx], category: sug.category, accountSubjectId: sug.accountSubjectId ? String(sug.accountSubjectId) : undefined, salesDate: d.toISOString().slice(0, 10) }
          }
        } else if (r.transType === "withdraw" && r.memo) {
          const sug = suggestWithdrawFromMemo(r.memo, accountSubjectOptions)
          if (sug) {
            next[idx] = { ...next[idx], category: sug.category, accountSubjectId: sug.accountSubjectId ? String(sug.accountSubjectId) : undefined }
          }
        }
      })
      return next
    })
  }, [importPreview, revenueAccountOptions, accountSubjectOptions])

  const fmt = (n: number) => `฿${(n ?? 0).toLocaleString()}`
  const diff = summary && actualBalance.trim() !== ""
    ? (Number(actualBalance.replace(/,/g, "")) || 0) - summary.calculatedBalance
    : null

  const handleAdd = async () => {
    const amount = Number(addAmount?.replace(/,/g, ""))
    if (!amount || amount <= 0) {
      alert(t("pettyAlertAmount") || "금액을 입력하세요.")
      return
    }
    if (!accountId) {
      alert(t("bankAccount") || "계좌를 선택하세요.")
      return
    }
    if (addTransType === "withdraw" && addCategory === "purchase_payment" && !addVendorCode) {
      alert(t("inAlertSelectVendor") || "거래처를 선택하세요.")
      return
    }
    if (addTransType === "deposit" && addCategory === "receivable_receive" && !addStoreNameForReceivable) {
      alert(t("store") ? `${t("store")}를 선택하세요.` : "매장을 선택하세요.")
      return
    }
    const acc = accounts.find((a) => String(a.id) === accountId)
    setAddSaving(true)
    try {
      const depositCat = ["revenue_delivery", "revenue_card", "revenue_qr", "revenue_cash", "receivable_receive", "correction", "loan", "advance", "unclassified"].includes(addCategory) ? addCategory : undefined
      const salesDateVal = addTransType === "deposit" && addSalesDate ? addSalesDate : addTransType === "deposit" ? (() => { const d = new Date(addDate); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) })() : undefined
      const expenseDateVal = addTransType === "withdraw" && addExpenseDate ? addExpenseDate : undefined
      const res = await addBankTransaction({
        accountId: Number(accountId),
        transDate: addDate,
        transType: addTransType,
        amount,
        memo: addMemo.trim() || undefined,
        note: addNote.trim() || undefined,
        store: acc?.store,
        userName: auth?.user,
        category: addTransType === "withdraw" ? addCategory : depositCat,
        fixedExpenseId: addCategory === "fixed" && addFixedExpenseId ? Number(addFixedExpenseId) : undefined,
        accountSubjectId: addAccountSubjectId ? Number(addAccountSubjectId) : undefined,
        salesDate: salesDateVal,
        expenseDate: expenseDateVal,
        vendorCode: addCategory === "purchase_payment" ? addVendorCode : undefined,
        storeName: addCategory === "receivable_receive" ? addStoreNameForReceivable : undefined,
      })
      if (res.success) {
        setAddAmount("")
        setAddMemo("")
        setAddNote("")
        setAddSalesDate("")
        setAddExpenseDate("")
        setAddFixedExpenseId("")
        setAddAccountSubjectId("")
        setAddVendorCode("")
        setAddStoreNameForReceivable("")
        loadData()
      } else {
        alert(res.message || "등록 실패")
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setAddSaving(false)
    }
  }

  const handleAddAccount = async () => {
    if (!newAccountName.trim()) {
      alert(t("bankAddAccount") || "계좌명을 입력하세요.")
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
        alert(res.message || "등록 실패")
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setAddAccountSaving(false)
    }
  }

  const storeOptions = isOffice ? (storeList || []) : [auth?.store || ""].filter(Boolean)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = (reader.result as string) || ""
        const parsed = parseKDepositCsv(text)
        if (parsed.rows.length === 0) {
          alert("파싱된 거래가 없습니다. K-DEPOSIT 형식인지 확인하세요.")
          return
        }
        setImportPreview(parsed)
        const initialEdits: Record<number, { category?: string; accountSubjectId?: string; salesDate?: string; expenseDate?: string }> = {}
        parsed.rows.forEach((r, idx) => {
          if (r.transType === "deposit") {
            const d = new Date(r.transDate)
            d.setDate(d.getDate() - 1)
            initialEdits[idx] = { category: "revenue_delivery", salesDate: d.toISOString().slice(0, 10) }
          }
        })
        setImportRowEdits(initialEdits)
        if (parsed.periodStart && parsed.periodEnd) {
          setStartStr(parsed.periodStart)
          setEndStr(parsed.periodEnd)
        }
      } catch (err) {
        alert("파일 파싱 실패: " + String(err))
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

  const handleImportSave = async () => {
    if (!importPreview || !accountId) return
    const acc = accounts.find((a) => String(a.id) === accountId)
    const items = importPreview.rows.map((r, idx) => {
      const edit = importRowEdits[idx]
      const category = r.transType === "withdraw"
        ? (edit?.category || "expense")
        : (edit?.category && ["revenue_delivery", "revenue_card", "revenue_qr", "revenue_cash", "receivable_receive", "correction", "loan", "advance", "unclassified"].includes(edit.category) ? edit.category : "revenue_delivery")
      const accountSubjectId = edit?.accountSubjectId && edit.accountSubjectId !== "__none__" ? Number(edit.accountSubjectId) : undefined
      const note = edit?.note?.trim() || undefined
      const salesDate = r.transType === "deposit" && !["correction", "loan", "advance", "unclassified", "receivable_receive"].includes(edit?.category || "")
        ? (edit?.salesDate || (() => { const d = new Date(r.transDate); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) })())
        : undefined
      const expenseDate = r.transType === "withdraw" && (edit?.category === "expense" || edit?.category === "fixed")
        ? (edit?.expenseDate || r.transDate)
        : undefined
      const vendorCode = edit?.category === "purchase_payment" ? (edit?.vendorCode?.trim() || undefined) : undefined
      const storeName = edit?.category === "receivable_receive" ? (edit?.storeName?.trim() || undefined) : undefined
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
        setImportPreview(null)
        setImportRowEdits({})
        if (importPreview.periodStart && importPreview.periodEnd) {
          setStartStr(importPreview.periodStart)
          setEndStr(importPreview.periodEnd)
        }
        loadData()
        alert(res.message || "저장되었습니다.")
      } else {
        alert(res.message || "저장 실패")
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setImportSaving(false)
    }
  }

  const balanceMatch =
    importPreview &&
    summary &&
    importPreview.periodEnd === endStr &&
    Math.abs(importPreview.endingBalance - summary.calculatedBalance) < 0.02

  return (
    <div className="space-y-4">
      <Tabs defaultValue="input" className="w-full">
        <TabsList className="mb-3">
          <TabsTrigger value="input">
            <PenLine className="h-4 w-4 mr-2" />
            {t("bankTabInput") || "입력"}
          </TabsTrigger>
          <TabsTrigger value="query">
            <List className="h-4 w-4 mr-2" />
            {t("bankTabQuery") || "조회"}
          </TabsTrigger>
          <TabsTrigger value="explanation">
            <HelpCircle className="h-4 w-4 mr-2" />
            {t("bankTabExplanation") || "설명"}
          </TabsTrigger>
        </TabsList>

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
                  <p className="text-sm text-muted-foreground">{t("bankAddAccount")} - 첫 계좌를 등록하세요. 입력 탭에서 계좌를 추가할 수 있습니다.</p>
                </div>
              ) : (
                <>
                  {summary && (
                    <div className="rounded-lg border bg-muted/30 p-3 mb-4 space-y-2 text-sm">
                      <div className="grid grid-cols-2 gap-2 max-w-md">
                        <span className="text-muted-foreground">{t("bankOpeningBalance")}</span>
                        <span className="text-right font-mono">{fmt(summary.openingBalance)}</span>
                        <span className="text-muted-foreground">+ {t("bankDeposit")}</span>
                        <span className="text-right font-mono text-green-600">{fmt(summary.periodDeposits)}</span>
                        <span className="text-muted-foreground">- {t("bankWithdraw")}</span>
                        <span className="text-right font-mono text-destructive">{fmt(summary.periodWithdrawals)}</span>
                        <span className="font-medium">{t("bankCalculatedBalance")}</span>
                        <span className="text-right font-mono font-medium">{fmt(summary.calculatedBalance)}</span>
                      </div>
                      <div className="pt-2 border-t flex flex-wrap items-center gap-2">
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

                  <div className="rounded-lg border max-h-[360px] overflow-auto">
                    {loading ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">{t("loadingItems")}</p>
                    ) : list.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">{t("pettyNoData") || "데이터 없음"}</p>
                    ) : (
                      <table className="w-full text-sm min-w-[800px]">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="p-2 text-center">{t("date") || "날짜"}</th>
                            <th className="p-2 text-center">{t("pettyColType") || "유형"}</th>
                            <th className="p-2 text-center">{t("bankCategoryLabel") || "용도"}</th>
                            <th className="p-2 text-center">{t("accountSubject") || "계정과목"}</th>
                            <th className="p-2 text-center">{t("pettyColAmount") || "금액"}</th>
                        <th className="p-2 text-center min-w-[90px]">{t("bankAttributedDate") || "인식일"}</th>
                        <th className="p-2 text-center min-w-[140px]">{t("bankMemoLabel") || "은행 적요"}</th>
                        <th className="p-2 text-center min-w-[120px]">{t("bankNoteLabel") || "상세 내용"}</th>
                      </tr>
                        </thead>
                        <tbody>
                          {list.map((r, i) => (
                            <tr key={r.id ?? i} className={`border-t ${r.category === "correction" ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                              <td className="p-2">{r.transDate}</td>
                              <td className="p-2 text-center">{r.transType === "deposit" ? t("bankDeposit") : t("bankWithdraw")}</td>
                              <td className={`p-2 text-center text-xs ${r.category === "correction" ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
                                {r.category === "correction"
                                  ? t("bankCategoryCorrection")
                                  : r.category === "loan"
                                    ? t("bankCategoryLoan")
                                    : r.category === "advance"
                                      ? t("bankCategoryAdvance")
                                      : r.category === "unclassified"
                                        ? t("bankCategoryUnclassified")
                                        : r.transType === "withdraw" && r.category === "transfer"
                                          ? t("bankCategoryTransfer")
                                          : r.transType === "withdraw" && r.category === "fixed"
                                            ? t("bankCategoryFixed")
                                            : r.transType === "withdraw" && r.category === "purchase_payment"
                                          ? (t("bankCategoryPurchasePayment") || "매입 대금")
                                          : r.transType === "deposit" && r.category === "receivable_receive"
                                            ? (t("bankCategoryReceivableReceive") || "매출 수령")
                                            : r.transType === "deposit" && r.category === "revenue_delivery"
                                                ? (t("bankRevenueDelivery") || "배달앱")
                                                : r.transType === "deposit" && r.category === "revenue_card"
                                                  ? (t("bankRevenueCard") || "카드")
                                                  : r.transType === "deposit" && r.category === "revenue_qr"
                                                    ? (t("bankRevenueQr") || "QR/이체")
                                                    : r.transType === "deposit" && r.category === "revenue_cash"
                                                    ? (t("bankRevenueCash") || "현금")
                                                    : r.transType === "withdraw"
                                                      ? t("bankCategoryExpense")
                                                      : "—"}
                              </td>
                              <td className="p-2 text-muted-foreground text-xs">
                                {r.accountSubjectId
                                  ? (() => {
                                      const sub = accountSubjectOptions.find((a) => a.id === r.accountSubjectId) || revenueAccountOptions.find((a) => a.id === r.accountSubjectId)
                                      return sub ? `${sub.code} ${asDisplayName(sub)}` : "-"
                                    })()
                                  : "—"}
                              </td>
                              <td className={`p-2 text-right ${r.amount >= 0 ? "text-green-600" : "text-destructive"}`}>
                                {r.amount >= 0 ? "+" : ""}{fmt(r.amount)}
                              </td>
                              <td className="p-2 text-muted-foreground text-xs">
                                {r.transType === "deposit" && r.salesDate
                                  ? r.salesDate
                                  : r.transType === "withdraw" && r.expenseDate
                                    ? r.expenseDate
                                    : "—"}
                              </td>
                              <td
                              className="p-2 min-w-[140px] max-w-[140px] truncate text-muted-foreground text-xs cursor-pointer hover:bg-muted/50 rounded"
                              onClick={() => r.memo?.trim() && setMemoPreviewText(r.memo)}
                              title={r.memo ? `${t("bankMemoLabel") || "은행 적요"} (클릭하여 전체 보기)` : undefined}
                            >
                              {r.memo || "-"}
                            </td>
                              <td className="p-2 truncate max-w-[160px]" title={r.note}>{r.note || "-"}</td>
                            </tr>
                          ))}
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
              </div>

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
                <span>{importPreview.rows.length}건</span>
              </div>
              {summary && importPreview.periodEnd === endStr && (
                <div className={`text-sm font-medium ${balanceMatch ? "text-green-600" : "text-destructive"}`}>
                  {t("bankStatementBalance")}: {fmt(importPreview.endingBalance)} | {t("bankErpBalance")}: {fmt(summary.calculatedBalance)}{" "}
                  {balanceMatch ? `✓ ${t("bankBalanceMatch")}` : `✗ ${t("bankBalanceMismatch")}`}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t("bankImportDupHint") || "이미 등록된 거래(날짜·금액·적요 동일)는 자동으로 제외됩니다."}</p>
              <div className="max-h-[240px] overflow-auto border rounded">
                <table className="w-full text-sm min-w-[840px]">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="p-2 text-center">{t("date")}</th>
                      <th className="p-2 text-center">{t("pettyColType")}</th>
                      <th className="p-2 text-center">{t("bankCategoryLabel")}</th>
                      <th className="p-2 text-center">{t("accountSubject")}</th>
                      <th className="p-2 text-center">{t("pettyColAmount")}</th>
                      <th className="p-2 text-center min-w-[110px]">{t("bankAttributedDate") || "인식일"}</th>
                      <th className="p-2 text-center min-w-[140px]">{t("bankMemoLabel") || "은행 적요"}</th>
                      <th className="p-2 text-center min-w-[150px]">{t("bankNoteLabel") || "상세 내용"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map((r, idx) => (
                      <tr key={idx} className={`border-t ${importRowEdits[idx]?.category === "correction" ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                        <td className="p-2">{r.transDate}</td>
                        <td className="p-2 text-center">{r.transType === "deposit" ? t("bankDeposit") : t("bankWithdraw")}</td>
                        <td className="p-2">
                          {r.transType === "withdraw" ? (
                            <Select
                              value={importRowEdits[idx]?.category || "expense"}
                              onValueChange={(v) => setImportRowEdit(idx, "category", v)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="transfer">{t("bankCategoryTransfer")}</SelectItem>
                                <SelectItem value="expense">{t("bankCategoryExpense")}</SelectItem>
                                <SelectItem value="fixed">{t("bankCategoryFixed")}</SelectItem>
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
                              value={importRowEdits[idx]?.vendorCode || "__none__"}
                              onValueChange={(v) => setImportRowEdit(idx, "vendorCode", v === "__none__" ? "" : v)}
                            >
                              <SelectTrigger className="h-8 text-xs max-w-[140px]">
                                <SelectValue placeholder={t("inVendorPlaceholder") || "거래처"} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">—</SelectItem>
                                {vendorOptions.map((v) => (
                                  <SelectItem key={v.code} value={v.code}>{v.name || v.code}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : r.transType === "deposit" && importRowEdits[idx]?.category === "receivable_receive" ? (
                            <Select
                              value={importRowEdits[idx]?.storeName || "__none__"}
                              onValueChange={(v) => setImportRowEdit(idx, "storeName", v === "__none__" ? "" : v)}
                            >
                              <SelectTrigger className="h-8 text-xs max-w-[120px]">
                                <SelectValue placeholder={t("store") || "매장"} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">—</SelectItem>
                                {(storeList || []).filter((s) => s && s !== "All").map((s) => (
                                  <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : r.transType === "withdraw" && !["correction", "loan", "advance", "unclassified", "purchase_payment"].includes(importRowEdits[idx]?.category || "") ? (
                            <Select
                              value={importRowEdits[idx]?.accountSubjectId || "__none__"}
                              onValueChange={(v) => setImportRowEdit(idx, "accountSubjectId", v === "__none__" ? "" : v)}
                            >
                              <SelectTrigger className="h-8 text-xs max-w-[140px]">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">—</SelectItem>
                                {((cat) =>
                                  cat === "transfer"
                                    ? accountSubjectOptions.filter((a) => a.type === "transfer")
                                    : cat === "fixed"
                                      ? accountSubjectOptions.filter((a) => a.pAndLSection === "fixed")
                                      : accountSubjectOptions.filter((a) => a.type === "expense" && a.pAndLSection !== "fixed")
                                )(importRowEdits[idx]?.category || "expense").map((a) => (
                                  <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
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
                        <td className={`p-2 text-right ${r.amount >= 0 ? "text-green-600" : "text-destructive"}`}>
                          {r.amount >= 0 ? "+" : ""}{fmt(r.amount)}
                        </td>
                        <td className="p-2">
                          {r.transType === "deposit" && !["correction", "loan", "advance", "unclassified", "receivable_receive"].includes(importRowEdits[idx]?.category || "") ? (
                            <Input
                              type="date"
                              value={importRowEdits[idx]?.salesDate || (() => { const d = new Date(r.transDate); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) })()}
                              onChange={(e) => setImportRowEdit(idx, "salesDate", e.target.value)}
                              className="h-8 text-xs min-w-[110px] w-[110px]"
                            />
                          ) : r.transType === "withdraw" && (importRowEdits[idx]?.category === "expense" || importRowEdits[idx]?.category === "fixed") ? (
                            <Input
                              type="date"
                              value={importRowEdits[idx]?.expenseDate ?? r.transDate}
                              onChange={(e) => setImportRowEdit(idx, "expenseDate", e.target.value)}
                              className="h-8 text-xs min-w-[110px] w-[110px]"
                            />
                          ) : "—"}
                        </td>
                        <td
                          className="p-2 min-w-[140px] max-w-[140px] truncate text-muted-foreground text-xs cursor-pointer hover:bg-muted/50 rounded"
                          onClick={() => r.memo?.trim() && setMemoPreviewText(r.memo)}
                          title={r.memo ? `${t("bankMemoLabel") || "은행 적요"} (클릭하여 전체 보기)` : undefined}
                        >
                          {r.memo || "-"}
                        </td>
                        <td className="p-2">
                          <Input
                            placeholder={t("bankNotePlaceholder") || "상세 내용 입력"}
                            value={importRowEdits[idx]?.note ?? ""}
                            onChange={(e) => setImportRowEdit(idx, "note", e.target.value)}
                            className="h-8 text-xs min-w-[150px]"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button size="sm" onClick={handleImportSave} disabled={importSaving || !accountId}>
                {importSaving ? "..." : t("bankImportSave")}
              </Button>
            </div>
          )}

          {accounts.length === 0 ? (
            <div className="border rounded-lg p-4 space-y-3">
              <p className="text-sm text-muted-foreground">{t("bankAddAccount")} - 첫 계좌를 등록하세요.</p>
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder={t("bankName") || "은행명"}
                  value={newAccountBankName}
                  onChange={(e) => setNewAccountBankName(e.target.value)}
                  className="max-w-[140px]"
                />
                <Input
                  placeholder={t("bankAccount")}
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  className="max-w-[200px]"
                />
                {isOffice && (
                  <Select value={newAccountStore || "본사"} onValueChange={setNewAccountStore}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder={t("store") || "매장"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="본사">{t("pettyScopeOffice") || "본사"}</SelectItem>
                      {(storeOptions || []).filter((s) => s !== "All").map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button size="sm" onClick={handleAddAccount} disabled={addAccountSaving}>
                  <Plus className="h-4 w-4 mr-1" />
                  {t("bankAddAccount")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">{t("pettyAddTitle") || "등록"}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={addTransType} onValueChange={(v) => {
                    const next = v as "deposit" | "withdraw"
                    setAddTransType(next)
                    if (next === "deposit") setAddCategory("revenue_delivery")
                    else setAddCategory("expense")
                  }}>
                    <SelectTrigger className="w-[100px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deposit">{t("bankDeposit")}</SelectItem>
                      <SelectItem value="withdraw">{t("bankWithdraw")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {addTransType === "deposit" && (
                    <>
                      <Select value={addCategory} onValueChange={(v) => setAddCategory(v as typeof addCategory)}>
                        <SelectTrigger className="w-[130px] h-9">
                          <SelectValue placeholder={t("bankCategoryLabel")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="revenue_delivery">{t("bankRevenueDelivery") || "배달앱정산"}</SelectItem>
                          <SelectItem value="revenue_card">{t("bankRevenueCard") || "카드매출"}</SelectItem>
                          <SelectItem value="revenue_qr">{t("bankRevenueQr") || "QR/이체"}</SelectItem>
                          <SelectItem value="revenue_cash">{t("bankRevenueCash") || "현금입금"}</SelectItem>
                          <SelectItem value="receivable_receive">{t("bankCategoryReceivableReceive") || "매출 수령"}</SelectItem>
                          <SelectItem value="loan">{t("bankCategoryLoan")}</SelectItem>
                          <SelectItem value="advance">{t("bankCategoryAdvance")}</SelectItem>
                          <SelectItem value="unclassified">{t("bankCategoryUnclassified")}</SelectItem>
                          <SelectItem value="correction">{t("bankCategoryCorrection")}</SelectItem>
                        </SelectContent>
                      </Select>
                      {!["correction", "loan", "advance", "unclassified", "receivable_receive"].includes(addCategory) && (
                        <Select value={addAccountSubjectId || "__none__"} onValueChange={(v) => setAddAccountSubjectId(v === "__none__" ? "" : v)}>
                          <SelectTrigger className="w-[130px] h-9">
                            <SelectValue placeholder={t("accountSubject")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {revenueAccountOptions.map((a) => (
                              <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {!["correction", "loan", "advance", "unclassified"].includes(addCategory) && addCategory !== "receivable_receive" && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{t("bankSalesDate") || "매출일"}</span>
                          <Input
                            type="date"
                            value={addSalesDate || (() => { const d = new Date(addDate); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) })()}
                            onChange={(e) => setAddSalesDate(e.target.value)}
                            className="w-[120px] h-9"
                          />
                        </div>
                      )}
                      {addCategory === "receivable_receive" && (
                        <Select value={addStoreNameForReceivable || "__none__"} onValueChange={(v) => setAddStoreNameForReceivable(v === "__none__" ? "" : v)}>
                          <SelectTrigger className="w-[140px] h-9">
                            <SelectValue placeholder={t("store") || "매장"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {(storeList || []).filter((s) => s && s !== "All").map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </>
                  )}
                  {addTransType === "withdraw" && (
                    <>
                      <Select value={addCategory} onValueChange={(v) => setAddCategory(v as "transfer" | "expense" | "fixed" | "purchase_payment" | "correction" | "loan" | "advance" | "unclassified")}>
                        <SelectTrigger className="w-[130px] h-9">
                          <SelectValue placeholder={t("bankCategoryLabel")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="transfer">{t("bankCategoryTransfer")}</SelectItem>
                          <SelectItem value="expense">{t("bankCategoryExpense")}</SelectItem>
                          <SelectItem value="fixed">{t("bankCategoryFixed")}</SelectItem>
                          <SelectItem value="purchase_payment">{t("bankCategoryPurchasePayment") || "매입 대금"}</SelectItem>
                          <SelectItem value="loan">{t("bankCategoryLoan")}</SelectItem>
                          <SelectItem value="advance">{t("bankCategoryAdvance")}</SelectItem>
                          <SelectItem value="unclassified">{t("bankCategoryUnclassified")}</SelectItem>
                          <SelectItem value="correction">{t("bankCategoryCorrection")}</SelectItem>
                        </SelectContent>
                      </Select>
                      {addCategory === "fixed" && fixedExpenseOptions.length > 0 && (
                        <Select value={addFixedExpenseId || "__none__"} onValueChange={(v) => setAddFixedExpenseId(v === "__none__" ? "" : v)}>
                          <SelectTrigger className="w-[140px] h-9">
                            <SelectValue placeholder={t("fixedExpName")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {fixedExpenseOptions.map((fe) => (
                              <SelectItem key={fe.id} value={String(fe.id)}>
                                {fe.name} {fe.store ? `(${fe.store})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {(addCategory === "expense" || addCategory === "fixed" || addCategory === "transfer") && !["loan", "advance", "unclassified", "correction"].includes(addCategory) && (
                        <Select value={addAccountSubjectId || "__none__"} onValueChange={(v) => setAddAccountSubjectId(v === "__none__" ? "" : v)}>
                          <SelectTrigger className="w-[130px] h-9">
                            <SelectValue placeholder={t("accountSubject") || "계정과목"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {(addCategory === "transfer"
                              ? accountSubjectOptions.filter((a) => a.type === "transfer")
                              : addCategory === "fixed"
                                ? accountSubjectOptions.filter((a) => a.pAndLSection === "fixed")
                                : accountSubjectOptions.filter((a) => a.type === "expense" && a.pAndLSection !== "fixed")
                            ).map((a) => (
                              <SelectItem key={a.id} value={String(a.id)}>
                                {a.code} {asDisplayName(a)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {(addCategory === "expense" || addCategory === "fixed") && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{t("bankExpenseDate") || "비용인식일"}</span>
                          <Input
                            type="date"
                            value={addExpenseDate || addDate}
                            onChange={(e) => setAddExpenseDate(e.target.value)}
                            className="w-[120px] h-9"
                          />
                        </div>
                      )}
                      {addCategory === "purchase_payment" && (
                        <Select value={addVendorCode || "__none__"} onValueChange={(v) => setAddVendorCode(v === "__none__" ? "" : v)}>
                          <SelectTrigger className="w-[140px] h-9">
                            <SelectValue placeholder={t("inVendorPlaceholder") || t("inVendor") || "거래처"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {vendorOptions.map((v) => (
                              <SelectItem key={v.code} value={v.code}>{v.name || v.code}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </>
                  )}
                  <Input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} className="w-[130px] h-9" />
                  <Input
                    placeholder={t("pettyAmountPh") || "금액"}
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    className="w-[120px] h-9"
                  />
                  <Input
                    placeholder={t("bankMemoPh") || "은행 적요"}
                    value={addMemo}
                    onChange={(e) => {
                      const v = e.target.value
                      setAddMemo(v)
                      if (addTransType === "deposit" && v.trim()) applyDepositSuggestion(v)
                    }}
                    className="w-[140px] h-9"
                  />
                  <Input
                    placeholder={t("bankNotePh") || "상세 내용 (상황 파악용)"}
                    value={addNote}
                    onChange={(e) => setAddNote(e.target.value)}
                    className="flex-1 min-w-[160px] h-9"
                  />
                  <Button size="sm" onClick={handleAdd} disabled={addSaving || !accountId}>
                    {addSaving ? "..." : t("btn_add")}
                  </Button>
                </div>
              </div>

              {isOffice && (
                <div className="mt-4 pt-3 border-t">
                  <p className="text-sm font-medium mb-2">{t("bankAddAccount")}</p>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      placeholder={t("bankName") || "은행명"}
                      value={newAccountBankName}
                      onChange={(e) => setNewAccountBankName(e.target.value)}
                      className="max-w-[130px]"
                    />
                    <Input
                      placeholder={t("bankAccount")}
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      className="max-w-[180px]"
                    />
                    <Select value={newAccountStore || "본사"} onValueChange={setNewAccountStore}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder={t("store") || "매장"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="본사">{t("pettyScopeOffice") || "본사"}</SelectItem>
                        {(storeOptions || []).filter((s) => s !== "All").map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" onClick={handleAddAccount} disabled={addAccountSaving}>
                      <Plus className="h-4 w-4 mr-1" />
                      {t("bankAddAccount")}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="explanation" className="mt-0">
          <Card>
            <CardContent className="pt-4">
              <div className="prose prose-sm dark:prose-invert max-w-none space-y-4 text-sm">
                <h3 className="text-base font-semibold">{t("bankTabExplanation") || "은행 거래 자동 매칭 가이드"}</h3>
                <p className="text-muted-foreground">회계 직원을 위한 은행 파일 업로드 시 자동 용도·계정과목·매출일 매칭 설명입니다.</p>

                <h4 className="font-medium pt-2">1. 입금 (Deposit)</h4>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li><strong>용도</strong>: 은행 적요 키워드에 따라 배달앱·카드·QR/이체·현금입금으로 자동 분류</li>
                  <li><strong>계정과목</strong>: Grab, Line Man, Shopee, Food Panda, Robinhood / Visa, Master, UnionPay, JCB 등 세부 과목 자동 매칭</li>
                  <li><strong>매출일</strong>: 입금일 -1일(T+1)을 기본값으로 적용</li>
                </ul>

                <h4 className="font-medium pt-2">2. 출금 (Withdraw)</h4>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li><strong>용도</strong>: 보충·이체·정산 → 이체, 월세·전기·급여·보험 등 → 고정비, 그 외 → 비용</li>
                  <li><strong>대여</strong>: 돈 빌려줌/빌려옴 (손익 제외)</li>
                  <li><strong>전도금</strong>: 선급 지급 (손익 제외)</li>
                  <li><strong>미분류</strong>: 잘 모르는 금액, 나중에 정리 (손익 제외)</li>
                  <li><strong>계정과목</strong>: 임차료, 전기료, 급여 등 키워드 매칭</li>
                  <li><strong>비용인식일</strong>: 미입력 시 지급일 기준</li>
                </ul>

                <h4 className="font-medium pt-2">3. 적용 시점</h4>
                <p className="text-muted-foreground">CSV 업로드 후 미리보기 로드 시 모든 거래에 자동 적용. 잘못된 건은 수동 수정 가능.</p>

                <h4 className="font-medium pt-2">4. 발생주의 (인식일)</h4>
                <p className="text-muted-foreground">1월 매출 2월 수령 → 매출일 1월 입력. 1월 구매 2월 지불 → 비용인식일 1월 입력. 손익계산서는 인식일 기준으로 해당 월에 반영됨.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!memoPreviewText} onOpenChange={(open) => !open && setMemoPreviewText(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("bankMemoLabel") || "은행 적요"}</DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap break-words text-sm py-2">{memoPreviewText || ""}</p>
        </DialogContent>
      </Dialog>
    </div>
  )
}
