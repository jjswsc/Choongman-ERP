"use client"

import { useState, useEffect } from "react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { ClipboardCheck, RefreshCw, Save, Search, Eye, Pencil, Trash2, Plus } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { isManagerRole } from "@/lib/permissions"
import {
  getLoginData,
  getChecklistItems,
  saveCheckResult,
  getCheckHistory,
  deleteCheckHistory,
  updateChecklistItems,
  addChecklistItem,
  deleteChecklistItem,
  translateTexts,
  type ChecklistItem,
  type CheckHistoryItem,
} from "@/lib/api-client"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

type CheckRow = { id: number; main: string; sub: string; name: string; val: "O" | "X"; remark: string }

export function AdminStoreCheck() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const [tab, setTab] = useState<"check" | "history" | "setting">("check")
  const [stores, setStores] = useState<string[]>([])
  const [storeSelect, setStoreSelect] = useState("")
  const [dateSelect, setDateSelect] = useState(todayStr())
  const [checkItems, setCheckItems] = useState<ChecklistItem[]>([])
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

  const isHQ = auth?.role === "director" || auth?.role === "officer"
  const isManager = isManagerRole(auth?.role || "")
  const inspectorName = auth?.user || auth?.store || ""

  // 로그인 언어로 점검 항목/비고 자동 번역
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
  }, [checkRows, totalMemo, settingItems, lang])

  useEffect(() => {
    if (!auth?.store) return
    getLoginData().then((r) => {
      const keys = Object.keys(r.users || {}).filter(Boolean).sort()
      let list: string[]
      if (isManager) {
        list = [auth.store]
        setStoreSelect(auth.store)
        setHistStore(auth.store)
      } else if (isHQ) {
        list = ["All", ...keys]
        if (list.length > 0 && !storeSelect) setStoreSelect(list.find((s) => s !== "All") || list[0] || "")
      } else {
        list = keys
        setStoreSelect(auth.store)
      }
      setStores(list)
    })
  }, [auth?.store, auth?.role, auth?.user, isHQ, isManager])

  const loadChecklistForm = async () => {
    if (!storeSelect || !dateSelect) {
      alert(t("store_load_hint"))
      return
    }
    setLoadFormLoading(true)
    setCheckRows([])
    setEditId("")
    setViewOnlyMode(false)
    setTotalMemo("")
    try {
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
      const data = JSON.parse(h.json || "[]") as { id: number; main: string; sub: string; name: string; val: "O" | "X"; remark: string }[]
      rows = data.map((d) => ({
        id: d.id,
        main: d.main || "",
        sub: d.sub || "",
        name: d.name || "",
        val: d.val === "X" ? "X" : "O",
        remark: d.remark || "",
      }))
    } catch {
      rows = items.map((it) => ({ id: it.id, main: it.main, sub: it.sub, name: it.name, val: "O" as const, remark: "" }))
    }
    for (const it of items) {
      if (!rows.find((r) => r.id === it.id)) {
        rows.push({ id: it.id, main: it.main, sub: it.sub, name: it.name, val: "O", remark: "" })
      }
    }
    rows.sort((a, b) => a.id - b.id)
    setCheckRows(rows)
    setTab("check")
  }

  const handleSaveCheck = async () => {
    if (!storeSelect || !dateSelect || checkRows.length === 0) {
      alert(t("store_load_hint"))
      return
    }
    if (!confirm(editId ? t("store_check_updated") + "?" : t("store_save_check") + "?")) return
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
      alert(editId ? t("store_check_updated") : t("store_check_saved"))
      setEditId("")
      setTotalMemo("")
      setCheckRows([])
      setTab("history")
      searchHistory()
    } catch (e) {
      alert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
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
    if (!confirm(t("store_check_delete_confirm"))) return
    try {
      await deleteCheckHistory(id)
      alert(t("store_check_deleted"))
      searchHistory()
    } catch (e) {
      alert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
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

  const handleSaveSettings = async () => {
    setSettingSaving(true)
    try {
      const updates = settingItems.map((it) => ({ id: it.id, name: it.name, use: it.use }))
      await updateChecklistItems(updates)
      alert(t("store_check_saved"))
      loadSettingItems()
    } catch (e) {
      alert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
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
      alert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSettingAdding(false)
    }
  }

  const handleDeleteCheckItem = async (id: string | number) => {
    if (!confirm(t("msg_delete_confirm_check_item"))) return
    try {
      await deleteChecklistItem(id)
      loadSettingItems()
    } catch (e) {
      alert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    }
  }

  const updateCheckRow = (idx: number, field: "val" | "remark", value: string) => {
    setCheckRows((prev) =>
      prev.map((r, i) =>
        i === idx ? (field === "val" ? { ...r, val: value as "O" | "X" } : { ...r, remark: value }) : r
      )
    )
  }

  const tr = (s: string) => (s && transMap[s]) || s || ""

  const updateSettingItem = (idx: number, field: "name" | "use", value: string | boolean) => {
    setSettingItems((prev) =>
      prev.map((it, i) => (i === idx ? (field === "name" ? { ...it, name: String(value) } : { ...it, use: !!value }) : it))
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <ClipboardCheck className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">{t("adminStoreCheck")}</h1>
        </div>

        <Tabs value={tab} onValueChange={(v) => {
          setTab(v as "check" | "history" | "setting")
          if (v === "history") searchHistory()
          if (v === "setting") loadSettingItems()
        }}>
          <TabsList className={cn("grid w-full max-w-md", isHQ ? "grid-cols-3" : "grid-cols-2")}>
            <TabsTrigger value="check">{t("tab_store_check")}</TabsTrigger>
            <TabsTrigger value="history">{t("tab_store_history")}</TabsTrigger>
            {isHQ && <TabsTrigger value="setting">{t("tab_store_setting")}</TabsTrigger>}
          </TabsList>

          <TabsContent value="check" className="mt-4">
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
                      </tr>
                    </thead>
                    <tbody>
                      {checkRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-muted-foreground">
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
                            <td className="p-2">
                              <div className="flex gap-1 justify-center">
                                <Button
                                  size="sm"
                                  variant={r.val === "O" ? "default" : "outline"}
                                  className="h-7 px-2 text-xs"
                                  onClick={() => !viewOnlyMode && updateCheckRow(idx, "val", "O")}
                                  disabled={viewOnlyMode}
                                >O</Button>
                                <Button
                                  size="sm"
                                  variant={r.val === "X" ? "destructive" : "outline"}
                                  className="h-7 px-2 text-xs"
                                  onClick={() => !viewOnlyMode && updateCheckRow(idx, "val", "X")}
                                  disabled={viewOnlyMode}
                                >X</Button>
                              </div>
                            </td>
                            <td className="p-2">
                              <div className="flex flex-col items-center">
                                <Input
                                  className="h-7 text-xs w-full max-w-xs"
                                  value={r.remark}
                                  onChange={(e) => !viewOnlyMode && updateCheckRow(idx, "remark", e.target.value)}
                                  placeholder=""
                                  readOnly={viewOnlyMode}
                                />
                                {r.remark?.trim() && transMap[r.remark.trim()] && (
                                  <p className="text-[11px] text-muted-foreground mt-1 font-medium" title={r.remark}>{tr(r.remark)}</p>
                                )}
                              </div>
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
          </TabsContent>

          <TabsContent value="history" className="mt-4">
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

                <div className="overflow-x-auto">
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
                            <td className="p-2 text-center">{h.result}</td>
                            <td className="p-2">
                              <div className="flex gap-1 justify-center">
                                <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => loadHistoryIntoForm(h, true)} title={lang === "ko" ? "보기 (수정 불가)" : "View (read-only)"}>
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => loadHistoryIntoForm(h, false)} title={lang === "ko" ? "수정하기" : "Edit"}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="destructive" className="h-7 px-2" onClick={() => handleDeleteHistory(h.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {isHQ && (
            <TabsContent value="setting" className="mt-4">
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
                            <td className="p-2">{tr(it.main)}</td>
                            <td className="p-2">{tr(it.sub)}</td>
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
                              <Button size="sm" variant="destructive" className="h-7 px-2" onClick={() => handleDeleteCheckItem(it.id)}>
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
      </div>
    </div>
  )
}
