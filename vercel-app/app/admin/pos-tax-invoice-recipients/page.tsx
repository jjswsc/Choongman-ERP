"use client"

import * as React from "react"
import { FileText, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getPosTaxInvoiceRecipients,
  patchPosTaxInvoiceRecipient,
  type PosTaxInvoiceRecipientRow,
} from "@/lib/api-client"
import { isOfficeRole, canAccessPosSettlement } from "@/lib/permissions"
import { POS_TAX_INVOICE_SHARED_STORE_CODE } from "@/lib/pos-tax-invoice"
import { appAlert } from "@/lib/app-message"
import { cn } from "@/lib/utils"

type SearchBy = "phone" | "taxId" | "name" | "memberNo"

export default function AdminPosTaxInvoiceRecipientsPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const canEdit = canAccessPosSettlement(auth?.role || "") || isOfficeRole(auth?.role || "")
  const [by, setBy] = React.useState<SearchBy>("phone")
  const [q, setQ] = React.useState("")
  const [rows, setRows] = React.useState<PosTaxInvoiceRecipientRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [editRow, setEditRow] = React.useState<PosTaxInvoiceRecipientRow | null>(null)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    if (!auth?.store || !auth?.role) return
    setLoading(true)
    try {
      const res = await getPosTaxInvoiceRecipients({
        userStore: auth.store,
        userRole: auth.role,
        storeCode: auth.store,
        q: q.trim() || undefined,
        by,
        limit: 100,
      })
      if (res.success && res.rows) setRows(res.rows)
      else {
        setRows([])
        if (res.message) await appAlert(res.message)
      }
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [auth?.store, auth?.role, q, by])

  React.useEffect(() => {
    void load()
  }, [load])

  const openEdit = (r: PosTaxInvoiceRecipientRow) => {
    if (!canEdit) return
    setEditRow({ ...r })
  }

  const saveEdit = async () => {
    if (!editRow || !auth?.store || !auth?.role) return
    setSaving(true)
    try {
      const res = await patchPosTaxInvoiceRecipient({
        userStore: auth.store,
        userRole: auth.role,
        id: editRow.id,
        name: editRow.name,
        taxId: editRow.tax_id,
        branchNo: editRow.branch_no,
        phone: editRow.phone,
        email: editRow.email,
        address: editRow.address,
        customerType: editRow.customer_type,
        member_no: editRow.member_no,
        member_id: editRow.member_id,
        is_active: editRow.is_active,
        notes: editRow.notes,
      })
      if (res.success) {
        setEditRow(null)
        await load()
      } else await appAlert(res.message || t("msg_save_fail_detail"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {t("adminPosTaxInvoiceRecipients") || "세금계산서 수취인"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("taxRecipientPageHint") || "POS에서 발행한 세금계산서 수취인 정보를 검색·관리합니다."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
          <div className="space-y-1">
            <Label className="text-xs">{t("posSearch")}</Label>
            <Select value={by} onValueChange={(v) => setBy(v as SearchBy)}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="phone">{t("posPhone")}</SelectItem>
                <SelectItem value="taxId">{t("posTaxIdLabel")}</SelectItem>
                <SelectItem value="name">{t("posName")}</SelectItem>
                <SelectItem value="memberNo">{t("posMemberNoInputPh") || "회원번호"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[200px] flex-1 space-y-1">
            <Label className="text-xs">{t("stockBtnSearch")}</Label>
            <Input
              className="h-9"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder={t("taxRecipientSearchPh") || "키워드"}
            />
          </div>
          <Button type="button" size="sm" className="h-9" onClick={() => void load()} disabled={loading}>
            <Search className="mr-1.5 h-4 w-4" />
            {loading ? "…" : t("stockBtnSearch")}
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left">{t("taxRecipientPoolColumn")}</th>
                <th className="px-3 py-2 text-left">{t("posName")}</th>
                <th className="px-3 py-2 text-left">{t("posTaxIdLabel")}</th>
                <th className="px-3 py-2 text-left">{t("posPhone")}</th>
                <th className="px-3 py-2 text-left">{t("settings_address")}</th>
                <th className="px-3 py-2 text-left">{t("email")}</th>
                <th className="px-3 py-2 text-center">{t("itemsBtnSave")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                    {t("adminLeaveNoResult")}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className={cn("border-b", !r.is_active && "opacity-50")}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.store_code === POS_TAX_INVOICE_SHARED_STORE_CODE
                        ? t("taxRecipientSharedPool")
                        : r.store_code}
                    </td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.tax_id}</td>
                    <td className="px-3 py-2">{r.phone}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate align-top" title={r.address || undefined}>
                      {r.address || "—"}
                    </td>
                    <td className="px-3 py-2 max-w-[180px] truncate">{r.email}</td>
                    <td className="px-3 py-2 text-center">
                      {canEdit ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => openEdit(r)}>
                          {t("itemsBtnEdit") || "수정"}
                        </Button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("itemsBtnEdit")}</DialogTitle>
          </DialogHeader>
          {editRow && (
            <div className="grid gap-3 py-2">
              <div className="grid gap-1">
                <Label>{t("posName")}</Label>
                <Input value={editRow.name} onChange={(e) => setEditRow({ ...editRow, name: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label>{t("posTaxIdLabel")}</Label>
                <Input
                  value={editRow.tax_id}
                  onChange={(e) => setEditRow({ ...editRow, tax_id: e.target.value.replace(/\D/g, "").slice(0, 13) })}
                />
              </div>
              <div className="grid gap-1">
                <Label>{t("posBranchLabel")}</Label>
                <Input
                  value={editRow.branch_no}
                  onChange={(e) => setEditRow({ ...editRow, branch_no: e.target.value.replace(/\D/g, "").slice(0, 5) })}
                />
              </div>
              <div className="grid gap-1">
                <Label>{t("posPhone")}</Label>
                <Input value={editRow.phone} onChange={(e) => setEditRow({ ...editRow, phone: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label>{t("email")}</Label>
                <Input value={editRow.email} onChange={(e) => setEditRow({ ...editRow, email: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label>{t("settings_address")}</Label>
                <Textarea
                  className="min-h-[72px] resize-y"
                  value={editRow.address}
                  onChange={(e) => setEditRow({ ...editRow, address: e.target.value })}
                />
              </div>
              <div className="grid gap-1">
                <Label>{t("posMemberNoInputPh") || "회원번호"}</Label>
                <Input
                  value={editRow.member_no || ""}
                  onChange={(e) => setEditRow({ ...editRow, member_no: e.target.value || null })}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="ti-active"
                  checked={editRow.is_active}
                  onChange={(e) => setEditRow({ ...editRow, is_active: e.target.checked })}
                />
                <Label htmlFor="ti-active">{t("taxRecipientActive") || "사용 중"}</Label>
              </div>
              <div className="grid gap-1">
                <Label>{t("taxRecipientNotes") || "관리자 메모"}</Label>
                <Input
                  value={editRow.notes || ""}
                  onChange={(e) => setEditRow({ ...editRow, notes: e.target.value || null })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)}>
              {t("cancel")}
            </Button>
            <Button onClick={() => void saveEdit()} disabled={saving}>
              {saving ? "…" : t("itemsBtnSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
