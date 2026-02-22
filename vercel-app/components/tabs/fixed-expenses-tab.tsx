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
import { Pencil, Trash2 } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useStoreList } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import {
  getFixedExpenses,
  saveFixedExpense,
  deleteFixedExpense,
  getAccountSubjects,
  type FixedExpenseItem,
  type AccountSubjectItem,
} from "@/lib/api-client"

export function FixedExpensesTab() {
  const { auth } = useAuth()
  const t = useT(useLang().lang)
  const { stores: storeList } = useStoreList()

  const isOffice = isOfficeRole(auth?.role || "")
  const [list, setList] = React.useState<FixedExpenseItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [storeFilter, setStoreFilter] = React.useState<string>("All")

  const [editingId, setEditingId] = React.useState<number | null>(null)
  const [addName, setAddName] = React.useState("")
  const [addAmount, setAddAmount] = React.useState("")
  const [addStore, setAddStore] = React.useState("")
  const [addStartYm, setAddStartYm] = React.useState("")
  const [addEndYm, setAddEndYm] = React.useState("")
  const [addMemo, setAddMemo] = React.useState("")
  const [addAccountSubjectId, setAddAccountSubjectId] = React.useState<string>("")
  const [accountSubjectOptions, setAccountSubjectOptions] = React.useState<AccountSubjectItem[]>([])
  const [saving, setSaving] = React.useState(false)
  const [deletingId, setDeletingId] = React.useState<number | null>(null)

  const storeOptions = isOffice ? ["All", "본사", ...(storeList || [])] : [auth?.store || ""].filter(Boolean)

  const loadData = React.useCallback(() => {
    setLoading(true)
    getFixedExpenses({
      store: storeFilter !== "All" ? storeFilter : undefined,
      userStore: auth?.store,
      userRole: auth?.role,
    })
      .then((r) => setList(r || []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [storeFilter, auth?.store, auth?.role])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  React.useEffect(() => {
    getAccountSubjects()
      .then((r) => setAccountSubjectOptions(r || []))
      .catch(() => setAccountSubjectOptions([]))
  }, [])

  React.useEffect(() => {
    if (isOffice && storeOptions.length > 1 && !addStore) {
      setAddStore(storeOptions[1] || "본사")
    } else if (!isOffice && auth?.store) {
      setAddStore(auth.store)
    }
  }, [isOffice, auth?.store, storeOptions])

  const resetForm = () => {
    setEditingId(null)
    setAddName("")
    setAddAmount("")
    setAddStore(isOffice ? "본사" : auth?.store || "")
    setAddStartYm("")
    setAddEndYm("")
    setAddMemo("")
    setAddAccountSubjectId("")
  }

  const handleEdit = (item: FixedExpenseItem) => {
    setEditingId(item.id ?? null)
    setAddName(item.name)
    setAddAmount(String(item.monthlyAmount || ""))
    setAddStore(item.store || "")
    setAddStartYm(item.startYearMonth || "")
    setAddEndYm(item.endYearMonth || "")
    setAddMemo(item.memo || "")
    setAddAccountSubjectId(item.accountSubjectId ? String(item.accountSubjectId) : "")
  }

  const handleSave = async () => {
    if (!addName.trim()) {
      alert(t("fixedExpNameRequired") || "항목명을 입력하세요.")
      return
    }
    const amount = Number(addAmount?.replace(/,/g, ""))
    if (isNaN(amount) || amount < 0) {
      alert(t("pettyAlertAmount") || "금액을 입력하세요.")
      return
    }
    setSaving(true)
    try {
      const store = isOffice ? (addStore || undefined) : (auth?.store || undefined)
      const res = await saveFixedExpense({
        id: editingId ?? undefined,
        name: addName.trim(),
        monthlyAmount: amount,
        store,
        startYearMonth: addStartYm.trim() || null,
        endYearMonth: addEndYm.trim() || null,
        memo: addMemo.trim() || null,
        accountSubjectId: addAccountSubjectId ? Number(addAccountSubjectId) : null,
      })
      if (res.success) {
        resetForm()
        loadData()
      } else {
        alert(res.message || "저장 실패")
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm(t("fixedExpDeleteConfirm") || "이 고정비를 삭제하시겠습니까?")) return
    setDeletingId(id)
    try {
      const res = await deleteFixedExpense({ id })
      if (res.success) {
        loadData()
        if (editingId === id) resetForm()
      } else {
        alert(res.message || "삭제 실패")
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setDeletingId(null)
    }
  }

  const fmt = (n: number) => `฿${(n ?? 0).toLocaleString()}`
  const fmtStore = (s: string) => (s.startsWith("Office") || s === "본사" ? (t("pettyScopeOffice") || "본사") : s)

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {isOffice && (
              <Select value={storeFilter} onValueChange={setStoreFilter}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder={t("pL_store")} />
                </SelectTrigger>
                <SelectContent>
                  {storeOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s === "All" ? t("all") : fmtStore(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" variant="outline" onClick={loadData} disabled={loading}>
              {t("btn_query")}
            </Button>
          </div>

          {/* 추가/수정 폼 */}
          <div className="border rounded-lg p-4 mb-4 bg-muted/20 space-y-3">
            <p className="text-sm font-medium">
              {editingId ? t("msg_modify") || "수정" : t("fixedExpAdd") || "고정비 추가"}
            </p>
            <div className="flex flex-wrap gap-2 items-end">
              <Input
                placeholder={t("fixedExpName") || "항목명"}
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="w-[160px]"
              />
              <Input
                placeholder={t("fixedExpAmount") || "월 금액"}
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                className="w-[120px]"
              />
              {isOffice && (
                <Select value={addStore} onValueChange={setAddStore}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder={t("store")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="본사">{t("pettyScopeOffice") || "본사"}</SelectItem>
                    {(storeList || []).map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={addAccountSubjectId || "__none__"} onValueChange={(v) => setAddAccountSubjectId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder={t("accountSubject") || "계정과목"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {accountSubjectOptions
                    .filter((a) => a.type === "expense" && (a.pAndLSection === "fixed" || !a.pAndLSection))
                    .map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.code} {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Input
                placeholder={t("fixedExpStart") || "시작월 (YYYY-MM)"}
                value={addStartYm}
                onChange={(e) => setAddStartYm(e.target.value)}
                className="w-[130px]"
              />
              <Input
                placeholder={t("fixedExpEnd") || "종료월 (YYYY-MM)"}
                value={addEndYm}
                onChange={(e) => setAddEndYm(e.target.value)}
                className="w-[130px]"
              />
              <Input
                placeholder={t("pettyMemoPh") || "비고"}
                value={addMemo}
                onChange={(e) => setAddMemo(e.target.value)}
                className="flex-1 min-w-[120px]"
              />
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "..." : editingId ? t("btn_save") : t("btn_add")}
              </Button>
              {editingId && (
                <Button size="sm" variant="ghost" onClick={resetForm}>
                  {t("cancel")}
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-lg border max-h-[320px] overflow-auto">
            {loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("loadingItems")}</p>
            ) : list.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("pettyNoData") || "데이터 없음"}</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="p-2 text-left">{t("fixedExpName") || "항목"}</th>
                    <th className="p-2 text-left">{t("accountSubject") || "계정과목"}</th>
                    <th className="p-2 text-right">{t("fixedExpAmount") || "월 금액"}</th>
                    <th className="p-2 text-left">{t("store") || "매장"}</th>
                    <th className="p-2 text-left">{t("fixedExpStart") || "시작"}</th>
                    <th className="p-2 text-left">{t("fixedExpEnd") || "종료"}</th>
                    <th className="p-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r, i) => (
                    <tr key={r.id ?? i} className="border-t">
                      <td className="p-2 font-medium">{r.name}</td>
                      <td className="p-2 text-muted-foreground text-xs">
                        {r.accountSubjectId
                          ? (() => {
                              const sub = accountSubjectOptions.find((a) => a.id === r.accountSubjectId)
                              return sub ? `${sub.code} ${sub.name}` : "-"
                            })()
                          : "—"}
                      </td>
                      <td className="p-2 text-right">{fmt(r.monthlyAmount)}</td>
                      <td className="p-2">{fmtStore(r.store)}</td>
                      <td className="p-2 text-muted-foreground">{r.startYearMonth || "-"}</td>
                      <td className="p-2 text-muted-foreground">{r.endYearMonth || "-"}</td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => handleEdit(r)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => r.id && handleDelete(r.id)}
                            disabled={deletingId === r.id}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
