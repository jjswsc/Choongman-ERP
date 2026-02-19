"use client"

import * as React from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  getWarehouseLocations,
  saveWarehouseLocation,
  deleteWarehouseLocation,
  type WarehouseLocation,
} from "@/lib/api-client"
import { Settings, Pencil, Trash2 } from "lucide-react"

export interface OutboundLocationSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export function OutboundLocationSettingsDialog({
  open,
  onOpenChange,
  onSaved,
}: OutboundLocationSettingsDialogProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [list, setList] = React.useState<WarehouseLocation[]>([])
  const [loading, setLoading] = React.useState(false)
  const [editing, setEditing] = React.useState<WarehouseLocation | null>(null)
  const [form, setForm] = React.useState({ name: "", address: "", location_code: "", sort_order: 0 })
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await getWarehouseLocations()
      setList(data || [])
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (open) load()
  }, [open, load])

  const handleSave = async () => {
    const name = form.name.trim()
    if (!name) {
      alert(t("outboundLocationNameRequired") || "출고지명을 입력하세요.")
      return
    }
    setSaving(true)
    try {
      const res = await saveWarehouseLocation({
        id: editing?.id,
        name,
        address: form.address.trim(),
        location_code: form.location_code.trim() || name,
        sort_order: form.sort_order || 0,
      })
      if (res.success) {
        setEditing(null)
        setForm({ name: "", address: "", location_code: "", sort_order: 0 })
        await load()
        onSaved?.()
      } else {
        alert(res.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : t("msg_save_fail_detail"))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: WarehouseLocation) => {
    if (!confirm(`"${item.name}" ${t("outboundLocationConfirmDelete") || "를 삭제하시겠습니까?"}`)) return
    setDeleting(item.id ?? 0)
    try {
      const res = await deleteWarehouseLocation({ id: item.id, location_code: item.location_code })
      if (res.success) {
        await load()
        onSaved?.()
      } else {
        alert(res.message || t("msg_delete_fail_detail"))
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : t("msg_delete_fail_detail"))
    } finally {
      setDeleting(null)
    }
  }

  const startEdit = (item: WarehouseLocation) => {
    setEditing(item)
    setForm({
      name: item.name || "",
      address: item.address || "",
      location_code: item.location_code || "",
      sort_order: item.sort_order ?? 0,
    })
  }

  const cancelEdit = () => {
    setEditing(null)
    setForm({ name: "", address: "", location_code: "", sort_order: 0 })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl sm:max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            {t("outboundLocationSettings") || "출고지 설정"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 overflow-y-auto">
          {editing ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <h4 className="text-sm font-semibold">{editing.id ? (t("emp_edit") || "수정") : (t("btn_add") || "추가")}</h4>
              <div className="grid gap-2">
                <div>
                  <label className="text-xs font-medium">{t("outboundLocationName") || "출고지명"}</label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder={t("outboundLocationNamePh") || "예: Jidubang"}
                    className="h-9 mt-0.5"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">{t("outboundLocationCode") || "코드"}</label>
                  <Input
                    value={form.location_code}
                    onChange={(e) => setForm((p) => ({ ...p, location_code: e.target.value }))}
                    placeholder={t("outboundLocationCodePh") || "예: Jidubang (품목에서 참조)"}
                    className="h-9 mt-0.5"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">{t("outboundLocationAddress") || t("vendorAddress") || "주소"}</label>
                  <Input
                    value={form.address}
                    onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                    placeholder={t("optional") || "선택"}
                    className="h-9 mt-0.5"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? "..." : (t("btn_save") || t("emp_save") || "저장")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit}>
                    {t("cancel") || "취소"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => startEdit({ name: "", address: "", location_code: "", sort_order: 0 })}
            >
              + {t("outboundLocationAdd") || "출고지 추가"}
            </Button>
          )}

          <div className="rounded-lg border min-h-[200px] max-h-[50vh] overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
            ) : list.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t("outboundLocationEmpty") || "등록된 출고지가 없습니다."}
              </div>
            ) : (
              <ul className="divide-y">
                {list.map((item) => (
                  <li key={item.id ?? item.location_code} className="flex items-center justify-between gap-2 px-4 py-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{item.name}</span>
                      {item.location_code && item.location_code !== item.name && (
                        <span className="ml-1.5 text-xs text-muted-foreground">({item.location_code})</span>
                      )}
                      {item.address && (
                        <p className="text-xs text-muted-foreground truncate">{item.address}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => startEdit(item)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(item)}
                        disabled={deleting === item.id}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
