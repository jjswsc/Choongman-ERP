"use client"

import * as React from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getEvaluationItems,
  updateEvaluationItems,
  addEvaluationItem,
  deleteEvaluationItem,
} from "@/lib/api-client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

export interface EvaluationItemRow {
  id: string | number
  main: string
  sub: string
  name: string
  use?: boolean
}

export interface EmployeeEvalSettingTabProps {
  type: "kitchen" | "service"
}

const KITCHEN_MAIN_CATS = ["메뉴숙련", "원가정확도", "위생", "태도"]

export function EmployeeEvalSettingTab({ type }: EmployeeEvalSettingTabProps) {
  const { lang } = useLang()
  const t = useT(lang)

  const [items, setItems] = React.useState<EvaluationItemRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [addOpen, setAddOpen] = React.useState(false)
  const [addMain, setAddMain] = React.useState("메뉴숙련")
  const [addSub, setAddSub] = React.useState("")
  const [addName, setAddName] = React.useState("(새 항목)")

  const loadItems = React.useCallback(async () => {
    setLoading(true)
    try {
      const list = await getEvaluationItems({ type, activeOnly: false })
      setItems(Array.isArray(list) ? list : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [type])

  React.useEffect(() => {
    loadItems()
  }, [loadItems])

  const handleLoad = () => loadItems()

  const handleSave = async () => {
    const updates = items.map((item) => ({
      id: item.id,
      name: item.name,
      use: item.use ?? true,
    }))
    if (updates.length === 0) {
      alert(t("eval_save_items_ok") || "저장할 항목이 없습니다.")
      return
    }
    setSaving(true)
    try {
      await updateEvaluationItems({ type, updates })
      alert(t("eval_save_items_ok"))
      await loadItems()
    } catch (e) {
      console.error(e)
      alert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = () => {
    if (type === "service") {
      setAddMain("서비스")
      setAddSub("")
    } else {
      setAddMain("메뉴숙련")
      setAddSub("")
    }
    setAddName("(새 항목)")
    setAddOpen(true)
  }

  const handleAddSubmit = async () => {
    const itemName = addName.trim() || "(새 항목)"
    setSaving(true)
    try {
      await addEvaluationItem({
        type,
        mainCat: type === "service" ? "서비스" : addMain,
        subCat: addSub.trim(),
        itemName,
      })
      setAddOpen(false)
      alert(t("eval_add_item_ok"))
      await loadItems()
    } catch (e) {
      console.error(e)
      alert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (itemId: string | number) => {
    if (!confirm(t("eval_delete_confirm"))) return
    setSaving(true)
    try {
      await deleteEvaluationItem({ type, itemId })
      alert(t("eval_delete_ok"))
      await loadItems()
    } catch (e) {
      console.error(e)
      alert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const setItemName = (idx: number, name: string) => {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, name } : it))
    )
  }

  const setItemUse = (idx: number, use: boolean) => {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, use } : it))
    )
  }

  const descKey =
    type === "kitchen" ? "eval_setting_desc_kitchen" : "eval_setting_desc"
  const titleKey =
    type === "kitchen" ? "tab_eval_kitchen_setting" : "tab_eval_service_setting"

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h6 className="font-bold border-b border-border pb-2 mb-3">
        {t(titleKey)}
      </h6>
      <p className="text-sm text-muted-foreground mb-4">{t(descKey)}</p>

      <div className="overflow-x-auto max-h-[400px] rounded border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left font-medium w-14">{t("store_no")}</th>
              <th className="p-2 text-left font-medium min-w-[100px]">
                {t("eval_cat_main")}
              </th>
              <th className="p-2 text-left font-medium min-w-[80px]">
                {t("eval_cat_sub")}
              </th>
              <th className="p-2 text-left font-medium">{t("eval_item")}</th>
              <th className="p-2 text-center font-medium w-14">{t("eval_use")}</th>
              <th className="p-2 text-center font-medium w-16">
                {t("eval_delete")}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  {t("loading")}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="p-6 text-center text-muted-foreground"
                >
{t("eval_setting_no_items")}
                </td>
              </tr>
            ) : (
              items.map((item, idx) => (
                <tr key={String(item.id)} className="border-t border-border">
                  <td className="p-2">{item.id}</td>
                  <td className="p-2">
                    <Input
                      value={item.main}
                      readOnly
                      className="h-8 text-sm bg-muted/30"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={item.sub}
                      readOnly
                      className="h-8 text-sm bg-muted/30"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={item.name}
                      onChange={(e) => setItemName(idx, e.target.value)}
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="p-2 text-center">
                    <Checkbox
                      checked={item.use ?? true}
                      onCheckedChange={(v) =>
                        setItemUse(idx, v === true)
                      }
                    />
                  </td>
                  <td className="p-2 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(item.id)}
                      disabled={saving}
                    >
                      {t("eval_delete")}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <Button variant="outline" onClick={handleLoad} disabled={loading}>
          {t("eval_load_items")}
        </Button>
        <Button variant="outline" onClick={handleAdd} disabled={saving}>
          {t("eval_add_item")}
        </Button>
        <Button onClick={handleSave} disabled={saving || loading}>
          {saving ? t("loading") : t("eval_save_items")}
        </Button>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("eval_add_item")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-sm font-medium">{t("eval_cat_main")}</label>
              {type === "kitchen" ? (
                <select
                  value={addMain}
                  onChange={(e) => setAddMain(e.target.value)}
                  className="w-full mt-1 h-9 rounded border border-input bg-background px-3"
                >
                  {KITCHEN_MAIN_CATS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              ) : (
                <Input
                  value={addMain}
                  onChange={(e) => setAddMain(e.target.value)}
                  placeholder={t("eval_cat_main")}
                  className="mt-1"
                />
              )}
            </div>
            <div>
              <label className="text-sm font-medium">{t("eval_cat_sub")}</label>
              <Input
                value={addSub}
                onChange={(e) => setAddSub(e.target.value)}
                placeholder={t("eval_setting_sub_ph")}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("eval_item")}</label>
              <Input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder={t("eval_setting_new_item")}
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                {t("cancel")}
              </Button>
              <Button onClick={handleAddSubmit} disabled={saving}>
                {saving ? t("loading") : t("eval_add_item")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
