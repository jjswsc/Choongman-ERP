"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getPosMenuCategoriesConfig, savePosMenuCategoriesConfig, type PosMenuCategoriesConfig } from "@/lib/api-client"
import { Pencil, Trash2, FolderTree } from "lucide-react"
import {
  adminTabsBarCn,
  adminTabsContentFlushCn,
  adminTabsListGridClass,
  adminTabsScrollCn,
  adminTabsTriggerGridCn,
} from "@/lib/admin-tab-styles"
import { cn } from "@/lib/utils"
import { translatePosMenuCategoryLabel } from "@/lib/pos-menu-category-label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export interface PosMenuCategorySettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export function PosMenuCategorySettingsDialog({
  open,
  onOpenChange,
  onSaved,
}: PosMenuCategorySettingsDialogProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [config, setConfig] = React.useState<PosMenuCategoriesConfig | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [editingMain, setEditingMain] = React.useState<string | null>(null)
  const [editingSub, setEditingSub] = React.useState<{ main: string; sub: string } | null>(null)
  const [formMain, setFormMain] = React.useState("")
  const [formSub, setFormSub] = React.useState({ main: "", name: "" })
  const [deletingMain, setDeletingMain] = React.useState<string | null>(null)
  const [deletingSub, setDeletingSub] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await getPosMenuCategoriesConfig()
      setConfig(data || { mainCategories: [], categoriesByMain: {} })
    } catch {
      setConfig({ mainCategories: [], categoriesByMain: {} })
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (open) load()
  }, [open, load])

  const handleSaveMain = async () => {
    const name = formMain.trim()
    if (!name) {
      await appAlert(t("itemsCategoryRequired") || "카테고리명을 입력하세요.")
      return
    }
    if (!config) return
    setSaving(true)
    try {
      const newMains = editingMain
        ? config.mainCategories.map((c) => (c === editingMain ? name : c))
        : [...config.mainCategories, name].sort()
      const newCategoriesByMain = { ...config.categoriesByMain }
      if (editingMain && editingMain !== name) {
        newCategoriesByMain[name] = newCategoriesByMain[editingMain] || []
        delete newCategoriesByMain[editingMain]
      } else if (!editingMain) {
        newCategoriesByMain[name] = []
      }
      const res = await savePosMenuCategoriesConfig({
        mainCategories: newMains,
        categoriesByMain: newCategoriesByMain,
        applyToMenus: false,
      })
      if (res?.success) {
        setConfig({ mainCategories: newMains, categoriesByMain: newCategoriesByMain })
        setEditingMain(null)
        setFormMain("")
        onSaved?.()
      } else {
        await appAlert((res as { message?: string })?.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : t("msg_save_fail_detail"))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteMain = async (main: string) => {
    if (!await appConfirm(`"${main}" ${t("itemCategoryConfirmDelete") || "를 삭제하시겠습니까?"}`)) return
    if (!config) return
    setDeletingMain(main)
    try {
      const newMains = config.mainCategories.filter((c) => c !== main)
      const newCategoriesByMain = { ...config.categoriesByMain }
      delete newCategoriesByMain[main]
      const res = await savePosMenuCategoriesConfig({
        mainCategories: newMains,
        categoriesByMain: newCategoriesByMain,
        applyToMenus: false,
      })
      if (res?.success) {
        setConfig({ mainCategories: newMains, categoriesByMain: newCategoriesByMain })
        onSaved?.()
      } else {
        await appAlert((res as { message?: string })?.message || t("msg_delete_fail_detail"))
      }
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : t("msg_delete_fail_detail"))
    } finally {
      setDeletingMain(null)
    }
  }

  const handleSaveSub = async () => {
    const main = formSub.main.trim()
    const name = formSub.name.trim()
    if (!main || !name) {
      await appAlert(t("itemsCategoryRequired") || "카테고리명을 입력하세요.")
      return
    }
    if (!config) return
    setSaving(true)
    try {
      const subs = config.categoriesByMain[main] || []
      const isEditMode = editingSub && editingSub.sub !== ""
      const newSubs = isEditMode
        ? subs.map((c) => (c === editingSub!.sub ? name : c))
        : subs.includes(name)
          ? subs
          : [...subs, name].sort()
      const newCategoriesByMain = {
        ...config.categoriesByMain,
        [main]: newSubs,
      }
      const res = await savePosMenuCategoriesConfig({
        mainCategories: config.mainCategories,
        categoriesByMain: newCategoriesByMain,
        applyToMenus: false,
      })
      if (res?.success) {
        setConfig({ ...config, categoriesByMain: newCategoriesByMain })
        setEditingSub(null)
        setFormSub({ main: "", name: "" })
        onSaved?.()
      } else {
        await appAlert((res as { message?: string })?.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : t("msg_save_fail_detail"))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSub = async (main: string, sub: string) => {
    if (!await appConfirm(`"${main} > ${sub}" ${t("itemCategoryConfirmDelete") || "를 삭제하시겠습니까?"}`)) return
    if (!config) return
    setDeletingSub(`${main}|${sub}`)
    try {
      const subs = (config.categoriesByMain[main] || []).filter((c) => c !== sub)
      const newCategoriesByMain = {
        ...config.categoriesByMain,
        [main]: subs,
      }
      const res = await savePosMenuCategoriesConfig({
        mainCategories: config.mainCategories,
        categoriesByMain: newCategoriesByMain,
        applyToMenus: false,
      })
      if (res?.success) {
        setConfig({ ...config, categoriesByMain: newCategoriesByMain })
        onSaved?.()
      } else {
        await appAlert((res as { message?: string })?.message || t("msg_delete_fail_detail"))
      }
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : t("msg_delete_fail_detail"))
    } finally {
      setDeletingSub(null)
    }
  }

  const startEditMain = (main: string | null) => {
    setEditingMain(main)
    setFormMain(main || "")
  }

  const startEditSub = (main: string, sub: string | null) => {
    if (sub === null) {
      setEditingSub(null)
      setFormSub({ main: "", name: "" })
      return
    }
    setEditingSub({ main, sub })
    setFormSub({ main, name: sub })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl sm:max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="h-4 w-4" />
            {(t("posMenuCategorySettings") === "posMenuCategorySettings" ? "대분류·카테고리 설정" : t("posMenuCategorySettings"))}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="main" className="flex-1 min-h-0 flex flex-col">
          <div className={adminTabsBarCn}>
            <div className={adminTabsScrollCn}>
              <TabsList className={adminTabsListGridClass("grid-cols-2")}>
                <TabsTrigger value="main" className={adminTabsTriggerGridCn}>
                  {t("posMenuCategoryMain") || "대분류"}
                </TabsTrigger>
                <TabsTrigger value="sub" className={adminTabsTriggerGridCn}>
                  {t("posMenuCategory") || "카테고리"}
                </TabsTrigger>
              </TabsList>
            </div>
          </div>
          <TabsContent value="main" className={cn(adminTabsContentFlushCn, "mt-4 space-y-4 flex-1 min-h-0 overflow-y-auto")}>
            {editingMain !== null ? (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                <h4 className="text-sm font-semibold">{editingMain ? (t("emp_edit") || "수정") : (t("btn_add") || "추가")}</h4>
                <div className="flex gap-2">
                  <Input
                    value={formMain}
                    onChange={(e) => setFormMain(e.target.value)}
                    placeholder={t("posMenuCategoryMain") || "대분류명"}
                    className="h-9 flex-1"
                  />
                  <Button size="sm" onClick={handleSaveMain} disabled={saving}>
                    {saving ? "..." : t("btn_save") || "저장"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => startEditMain(null)}>
                    {t("cancel") || "취소"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => startEditMain("")}>
                + {(t("posMenuCategoryMainAdd") === "posMenuCategoryMainAdd" ? "대분류 추가" : t("posMenuCategoryMainAdd"))}
              </Button>
            )}
            <div className="rounded-lg border min-h-[120px] max-h-[40vh] overflow-y-auto">
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
              ) : !config?.mainCategories?.length ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {t("itemCategoryEmpty") || "등록된 대분류가 없습니다."}
                </div>
              ) : (
                <ul className="divide-y">
                  {config.mainCategories.map((m) => (
                    <li key={m} className="flex items-center justify-between gap-2 px-4 py-2">
                      <span className="font-medium">{m}</span>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEditMain(m)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteMain(m)}
                          disabled={deletingMain === m}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>
          <TabsContent value="sub" className={cn(adminTabsContentFlushCn, "mt-4 space-y-4 flex-1 min-h-0 overflow-y-auto")}>
            {editingSub !== null ? (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                <h4 className="text-sm font-semibold">
                  {editingSub.sub ? (t("emp_edit") || "수정") : (t("btn_add") || "추가")} — {t("posMenuCategory") || "카테고리"}
                </h4>
                <div className="grid gap-2">
                  <div>
                    <label className="text-xs font-medium">{t("posMenuCategoryMain") || "대분류"}</label>
                    <Select
                      value={formSub.main}
                      onValueChange={(v) => setFormSub((p) => ({ ...p, main: v }))}
                      disabled={!!editingSub.sub}
                    >
                      <SelectTrigger className="h-9 mt-0.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(config?.mainCategories || []).map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium">{t("itemCategoryName") || "카테고리명"}</label>
                    <Input
                      value={formSub.name}
                      onChange={(e) => setFormSub((p) => ({ ...p, name: e.target.value }))}
                      placeholder={t("itemsCategoryPh") || "예: ORIGINAL"}
                      className="h-9 mt-0.5"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveSub} disabled={saving}>
                      {saving ? "..." : t("btn_save") || "저장"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => startEditSub("", null)}>
                      {t("cancel") || "취소"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => startEditSub(config?.mainCategories?.[0] || "", "")}
                disabled={!config?.mainCategories?.length}
              >
                + {t("itemCategoryAdd") || "카테고리 추가"}
              </Button>
            )}
            <div className="rounded-lg border min-h-[120px] max-h-[40vh] overflow-y-auto">
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
              ) : !config?.mainCategories?.length ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {t("posMenuCategoryMainFirst") || "먼저 대분류를 추가해 주세요."}
                </div>
              ) : (
                <ul className="divide-y">
                  {config.mainCategories.flatMap((main) =>
                    (config.categoriesByMain[main] || []).map((sub) => (
                      <li key={`${main}-${sub}`} className="flex items-center justify-between gap-2 px-4 py-2">
                        <span className="text-muted-foreground text-xs">{main}</span>
                        <span className="font-medium flex-1">{translatePosMenuCategoryLabel(sub, t)}</span>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => startEditSub(main, sub)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteSub(main, sub)}
                            disabled={deletingSub === `${main}|${sub}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
