"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search, Camera, Pencil, Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getExpenseRegisterList,
  getBankAccounts,
  getAccountSubjects,
  getVendorsForPurchase,
  deleteExpenseRegisterItem,
  updateBankTransactionInvoice,
  translateTexts,
  type BankAccount,
  type ExpenseRegisterItem,
  type AccountSubjectItem,
} from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { compressImageForUpload } from "@/lib/utils"
import { ImageViewerWithRotate } from "@/components/ui/image-viewer-with-rotate"
import { useRouter } from "next/navigation"

function todayStrBkk() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

function getCategoryLabel(cat: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    purchase_payment: t("wm_purchase") || "Purchase Payment",
    purchase_advance: t("wm_advance") || "Advance Payment",
    expense: t("wm_expense") || "Expense",
    expense_advance: t("wm_advance") || "Advance Payment",
    fixed: t("wm_expense") || "Expense",
    fixed_asset: t("wm_fixed_asset") || "Fixed Asset",
    transfer: t("wm_transfer") || "Transfer",
    tax: t("wm_tax") || "Tax",
    loan_repayment: t("wm_loan_repayment") || "Loan Repayment",
    loan_given: t("wm_loan_given") || "Loan Given",
    correction: t("wm_correction") || "Correction",
    dividend: t("wm_dividend") || "Dividend",
  }
  return map[cat] ?? cat
}

function getLinkFlagsLabel(
  bankLinked: boolean | undefined,
  pettyLinked: boolean | undefined,
  t: (k: string) => string
): string {
  if (typeof bankLinked === "boolean" || typeof pettyLinked === "boolean") {
    const b = bankLinked ? "O" : "X"
    const p = pettyLinked ? "O" : "X"
    return `${t("bankTitle") || "Bank"} ${b} · ${t("adminPettyCash") || "Petty Cash"} ${p}`
  }
  return "-"
}

export function ExpenseRegisterSearchTab() {
  const { lang } = useLang()
  const t = useT(lang)
  const tt = React.useCallback((key: string, fallback: string) => {
    const v = t(key)
    if (!v || v === key) return fallback
    return v
  }, [t])
  const { auth } = useAuth()
  const router = useRouter()
  const asDisplayName = (a: AccountSubjectItem) => (lang === "ko" ? a.name : (a.nameEn || a.name))

  const [accountId, setAccountId] = React.useState<string>("__all__")
  const [startStr, setStartStr] = React.useState(todayStrBkk)
  const [endStr, setEndStr] = React.useState(todayStrBkk)
  const [loading, setLoading] = React.useState(false)
  const [list, setList] = React.useState<ExpenseRegisterItem[]>([])
  const [categoryFilter, setCategoryFilter] = React.useState<string>("__all__")
  const [vendorFilter, setVendorFilter] = React.useState("")
  const [accounts, setAccounts] = React.useState<BankAccount[]>([])
  const [accountSubjects, setAccountSubjects] = React.useState<AccountSubjectItem[]>([])
  const [vendors, setVendors] = React.useState<{ code: string; name: string }[]>([])
  const [updatingInvoiceId, setUpdatingInvoiceId] = React.useState<number | null>(null)
  const [invoicePhotoPreviewUrl, setInvoicePhotoPreviewUrl] = React.useState<string | null>(null)
  const [invoicePhotoUploadingId, setInvoicePhotoUploadingId] = React.useState<number | null>(null)
  const [deletingId, setDeletingId] = React.useState<number | null>(null)
  const [memoTransMap, setMemoTransMap] = React.useState<Record<string, string>>({})

  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const invoicePhotoTargetRowRef = React.useRef<ExpenseRegisterItem | null>(null)

  React.useEffect(() => {
    Promise.all([
      getBankAccounts({ userStore: auth?.store, userRole: auth?.role }).catch(() => []),
      getAccountSubjects({ forExpense: true, excludeHeaders: true }).catch(() => []),
      getVendorsForPurchase().catch(() => []),
    ]).then(([a, s, v]) => {
      setAccounts(a || [])
      setAccountSubjects(s || [])
      setVendors(v || [])
    })
  }, [auth?.role, auth?.store])

  React.useEffect(() => {
    const memos = [...new Set(list.map((r) => (r.memo || "").trim()).filter(Boolean))]
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
  }, [list, lang])

  const getMemo = React.useCallback((memo: string | undefined) => (memo && memoTransMap[memo]) || memo || "-", [memoTransMap])

  const loadData = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await getExpenseRegisterList({
        accountId: (accountId && accountId !== '__all__') ? accountId : undefined,
        startStr,
        endStr,
      })
      setList(res.list || [])
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }, [accountId, startStr, endStr])

  const handleInvoiceCheckChange = async (r: ExpenseRegisterItem, checked: boolean) => {
    if (!r.id) return
    setUpdatingInvoiceId(r.id)
    try {
      const res = await updateBankTransactionInvoice({
        bankTransactionId: r.id,
        invoiceReceived: checked,
      })
      if (res.success) {
        setList((prev) =>
          prev.map((x) => (x.id === r.id ? { ...x, invoiceReceived: checked } : x))
        )
      } else {
        await appAlert(res.message || t("processFail"))
      }
    } catch (e) {
      await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setUpdatingInvoiceId(null)
    }
  }

  const handleInvoicePhotoUpload = React.useCallback(
    async (r: ExpenseRegisterItem, file: File) => {
      if (!r.id) return
      setInvoicePhotoUploadingId(r.id)
      try {
        const dataUrl = await compressImageForUpload(file, 1024, 0.7)
        const res = await updateBankTransactionInvoice({
          bankTransactionId: r.id,
          invoicePhotoUrl: dataUrl,
        })
        if (res.success) {
          setList((prev) =>
            prev.map((x) => (x.id === r.id ? { ...x, invoicePhotoUrl: dataUrl } : x))
          )
        } else {
          await appAlert(res.message || t("msg_upload_fail"))
        }
      } catch (e) {
        await appAlert(t("msg_upload_fail") + ": " + (e instanceof Error ? e.message : String(e)))
      } finally {
        setInvoicePhotoUploadingId(null)
        if (fileInputRef.current) fileInputRef.current.value = ""
      }
    },
    [t]
  )

  React.useEffect(() => {
    const handleFileChange = (e: Event) => {
      const target = e.target as HTMLInputElement
      const file = target?.files?.[0]
      const row = invoicePhotoTargetRowRef.current
      if (file && row) {
        handleInvoicePhotoUpload(row, file)
        invoicePhotoTargetRowRef.current = null
      }
    }
    const input = fileInputRef.current
    if (input) input.addEventListener("change", handleFileChange)
    return () => input?.removeEventListener("change", handleFileChange)
  }, [handleInvoicePhotoUpload])

  const fmt = (n: number) => `฿${(n ?? 0).toLocaleString()}`

  const categoryOptions = React.useMemo(
    () => Array.from(new Set((list || []).map((r) => String(r.category || "").trim()).filter(Boolean))).sort(),
    [list]
  )

  const filteredList = React.useMemo(() => {
    const vendorCodeNeedle = vendorFilter.trim().toLowerCase()
    return (list || []).filter((r) => {
      if (categoryFilter !== "__all__") {
        const rowCat = String(r.category || "").toLowerCase()
        if (categoryFilter === "expense") {
          if (rowCat !== "expense" && rowCat !== "fixed") return false
        } else if (rowCat !== categoryFilter) return false
      }
      if (!vendorCodeNeedle) return true
      return String(r.vendorCode || "").trim().toLowerCase().includes(vendorCodeNeedle)
    })
  }, [list, categoryFilter, vendorFilter])

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder={tt("wm_searchAllAccounts", "All Accounts")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{tt("wm_searchAllAccounts", "All Accounts")}</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.bankName ? `[${a.bankName}] ` : ""}{a.name} {a.store ? `(${a.store})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={startStr} onChange={(e) => setStartStr(e.target.value)} className="w-[140px] h-9" />
            <span className="text-xs">~</span>
            <Input type="date" value={endStr} onChange={(e) => setEndStr(e.target.value)} className="w-[140px] h-9" />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder={tt("bankCategoryLabel", "Category")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{tt("all", "All")} {tt("bankCategoryLabel", "Category")}</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c} value={c.toLowerCase()}>
                    {getCategoryLabel(c, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              placeholder={tt("vendor", "Vendor") + " " + tt("code", "Code")}
              className="w-[180px] h-9"
            />
            <Button size="sm" onClick={loadData} disabled={loading} className="h-9">
              <Search className="h-4 w-4 mr-1" />
              {tt("btn_query", "Query")}
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
          />

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
          ) : filteredList.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {tt("pettyNoData", "No expense registration records found.")}
            </p>
          ) : (
            <div className="rounded-lg border overflow-auto max-h-[500px]">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="p-2 text-center">{tt("date", "Date")}</th>
                    <th className="p-2 text-center">{tt("bankCategoryLabel", "Category")}</th>
                    <th className="p-2 text-left">{tt("vendor", "Vendor")}</th>
                    <th className="p-2 text-right">{tt("pettyColAmount", "Amount")}</th>
                    <th className="p-2 text-center min-w-[160px]" title={tt("poInvoice", "Invoice")}>
                      {tt("poInvoice", "Invoice")}
                    </th>
                    <th className="p-2 text-left">{tt("memo", "Memo")}</th>
                    <th className="p-2 text-center">
                      {tt("bankTitle", "Bank")}/{tt("adminPettyCash", "Petty Cash")} {tt("wl_status", "Status")}
                    </th>
                    <th className="p-2 text-center">{tt("action", "Action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((r, i) => {
                    const isPurchase = ["purchase_payment", "purchase_advance"].includes(r.category)
                    const vendor = isPurchase && r.vendorCode ? vendors.find((v) => v.code === r.vendorCode) : null
                    const sub = !isPurchase ? accountSubjects.find((a) => a.id === r.accountSubjectId) : null
                    const payeeLabel = isPurchase
                      ? (vendor ? `${vendor.name} (${vendor.code})` : r.vendorCode || "—")
                      : (sub ? `${sub.code} ${asDisplayName(sub)}` : "—")
                    return (
                      <tr key={r.id ?? i} className="border-t">
                        <td className="p-2 text-center">{r.transDate}</td>
                        <td className="p-2 text-center">{getCategoryLabel(r.category, t)}</td>
                        <td className="p-2">{payeeLabel}</td>
                        <td className="p-2 text-right tabular-nums">{fmt(r.amount)}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-2 justify-center flex-wrap">
                            <Checkbox
                              checked={r.invoiceReceived}
                              onCheckedChange={(c) => handleInvoiceCheckChange(r, c === true)}
                              disabled={updatingInvoiceId === r.id}
                              title={tt("poInvoiceReceived", "Invoice Received")}
                              className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 shrink-0"
                            />
                            {r.invoiceNo ? (
                              <span className="text-xs text-muted-foreground" title={r.invoiceNo}>
                                {r.invoiceNo}
                              </span>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => {
                                if (r.invoicePhotoUrl) {
                                  setInvoicePhotoPreviewUrl(r.invoicePhotoUrl!)
                                } else {
                                  invoicePhotoTargetRowRef.current = r
                                  fileInputRef.current?.click()
                                }
                              }}
                              disabled={invoicePhotoUploadingId === r.id}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded hover:bg-muted shrink-0 overflow-hidden ${r.invoicePhotoUrl ? "text-green-600" : "text-muted-foreground"}`}
                              title={
                                r.invoicePhotoUrl
                                  ? `${tt("poInvoice", "Invoice")} (${tt("clickToView", "click to view")})`
                                  : tt("bankInvoicePhotoUpload", "Upload invoice image")
                              }
                            >
                              {r.invoicePhotoUrl ? (
                                <img src={r.invoicePhotoUrl} alt="" className="h-6 w-6 object-cover rounded" />
                              ) : invoicePhotoUploadingId === r.id ? (
                                <span className="text-xs">...</span>
                              ) : (
                                <Camera className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="p-2 text-muted-foreground text-xs max-w-[180px] truncate" title={r.memo}>
                          {getMemo(r.memo)}
                        </td>
                        <td className="p-2 text-center text-xs text-muted-foreground">
                          {getLinkFlagsLabel(r.bankLinked, r.pettyLinked, t)}
                        </td>
                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              title={tt("btnEdit", "Edit")}
                              onClick={() => {
                                if (!r.id) return
                                const q = new URLSearchParams()
                                q.set("tab", "expenseRegister")
                                q.set("editMode", "1")
                                q.set("bankTransactionId", String(r.id))
                                if (r.accountId) q.set("accountId", String(r.accountId))
                                if (r.transDate) q.set("transDate", r.transDate)
                                if (r.amount) q.set("amount", String(r.amount))
                                if (r.memo) {
                                  q.set("bankNote", r.memo)
                                  q.set("bankMemo", r.memo)
                                }
                                if (r.category) q.set("category", r.category)
                                if (r.vendorCode) q.set("vendorCode", r.vendorCode)
                                if (r.accountSubjectId) q.set("accountSubjectId", String(r.accountSubjectId))
                                q.set("startStr", startStr)
                                q.set("endStr", endStr)
                                router.push(`/admin/expense-management?${q.toString()}`)
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 border-destructive/40 text-destructive"
                              title={tt("delete", "Delete")}
                              disabled={!r.id || deletingId === r.id}
                              onClick={async () => {
                                if (!r.id) return
                                const ok = await appConfirm(tt("emp_confirm_delete", "Delete this item?"))
                                if (!ok) return
                                setDeletingId(r.id)
                                try {
                                  const res = await deleteExpenseRegisterItem({
                                    bankTransactionId: r.id,
                                    userRole: auth?.role,
                                  })
                                  if (!res.success) {
                                    await appAlert(res.message || tt("msg_delete_fail", "Delete failed"))
                                    return
                                  }
                                  setList((prev) => prev.filter((x) => x.id !== r.id))
                                } catch (e) {
                                  await appAlert(tt("msg_delete_fail", "Delete failed") + ": " + (e instanceof Error ? e.message : String(e)))
                                } finally {
                                  setDeletingId(null)
                                }
                              }}
                            >
                              {deletingId === r.id ? <span className="text-xs">...</span> : <Trash2 className="h-4 w-4" />}
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

      <Dialog open={!!invoicePhotoPreviewUrl} onOpenChange={(open) => !open && setInvoicePhotoPreviewUrl(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{tt("poInvoice", "Invoice")}</DialogTitle>
          </DialogHeader>
          <ImageViewerWithRotate
            src={invoicePhotoPreviewUrl || ""}
            alt=""
            imgClassName="max-h-[70vh] w-full object-contain rounded"
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
