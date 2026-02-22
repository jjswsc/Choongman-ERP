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
import { Search, Plus, Upload, X, List, PenLine, HelpCircle, FileCheck, Trash2 } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useStoreList } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import {
  getBankAccounts,
  getBankTransactions,
  addBankTransactionsBulk,
  saveBankAccount,
  getAccountSubjects,
  getVendorsForPurchase,
  getVendorsForSales,
  updateBankTransactionInvoice,
  getBankMemoRules,
  saveBankMemoRule,
  deleteBankMemoRule,
  type AccountSubjectItem,
  type BankMemoRule,
} from "@/lib/api-client"
import { parseKDepositCsv, type KDepositParsedResult } from "@/lib/parse-kdeposit-csv"
import { suggestDepositWithRules, suggestWithdrawWithRules } from "@/lib/suggest-with-custom-rules"

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
  const [list, setList] = React.useState<{ id?: number; transDate: string; transType: string; amount: number; memo: string; note?: string; category?: string; accountSubjectId?: number | null; salesDate?: string; expenseDate?: string; invoiceReceived?: boolean; invoiceNo?: string; purchaseOrderId?: number }[]>([])
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

  const [importPreview, setImportPreview] = React.useState<KDepositParsedResult | null>(null)
  const [importRowEdits, setImportRowEdits] = React.useState<Record<number, { category?: string; accountSubjectId?: string; note?: string; salesDate?: string; expenseDate?: string; vendorCode?: string; storeName?: string }>>({})
  const [memoPreviewText, setMemoPreviewText] = React.useState<string | null>(null)
  const [updatingInvoiceId, setUpdatingInvoiceId] = React.useState<number | null>(null)
  const [memoRules, setMemoRules] = React.useState<BankMemoRule[]>([])
  const [newRuleKeyword, setNewRuleKeyword] = React.useState("")
  const [newRuleTransType, setNewRuleTransType] = React.useState<"deposit" | "withdraw">("withdraw")
  const [newRuleCategory, setNewRuleCategory] = React.useState("")
  const [newRuleAccountSubjectId, setNewRuleAccountSubjectId] = React.useState<string>("")
  const [savingMemoRule, setSavingMemoRule] = React.useState(false)
  const [filterTransType, setFilterTransType] = React.useState<string>("")
  const [filterCategory, setFilterCategory] = React.useState<string>("")
  const [filterAccountSubjectId, setFilterAccountSubjectId] = React.useState<string>("")
  const [filterInvoiceNotReceived, setFilterInvoiceNotReceived] = React.useState(false)
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
            next[idx] = { ...next[idx], category: sug.category, accountSubjectId: sug.accountSubjectId ? String(sug.accountSubjectId) : undefined }
          }
        }
      })
      return next
    })
  }, [importPreview, revenueAccountOptions, accountSubjectOptions, memoRules])

  const fmt = (n: number) => `฿${(n ?? 0).toLocaleString()}`
  const diff = summary && actualBalance.trim() !== ""
    ? (Number(actualBalance.replace(/,/g, "")) || 0) - summary.calculatedBalance
    : null

  const handleBankInvoiceToggle = React.useCallback(
    async (r: (typeof list)[0]) => {
      if (!r.id || r.category !== "purchase_payment") return
      setUpdatingInvoiceId(r.id)
      try {
        const res = await updateBankTransactionInvoice({
          bankTransactionId: r.id,
          invoiceReceived: !r.invoiceReceived,
        })
        if (res.success) loadData()
        else alert(res.message || t("processFail"))
      } catch (e) {
        alert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
      } finally {
        setUpdatingInvoiceId(null)
      }
    },
    [loadData, t]
  )

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

  const handleAddMemoRule = async () => {
    if (!newRuleKeyword.trim() || !newRuleCategory) {
      alert(t("bankMemoRuleKeywordRequired") || "키워드와 용도를 입력하세요.")
      return
    }
    setSavingMemoRule(true)
    try {
      const res = await saveBankMemoRule({
        keyword: newRuleKeyword.trim(),
        transType: newRuleTransType,
        category: newRuleCategory,
        accountSubjectId: newRuleAccountSubjectId ? Number(newRuleAccountSubjectId) : null,
      })
      if (res.success) {
        setNewRuleKeyword("")
        setNewRuleCategory("")
        setNewRuleAccountSubjectId("")
        getBankMemoRules().then((r) => setMemoRules(r || [])).catch(() => setMemoRules([]))
      } else {
        alert(res.message || t("processFail"))
      }
    } catch (e) {
      alert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSavingMemoRule(false)
    }
  }

  const handleDeleteMemoRule = async (id: number) => {
    if (!confirm(t("bankMemoRuleDeleteConfirm") || "이 규칙을 삭제하시겠습니까?")) return
    try {
      const res = await deleteBankMemoRule({ id })
      if (res.success) getBankMemoRules().then((r) => setMemoRules(r || [])).catch(() => setMemoRules([]))
      else alert(res.message)
    } catch (e) {
      alert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
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
      if (filterInvoiceNotReceived) {
        if (r.transType !== "withdraw" || r.category !== "purchase_payment") return false
        if (r.invoiceReceived) return false
      }
      return true
    })
  }, [list, filterTransType, filterCategory, filterAccountSubjectId, filterInvoiceNotReceived])

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

                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <Select value={filterTransType || "__all__"} onValueChange={(v) => setFilterTransType(v === "__all__" ? "" : v)}>
                      <SelectTrigger className="w-[110px] h-9">
                        <SelectValue placeholder={t("pettyColType") || "유형"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">— {t("pettyColType") || "유형"}</SelectItem>
                        <SelectItem value="deposit">{t("bankDeposit")}</SelectItem>
                        <SelectItem value="withdraw">{t("bankWithdraw")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={filterCategory || "__all__"} onValueChange={(v) => setFilterCategory(v === "__all__" ? "" : v)}>
                      <SelectTrigger className="w-[130px] h-9">
                        <SelectValue placeholder={t("bankCategoryLabel") || "용도"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">— {t("bankCategoryLabel") || "용도"}</SelectItem>
                        <SelectItem value="transfer">{t("bankCategoryTransfer")}</SelectItem>
                        <SelectItem value="expense">{t("bankCategoryExpense")}</SelectItem>
                        <SelectItem value="fixed">{t("bankCategoryFixed")}</SelectItem>
                        <SelectItem value="purchase_payment">{t("bankCategoryPurchasePayment") || "매입 대금"}</SelectItem>
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
                    <Select value={filterAccountSubjectId || "__all__"} onValueChange={(v) => setFilterAccountSubjectId(v === "__all__" ? "" : v)}>
                      <SelectTrigger className="w-[160px] h-9">
                        <SelectValue placeholder={t("accountSubject") || "계정과목"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">— {t("accountSubject") || "계정과목"}</SelectItem>
                        {[...accountSubjectOptions, ...revenueAccountOptions].map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.code} {asDisplayName(a)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filterInvoiceNotReceived}
                        onChange={(e) => setFilterInvoiceNotReceived(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm whitespace-nowrap">{t("poInvoiceNotReceived") || "인보이스 미수령만"}</span>
                    </label>
                    {(filterTransType || filterCategory || filterAccountSubjectId || filterInvoiceNotReceived) && (
                      <Button size="sm" variant="ghost" onClick={() => { setFilterTransType(""); setFilterCategory(""); setFilterAccountSubjectId(""); setFilterInvoiceNotReceived(false) }}>
                        {t("btn_reset") || "초기화"}
                      </Button>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {filteredList.length}건
                    </span>
                  </div>

                  <div className="rounded-lg border max-h-[360px] overflow-auto">
                    {loading ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">{t("loadingItems")}</p>
                    ) : filteredList.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">{list.length === 0 ? (t("pettyNoData") || "데이터 없음") : (t("bankNoMatchFilter") || "조건에 맞는 거래가 없습니다.")}</p>
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
                        <th className="p-2 text-center min-w-[42px]" title={t("poInvoiceReceived") || "인보이스"}>{t("poInvoiceReceived") || "인보이스"}</th>
                        <th className="p-2 text-center min-w-[140px]">{t("bankMemoLabel") || "은행 적요"}</th>
                        <th className="p-2 text-center min-w-[120px]">{t("bankNoteLabel") || "상세 내용"}</th>
                      </tr>
                        </thead>
                        <tbody>
                          {filteredList.map((r, i) => (
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
                              <td className={`p-2 text-right ${r.amount >= 0 ? "text-green-600" : "text-orange-600 dark:text-orange-400"}`}>
                                {r.amount >= 0 ? "+" : ""}{fmt(r.amount)}
                              </td>
                              <td className="p-2 text-muted-foreground text-xs">
                                {r.transType === "deposit" && r.salesDate
                                  ? r.salesDate
                                  : r.transType === "withdraw" && r.expenseDate
                                    ? r.expenseDate
                                    : "—"}
                              </td>
                              <td className="p-2 text-center">
                                {r.transType === "withdraw" && r.category === "purchase_payment" ? (
                                  <button
                                    type="button"
                                    className={`inline-flex h-8 w-8 items-center justify-center rounded hover:bg-muted ${r.invoiceReceived ? "text-green-600" : "text-muted-foreground"}`}
                                    onClick={() => handleBankInvoiceToggle(r)}
                                    disabled={updatingInvoiceId === r.id}
                                    title={r.invoiceReceived ? (t("poInvoiceReceived") || "인보이스") + " ✓" : (t("poInvoiceReceived") || "인보이스") + " (클릭하여 수령 체크)"}
                                  >
                                    <FileCheck className="h-5 w-5" />
                                  </button>
                                ) : "—"}
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
                {accounts.length > 0 && (
                  <>
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
                          <SelectItem value="본사">{t("pettyScopeOffice") || "본사"}</SelectItem>
                          {(storeOptions || []).filter((s) => s !== "All").map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
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
                <p className="text-sm text-muted-foreground mb-4">{t("bankAddAccount")} - 첫 계좌를 등록하세요.</p>
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
                      <th className="p-2 text-center min-w-[132px]">{t("bankAttributedDate") || "인식일"}</th>
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
                                {receivableOptions.map((s) => (
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
                        <td className={`p-2 text-right whitespace-nowrap ${r.amount >= 0 ? "text-green-600" : "text-orange-600 dark:text-orange-400"}`}>
                          {(r.amount ?? 0).toLocaleString()}
                        </td>
                        <td className="p-2">
                          {r.transType === "deposit" && !["correction", "loan", "advance", "unclassified", "receivable_receive"].includes(importRowEdits[idx]?.category || "") ? (
                            <Input
                              type="date"
                              value={importRowEdits[idx]?.salesDate || (() => { const d = new Date(r.transDate); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) })()}
                              onChange={(e) => setImportRowEdit(idx, "salesDate", e.target.value)}
                              className="h-8 text-xs min-w-[132px] w-[132px]"
                            />
                          ) : r.transType === "withdraw" && (importRowEdits[idx]?.category === "expense" || importRowEdits[idx]?.category === "fixed") ? (
                            <Input
                              type="date"
                              value={importRowEdits[idx]?.expenseDate ?? r.transDate}
                              onChange={(e) => setImportRowEdit(idx, "expenseDate", e.target.value)}
                              className="h-8 text-xs min-w-[132px] w-[132px]"
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="explanation" className="mt-0">
          <Card>
            <CardContent className="pt-4">
              <div className="prose prose-sm dark:prose-invert max-w-none space-y-5 text-sm">
                <h3 className="text-lg font-semibold border-b pb-2">{t("bankTabExplanation") || "통장 거래 매뉴얼"}</h3>
                <p className="text-muted-foreground">은행 CSV 업로드 → 자동 용도·계정과목 매칭 → 미수금/미지급금 연동까지, 통장 거래 처리 전체 흐름을 안내합니다.</p>

                <div className="rounded-lg bg-muted/30 p-4 space-y-2">
                  <h4 className="font-medium">■ 화면 구성</h4>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    <li><strong>입력</strong>: 계좌 선택, 은행 CSV 업로드, 계좌 추가</li>
                    <li><strong>조회</strong>: 기간별 거래 조회, 필터 검색, 인보이스 체크</li>
                    <li><strong>설명</strong>: 이 매뉴얼 및 적요 키워드 규칙 설정</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-medium pt-2">■ 1. 입력 탭 – CSV 업로드</h4>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2">
                    <li>계좌 선택 → <strong>은행 CSV 업로드</strong> 클릭 → K-DEPOSIT 형식 CSV 선택</li>
                    <li>미리보기에서 용도·계정과목·매출일·비용인식일 등 확인 후 <strong>저장</strong></li>
                    <li>이미 등록된 거래(날짜·금액·적요 동일)는 자동 제외</li>
                    <li>계좌가 없으면 <strong>계좌 추가</strong>로 은행명·계좌명·매장 입력 후 등록</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-medium pt-2">■ 2. 조회 탭 – 검색·필터</h4>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2">
                    <li>계좌·기간 선택 후 <strong>조회</strong> → 해당 기간 거래 목록 표시</li>
                    <li><strong>실제 잔액</strong> 입력 시 시스템 잔액과 차이 표시 (불일치 시 점검)</li>
                    <li><strong>필터</strong>: 유형(입금/출금), 용도, 계정과목, <strong>인보이스 미수령만</strong>으로 검색</li>
                    <li><strong>인보이스 체크</strong>: 매입 대금 출금 건에서 📄 아이콘 클릭 → 수령 여부 체크 (발주서와 연동됨)</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-medium pt-2">■ 3. 입금 – 자동 매칭</h4>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2">
                    <li><strong>용도</strong>: 적요 키워드로 배달앱·카드·QR/이체·현금·매출 수령 등 자동 분류</li>
                    <li><strong>계정과목</strong>: Grab, Line Man, Shopee, Visa, Master 등 세부 과목 자동 매칭</li>
                    <li><strong>매출 수령</strong>: 수령처(매장 또는 판매처) 선택 시 → 미수금 자동 차감</li>
                    <li><strong>매출일</strong>: 입금일 -1일(T+1) 기본 적용</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-medium pt-2">■ 4. 출금 – 자동 매칭</h4>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2">
                    <li><strong>용도</strong>: 보충·이체·정산→이체, 월세·전기·급여→고정비, 그 외→비용</li>
                    <li><strong>매입 대금</strong>: 거래처 선택 시 → 미지급금 자동 차감</li>
                    <li><strong>대여·전도금·미분류</strong>: 손익 계산 제외 (나중에 정리)</li>
                    <li><strong>계정과목</strong>: 임차료, 전기료, 급여 등 키워드 자동 매칭</li>
                    <li><strong>비용인식일</strong>: 미입력 시 지급일 기준</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-medium pt-2">■ 5. 미수금·미지급금 연동</h4>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2">
                    <li><strong>매출 수령</strong> (입금) + 수령처 선택 → 해당 매장/판매처 미수금 차감</li>
                    <li><strong>매입 대금</strong> (출금) + 거래처 선택 → 해당 거래처 미지급금 차감</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-medium pt-2">■ 6. 인보이스 수령 체크</h4>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2">
                    <li><strong>{"통장 거래 > 조회"}</strong>: 매입 대금 건에서 📄 클릭으로 수령 체크</li>
                    <li><strong>발주서</strong>와 연결된 경우, 한쪽에서 체크하면 양쪽 동기화</li>
                    <li>발주서 없는 직접 구매(마트 등)도 통장 조회에서 인보이스 체크 가능</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-medium pt-2">■ 7. 발생주의 (인식일)</h4>
                  <p className="text-muted-foreground mt-1">1월 매출 2월 수령 → 매출일 1월 입력. 1월 구매 2월 지불 → 비용인식일 1월 입력. 손익계산서는 인식일 기준으로 해당 월에 반영.</p>
                </div>

                <h4 className="font-medium pt-4 border-t mt-6 pt-4">■ 8. 적요 키워드 규칙 설정</h4>
                <p className="text-muted-foreground">은행 적요에 특정 키워드가 포함되면 용도와 계정과목을 자동 지정합니다. 아래에서 규칙을 추가하면 CSV 업로드 시 기본 매칭보다 우선 적용됩니다.</p>
                <div className="space-y-3 pt-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">{t("bankMemoRuleKeyword") || "키워드"}</label>
                      <Input
                        placeholder="예: ABC마트, 월세"
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
                          <SelectValue placeholder="선택" />
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
                              <SelectItem value="fixed">{t("bankCategoryFixed")}</SelectItem>
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
                          <SelectValue placeholder="선택 (생략 가능)" />
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
                      {savingMemoRule ? "..." : <Plus className="h-4 w-4 mr-1" />}
                      {t("btn_add")}
                    </Button>
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
                            <th className="p-2 w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {memoRules.map((rule) => {
                            const catLabel = rule.transType === "deposit"
                              ? (rule.category === "revenue_delivery" ? (t("bankRevenueDelivery") || "배달앱") : rule.category === "revenue_card" ? (t("bankRevenueCard") || "카드") : rule.category === "revenue_qr" ? (t("bankRevenueQr") || "QR/이체") : rule.category === "revenue_cash" ? (t("bankRevenueCash") || "현금") : rule.category === "receivable_receive" ? (t("bankCategoryReceivableReceive") || "매출 수령") : rule.category)
                              : (rule.category === "transfer" ? t("bankCategoryTransfer") : rule.category === "expense" ? t("bankCategoryExpense") : rule.category === "fixed" ? t("bankCategoryFixed") : rule.category === "purchase_payment" ? (t("bankCategoryPurchasePayment") || "매입 대금") : rule.category)
                            const sub = (rule.transType === "deposit" ? revenueAccountOptions : accountSubjectOptions).find((a) => a.id === rule.accountSubjectId)
                            return (
                              <tr key={rule.id} className="border-t">
                                <td className="p-2 font-mono text-xs">{rule.keyword}</td>
                                <td className="p-2">{rule.transType === "deposit" ? t("bankDeposit") : t("bankWithdraw")}</td>
                                <td className="p-2">{catLabel}</td>
                                <td className="p-2 text-muted-foreground">{sub ? `${sub.code} ${asDisplayName(sub)}` : "—"}</td>
                                <td className="p-2">
                                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => rule.id && handleDeleteMemoRule(rule.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
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
                  <h4 className="font-medium text-amber-800 dark:text-amber-200">■ 유의사항</h4>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2 text-xs">
                    <li>통장 거래는 CSV 업로드만 가능합니다. 수동 등록 시 잔액이 맞지 않을 수 있습니다.</li>
                    <li>저장 전 미리보기에서 용도·계정과목·수령처·거래처를 꼭 확인하세요.</li>
                    <li>잔액 불일치 시: 기간·누락·중복 입력 여부를 확인하세요.</li>
                  </ul>
                </div>
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
