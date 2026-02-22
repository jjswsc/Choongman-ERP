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
import { Search, Plus } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useStoreList } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import {
  getBankAccounts,
  getBankTransactions,
  addBankTransaction,
  saveBankAccount,
  getFixedExpenses,
  getAccountSubjects,
  type AccountSubjectItem,
} from "@/lib/api-client"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function BankTransactionsTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores: storeList } = useStoreList()

  const isOffice = isOfficeRole(auth?.role || "")
  const [accounts, setAccounts] = React.useState<{ id: number; name: string; store: string }[]>([])
  const [accountId, setAccountId] = React.useState<string>("")
  const [startStr, setStartStr] = React.useState(todayStr)
  const [endStr, setEndStr] = React.useState(todayStr)
  const [list, setList] = React.useState<{ id?: number; transDate: string; transType: string; amount: number; memo: string; category?: string; accountSubjectId?: number | null }[]>([])
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
  const [addCategory, setAddCategory] = React.useState<"transfer" | "expense" | "fixed">("expense")
  const [addFixedExpenseId, setAddFixedExpenseId] = React.useState<string>("")
  const [addAccountSubjectId, setAddAccountSubjectId] = React.useState<string>("")
  const [fixedExpenseOptions, setFixedExpenseOptions] = React.useState<{ id: number; name: string; store: string }[]>([])
  const [accountSubjectOptions, setAccountSubjectOptions] = React.useState<AccountSubjectItem[]>([])
  const [addDate, setAddDate] = React.useState(todayStr)
  const [addAmount, setAddAmount] = React.useState("")
  const [addMemo, setAddMemo] = React.useState("")
  const [addSaving, setAddSaving] = React.useState(false)

  const [newAccountName, setNewAccountName] = React.useState("")
  const [newAccountStore, setNewAccountStore] = React.useState("")
  const [addAccountSaving, setAddAccountSaving] = React.useState(false)

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
    if (accountId) loadData()
  }, [accountId, loadData])

  React.useEffect(() => {
    getFixedExpenses({ userStore: auth?.store, userRole: auth?.role })
      .then((r) => setFixedExpenseOptions((r || []).filter((fe) => fe.id != null).map((fe) => ({ id: fe.id!, name: fe.name, store: fe.store }))))
      .catch(() => setFixedExpenseOptions([]))
  }, [auth?.store, auth?.role])

  React.useEffect(() => {
    const fetch = async () => {
      const [expense, fixed, transfer] = await Promise.all([
        getAccountSubjects({ forExpense: true }),
        getAccountSubjects({ forFixed: true }),
        getAccountSubjects({ forTransfer: true }),
      ])
      setAccountSubjectOptions([...transfer, ...fixed, ...expense])
    }
    fetch().catch(() => setAccountSubjectOptions([]))
  }, [])

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
    const acc = accounts.find((a) => String(a.id) === accountId)
    setAddSaving(true)
    try {
      const res = await addBankTransaction({
        accountId: Number(accountId),
        transDate: addDate,
        transType: addTransType,
        amount,
        memo: addMemo.trim() || undefined,
        store: acc?.store,
        userName: auth?.user,
        category: addTransType === "withdraw" ? addCategory : undefined,
        fixedExpenseId: addCategory === "fixed" && addFixedExpenseId ? Number(addFixedExpenseId) : undefined,
        accountSubjectId: addTransType === "withdraw" && addAccountSubjectId ? Number(addAccountSubjectId) : undefined,
      })
      if (res.success) {
        setAddAmount("")
        setAddMemo("")
        setAddFixedExpenseId("")
        setAddAccountSubjectId("")
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
      })
      if (res.success) {
        setNewAccountName("")
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

  return (
    <div className="space-y-4">
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
                    {a.name} {a.store ? `(${a.store})` : ""}
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
              <p className="text-sm text-muted-foreground">{t("bankAddAccount")} - 첫 계좌를 등록하세요.</p>
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder={t("bankAccount")}
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  className="max-w-[200px]"
                />
                {isOffice && (
                  <Select value={newAccountStore} onValueChange={setNewAccountStore}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder={t("store") || "매장"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="본사">{t("pettyScopeOffice") || "본사"}</SelectItem>
                      {(storeOptions || []).map((s) => (
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

              <div className="rounded-lg border max-h-[280px] overflow-auto mb-4">
                {loading ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">{t("loadingItems")}</p>
                ) : list.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">{t("pettyNoData") || "데이터 없음"}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="p-2 text-left">{t("date") || "날짜"}</th>
                        <th className="p-2 text-center">{t("pettyColType") || "유형"}</th>
                        <th className="p-2 text-center">{t("bankCategoryLabel") || "용도"}</th>
                        <th className="p-2 text-left">{t("accountSubject") || "계정과목"}</th>
                        <th className="p-2 text-right">{t("pettyColAmount") || "금액"}</th>
                        <th className="p-2 text-left">{t("pettyColMemo") || "내용"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r, i) => (
                        <tr key={r.id ?? i} className="border-t">
                          <td className="p-2">{r.transDate}</td>
                          <td className="p-2 text-center">{r.transType === "deposit" ? t("bankDeposit") : t("bankWithdraw")}</td>
                          <td className="p-2 text-center text-muted-foreground text-xs">
                            {r.transType === "withdraw" && r.category === "transfer"
                              ? t("bankCategoryTransfer")
                              : r.transType === "withdraw" && r.category === "fixed"
                                ? t("bankCategoryFixed")
                                : r.transType === "withdraw"
                                  ? t("bankCategoryExpense")
                                  : "—"}
                          </td>
                          <td className="p-2 text-muted-foreground text-xs">
                            {r.accountSubjectId
                              ? (() => {
                                  const sub = accountSubjectOptions.find((a) => a.id === r.accountSubjectId)
                                  return sub ? `${sub.code} ${sub.name}` : "-"
                                })()
                              : "—"}
                          </td>
                          <td className={`p-2 text-right ${r.amount >= 0 ? "text-green-600" : "text-destructive"}`}>
                            {r.amount >= 0 ? "+" : ""}{fmt(r.amount)}
                          </td>
                          <td className="p-2 truncate max-w-[180px]" title={r.memo}>{r.memo || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">{t("pettyAddTitle") || "등록"}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={addTransType} onValueChange={(v) => setAddTransType(v as "deposit" | "withdraw")}>
                    <SelectTrigger className="w-[100px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deposit">{t("bankDeposit")}</SelectItem>
                      <SelectItem value="withdraw">{t("bankWithdraw")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {addTransType === "withdraw" && (
                    <>
                      <Select value={addCategory} onValueChange={(v) => setAddCategory(v as "transfer" | "expense" | "fixed")}>
                        <SelectTrigger className="w-[110px] h-9">
                          <SelectValue placeholder={t("bankCategoryLabel")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="transfer">{t("bankCategoryTransfer")}</SelectItem>
                          <SelectItem value="expense">{t("bankCategoryExpense")}</SelectItem>
                          <SelectItem value="fixed">{t("bankCategoryFixed")}</SelectItem>
                        </SelectContent>
                      </Select>
                      {addCategory === "fixed" && fixedExpenseOptions.length > 0 && (
                        <Select value={addFixedExpenseId} onValueChange={setAddFixedExpenseId}>
                          <SelectTrigger className="w-[140px] h-9">
                            <SelectValue placeholder={t("fixedExpName")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">—</SelectItem>
                            {fixedExpenseOptions.map((fe) => (
                              <SelectItem key={fe.id} value={String(fe.id)}>
                                {fe.name} {fe.store ? `(${fe.store})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {(addCategory === "expense" || addCategory === "fixed" || addCategory === "transfer") && (
                        <Select value={addAccountSubjectId} onValueChange={setAddAccountSubjectId}>
                          <SelectTrigger className="w-[130px] h-9">
                            <SelectValue placeholder={t("accountSubject") || "계정과목"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">—</SelectItem>
                            {(addCategory === "transfer"
                              ? accountSubjectOptions.filter((a) => a.type === "transfer")
                              : addCategory === "fixed"
                                ? accountSubjectOptions.filter((a) => a.pAndLSection === "fixed")
                                : accountSubjectOptions.filter((a) => a.type === "expense" && a.pAndLSection !== "fixed")
                            ).map((a) => (
                              <SelectItem key={a.id} value={String(a.id)}>
                                {a.code} {a.name}
                              </SelectItem>
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
                    placeholder={t("pettyMemoPh") || "내용"}
                    value={addMemo}
                    onChange={(e) => setAddMemo(e.target.value)}
                    className="flex-1 min-w-[120px] h-9"
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
                      placeholder={t("bankAccount")}
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      className="max-w-[180px]"
                    />
                    <Select value={newAccountStore} onValueChange={setNewAccountStore}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder={t("store") || "매장"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="본사">{t("pettyScopeOffice") || "본사"}</SelectItem>
                        {(storeOptions || []).map((s) => (
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
    </div>
  )
}
