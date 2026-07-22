"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert, appConfirm } from "@/lib/app-message"

import { useState, useEffect, useRef, useCallback } from "react"
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
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { ClipboardCheck, RefreshCw, Save, Search, Eye, Pencil, Trash2, Plus, FileText, Wrench, Camera, X as XIcon, Loader2 } from "lucide-react"
import {
  AdminDesktopOnly,
  AdminMobileOnly,
  AdminTableScroll,
} from "@/components/erp/admin-responsive-list"
import Link from "next/link"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { isManagerRole } from "@/lib/permissions"
import {
  useStoreList,
  getChecklistItems,
  saveCheckResult,
  getCheckHistory,
  deleteCheckHistory,
  updateChecklistItems,
  addChecklistItem,
  deleteChecklistItem,
  uploadStoreCheckPhoto,
  translateTexts,
  type ChecklistItem,
  type CheckHistoryItem,
} from "@/lib/api-client"
import { ADMIN_BTN_XS_CN, ADMIN_DIALOG_SCROLL_CN } from "@/lib/admin-ui-standards"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { translateApiMessage } from "@/lib/translate-api-message"
import { Badge } from "@/components/ui/badge"
import { StorePageShell } from "@/components/erp/store-page-shell"
import { AdminFilterBar, AdminFilterField } from "@/components/erp/admin-filter-bar"

function todayStr() {
  return getBangkokTodayDateString()
}

type CheckRow = { id: number; main: string; sub: string; name: string; val: "O" | "X"; remark: string; beforePhotos: string[]; afterPhotos: string[] }

export function AdminStoreCheck() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const [tab, setTab] = useState<"check" | "history" | "failedSummary" | "setting">("check")
  const [stores, setStores] = useState<string[]>([])
  const [storeSelect, setStoreSelect] = useState("")
  const [dateSelect, setDateSelect] = useState(todayStr())
  const [_checkItems, setCheckItems] = useState<ChecklistItem[]>([])
  const [checkRows, setCheckRows] = useState<CheckRow[]>([])
  const [editId, setEditId] = useState("")
  const [totalMemo, setTotalMemo] = useState("")
  const [loadFormLoading, setLoadFormLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)

  const [histStart, setHistStart] = useState(todayStr())
  const [histEnd, setHistEnd] = useState(todayStr())
  const [histStore, setHistStore] = useState("All")
  const [histInspector, setHistInspector] = useState("")
  const [histList, setHistList] = useState<CheckHistoryItem[]>([])
  const [histLoading, setHistLoading] = useState(false)

  const [settingItems, setSettingItems] = useState<ChecklistItem[]>([])
  const [settingLoading, setSettingLoading] = useState(false)
  const [settingSaving, setSettingSaving] = useState(false)
  const [settingAdding, setSettingAdding] = useState(false)
  const [newMain, setNewMain] = useState("")
  const [newSub, setNewSub] = useState("")
  const [newName, setNewName] = useState("")
  const [transMap, setTransMap] = useState<Record<string, string>>({})
  const [remarkModalIdx, setRemarkModalIdx] = useState<number | null>(null)
  const [photoModalIdx, setPhotoModalIdx] = useState<number | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoViewerUrl, setPhotoViewerUrl] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [photoPhase, setPhotoPhase] = useState<"before" | "after">("before")
  const [failedPhotoViewing, setFailedPhotoViewing] = useState<{ beforePhotos: string[]; afterPhotos: string[]; name: string } | null>(null)
  const [existsHint, setExistsHint] = useState(false)

  const resultBadge = (result: string) => {
    const isPass = String(result || "").toUpperCase().includes("PASS")
    return (
      <Badge variant={isPass ? "default" : "destructive"} className={isPass ? "bg-emerald-600 hover:bg-emerald-600" : ""}>
        {isPass ? t("store_check_result_pass") : t("store_check_result_fail")}
      </Badge>
    )
  }

  const repairPrefillHref = (store: string, itemLabel: string) => {
    const title = `[점검FAIL] ${itemLabel}`.slice(0, 120)
    const q = new URLSearchParams({ tab: "new", store, title, category: "시설", priority: "보통" })
    return `/admin/store-repairs?${q.toString()}`
  }

  const isHQ = auth?.role === "director" || auth?.role === "secretary" || auth?.role === "officer"
  const isManager = isManagerRole(auth?.role || "")
  const inspectorName = auth?.user || auth?.store || ""

  // 로그인 언어로 점검 항목/비고/항목요약 자동 번역
  useEffect(() => {
    const texts = new Set<string>()
    for (const r of checkRows) {
      if (r.main?.trim()) texts.add(r.main.trim())
      if (r.sub?.trim()) texts.add(r.sub.trim())
      if (r.name?.trim()) texts.add(r.name.trim())
      if (r.remark?.trim()) texts.add(r.remark.trim())
    }
    for (const it of settingItems) {
      if (it.main?.trim()) texts.add(it.main.trim())
      if (it.sub?.trim()) texts.add(it.sub.trim())
      if (it.name?.trim()) texts.add(it.name.trim())
    }
    if (totalMemo?.trim()) texts.add(totalMemo.trim())
    for (const h of histList) {
      if (h.result === "PASS") continue
      try {
        const arr = JSON.parse(h.json || "[]") as { main?: string; sub?: string; name?: string; val?: string; remark?: string }[]
        for (const it of arr) {
          if (it.val === "X") {
            if (it.main?.trim()) texts.add(it.main.trim())
            if (it.sub?.trim()) texts.add(it.sub.trim())
            if (it.name?.trim()) texts.add(it.name.trim())
            if (it.remark?.trim()) texts.add(it.remark.trim())
          }
        }
      } catch { /* ignore */ }
    }
    const arr = Array.from(texts)
    if (arr.length === 0) {
      setTransMap({})
      return
    }
    let cancelled = false
    translateTexts(arr, lang)
      .then((translated) => {
        if (cancelled) return
        const m: Record<string, string> = {}
        arr.forEach((s, i) => { m[s] = translated[i] ?? s })
        setTransMap(m)
      })
      .catch(() => setTransMap({}))
    return () => { cancelled = true }
  }, [checkRows, totalMemo, settingItems, histList, lang])

  const { stores: storeList } = useStoreList()
  useEffect(() => {
    if (!auth?.store) return
    let list: string[]
    if (isManager) {
      list = [auth.store]
      setStoreSelect(auth.store)
      setHistStore(auth.store)
    } else if (isHQ) {
      list = ["All", ...storeList]
      if (list.length > 0 && !storeSelect) setStoreSelect(list.find((s) => s !== "All") || list[0] || "")
    } else {
      list = storeList
      setStoreSelect(auth.store)
    }
    setStores(list)
  }, [auth?.store, auth?.role, isHQ, isManager, storeList])

  const loadChecklistForm = async () => {
    if (!storeSelect || !dateSelect) {
      await appAlert(t("store_load_hint"))
      return
    }
    setLoadFormLoading(true)
    setCheckRows([])
    setEditId("")
    setViewOnlyMode(false)
    setTotalMemo("")
    setExistsHint(false)
    try {
      const existing = await getCheckHistory({
        startStr: dateSelect,
        endStr: dateSelect,
        store: storeSelect,
      })
      if (existing.length > 0) {
        await loadHistoryIntoForm(existing[0], false)
        setExistsHint(true)
        return
      }
      const items = await getChecklistItems(true)
      setCheckItems(items)
      if (items.length === 0) {
        setCheckRows([])
        return
      }
      const rows: CheckRow[] = items.map((it) => ({
        id: it.id,
        main: it.main,
        sub: it.sub,
        name: it.name,
        val: "O",
        remark: "",
        beforePhotos: [],
        afterPhotos: [],
      }))
      setCheckRows(rows)
    } catch {
      setCheckRows([])
    } finally {
      setLoadFormLoading(false)
    }
  }

  const [viewOnlyMode, setViewOnlyMode] = useState(false)

  const loadHistoryIntoForm = async (h: CheckHistoryItem, readOnly = false) => {
    setViewOnlyMode(readOnly)
    setStoreSelect(h.store)
    setDateSelect(h.date)
    setEditId(h.id)
    setTotalMemo(h.memo || "")
    const items = await getChecklistItems(false)
    setCheckItems(items)
    let rows: CheckRow[] = []
    try {
      const data = JSON.parse(h.json || "[]") as { id: number; main: string; sub: string; name: string; val: "O" | "X"; remark: string; beforePhotos?: string[]; afterPhotos?: string[] }[]
      rows = data.map((d) => ({
        id: d.id,
        main: d.main || "",
        sub: d.sub || "",
        name: d.name || "",
        val: d.val === "X" ? "X" : "O",
        remark: d.remark || "",
        beforePhotos: Array.isArray(d.beforePhotos) ? d.beforePhotos : [],
        afterPhotos: Array.isArray(d.afterPhotos) ? d.afterPhotos : [],
      }))
    } catch {
      rows = items.map((it) => ({ id: it.id, main: it.main, sub: it.sub, name: it.name, val: "O" as const, remark: "", beforePhotos: [], afterPhotos: [] }))
    }
    for (const it of items) {
      if (!rows.find((r) => r.id === it.id)) {
        rows.push({ id: it.id, main: it.main, sub: it.sub, name: it.name, val: "O", remark: "", beforePhotos: [], afterPhotos: [] })
      }
    }
    rows.sort((a, b) => a.id - b.id)
    setCheckRows(rows)
    setTab("check")
  }

  const handleSaveCheck = async () => {
    if (!storeSelect || !dateSelect || checkRows.length === 0) {
      await appAlert(t("store_load_hint"))
      return
    }
    if (!await appConfirm(editId ? t("store_check_updated") + "?" : t("store_save_check") + "?")) return
    setSaveLoading(true)
    try {
      const failCount = checkRows.filter((r) => r.val === "X").length
      const summary = failCount === 0 ? t("store_check_summary_pass") : t("store_check_summary_fail").replace("{n}", String(failCount))
      const jsonData = checkRows.map((r) => ({
        id: r.id,
        main: r.main,
        sub: r.sub,
        name: r.name,
        val: r.val,
        remark: r.remark,
        ...(r.beforePhotos.length > 0 ? { beforePhotos: r.beforePhotos } : {}),
        ...(r.afterPhotos.length > 0 ? { afterPhotos: r.afterPhotos } : {}),
      }))
      await saveCheckResult({
        id: editId || undefined,
        date: dateSelect,
        store: storeSelect,
        inspector: inspectorName,
        summary,
        memo: totalMemo,
        jsonData: JSON.stringify(jsonData),
      })
      await appAlert(editId ? t("store_check_updated") : t("store_check_saved"))
      setEditId("")
      setTotalMemo("")
      setCheckRows([])
      setTab("history")
      searchHistory()
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaveLoading(false)
    }
  }

  const searchHistory = async () => {
    setHistLoading(true)
    try {
      const list = await getCheckHistory({
        startStr: histStart,
        endStr: histEnd,
        store: histStore === "All" ? undefined : histStore,
        inspector: histInspector.trim() || undefined,
      })
      setHistList(list)
    } catch {
      setHistList([])
    } finally {
      setHistLoading(false)
    }
  }

  const handleDeleteHistory = async (id: string) => {
    if (!await appConfirm(t("store_check_delete_confirm"))) return
    try {
      await deleteCheckHistory(id)
      await appAlert(t("store_check_deleted"))
      searchHistory()
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    }
  }

  const loadSettingItems = async () => {
    setSettingLoading(true)
    try {
      const items = await getChecklistItems(false)
      setSettingItems(items)
    } catch {
      setSettingItems([])
    } finally {
      setSettingLoading(false)
    }
  }

  const moveSettingItemUp = (idx: number) => {
    if (idx <= 0) return
    setSettingItems((prev) => {
      const arr = [...prev]
      ;[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
      return arr
    })
  }
  const moveSettingItemDown = (idx: number) => {
    if (idx >= settingItems.length - 1) return
    setSettingItems((prev) => {
      const arr = [...prev]
      ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
      return arr
    })
  }

  const handleSaveSettings = async () => {
    setSettingSaving(true)
    try {
      const updates = settingItems.map((it, idx) => ({
        id: it.id,
        main: it.main ?? "",
        sub: it.sub ?? "",
        name: it.name,
        use: it.use,
        sort_order: idx + 1,
      }))
      await updateChecklistItems(updates)
      await appAlert(t("store_check_saved"))
      loadSettingItems()
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSettingSaving(false)
    }
  }

  const handleAddCheckItem = async () => {
    setSettingAdding(true)
    try {
      await addChecklistItem({ main: newMain, sub: newSub, name: newName || "항목" })
      setNewMain("")
      setNewSub("")
      setNewName("")
      loadSettingItems()
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSettingAdding(false)
    }
  }

  const handleDeleteCheckItem = async (id: string | number) => {
    if (!await appConfirm(t("msg_delete_confirm_check_item"))) return
    try {
      await deleteChecklistItem(id)
      loadSettingItems()
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    }
  }

  const updateCheckRow = (idx: number, field: "val" | "remark", value: string) => {
    setCheckRows((prev) =>
      prev.map((r, i) =>
        i === idx ? (field === "val" ? { ...r, val: value as "O" | "X" } : { ...r, remark: value }) : r
      )
    )
  }

  const MAX_PHOTOS = 5

  const handlePhotoUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || photoModalIdx == null) return
    const row = checkRows[photoModalIdx]
    if (!row) return
    const target = photoPhase === "before" ? row.beforePhotos : row.afterPhotos
    if (target.length >= MAX_PHOTOS) {
      await appAlert(t("store_check_photo_limit"))
      return
    }
    setPhotoUploading(true)
    try {
      const remaining = MAX_PHOTOS - target.length
      const filesToUpload = Array.from(files).slice(0, remaining)
      const newUrls: string[] = []
      for (const file of filesToUpload) {
        const res = await uploadStoreCheckPhoto(storeSelect, dateSelect, row.id, photoPhase, file)
        if (res.success && res.url) {
          newUrls.push(res.url)
        } else {
          await appAlert(translateApiMessage(res.message, t) || t("msg_upload_fail"))
        }
      }
      if (newUrls.length > 0) {
        setCheckRows((prev) =>
          prev.map((r, i) => {
            if (i !== photoModalIdx) return r
            return photoPhase === "before"
              ? { ...r, beforePhotos: [...r.beforePhotos, ...newUrls] }
              : { ...r, afterPhotos: [...r.afterPhotos, ...newUrls] }
          })
        )
      }
    } finally {
      setPhotoUploading(false)
      if (photoInputRef.current) photoInputRef.current.value = ""
    }
  }, [photoModalIdx, photoPhase, checkRows, storeSelect, dateSelect, t])

  const removePhoto = useCallback((idx: number, phase: "before" | "after", photoIdx: number) => {
    setCheckRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r
        if (phase === "before") {
          return { ...r, beforePhotos: r.beforePhotos.filter((_, pi) => pi !== photoIdx) }
        }
        return { ...r, afterPhotos: r.afterPhotos.filter((_, pi) => pi !== photoIdx) }
      })
    )
  }, [])

  const getPhotoCount = (r: CheckRow) => r.beforePhotos.length + r.afterPhotos.length

  const tr = (s: string) => (s && transMap[s]) || s || ""

  const updateSettingItem = (idx: number, field: "main" | "sub" | "name" | "use", value: string | boolean) => {
    setSettingItems((prev) =>
      prev.map((it, i) =>
        i === idx
          ? field === "name"
            ? { ...it, name: String(value) }
            : field === "main"
              ? { ...it, main: String(value) }
              : field === "sub"
                ? { ...it, sub: String(value) }
                : { ...it, use: !!value }
          : it
      )
    )
  }

  return (
    <StorePageShell
      icon={ClipboardCheck}
      title={t("adminStoreCheck")}
      subtitle={t("store_check_page_sub")}
      maxWidthClass="max-w-6xl"
    >
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as "check" | "history" | "failedSummary" | "setting")
            if (v === "history" || v === "failedSummary") searchHistory()
            if (v === "setting") loadSettingItems()
          }}
          className={adminTabsRootCn}
        >
          <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="check" className={adminTabsTriggerCn}>
                  {t("tab_store_check")}
                </TabsTrigger>
                <TabsTrigger value="history" className={adminTabsTriggerCn}>
                  {t("tab_store_history")}
                </TabsTrigger>
                <TabsTrigger value="failedSummary" className={adminTabsTriggerCn}>
                  {t("tab_store_failed_summary")}
                </TabsTrigger>
                {isHQ && (
                  <TabsTrigger value="setting" className={adminTabsTriggerCn}>
                    {t("tab_store_setting")}
                  </TabsTrigger>
                )}
              </TabsList>
          </AdminTabsBarWithHelp>

          <TabsContent value="check" className={adminTabsContentCn}>
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-end gap-3 mb-4">
                  <div className="min-w-[120px]">
                    <label className="text-xs font-semibold block mb-1">{t("store_check_store")}</label>
                    <Select value={storeSelect} onValueChange={setStoreSelect}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder={t("store_all_stores")} />
                      </SelectTrigger>
                      <SelectContent>
                        {stores.filter((s) => s !== "All").map((st) => (
                          <SelectItem key={st} value={st}>{st}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[140px]">
                    <label className="text-xs font-semibold block mb-1">{t("store_check_date")}</label>
                    <Input type="date" value={dateSelect} onChange={(e) => setDateSelect(e.target.value)} className="h-9 text-xs" />
                  </div>
                  <div className="min-w-[140px]">
                    <label className="text-xs font-semibold block mb-1">{t("store_check_inspector")}</label>
                    <Input value={inspectorName} readOnly className="h-9 text-xs bg-muted" />
                  </div>
                  <Button className="h-9 font-medium" onClick={loadChecklistForm} disabled={loadFormLoading}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    {loadFormLoading ? t("loading") : t("store_load_form")}
                  </Button>
                </div>

                {existsHint && checkRows.length > 0 && (
                  <div className="mb-3 p-3 rounded-md bg-blue-500/10 border border-blue-500/30 text-sm text-blue-900 dark:text-blue-100">
                    {t("store_check_exists_hint")}
                  </div>
                )}
                {viewOnlyMode && checkRows.length > 0 && (
                  <div className="mb-3 p-3 rounded-md bg-amber-500/15 border border-amber-500/40 text-sm text-amber-800 dark:text-amber-200 flex flex-wrap items-center justify-between gap-2">
                    <span>{t("store_check_readonly_hint")}</span>
                    <Button size="sm" variant="outline" className="shrink-0 border-amber-600 text-amber-800 hover:bg-amber-500/20" onClick={() => setViewOnlyMode(false)}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      {t("store_check_switch_edit")}
                    </Button>
                  </div>
                )}
                <div className="border rounded-md overflow-auto max-h-[420px]">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 bg-muted z-10">
                      <tr className="border-b">
                        <th className="p-2 text-center w-12 font-medium">{t("store_no")}</th>
                        <th className="p-2 text-center w-28 font-medium">{t("store_cat_main")}</th>
                        <th className="p-2 text-center w-32 font-medium">{t("store_cat_sub")}</th>
                        <th className="p-2 text-center font-medium">{t("store_check_item")}</th>
                        <th className="p-2 text-center w-24 font-medium">{t("store_check")}</th>
                        <th className="p-2 text-center w-40 font-medium">{t("store_remark")}</th>
                        <th className="p-2 text-center w-20 font-medium">{t("store_check_photo_btn")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checkRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-muted-foreground">
                            {t("store_load_hint")}
                          </td>
                        </tr>
                      ) : (
                        checkRows.map((r, idx) => (
                          <tr key={r.id} className="border-b border-border/60 hover:bg-muted/30">
                            <td className="p-2 text-center font-medium">{r.id}</td>
                            <td className="p-2 text-center">{tr(r.main)}</td>
                            <td className="p-2 text-center">{tr(r.sub)}</td>
                            <td className="p-2 text-center">{tr(r.name)}</td>
                            <td className="p-2 align-middle">
                              <div
                                className="flex gap-2 justify-center items-center select-none"
                                style={{ touchAction: "manipulation" }}
                                role="group"
                                aria-label={tr(r.name) || String(r.id)}
                              >
                                <button
                                  type="button"
                                  className={cn(
                                    "min-h-[48px] min-w-[48px] rounded-md text-base font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
                                    r.val === "O"
                                      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                                      : "border-2 bg-background hover:bg-accent hover:text-accent-foreground dark:border-input dark:hover:bg-input/50"
                                  )}
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    if (!viewOnlyMode) updateCheckRow(idx, "val", "O")
                                  }}
                                  onPointerDown={(e) => e.currentTarget.setPointerCapture?.(e.pointerId)}
                                  disabled={viewOnlyMode}
                                  aria-pressed={r.val === "O"}
                                  aria-label={r.val === "O" ? "선택됨 (O)" : "O 선택"}
                                >
                                  O
                                </button>
                                <button
                                  type="button"
                                  className={cn(
                                    "min-h-[48px] min-w-[48px] rounded-md text-base font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
                                    r.val === "X"
                                      ? "bg-destructive text-white hover:bg-destructive/90 shadow-sm"
                                      : "border-2 bg-background hover:bg-accent hover:text-accent-foreground dark:border-input dark:hover:bg-input/50"
                                  )}
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    if (!viewOnlyMode) updateCheckRow(idx, "val", "X")
                                  }}
                                  onPointerDown={(e) => e.currentTarget.setPointerCapture?.(e.pointerId)}
                                  disabled={viewOnlyMode}
                                  aria-pressed={r.val === "X"}
                                  aria-label={r.val === "X" ? "선택됨 (X)" : "X 선택"}
                                >
                                  X
                                </button>
                              </div>
                            </td>
                            <td className="p-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className={`${ADMIN_BTN_XS_CN} w-full max-w-[140px] justify-start truncate`}
                                onClick={() => setRemarkModalIdx(idx)}
                                title={r.remark || t("store_remark_add_btn")}
                              >
                                <FileText className="h-3 w-3 shrink-0 mr-1" />
                                {r.remark?.trim()
                                  ? (r.remark.length > 12 ? r.remark.slice(0, 12) + "…" : r.remark)
                                  : t("store_remark_add_btn")}
                              </Button>
                              {r.remark?.trim() && transMap[r.remark.trim()] && (
                                <p className="text-[11px] text-muted-foreground mt-1 font-medium truncate max-w-[140px]" title={r.remark}>{tr(r.remark)}</p>
                              )}
                            </td>
                            <td className="p-2 text-center">
                              {r.val === "X" ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={cn(ADMIN_BTN_XS_CN, "gap-1", getPhotoCount(r) > 0 && "border-blue-500 text-blue-600 dark:text-blue-400")}
                                  onClick={() => setPhotoModalIdx(idx)}
                                >
                                  <Camera className="h-3 w-3" />
                                  {getPhotoCount(r) > 0 && (
                                    <span className="text-[10px] font-bold">{t("store_check_photo_count").replace("{n}", String(getPhotoCount(r)))}</span>
                                  )}
                                </Button>
                              ) : (
                                <span className="text-muted-foreground text-[11px]">-</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {checkRows.length > 0 && (
                  <>
                    <label className="text-xs font-semibold block mt-4 mb-1">{t("store_total_comment")}</label>
                    <Input
                      className="text-xs"
                      value={totalMemo}
                      onChange={(e) => !viewOnlyMode && setTotalMemo(e.target.value)}
                      placeholder=""
                      readOnly={viewOnlyMode}
                    />
                    {totalMemo?.trim() && transMap[totalMemo.trim()] && (
                      <p className="text-xs text-muted-foreground mt-1 font-medium" title={totalMemo}>{tr(totalMemo)}</p>
                    )}
                    <Button
                      className="w-full mt-4 py-6 font-bold"
                      onClick={handleSaveCheck}
                      disabled={saveLoading || viewOnlyMode}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {saveLoading ? t("loading") : t("store_save_check")}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
            <Dialog open={remarkModalIdx !== null} onOpenChange={(open) => !open && setRemarkModalIdx(null)}>
              <DialogContent className={cn("max-w-md", ADMIN_DIALOG_SCROLL_CN)}>
                <DialogHeader>
                  <DialogTitle>
                    {t("store_remark_modal_title")}
                    {remarkModalIdx != null && checkRows[remarkModalIdx] && (
                      <span className="text-muted-foreground font-normal text-sm"> — {tr(checkRows[remarkModalIdx].name)}</span>
                    )}
                  </DialogTitle>
                </DialogHeader>
                {remarkModalIdx != null && checkRows[remarkModalIdx] && (
                  <Textarea
                    className="min-h-[120px] text-sm"
                    value={checkRows[remarkModalIdx].remark}
                    onChange={(e) => updateCheckRow(remarkModalIdx, "remark", e.target.value)}
                    placeholder={t("store_remark")}
                    readOnly={viewOnlyMode}
                  />
                )}
                <DialogFooter>
                  <Button onClick={() => setRemarkModalIdx(null)}>{t("btn_close")}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Before/After Photo Modal */}
            <Dialog open={photoModalIdx !== null} onOpenChange={(open) => { if (!open) { setPhotoModalIdx(null); setPhotoViewerUrl(null) } }}>
              <DialogContent className={cn("max-w-lg", ADMIN_DIALOG_SCROLL_CN)}>
                <DialogHeader>
                  <DialogTitle>
                    {t("store_check_photo_title")}
                    {photoModalIdx != null && checkRows[photoModalIdx] && (
                      <span className="text-muted-foreground font-normal text-sm"> — {tr(checkRows[photoModalIdx].name)}</span>
                    )}
                  </DialogTitle>
                </DialogHeader>
                {photoModalIdx != null && checkRows[photoModalIdx] && (
                  <div className="space-y-4">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => handlePhotoUpload(e.target.files)}
                    />

                    {/* Before Section */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold">{t("store_check_photo_before")}</h4>
                        {!viewOnlyMode && checkRows[photoModalIdx].beforePhotos.length < MAX_PHOTOS && (
                          <Button
                            variant="outline"
                            size="sm"
                            className={ADMIN_BTN_XS_CN}
                            disabled={photoUploading}
                            onClick={() => {
                              setPhotoPhase("before")
                              photoInputRef.current?.click()
                            }}
                          >
                            {photoUploading && photoPhase === "before" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                            {photoUploading && photoPhase === "before" ? t("store_check_photo_uploading") : t("store_check_photo_add")}
                          </Button>
                        )}
                      </div>
                      {checkRows[photoModalIdx].beforePhotos.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-3 text-center border rounded-md border-dashed">-</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {checkRows[photoModalIdx].beforePhotos.map((url, pi) => (
                            <div key={pi} className="relative group">
                              <img
                                src={url}
                                alt={`before-${pi + 1}`}
                                className="h-20 w-20 object-cover rounded-md border cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => setPhotoViewerUrl(url)}
                              />
                              {!viewOnlyMode && (
                                <button
                                  type="button"
                                  className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => removePhoto(photoModalIdx, "before", pi)}
                                >
                                  <XIcon className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* After Section */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold">{t("store_check_photo_after")}</h4>
                        {!viewOnlyMode && checkRows[photoModalIdx].afterPhotos.length < MAX_PHOTOS && (
                          <Button
                            variant="outline"
                            size="sm"
                            className={ADMIN_BTN_XS_CN}
                            disabled={photoUploading}
                            onClick={() => {
                              setPhotoPhase("after")
                              photoInputRef.current?.click()
                            }}
                          >
                            {photoUploading && photoPhase === "after" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                            {photoUploading && photoPhase === "after" ? t("store_check_photo_uploading") : t("store_check_photo_add")}
                          </Button>
                        )}
                      </div>
                      {checkRows[photoModalIdx].afterPhotos.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-3 text-center border rounded-md border-dashed">-</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {checkRows[photoModalIdx].afterPhotos.map((url, pi) => (
                            <div key={pi} className="relative group">
                              <img
                                src={url}
                                alt={`after-${pi + 1}`}
                                className="h-20 w-20 object-cover rounded-md border cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => setPhotoViewerUrl(url)}
                              />
                              {!viewOnlyMode && (
                                <button
                                  type="button"
                                  className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => removePhoto(photoModalIdx, "after", pi)}
                                >
                                  <XIcon className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <p className="text-[11px] text-muted-foreground text-center">{t("store_check_photo_limit")}</p>
                  </div>
                )}
                <DialogFooter>
                  <Button onClick={() => { setPhotoModalIdx(null); setPhotoViewerUrl(null) }}>{t("btn_close")}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Photo Viewer (full-size) */}
            <Dialog open={photoViewerUrl !== null} onOpenChange={(open) => !open && setPhotoViewerUrl(null)}>
              <DialogContent className="max-w-3xl p-2">
                {photoViewerUrl && (
                  <img src={photoViewerUrl} alt="photo" className="w-full h-auto max-h-[80vh] object-contain rounded-md" />
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="failedSummary" className={adminTabsContentCn}>
            <Card>
              <CardContent className="pt-6">
                <AdminFilterBar className="mb-4">
                  <AdminFilterField label={t("store_filter_period")}>
                    <div className="flex items-center gap-1">
                      <Input type="date" value={histStart} onChange={(e) => setHistStart(e.target.value)} className="h-9 w-[130px] text-xs" />
                      <span className="text-muted-foreground">~</span>
                      <Input type="date" value={histEnd} onChange={(e) => setHistEnd(e.target.value)} className="h-9 w-[130px] text-xs" />
                    </div>
                  </AdminFilterField>
                  <AdminFilterField label={t("store_filter_store")}>
                    <Select value={histStore} onValueChange={setHistStore}>
                      <SelectTrigger className="h-9 w-[120px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {stores.map((st) => (
                          <SelectItem key={st} value={st}>{st === "All" ? t("store_all_stores") : st}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </AdminFilterField>
                  <AdminFilterField label={t("store_check_inspector")}>
                    <Input
                      value={histInspector}
                      onChange={(e) => setHistInspector(e.target.value)}
                      placeholder={t("store_inspector_ph")}
                      className="h-9 w-[140px] text-xs"
                    />
                  </AdminFilterField>
                  <Button className="h-9 font-medium self-end" onClick={searchHistory} disabled={histLoading}>
                    <Search className="mr-1.5 h-3.5 w-3.5" />
                    {histLoading ? t("loading") : t("btn_query_go")}
                  </Button>
                </AdminFilterBar>
                {(() => {
                  type XRow = { date: string; store: string; inspector: string; main: string; sub: string; name: string; remark: string; beforePhotos: string[]; afterPhotos: string[] }
                  const xRows: XRow[] = []
                  for (const h of histList) {
                    if (h.result === "PASS") continue
                    try {
                      const arr = JSON.parse(h.json || "[]") as { main?: string; sub?: string; name?: string; val?: string; remark?: string; beforePhotos?: string[]; afterPhotos?: string[] }[]
                      for (const it of arr) {
                        if (it.val === "X") {
                          xRows.push({
                            date: h.date,
                            store: h.store,
                            inspector: h.inspector,
                            main: it.main || "",
                            sub: it.sub || "",
                            name: it.name || "",
                            remark: it.remark || "",
                            beforePhotos: Array.isArray(it.beforePhotos) ? it.beforePhotos : [],
                            afterPhotos: Array.isArray(it.afterPhotos) ? it.afterPhotos : [],
                          })
                        }
                      }
                    } catch { /* ignore */ }
                  }
                  return (
                    <>
                    <AdminDesktopOnly>
                    <AdminTableScroll>
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="p-2 text-center font-medium">{t("store_col_date")}</th>
                            <th className="p-2 text-center font-medium">{t("store")}</th>
                            <th className="p-2 text-center font-medium">{t("store_col_inspector")}</th>
                            <th className="p-2 text-center font-medium">{t("store_col_item_path")}</th>
                            <th className="p-2 text-left font-medium min-w-[200px]">{t("store_remark")}</th>
                            <th className="p-2 text-center font-medium w-16">{t("store_check_photo_btn")}</th>
                            <th className="p-2 text-center font-medium w-24">{t("store_col_manage")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {histLoading ? (
                            <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">{t("loading")}</td></tr>
                          ) : xRows.length === 0 ? (
                            <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">-</td></tr>
                          ) : (
                            xRows.map((x, i) => {
                              const itemPath = [tr(x.main), tr(x.sub), tr(x.name)].filter(Boolean).join(" > ") || "-"
                              const pCount = x.beforePhotos.length + x.afterPhotos.length
                              return (
                              <tr key={`${x.date}-${x.store}-${i}`} className="border-b border-border/60 hover:bg-muted/30">
                                <td className="p-2 text-center">{x.date}</td>
                                <td className="p-2 text-center">{x.store}</td>
                                <td className="p-2 text-center">{x.inspector}</td>
                                <td className="p-2 text-center whitespace-nowrap">{itemPath}</td>
                                <td className="p-2 whitespace-pre-wrap break-words">{tr(x.remark) || "-"}</td>
                                <td className="p-2 text-center">
                                  {pCount > 0 ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className={cn(ADMIN_BTN_XS_CN, "gap-1 border-blue-500 text-blue-600 dark:text-blue-400")}
                                      onClick={() => {
                                        setFailedPhotoViewing({ beforePhotos: x.beforePhotos, afterPhotos: x.afterPhotos, name: x.name })
                                      }}
                                    >
                                      <Camera className="h-3 w-3" />
                                      <span className="text-[10px] font-bold">{t("store_check_photo_count").replace("{n}", String(pCount))}</span>
                                    </Button>
                                  ) : (
                                    <span className="text-muted-foreground text-[11px]">-</span>
                                  )}
                                </td>
                                <td className="p-2 text-center">
                                  <Button asChild variant="outline" size="sm" className={ADMIN_BTN_XS_CN}>
                                    <Link href={repairPrefillHref(x.store, itemPath)}>
                                      <Wrench className="h-3 w-3 mr-1" />
                                      {t("store_check_create_repair")}
                                    </Link>
                                  </Button>
                                </td>
                              </tr>
                            )})
                          )}
                        </tbody>
                      </table>
                    </AdminTableScroll>
                    </AdminDesktopOnly>
                    <AdminMobileOnly>
                      {histLoading ? (
                        <p className="py-6 text-center text-xs text-muted-foreground">{t("loading")}</p>
                      ) : xRows.length === 0 ? (
                        <p className="py-6 text-center text-xs text-muted-foreground">-</p>
                      ) : (
                        <div className="divide-y divide-border/60 rounded-lg border border-border/60">
                          {xRows.map((x, i) => {
                            const itemPath = [tr(x.main), tr(x.sub), tr(x.name)].filter(Boolean).join(" > ") || "-"
                            const pCount = x.beforePhotos.length + x.afterPhotos.length
                            return (
                              <div key={`${x.date}-${x.store}-${i}`} className="space-y-2 px-3 py-3">
                                <p className="text-sm font-semibold leading-snug">{itemPath}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {x.date} · {x.store} · {x.inspector}
                                </p>
                                {tr(x.remark) ? (
                                  <p className="text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
                                    {tr(x.remark)}
                                  </p>
                                ) : null}
                                <div className="flex flex-wrap gap-2">
                                  {pCount > 0 ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-9 gap-1 text-xs"
                                      onClick={() => {
                                        setFailedPhotoViewing({
                                          beforePhotos: x.beforePhotos,
                                          afterPhotos: x.afterPhotos,
                                          name: x.name,
                                        })
                                      }}
                                    >
                                      <Camera className="h-3.5 w-3.5" />
                                      {t("store_check_photo_count").replace("{n}", String(pCount))}
                                    </Button>
                                  ) : null}
                                  <Button asChild size="sm" className="h-9 gap-1 text-xs">
                                    <Link href={repairPrefillHref(x.store, itemPath)}>
                                      <Wrench className="h-3.5 w-3.5" />
                                      {t("store_check_create_repair")}
                                    </Link>
                                  </Button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </AdminMobileOnly>
                    </>
                  )
                })()}
              </CardContent>
            </Card>
            {/* Read-only photo viewer for failedSummary */}
            <Dialog open={failedPhotoViewing !== null} onOpenChange={(open) => { if (!open) { setFailedPhotoViewing(null); setPhotoViewerUrl(null) } }}>
              <DialogContent className={cn("max-w-lg", ADMIN_DIALOG_SCROLL_CN)}>
                <DialogHeader>
                  <DialogTitle>
                    {t("store_check_photo_title")}
                    {failedPhotoViewing && (
                      <span className="text-muted-foreground font-normal text-sm"> — {tr(failedPhotoViewing.name)}</span>
                    )}
                  </DialogTitle>
                </DialogHeader>
                {failedPhotoViewing && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold mb-2">{t("store_check_photo_before")}</h4>
                      {failedPhotoViewing.beforePhotos.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-3 text-center border rounded-md border-dashed">-</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {failedPhotoViewing.beforePhotos.map((url, pi) => (
                            <img
                              key={pi}
                              src={url}
                              alt={`before-${pi + 1}`}
                              className="h-20 w-20 object-cover rounded-md border cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => setPhotoViewerUrl(url)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold mb-2">{t("store_check_photo_after")}</h4>
                      {failedPhotoViewing.afterPhotos.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-3 text-center border rounded-md border-dashed">-</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {failedPhotoViewing.afterPhotos.map((url, pi) => (
                            <img
                              key={pi}
                              src={url}
                              alt={`after-${pi + 1}`}
                              className="h-20 w-20 object-cover rounded-md border cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => setPhotoViewerUrl(url)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button onClick={() => { setFailedPhotoViewing(null); setPhotoViewerUrl(null) }}>{t("btn_close")}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="history" className={adminTabsContentCn}>
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-end gap-2 mb-4">
                  <span className="text-xs font-semibold">{t("store_hist_period")}</span>
                  <Input type="date" value={histStart} onChange={(e) => setHistStart(e.target.value)} className="h-9 w-[130px] text-xs" />
                  <span>~</span>
                  <Input type="date" value={histEnd} onChange={(e) => setHistEnd(e.target.value)} className="h-9 w-[130px] text-xs" />
                  <Select value={histStore} onValueChange={setHistStore}>
                    <SelectTrigger className="h-9 w-[120px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map((st) => (
                        <SelectItem key={st} value={st}>{st === "All" ? t("store_all_stores") : st}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={histInspector}
                    onChange={(e) => setHistInspector(e.target.value)}
                    placeholder={t("store_inspector_ph")}
                    className="h-9 w-[140px] text-xs"
                  />
                  <Button className="h-9 font-medium" onClick={searchHistory} disabled={histLoading}>
                    <Search className="mr-1.5 h-3.5 w-3.5" />
                    {histLoading ? t("loading") : t("btn_query_go")}
                  </Button>
                </div>

                <div>
                  <AdminDesktopOnly>
                  <AdminTableScroll>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-2 text-center font-medium">{t("store_col_date")}</th>
                        <th className="p-2 text-center font-medium">{t("store")}</th>
                        <th className="p-2 text-center font-medium">{t("store_col_inspector")}</th>
                        <th className="p-2 text-center font-medium">{t("store_col_result")}</th>
                        <th className="p-2 text-center font-medium w-28">{t("store_col_manage")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {histLoading ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-muted-foreground">
                            {t("loading")}
                          </td>
                        </tr>
                      ) : histList.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-muted-foreground">
                            -
                          </td>
                        </tr>
                      ) : (
                        histList.map((h) => (
                          <tr key={h.id} className="border-b border-border/60 hover:bg-muted/30">
                            <td className="p-2 text-center">{h.date}</td>
                            <td className="p-2 text-center">{h.store}</td>
                            <td className="p-2 text-center">{h.inspector}</td>
                            <td className="p-2 text-center">{resultBadge(h.result || "")}</td>
                            <td className="p-2">
                              <div className="flex gap-1 justify-center">
                                <Button size="sm" variant="outline" className={ADMIN_BTN_XS_CN} onClick={() => loadHistoryIntoForm(h, true)} title={t("store_check_view_readonly")}>
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="outline" className={ADMIN_BTN_XS_CN} onClick={() => loadHistoryIntoForm(h, false)} title={t("store_check_edit_btn")}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="destructive" className={ADMIN_BTN_XS_CN} onClick={() => handleDeleteHistory(h.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  </AdminTableScroll>
                  </AdminDesktopOnly>
                  <AdminMobileOnly>
                    {histLoading ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">{t("loading")}</p>
                    ) : histList.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">-</p>
                    ) : (
                      <div className="divide-y divide-border/60 rounded-lg border border-border/60">
                        {histList.map((h) => (
                          <div key={h.id} className="space-y-2 px-3 py-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold">{h.store}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {h.date} · {h.inspector}
                                </p>
                              </div>
                              {resultBadge(h.result || "")}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" variant="outline" className="h-9 gap-1 text-xs" onClick={() => loadHistoryIntoForm(h, true)}>
                                <Eye className="h-3.5 w-3.5" />
                                {t("store_check_view_readonly")}
                              </Button>
                              <Button size="sm" variant="outline" className="h-9 gap-1 text-xs" onClick={() => loadHistoryIntoForm(h, false)}>
                                <Pencil className="h-3.5 w-3.5" />
                                {t("store_check_edit_btn")}
                              </Button>
                              <Button size="sm" variant="destructive" className="h-9 text-xs" onClick={() => handleDeleteHistory(h.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </AdminMobileOnly>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {isHQ && (
            <TabsContent value="setting" className={adminTabsContentCn}>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex justify-between items-center mb-4">
                    <h6 className="font-semibold text-sm">{t("store_setting_title")}</h6>
                    <Button variant="outline" size="sm" onClick={loadSettingItems} disabled={settingLoading}>
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      {t("store_refresh")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{t("store_setting_desc")}</p>

                  <div className="flex flex-wrap items-end gap-2 mb-4 p-3 rounded border bg-muted/30">
                    <Input
                      className="h-8 w-36 min-w-[140px] text-xs"
                      value={newMain}
                      onChange={(e) => setNewMain(e.target.value)}
                      placeholder={t("store_cat_main")}
                    />
                    <Input
                      className="h-8 w-36 min-w-[140px] text-xs"
                      value={newSub}
                      onChange={(e) => setNewSub(e.target.value)}
                      placeholder={t("store_cat_sub")}
                    />
                    <Input
                      className="h-8 w-48 min-w-[200px] text-xs flex-1"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={t("store_check_item")}
                    />
                    <Button size="sm" className="h-8" onClick={handleAddCheckItem} disabled={settingAdding}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      {settingAdding ? t("loading") : t("btn_add")}
                    </Button>
                  </div>

                  <div className="overflow-auto max-h-[400px] border rounded-md">
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 bg-muted">
                        <tr>
                          <th className="p-2 text-center w-12 font-medium">{t("store_no")}</th>
                          <th className="p-2 text-center w-[70px] font-medium">{t("eval_order")}</th>
                          <th className="p-2 text-left font-medium">{t("store_cat_main")}</th>
                          <th className="p-2 text-left font-medium">{t("store_cat_sub")}</th>
                          <th className="p-2 text-left font-medium">{t("store_check_item")}</th>
                          <th className="p-2 text-center w-16 font-medium">{t("eval_use")}</th>
                          <th className="p-2 text-center w-16 font-medium">{t("delete")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {settingItems.map((it, idx) => (
                          <tr key={it.id} className="border-b border-border/60">
                            <td className="p-2 text-center">{it.id}</td>
                            <td className="p-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => moveSettingItemUp(idx)}
                                  disabled={idx === 0}
                                >
                                  {t("eval_order_up") || "▲"}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => moveSettingItemDown(idx)}
                                  disabled={idx === settingItems.length - 1}
                                >
                                  {t("eval_order_down") || "▼"}
                                </Button>
                              </div>
                            </td>
                            <td className="p-2">
                              <Input
                                className="h-7 text-xs"
                                value={it.main ?? ""}
                                onChange={(e) => updateSettingItem(idx, "main", e.target.value)}
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                className="h-7 text-xs"
                                value={it.sub ?? ""}
                                onChange={(e) => updateSettingItem(idx, "sub", e.target.value)}
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                className="h-7 text-xs"
                                value={it.name}
                                onChange={(e) => updateSettingItem(idx, "name", e.target.value)}
                              />
                            </td>
                            <td className="p-2 text-center">
                              <input
                                type="checkbox"
                                checked={it.use !== false}
                                onChange={(e) => updateSettingItem(idx, "use", e.target.checked)}
                                className="rounded"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <Button size="sm" variant="destructive" className={ADMIN_BTN_XS_CN} onClick={() => handleDeleteCheckItem(it.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button className="w-full mt-4 py-6 font-bold" onClick={handleSaveSettings} disabled={settingSaving}>
                    <Save className="mr-2 h-4 w-4" />
                    {settingSaving ? t("loading") : t("store_save_settings")}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
    </StorePageShell>
  )
}
