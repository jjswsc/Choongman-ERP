"use client"
import { appAlert } from "@/lib/app-message"

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
  getItemCategorySettings,
  saveItemCategory,
  type ItemCategory,
} from "@/lib/api-client"
import { Pencil, Tags } from "lucide-react"

export interface ItemCategorySettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export function ItemCategorySettingsDialog({
  open,
  onOpenChange,
  onSaved,
}: ItemCategorySettingsDialogProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [list, setList] = React.useState<ItemCategory[]>([])
  const [loading, setLoading] = React.useState(false)
  const [editing, setEditing] = React.useState<ItemCategory | null>(null)
  const [form, setForm] = React.useState({ name: "", sort_order: 0 })
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await getItemCategorySettings()
      setList(data || [])
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }, [])

  /** 저장/삭제 직후 목록만 서버와 맞춤 (전체 패널 로딩 없이) */
  const refreshListFromServer = React.useCallback(async () => {
    try {
      const data = await getItemCategorySettings()
      setList(data || [])
    } catch {
      /* 목록 유지 */
    }
  }, [])

  React.useEffect(() => {
    if (open) load()
  }, [open, load])

  const handleSave = async () => {
    const name = form.name.trim()
    if (!name) {
      await appAlert(t("itemsCategoryRequired") || "카테고리명을 입력하세요.")
      return
    }
    const sortOrder = form.sort_order || 0
    setSaving(true)
    try {
      const res = await saveItemCategory({
        id: editing?.id,
        name,
        oldName: editing?.name,
        sort_order: sortOrder,
      })
      if (res.success) {
        if (res.queued) {
          await appAlert(t("posPrinterSavedQueued"))
          const id = editing?.id
          if (id != null && id > 0) {
            setList((prev) =>
              prev.map((row) =>
                row.id === id ? { ...row, name, sort_order: sortOrder } : row
              )
            )
          } else {
            setList((prev) =>
              [...prev, { name, sort_order: sortOrder }].sort(
                (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)
              )
            )
          }
        } else {
          await refreshListFromServer()
        }
        setEditing(null)
        setForm({ name: "", sort_order: 0 })
        onSaved?.()
      } else {
        await appAlert(res.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : t("msg_save_fail_detail"))
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (item: ItemCategory) => {
    setEditing(item)
    setForm({
      name: item.name || "",
      sort_order: item.sort_order ?? 0,
    })
  }

  const cancelEdit = () => {
    setEditing(null)
    setForm({ name: "", sort_order: 0 })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl sm:max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="h-4 w-4" />
            {t("itemCategorySettings") || "카테고리 설정"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 overflow-y-auto">
          {editing ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <h4 className="text-sm font-semibold">{editing.id ? (t("emp_edit") || "수정") : (t("btn_add") || "추가")}</h4>
              <div className="grid gap-2">
                <div>
                  <label className="text-xs font-medium">{t("itemCategoryName") || "카테고리명"}</label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder={t("itemsCategoryPh") || "예: Packing"}
                    className="h-9 mt-0.5"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">{t("sortOrder") || "정렬순서"}</label>
                  <Input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm((p) => ({ ...p, sort_order: Number(e.target.value) || 0 }))}
                    className="h-9 mt-0.5 w-24"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? "..." : (t("btn_save") || t("emp_save") || "저장")}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={cancelEdit}>
                    {t("cancel") || "취소"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => startEdit({ name: "", sort_order: 0 })}
            >
              + {t("itemCategoryAdd") || "카테고리 추가"}
            </Button>
          )}

          <div className="rounded-lg border min-h-[200px] max-h-[50vh] overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
            ) : list.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t("itemCategoryEmpty") || "등록된 카테고리가 없습니다."}
              </div>
            ) : (
              <ul className="divide-y">
                {list.map((item) => (
                  <li key={item.id ?? item.name} className="flex items-center justify-between gap-2 px-4 py-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => startEdit(item)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
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
