"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

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
  type: "kitchen" | "service" | "manager"
  readOnly?: boolean
  /** true면 카드/제목 없이 본문만 (평가 항목설정 하위 탭용) */
  embedded?: boolean
}

export function EmployeeEvalSettingTab({
  type,
  readOnly = false,
  embedded = false,
}: EmployeeEvalSettingTabProps) {
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

  const moveItemUp = (idx: number) => {
    if (idx <= 0) return
    setItems((prev) => {
      const arr = [...prev]
      ;[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
      return arr
    })
  }
  const moveItemDown = (idx: number) => {
    if (idx >= items.length - 1) return
    setItems((prev) => {
      const arr = [...prev]
      ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
      return arr
    })
  }

  const handleSave = async () => {
    const updates = items.map((item, idx) => ({
      id: item.id,
      main: item.main ?? "",
      sub: item.sub ?? "",
      name: item.name,
      use: item.use ?? true,
      sort_order: idx + 1,
    }))
    if (updates.length === 0) {
      await appAlert(t("eval_save_items_ok") || t("eval_no_items_to_save"))
      return
    }
    setSaving(true)
    try {
      await updateEvaluationItems({ type, updates })
      await appAlert(t("eval_save_items_ok"))
      await loadItems()
    } catch (e) {
      console.error(e)
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = () => {
    if (type === "service") {
      setAddMain("서비스")
      setAddSub("")
    } else if (type === "manager") {
      setAddMain("매니저")
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
      await appAlert(t("eval_add_item_ok"))
      await loadItems()
    } catch (e) {
      console.error(e)
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (itemId: string | number) => {
    if (!await appConfirm(t("eval_delete_confirm"))) return
    setSaving(true)
    try {
      await deleteEvaluationItem({ type, itemId })
      await appAlert(t("eval_delete_ok"))
      await loadItems()
    } catch (e) {
      console.error(e)
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
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

  const setItemMain = (idx: number, main: string) => {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, main } : it))
    )
  }

  const setItemSub = (idx: number, sub: string) => {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, sub } : it))
    )
  }

  const descKey =
    type === "kitchen"
      ? "eval_setting_desc_kitchen"
      : type === "manager"
        ? "eval_setting_desc_manager"
        : "eval_setting_desc"
  const titleKey =
    type === "kitchen"
      ? "tab_eval_kitchen_setting"
      : type === "manager"
        ? "tab_eval_manager_setting"
        : "tab_eval_service_setting"

  const shellClass = embedded
    ? "space-y-4"
    : "rounded-lg border border-border bg-card p-4"

  return (
    <div className={shellClass}>
      {!embedded && (
        <>
          <h6 className="font-bold border-b border-border pb-2 mb-3">
            {t(titleKey)}
          </h6>
          <p className="text-sm text-muted-foreground mb-4">{t(descKey)}</p>
        </>
      )}
      {embedded && (
        <p className="text-sm text-muted-foreground mb-4">{t(descKey)}</p>
      )}

      <div className="overflow-x-auto max-h-[400px] rounded border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left font-medium w-[4.5rem]">
                {t("eval_setting_seq_col")}
              </th>
              {!readOnly && (
                <th className="p-2 text-center font-medium w-[70px]">{t("eval_order")}</th>
              )}
              <th className="p-2 text-left font-medium min-w-[100px]">
                {t("eval_cat_main")}
              </th>
              <th className="p-2 text-left font-medium min-w-[80px]">
                {t("eval_cat_sub")}
              </th>
              <th className="p-2 text-left font-medium">{t("eval_item")}</th>
              <th className="p-2 text-center font-medium w-14">{t("eval_use")}</th>
              {!readOnly && (
                <th className="p-2 text-center font-medium w-16">{t("eval_delete")}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={readOnly ? 5 : 7} className="p-6 text-center text-muted-foreground">
                  {t("loading")}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={readOnly ? 5 : 7}
                  className="p-6 text-center text-muted-foreground"
                >
                  {t("eval_setting_no_items")}
                </td>
              </tr>
            ) : (
              items.map((item, idx) => (
                <tr key={String(item.id)} className="border-t border-border">
                  <td className="p-2 align-top">
                    <div className="tabular-nums font-medium">{idx + 1}</div>
                    <div
                      className="mt-0.5 text-[10px] leading-tight text-muted-foreground"
                      title={`item_id=${item.id}`}
                    >
                      ID {item.id}
                    </div>
                  </td>
                  {!readOnly && (
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => moveItemUp(idx)}
                          disabled={idx === 0}
                        >
                          {t("eval_order_up") || "▲"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => moveItemDown(idx)}
                          disabled={idx === items.length - 1}
                        >
                          {t("eval_order_down") || "▼"}
                        </Button>
                      </div>
                    </td>
                  )}
                  <td className="p-2">
                    <Input
                      value={item.main}
                      onChange={(e) => setItemMain(idx, e.target.value)}
                      readOnly={readOnly}
                      className={`h-8 text-sm ${readOnly ? "bg-muted/30" : ""}`}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={item.sub}
                      onChange={(e) => setItemSub(idx, e.target.value)}
                      readOnly={readOnly}
                      className={`h-8 text-sm ${readOnly ? "bg-muted/30" : ""}`}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={item.name}
                      onChange={(e) => setItemName(idx, e.target.value)}
                      readOnly={readOnly}
                      className={`h-8 text-sm ${readOnly ? "bg-muted/30" : ""}`}
                    />
                  </td>
                  <td className="p-2 text-center">
                    <Checkbox
                      checked={item.use ?? true}
                      onCheckedChange={(v) => setItemUse(idx, v === true)}
                      disabled={readOnly}
                    />
                  </td>
                  {!readOnly && (
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
                  )}
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
        {!readOnly && (
          <>
            <Button variant="outline" onClick={handleAdd} disabled={saving}>
              {t("eval_add_item")}
            </Button>
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? t("loading") : t("eval_save_items")}
            </Button>
          </>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("eval_add_item")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-sm font-medium">{t("eval_cat_main")}</label>
              <Input
                value={addMain}
                onChange={(e) => setAddMain(e.target.value)}
                placeholder={t("eval_cat_main")}
                className="mt-1"
              />
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
