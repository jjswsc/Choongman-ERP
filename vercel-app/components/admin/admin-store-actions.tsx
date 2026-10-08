"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert } from "@/lib/app-message"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ClipboardList, ImageIcon, Search, X } from "lucide-react"
import {
  AdminDesktopOnly,
  AdminMobileOnly,
  AdminTableScroll,
} from "@/components/erp/admin-responsive-list"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useAuth } from "@/lib/auth-context"
import {
  hasOfficeStaffScope,
  isFranchiseeRole,
  isManagerRole,
  isOfficeRole,
  isSupervisorRole,
} from "@/lib/permissions"
import {
  useStoreList,
  getStoreActionItems,
  saveStoreActionItem,
  updateStoreActionItem,
  uploadStoreActionPhoto,
  type StoreActionItem,
} from "@/lib/api-client"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { StorePageShell } from "@/components/erp/store-page-shell"
import {
  STORE_ACTION_CATEGORIES,
  STORE_ACTION_PRIORITIES,
  STORE_ACTION_STATUSES,
  isStoreActionOpenStatus,
  storeActionDefaultDueDays,
} from "@/lib/store-action-items"
import {
  STORE_ACTION_CAT_TEMPLATE_I18N,
  addDaysYmd,
  storeActionLabelers,
} from "@/lib/store-action-i18n"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ImageViewerWithRotate } from "@/components/ui/image-viewer-with-rotate"
import { ADMIN_DIALOG_SCROLL_CN } from "@/lib/admin-ui-standards"
import { StoreActionPersonSelect } from "@/components/admin/store-action-person-select"
import { StoreActionTimeline } from "@/components/admin/store-action-timeline"
import { StoreActionTodayBoard } from "@/components/admin/store-action-today-board"
import { StoreActionScorecard } from "@/components/admin/store-action-scorecard"

type TabKey = "today" | "dash" | "list" | "process" | "new" | "score"
const TAB_KEYS: TabKey[] = ["today", "dash", "list", "process", "new", "score"]

function weekStartYmd(today: string): string {
  const d = new Date(`${today}T12:00:00+07:00`)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

export function AdminStoreActions() {
  const searchParams = useSearchParams()
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const label = storeActionLabelers(t)
  const fileRef = useRef<HTMLInputElement>(null)
  const afterFileRef = useRef<HTMLInputElement>(null)
  const newFileRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<TabKey>("today")
  const [stores, setStores] = useState<string[]>([])
  const [listStart, setListStart] = useState(() => addDaysYmd(getBangkokTodayDateString(), -30))
  const [listEnd, setListEnd] = useState(getBangkokTodayDateString)
  const [listStore, setListStore] = useState("All")
  const [listStatus, setListStatus] = useState("__all__")
  const [listCategory, setListCategory] = useState("__all__")
  const [listMine, setListMine] = useState(false)
  const [listQ, setListQ] = useState("")
  const [listData, setListData] = useState<StoreActionItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [openData, setOpenData] = useState<StoreActionItem[]>([])
  const [weekDoneCount, setWeekDoneCount] = useState(0)
  const [dashLoading, setDashLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const writerName = auth?.user || auth?.store || ""
  const myEmployeeId = auth?.employeeId != null && auth.employeeId > 0 ? String(auth.employeeId) : ""
  const isManager = isManagerRole(auth?.role || "") || isFranchiseeRole(auth?.role || "")
  const isHQ = isOfficeRole(auth?.role || "")
  const canVerify =
    hasOfficeStaffScope(auth?.role || "", auth?.store || "") || isSupervisorRole(auth?.role || "")

  const { stores: storeList } = useStoreList()
  const listStoresForFilter = isManager
    ? ["All", ...(storeList || []).filter((k) => k && String(k).trim()).sort()]
    : stores

  const today = getBangkokTodayDateString()
  const wStart = weekStartYmd(today)

  const blankForm = useCallback(
    (store: string) => ({
      store,
      title: "",
      description: "",
      category: "기타",
      priority: "보통",
      ownerName: "",
      ownerUserId: "",
      dueDate: addDaysYmd(getBangkokTodayDateString(), storeActionDefaultDueDays("기타")),
      verifierName: canVerify ? writerName : "",
      verifierUserId: canVerify ? myEmployeeId : "",
      actionPlan: "",
      photoUrls: [] as string[],
      sourceType: "manual",
      sourceRef: "",
      checkItemId: "",
    }),
    [canVerify, writerName, myEmployeeId]
  )

  const [form, setForm] = useState(() => blankForm(""))
  const [edit, setEdit] = useState<StoreActionItem | null>(null)

  useEffect(() => {
    if (!auth?.store) return
    const keys = storeList.filter((k) => k && String(k).trim()).sort()
    let list: string[]
    if (isManager) {
      list = [auth.store]
      setForm((f) => ({
        ...f,
        store: auth.store || "",
        ownerName: f.ownerName || writerName,
        ownerUserId: f.ownerUserId || myEmployeeId,
      }))
    } else {
      list = isHQ || isSupervisorRole(auth.role || "") ? ["All", ...keys] : keys
      if (keys.length) setForm((f) => (f.store ? f : { ...f, store: keys[0] }))
    }
    setStores(list)
    if (canVerify) {
      setForm((f) => (f.verifierName ? f : { ...f, verifierName: writerName, verifierUserId: myEmployeeId }))
    }
  }, [auth?.store, auth?.role, isManager, isHQ, storeList, writerName, myEmployeeId, canVerify])

  useEffect(() => {
    const tabParam = searchParams.get("tab")
    const storeParam = searchParams.get("store")
    const titleParam = searchParams.get("title")
    const categoryParam = searchParams.get("category")
    const priorityParam = searchParams.get("priority")
    const sourceParam = searchParams.get("source")
    const checkItemParam = searchParams.get("checkItem")
    const idParam = searchParams.get("id")
    if (tabParam && (TAB_KEYS as string[]).includes(tabParam)) {
      setTab(tabParam as TabKey)
    }
    if (idParam && /^\d+$/.test(idParam)) {
      setSelectedId(Number(idParam))
      setTab("process")
    }
    if (storeParam || titleParam || categoryParam || priorityParam || sourceParam || checkItemParam) {
      setForm((f) => {
        const category = categoryParam || f.category
        return {
          ...f,
          store: storeParam || f.store,
          title: titleParam || f.title,
          category,
          priority: priorityParam || f.priority,
          dueDate: categoryParam
            ? addDaysYmd(getBangkokTodayDateString(), storeActionDefaultDueDays(category))
            : f.dueDate,
          description: titleParam ? `[점검 연계] ${titleParam}` : f.description,
          sourceType: sourceParam === "check_fail" ? "check_fail" : sourceParam || f.sourceType,
          checkItemId: checkItemParam || f.checkItemId,
        }
      })
    }
  }, [searchParams])

  const loadList = useCallback(async () => {
    setListLoading(true)
    try {
      const list = await getStoreActionItems({
        startStr: listStart || undefined,
        endStr: listEnd || undefined,
        store: listStore && listStore !== "All" ? listStore : undefined,
        status: listStatus && listStatus !== "__all__" ? listStatus : undefined,
        category: listCategory && listCategory !== "__all__" ? listCategory : undefined,
        mine: listMine || undefined,
        q: listQ.trim() || undefined,
      })
      setListData(list || [])
    } catch {
      setListData([])
    } finally {
      setListLoading(false)
    }
  }, [listStart, listEnd, listStore, listStatus, listCategory, listMine, listQ])

  const loadDash = useCallback(async () => {
    setDashLoading(true)
    try {
      const [open, done] = await Promise.all([
        getStoreActionItems({ openOnly: true }),
        getStoreActionItems({ completedSince: wStart }),
      ])
      setOpenData(open || [])
      setWeekDoneCount((done || []).length)
    } catch {
      setOpenData([])
      setWeekDoneCount(0)
    } finally {
      setDashLoading(false)
    }
  }, [wStart])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    void loadDash()
  }, [loadDash, refreshKey])

  const refreshAll = useCallback(() => {
    void loadList()
    setRefreshKey((k) => k + 1)
  }, [loadList])

  useEffect(() => {
    if (selectedId == null) {
      setEdit(null)
      return
    }
    const found = listData.find((x) => x.id === selectedId) || openData.find((x) => x.id === selectedId)
    if (found) setEdit({ ...found })
    else {
      void getStoreActionItems({ id: selectedId }).then((rows) => {
        if (rows[0]) setEdit({ ...rows[0] })
      })
    }
  }, [selectedId, listData, openData])

  const stats = useMemo(() => {
    const overdue = openData.filter((x) => x.overdue).length
    const pendingVerify = openData.filter((x) => x.status === "pending_verify").length
    const inProgress = openData.filter((x) => x.status === "in_progress" || x.status === "open").length
    const recur = openData.filter((x) => (x.repeatCount || 0) >= 1).length
    return { overdue, pendingVerify, inProgress, weekDone: weekDoneCount, recur }
  }, [openData, weekDoneCount])

  const overdueByStore = useMemo(() => {
    const m = new Map<string, { overdue: number; open: number; recur: number }>()
    for (const r of openData) {
      const s = m.get(r.store) || { overdue: 0, open: 0, recur: 0 }
      s.open += 1
      if (r.overdue) s.overdue += 1
      if (r.repeatCount > 0) s.recur += 1
      m.set(r.store, s)
    }
    return [...m.entries()]
      .map(([store, s]) => ({ store, ...s }))
      .sort((a, b) => b.overdue - a.overdue || b.open - a.open)
      .slice(0, 12)
  }, [openData])

  const resetForm = useCallback(() => {
    setForm((f) => ({
      ...blankForm(isManager ? auth?.store || "" : f.store),
      ownerName: isManager ? writerName : "",
      ownerUserId: isManager ? myEmployeeId : "",
    }))
  }, [isManager, auth?.store, blankForm, writerName, myEmployeeId])

  const onFormCategory = (category: string) => {
    setForm((f) => {
      const prevTpl = t(STORE_ACTION_CAT_TEMPLATE_I18N[f.category] || "action_tpl_etc")
      const nextTpl = t(STORE_ACTION_CAT_TEMPLATE_I18N[category] || "action_tpl_etc")
      const planUntouched = !f.actionPlan.trim() || f.actionPlan === prevTpl
      return {
        ...f,
        category,
        dueDate: addDaysYmd(getBangkokTodayDateString(), storeActionDefaultDueDays(category)),
        actionPlan: planUntouched ? nextTpl : f.actionPlan,
      }
    })
  }

  const handleUpload = async (files: FileList | null, target: "form" | "before" | "after") => {
    if (!files?.length) return
    const store = target === "form" ? form.store : edit?.store || form.store
    if (!store) {
      await appAlert(t("store_load_hint"))
      return
    }
    const urls: string[] = []
    for (let i = 0; i < files.length; i++) {
      const res = await uploadStoreActionPhoto(store, files[i])
      if (res.success && res.url) urls.push(res.url)
      else await appAlert(translateApiMessage(res.message, t) || t("msg_upload_fail"))
    }
    if (!urls.length) return
    if (target === "form") setForm((f) => ({ ...f, photoUrls: [...f.photoUrls, ...urls] }))
    else if (edit) {
      if (target === "after") setEdit({ ...edit, afterPhotoUrls: [...(edit.afterPhotoUrls || []), ...urls] })
      else setEdit({ ...edit, photoUrls: [...(edit.photoUrls || []), ...urls] })
    }
  }

  const handleSaveNew = async () => {
    if (!form.store || !form.title.trim() || !form.ownerName.trim() || !form.dueDate || !form.verifierName.trim()) {
      await appAlert(t("action_required_fields"))
      return
    }
    setSaveLoading(true)
    try {
      const res = await saveStoreActionItem({
        store: form.store,
        title: form.title,
        description: form.description,
        category: form.category,
        priority: form.priority,
        ownerName: form.ownerName,
        ownerUserId: form.ownerUserId,
        dueDate: form.dueDate,
        verifierName: form.verifierName,
        verifierUserId: form.verifierUserId,
        actionPlan: form.actionPlan,
        photoUrls: form.photoUrls,
        sourceType: form.sourceType,
        sourceRef: form.sourceRef,
        checkItemId: form.checkItemId,
        createdBy: writerName,
      })
      if (res.success) {
        const base = translateApiMessage(res.message, t) || t("store_check_saved")
        const repeatMsg =
          res.repeatCount && res.repeatCount > 0
            ? `\n${t("action_repeat_saved").replace("{n}", String(res.repeatCount))}`
            : ""
        await appAlert(base + repeatMsg)
        resetForm()
        refreshAll()
        setTab("list")
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail"))
      }
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaveLoading(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!edit?.id) return
    setSaveLoading(true)
    try {
      const res = await updateStoreActionItem(edit.id, {
        store: edit.store,
        title: edit.title,
        description: edit.description,
        category: edit.category,
        priority: edit.priority,
        ownerName: edit.ownerName,
        ownerUserId: edit.ownerUserId,
        dueDate: edit.dueDate,
        verifierName: edit.verifierName,
        verifierUserId: edit.verifierUserId,
        actionPlan: edit.actionPlan,
        resolutionNote: edit.resolutionNote,
        verificationNote: edit.verificationNote,
        photoUrls: edit.photoUrls,
        afterPhotoUrls: edit.afterPhotoUrls,
        status: edit.status,
      })
      if (res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("store_check_updated"))
        refreshAll()
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("msg_modify_fail"))
      }
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaveLoading(false)
    }
  }

  const runAction = async (action: string) => {
    if (!edit?.id) return
    setSaveLoading(true)
    try {
      const res = await updateStoreActionItem(
        edit.id,
        {
          resolutionNote: edit.resolutionNote,
          verificationNote: edit.verificationNote,
          afterPhotoUrls: edit.afterPhotoUrls,
        },
        action
      )
      if (res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("store_check_updated"))
        refreshAll()
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("msg_modify_fail"))
      }
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaveLoading(false)
    }
  }

  const openProcessById = (id: number) => {
    setSelectedId(id)
    setTab("process")
  }

  const rowClass = (row: StoreActionItem) =>
    cn(
      row.overdue && "bg-red-50 dark:bg-red-950/30",
      row.status === "pending_verify" && !row.overdue && "bg-amber-50 dark:bg-amber-950/20"
    )

  const repeatBadge = (n: number) =>
    n > 0 ? (
      <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700 dark:bg-violet-900 dark:text-violet-100">
        {t("action_repeat_n").replace("{n}", String(n))}
      </span>
    ) : null

  return (
    <StorePageShell icon={ClipboardList} title={t("adminStoreActions")} subtitle={t("action_page_sub")}>
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className={adminTabsRootCn}>
        <AdminTabsBarWithHelp>
          <TabsList className={adminTabsListRowCn}>
            <TabsTrigger value="today" className={adminTabsTriggerCn}>
              {t("tab_action_today")}
            </TabsTrigger>
            <TabsTrigger value="dash" className={adminTabsTriggerCn}>
              {t("tab_action_dashboard")}
            </TabsTrigger>
            <TabsTrigger value="list" className={adminTabsTriggerCn}>
              {t("tab_action_list")}
            </TabsTrigger>
            <TabsTrigger value="process" className={adminTabsTriggerCn}>
              {t("tab_action_process")}
            </TabsTrigger>
            <TabsTrigger value="new" className={adminTabsTriggerCn}>
              {t("tab_action_new")}
            </TabsTrigger>
            <TabsTrigger value="score" className={adminTabsTriggerCn}>
              {t("tab_action_score")}
            </TabsTrigger>
          </TabsList>
        </AdminTabsBarWithHelp>

        <TabsContent value="today" className={cn(adminTabsContentCn, "space-y-3")}>
          <StoreActionTodayBoard t={t} canVerify={canVerify} onOpen={openProcessById} refreshKey={refreshKey} />
        </TabsContent>

        <TabsContent value="dash" className={cn(adminTabsContentCn, "space-y-4")}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: t("action_kpi_overdue"), value: stats.overdue, className: "border-red-500/40" },
              { label: t("action_kpi_pending_verify"), value: stats.pendingVerify, className: "border-amber-500/40" },
              { label: t("action_kpi_open"), value: stats.inProgress, className: "border-blue-500/40" },
              { label: t("action_kpi_week_done"), value: stats.weekDone, className: "border-emerald-500/40" },
              { label: t("action_kpi_repeat"), value: stats.recur, className: "border-violet-500/40" },
            ].map((k) => (
              <Card key={k.label} className={`border-l-4 ${k.className}`}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-2xl font-bold tabular-nums">{dashLoading ? "—" : k.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          {overdueByStore.length > 0 ? (
            <Card>
              <CardContent className="space-y-2 p-3">
                <p className="text-xs font-semibold">{t("action_dash_by_store")}</p>
                <AdminTableScroll>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="p-1.5">{t("store_filter_store")}</th>
                        <th className="p-1.5 text-right">{t("action_kpi_overdue")}</th>
                        <th className="p-1.5 text-right">{t("action_kpi_open")}</th>
                        <th className="p-1.5 text-right">{t("action_kpi_repeat")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overdueByStore.map((s) => (
                        <tr
                          key={s.store}
                          className="cursor-pointer border-b hover:bg-muted/40"
                          onClick={() => {
                            setListStore(s.store)
                            setListStatus("__all__")
                            setTab("list")
                          }}
                        >
                          <td className="p-1.5 font-medium">{s.store}</td>
                          <td className={cn("p-1.5 text-right tabular-nums", s.overdue > 0 && "font-semibold text-red-600")}>
                            {s.overdue}
                          </td>
                          <td className="p-1.5 text-right tabular-nums">{s.open}</td>
                          <td className="p-1.5 text-right tabular-nums">{s.recur}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </AdminTableScroll>
              </CardContent>
            </Card>
          ) : null}
          <p className="text-xs text-muted-foreground">{t("action_dash_hint")}</p>
        </TabsContent>

        <TabsContent value="list" className={cn(adminTabsContentCn, "space-y-3")}>
          <div className="flex flex-wrap gap-2">
            <Input type="date" value={listStart} onChange={(e) => setListStart(e.target.value)} className="h-9 w-[140px] text-xs" />
            <Input type="date" value={listEnd} onChange={(e) => setListEnd(e.target.value)} className="h-9 w-[140px] text-xs" />
            <Select value={listStore} onValueChange={setListStore}>
              <SelectTrigger className="h-9 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {listStoresForFilter.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={listStatus} onValueChange={setListStatus}>
              <SelectTrigger className="h-9 w-[150px] text-xs">
                <SelectValue placeholder={t("action_filter_status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("action_filter_all")}</SelectItem>
                {STORE_ACTION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {label.status(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={listCategory} onValueChange={setListCategory}>
              <SelectTrigger className="h-9 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("action_filter_all")}</SelectItem>
                {STORE_ACTION_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {label.category(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex h-9 items-center gap-1.5 rounded-md border px-2 text-xs">
              <input type="checkbox" checked={listMine} onChange={(e) => setListMine(e.target.checked)} />
              {t("action_filter_mine")}
            </label>
            <div className="flex gap-1">
              <Input
                value={listQ}
                onChange={(e) => setListQ(e.target.value)}
                placeholder={t("store_filter_search")}
                className="h-9 w-[160px] text-xs"
              />
              <Button type="button" size="sm" className="h-9" onClick={() => void loadList()}>
                <Search className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <AdminDesktopOnly>
            <AdminTableScroll>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-2">{t("store_filter_store")}</th>
                    <th className="p-2">{t("action_field_title")}</th>
                    <th className="p-2">{t("action_field_owner")}</th>
                    <th className="p-2">{t("action_field_verifier")}</th>
                    <th className="p-2">{t("action_field_due")}</th>
                    <th className="p-2">{t("action_field_status")}</th>
                    <th className="p-2">{t("action_field_repeat")}</th>
                  </tr>
                </thead>
                <tbody>
                  {listData.map((row) => (
                    <tr
                      key={row.id}
                      className={cn("border-b cursor-pointer hover:bg-muted/40", rowClass(row))}
                      onClick={() => openProcessById(row.id)}
                    >
                      <td className="p-2">{row.store}</td>
                      <td className="p-2 font-medium">{row.title}</td>
                      <td className="p-2">{row.ownerName}</td>
                      <td className="p-2">{row.verifierName}</td>
                      <td className={cn("p-2 tabular-nums", row.overdue && "font-semibold text-red-600")}>
                        {row.dueDate || "—"}
                      </td>
                      <td className="p-2">{label.status(row.status)}</td>
                      <td className="p-2">{repeatBadge(row.repeatCount || 0) || "0"}</td>
                    </tr>
                  ))}
                  {!listLoading && listData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">
                        {t("action_empty")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </AdminTableScroll>
          </AdminDesktopOnly>

          <AdminMobileOnly>
            <div className="space-y-2">
              {listData.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={cn("w-full rounded-lg border p-3 text-left text-xs space-y-1", rowClass(row))}
                  onClick={() => openProcessById(row.id)}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">{row.title}</span>
                    <span className={row.overdue ? "text-red-600 font-semibold" : ""}>{row.dueDate || "—"}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
                    {row.store} · {row.ownerName} · {label.status(row.status)} {repeatBadge(row.repeatCount || 0)}
                  </div>
                </button>
              ))}
              {!listLoading && listData.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">{t("action_empty")}</p>
              ) : null}
            </div>
          </AdminMobileOnly>
        </TabsContent>

        <TabsContent value="process" className={cn(adminTabsContentCn, "space-y-3")}>
          {!edit ? (
            <p className="text-sm text-muted-foreground">{t("action_process_select")}</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-sm">{edit.title}</span>
                  {edit.overdue ? (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 dark:bg-red-900 dark:text-red-100">
                      {t("action_overdue_badge")}
                    </span>
                  ) : null}
                  {repeatBadge(edit.repeatCount || 0)}
                  {edit.parentActionId ? (
                    <button
                      type="button"
                      className="text-[11px] text-blue-600 underline"
                      onClick={() => openProcessById(edit.parentActionId as number)}
                    >
                      {t("action_parent_link").replace("{id}", String(edit.parentActionId))}
                    </button>
                  ) : null}
                  <span className="text-muted-foreground">#{edit.id}</span>
                </div>
                {edit.checkItemId ? (
                  <p className="text-[11px] text-muted-foreground">
                    {t("action_check_item")}: {edit.checkItemId}
                  </p>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-muted-foreground">{t("store_filter_store")}</label>
                    <Input value={edit.store} onChange={(e) => setEdit({ ...edit, store: e.target.value })} className="h-9 text-xs" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("action_field_status")}</label>
                    <Select
                      value={edit.status}
                      onValueChange={(v) => setEdit({ ...edit, status: v })}
                      disabled={edit.status === "completed" && !canVerify}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STORE_ACTION_STATUSES.filter((s) => s !== "completed" || canVerify).map((s) => (
                          <SelectItem key={s} value={s} disabled={s === "completed"}>
                            {label.status(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("action_field_owner")}</label>
                    <StoreActionPersonSelect
                      store={edit.store}
                      name={edit.ownerName}
                      userId={edit.ownerUserId}
                      t={t}
                      onChange={(p) => setEdit({ ...edit, ownerName: p.name, ownerUserId: p.userId })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("action_field_verifier")}</label>
                    <StoreActionPersonSelect
                      store={edit.store}
                      name={edit.verifierName}
                      userId={edit.verifierUserId}
                      t={t}
                      preferHq
                      onChange={(p) => setEdit({ ...edit, verifierName: p.name, verifierUserId: p.userId })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("action_field_due")}</label>
                    <Input
                      type="date"
                      value={edit.dueDate}
                      onChange={(e) => setEdit({ ...edit, dueDate: e.target.value })}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("action_field_priority")}</label>
                    <Select value={edit.priority} onValueChange={(v) => setEdit({ ...edit, priority: v })}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STORE_ACTION_PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {label.priority(p)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t("action_field_title")}</label>
                  <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} className="h-9 text-xs" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t("action_field_plan")}</label>
                  <Textarea
                    value={edit.actionPlan}
                    onChange={(e) => setEdit({ ...edit, actionPlan: e.target.value })}
                    className="min-h-[60px] text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t("action_field_resolution")}</label>
                  <Textarea
                    value={edit.resolutionNote}
                    onChange={(e) => setEdit({ ...edit, resolutionNote: e.target.value })}
                    className="min-h-[60px] text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t("action_field_verify_note")}</label>
                  <Textarea
                    value={edit.verificationNote}
                    onChange={(e) => setEdit({ ...edit, verificationNote: e.target.value })}
                    className="min-h-[48px] text-xs"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {(edit.photoUrls || []).map((u) => (
                    <button key={u} type="button" onClick={() => setPhotoPreview(u)} className="relative h-14 w-14 overflow-hidden rounded border">
                      <img src={u} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                  <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => fileRef.current?.click()}>
                    <ImageIcon className="h-3.5 w-3.5 mr-1" />
                    {t("action_photo_before")}
                  </Button>
                  <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void handleUpload(e.target.files, "before")} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {(edit.afterPhotoUrls || []).map((u) => (
                    <button key={u} type="button" onClick={() => setPhotoPreview(u)} className="relative h-14 w-14 overflow-hidden rounded border">
                      <img src={u} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                  <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => afterFileRef.current?.click()}>
                    <ImageIcon className="h-3.5 w-3.5 mr-1" />
                    {t("action_photo_after")}
                  </Button>
                  <input
                    ref={afterFileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => void handleUpload(e.target.files, "after")}
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button type="button" size="sm" className="h-9" disabled={saveLoading} onClick={() => void handleSaveEdit()}>
                    {t("action_save")}
                  </Button>
                  {edit.status === "open" || edit.status === "in_progress" ? (
                    <Button type="button" variant="secondary" size="sm" className="h-9" disabled={saveLoading} onClick={() => void runAction("request_verify")}>
                      {t("action_request_verify")}
                    </Button>
                  ) : null}
                  {canVerify && isStoreActionOpenStatus(edit.status) ? (
                    <>
                      <Button type="button" size="sm" className="h-9" disabled={saveLoading} onClick={() => void runAction("verify_pass")}>
                        {edit.status === "pending_verify" ? t("action_verify_pass") : t("action_verify_field_pass")}
                      </Button>
                      <Button type="button" variant="destructive" size="sm" className="h-9" disabled={saveLoading} onClick={() => void runAction("verify_reject")}>
                        {t("action_verify_reject")}
                      </Button>
                    </>
                  ) : null}
                </div>
                {!canVerify ? <p className="text-[11px] text-muted-foreground">{t("action_verify_hq_only")}</p> : null}
              </div>
              <StoreActionTimeline actionId={edit.id} refreshKey={refreshKey} t={t} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="new" className={cn(adminTabsContentCn, "space-y-3 max-w-xl")}>
          {form.sourceType === "check_fail" && form.checkItemId ? (
            <p className="rounded border border-amber-500/40 bg-amber-50 px-2 py-1 text-[11px] dark:bg-amber-950/20">
              {t("action_check_item")}: {form.checkItemId}
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">{t("store_filter_store")}</label>
              <Select value={form.store} onValueChange={(v) => setForm((f) => ({ ...f, store: v }))}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={t("store_filter_store")} />
                </SelectTrigger>
                <SelectContent>
                  {(isManager ? [auth?.store || form.store].filter(Boolean) : storeList).map((s) => (
                    <SelectItem key={s} value={s!}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("action_field_category")}</label>
              <Select value={form.category} onValueChange={onFormCategory}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STORE_ACTION_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {label.category(c)} ({t("action_due_days").replace("{n}", String(storeActionDefaultDueDays(c)))})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("action_field_priority")}</label>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STORE_ACTION_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {label.priority(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("action_field_due")}</label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                className="h-9 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("action_field_owner")}</label>
              <StoreActionPersonSelect
                store={form.store}
                name={form.ownerName}
                userId={form.ownerUserId}
                t={t}
                onChange={(p) => setForm((f) => ({ ...f, ownerName: p.name, ownerUserId: p.userId }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("action_field_verifier")}</label>
              <StoreActionPersonSelect
                store={form.store}
                name={form.verifierName}
                userId={form.verifierUserId}
                t={t}
                preferHq
                onChange={(p) => setForm((f) => ({ ...f, verifierName: p.name, verifierUserId: p.userId }))}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("action_field_title")}</label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="h-9 text-xs" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("action_field_desc")}</label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="min-h-[60px] text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("action_field_plan")}</label>
            <Textarea
              value={form.actionPlan}
              onChange={(e) => setForm((f) => ({ ...f, actionPlan: e.target.value }))}
              className="min-h-[60px] text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {form.photoUrls.map((u) => (
              <div key={u} className="relative h-14 w-14">
                <img src={u} alt="" className="h-full w-full rounded border object-cover" />
                <button
                  type="button"
                  className="absolute -right-1 -top-1 rounded-full bg-background border p-0.5"
                  onClick={() => setForm((f) => ({ ...f, photoUrls: f.photoUrls.filter((x) => x !== u) }))}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => newFileRef.current?.click()}>
              <ImageIcon className="h-3.5 w-3.5 mr-1" />
              {t("action_photo_before")}
            </Button>
            <input
              ref={newFileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void handleUpload(e.target.files, "form")}
            />
          </div>
          <Button type="button" className="h-9" disabled={saveLoading} onClick={() => void handleSaveNew()}>
            {t("action_create")}
          </Button>
        </TabsContent>

        <TabsContent value="score" className={cn(adminTabsContentCn, "space-y-3")}>
          <StoreActionScorecard t={t} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!photoPreview} onOpenChange={(o) => !o && setPhotoPreview(null)}>
        <DialogContent className={cn(ADMIN_DIALOG_SCROLL_CN, "max-w-3xl")}>
          <DialogHeader>
            <DialogTitle>{t("action_photo_before")}</DialogTitle>
          </DialogHeader>
          {photoPreview ? <ImageViewerWithRotate src={photoPreview} alt="" /> : null}
        </DialogContent>
      </Dialog>
    </StorePageShell>
  )
}
