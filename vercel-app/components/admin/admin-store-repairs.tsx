"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert } from "@/lib/app-message"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
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
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Save, Wrench, ImageIcon, X, Pencil } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useAuth } from "@/lib/auth-context"
import { isManagerRole, isFranchiseeRole, isOfficeRole } from "@/lib/permissions"
import {
  useStoreList,
  getStoreRepairTicketList,
  saveStoreRepairTicket,
  updateStoreRepairTicket,
  uploadStoreRepairPhoto,
  type StoreRepairTicketItem,
} from "@/lib/api-client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ImageViewerWithRotate } from "@/components/ui/image-viewer-with-rotate"
import { StoreRepairMediaThumb } from "@/components/store-repair-media-thumb"
import { isStoreRepairVideoUrl } from "@/lib/store-repair-media"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { StoreRepairsProcessTab } from "@/components/admin/store-repairs-process-tab"
import { useTranslatedTextMap, useDebouncedTranslatedText } from "@/lib/use-ui-translate"

const CATEGORIES: { v: string; k: string }[] = [
  { v: "시설", k: "repair_cat_facility" },
  { v: "전기·설비", k: "repair_cat_electric" },
  { v: "냉난방", k: "repair_cat_hvac" },
  { v: "배관", k: "repair_cat_plumbing" },
  { v: "가구·인테리어", k: "repair_cat_interior" },
  { v: "IT·POS", k: "repair_cat_it" },
  { v: "기타", k: "repair_cat_etc" },
]
const PRIORITIES: { v: string; k: string }[] = [
  { v: "긴급", k: "repair_pri_urgent" },
  { v: "높음", k: "repair_pri_high" },
  { v: "보통", k: "repair_pri_normal" },
  { v: "낮음", k: "repair_pri_low" },
]
const STATUSES: { v: string; k: string }[] = [
  { v: "접수", k: "repair_st_recv" },
  { v: "진행중", k: "repair_st_prog" },
  { v: "완료", k: "repair_st_done" },
  { v: "보류", k: "repair_st_hold" },
  { v: "취소", k: "repair_st_cancel" },
]

const CHART_COLORS = ["#2563eb", "#059669", "#d97706", "#dc2626", "#8b5cf6", "#6b7280", "#ec4899"]

function leadTimeLabel(item: StoreRepairTicketItem, t: (k: string) => string): string {
  if (!item.completedAt || !item.reportedAt) return "—"
  const a = new Date(item.reportedAt).getTime()
  const b = new Date(item.completedAt).getTime()
  if (b <= a) return "—"
  const h = (b - a) / 3600000
  if (h < 48) return `${h.toFixed(1)} ${t("repair_unit_hours")}`
  return `${(h / 24).toFixed(1)} ${t("repair_unit_days")}`
}

function toBangkokYmd(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

function daysBetweenBangkokYmd(fromYmd: string, toYmd: string): number {
  const a = new Date(`${fromYmd}T12:00:00+07:00`).getTime()
  const b = new Date(`${toYmd}T12:00:00+07:00`).getTime()
  return Math.floor((b - a) / 86400000)
}

function daysSinceReportedBangkok(reportedAt: string): number {
  const repDay = toBangkokYmd(reportedAt)
  const todayStr = getBangkokTodayDateString()
  return daysBetweenBangkokYmd(repDay, todayStr)
}

export function AdminStoreRepairs() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const fileRef = useRef<HTMLInputElement>(null)
  const fileRefDialog = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<"dash" | "list" | "process" | "new">("dash")
  const [stores, setStores] = useState<string[]>([])
  const [listStart, setListStart] = useState(() => {
    const end = getBangkokTodayDateString()
    const d = new Date(`${end}T12:00:00+07:00`)
    d.setDate(d.getDate() - 30)
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
  })
  const [listEnd, setListEnd] = useState(getBangkokTodayDateString)
  const [listStore, setListStore] = useState("All")
  const [listStatus, setListStatus] = useState("__all__")
  const [listCategory, setListCategory] = useState("__all__")
  const [listQ, setListQ] = useState("")
  const [listData, setListData] = useState<StoreRepairTicketItem[]>([])
  const [listLoading, setListLoading] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editItem, setEditItem] = useState<StoreRepairTicketItem | null>(null)
  const [processFocusTicketId, setProcessFocusTicketId] = useState<number | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const [form, setForm] = useState({
    store: "",
    reporter: "",
    category: "시설",
    priority: "보통",
    area: "",
    title: "",
    description: "",
    photoUrls: [] as string[],
    status: "접수",
    handler: "",
    resolutionNote: "",
    vendorName: "",
  })
  const [saveLoading, setSaveLoading] = useState(false)

  const writerName = auth?.user || auth?.store || ""
  const isManager = isManagerRole(auth?.role || "") || isFranchiseeRole(auth?.role || "")
  const isHQ = isOfficeRole(auth?.role || "")

  const { stores: storeList } = useStoreList()
  const listStoresForFilter = isManager
    ? ["All", ...(storeList || []).filter((k) => k && String(k).trim()).sort()]
    : stores

  useEffect(() => {
    if (!auth?.store) return
    const keys = storeList.filter((k) => k && String(k).trim()).sort()
    let list: string[]
    if (isManager) {
      list = [auth.store]
      setForm((f) => ({ ...f, store: auth.store || "", reporter: writerName }))
    } else {
      list = isHQ ? ["All", ...keys] : keys
      if (keys.length && !form.store) setForm((f) => ({ ...f, store: keys[0], reporter: writerName }))
    }
    setStores(list)
  }, [auth?.store, auth?.role, isManager, isHQ, storeList, writerName])

  useEffect(() => {
    setForm((f) => ({ ...f, reporter: writerName }))
  }, [writerName])

  const loadList = useCallback(async () => {
    setListLoading(true)
    try {
      const list = await getStoreRepairTicketList({
        startStr: listStart || undefined,
        endStr: listEnd || undefined,
        store: listStore && listStore !== "All" ? listStore : undefined,
        status: listStatus && listStatus !== "__all__" ? listStatus : undefined,
        category: listCategory && listCategory !== "__all__" ? listCategory : undefined,
        q: listQ.trim() || undefined,
      })
      setListData(list || [])
    } catch {
      setListData([])
    } finally {
      setListLoading(false)
    }
  }, [listStart, listEnd, listStore, listStatus, listCategory, listQ])

  useEffect(() => {
    loadList()
  }, [loadList])

  const listTitles = useMemo(() => listData.map((r) => r.title || ""), [listData])
  const translateTitle = useTranslatedTextMap(listTitles, lang)
  const newTitleTrans = useDebouncedTranslatedText(form.title, lang)
  const editTitleTrans = useDebouncedTranslatedText(editItem?.title || "", lang)

  const stats = useMemo(() => {
    const recv = listData.filter((x) => x.status === "접수").length
    const prog = listData.filter((x) => x.status === "진행중").length
    const done = listData.filter((x) => x.status === "완료").length
    const urgentOpen = listData.filter((x) => x.priority === "긴급" && x.status !== "완료" && x.status !== "취소").length
    const doneWithLead = listData.filter((x) => x.status === "완료" && x.completedAt && x.reportedAt)
    let avgDays = 0
    if (doneWithLead.length) {
      const sum = doneWithLead.reduce((s, x) => {
        const a = new Date(x.reportedAt).getTime()
        const b = new Date(x.completedAt!).getTime()
        return s + (b - a) / 86400000
      }, 0)
      avgDays = sum / doneWithLead.length
    }
    const byStatus: Record<string, number> = {}
    const byCat: Record<string, number> = {}
    for (const x of listData) {
      byStatus[x.status || "?"] = (byStatus[x.status || "?"] || 0) + 1
      const c = x.category || "기타"
      byCat[c] = (byCat[c] || 0) + 1
    }
    const stKey = (s: string) => STATUSES.find((x) => x.v === s)?.k || "repair_st_recv"
    const catKey = (c: string) => CATEGORIES.find((x) => x.v === c)?.k || "repair_cat_etc"
    const statusChart = Object.entries(byStatus).map(([name, value]) => ({
      name: t(stKey(name)),
      value,
    }))
    const catChart = Object.entries(byCat).map(([name, value]) => ({
      name: t(catKey(name)),
      value,
    }))
    return { recv, prog, done, urgentOpen, avgDays, statusChart, catChart }
  }, [listData, t])

  const statusChartConfig = useMemo(
    () =>
      Object.fromEntries(stats.statusChart.map((d, i) => [d.name, { label: d.name, color: CHART_COLORS[i % CHART_COLORS.length] }])),
    [stats.statusChart]
  )
  const catChartConfig = useMemo(
    () =>
      Object.fromEntries(stats.catChart.map((d, i) => [d.name, { label: d.name, color: CHART_COLORS[i % CHART_COLORS.length] }])),
    [stats.catChart]
  )

  const resetForm = useCallback(() => {
    setForm((f) => ({
      ...f,
      category: "시설",
      priority: "보통",
      area: "",
      title: "",
      description: "",
      photoUrls: [],
      status: "접수",
      handler: "",
      resolutionNote: "",
      vendorName: "",
      store: isManager ? auth?.store || "" : f.store,
      reporter: writerName,
    }))
  }, [isManager, auth?.store, writerName])

  const handleUploadFiles = async (files: FileList | null, target: "form" | "dialog") => {
    if (!files?.length) return
    const store = target === "form" ? form.store : editItem?.store || form.store
    if (!store) {
      await appAlert(t("store_load_hint"))
      return
    }
    const urls: string[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const res = await uploadStoreRepairPhoto(store, file)
      if (res.success && res.url) urls.push(res.url)
      else await appAlert(translateApiMessage(res.message, t) || t("msg_upload_fail"))
    }
    if (!urls.length) return
    if (target === "form") {
      setForm((f) => ({ ...f, photoUrls: [...f.photoUrls, ...urls] }))
    } else if (editItem) {
      const next = [...(editItem.photoUrls || []), ...urls]
      setEditItem({ ...editItem, photoUrls: next })
    }
  }

  const handleSaveNew = async () => {
    if (!form.store) {
      await appAlert(t("store_load_hint"))
      return
    }
    if (!form.title.trim()) {
      await appAlert(t("repair_field_title"))
      return
    }
    setSaveLoading(true)
    try {
      const res = await saveStoreRepairTicket({
        store: form.store,
        reporter: form.reporter,
        category: form.category,
        priority: form.priority,
        area: form.area,
        title: form.title,
        description: form.description,
        photoUrls: form.photoUrls,
        status: form.status,
        handler: form.handler,
        resolutionNote: form.resolutionNote,
        vendorName: form.vendorName,
      })
      if (res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("store_check_saved"))
        resetForm()
        loadList()
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail"))
      }
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaveLoading(false)
    }
  }

  const openEdit = (item: StoreRepairTicketItem) => {
    setEditItem(item)
    setEditOpen(true)
  }

  const clearProcessFocus = useCallback(() => {
    setProcessFocusTicketId(null)
  }, [])

  const goToProcessWithTicket = (row: StoreRepairTicketItem) => {
    if (row.id == null) return
    setProcessFocusTicketId(row.id)
    setTab("process")
  }

  const handleSaveEdit = async () => {
    if (!editItem?.id) return
    setSaveLoading(true)
    try {
      const res = await updateStoreRepairTicket(editItem.id, {
        store: editItem.store,
        reporter: editItem.reporter,
        category: editItem.category,
        priority: editItem.priority,
        area: editItem.area,
        title: editItem.title,
        description: editItem.description,
        photoUrls: editItem.photoUrls,
        status: editItem.status,
        handler: editItem.handler,
        resolutionNote: editItem.resolutionNote,
        vendorName: editItem.vendorName,
      })
      if (res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("store_check_updated"))
        setEditOpen(false)
        setEditItem(null)
        loadList()
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("msg_modify_fail"))
      }
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaveLoading(false)
    }
  }

  const labelPri = (v: string) => PRIORITIES.find((c) => c.v === v)?.k || "repair_pri_normal"
  const labelSt = (v: string) => STATUSES.find((c) => c.v === v)?.k || "repair_st_recv"

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Wrench className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{t("adminStoreRepairs")}</h1>
            <p className="text-xs text-muted-foreground">{t("repair_page_sub")}</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className={adminTabsRootCn}>
          <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="dash" className={adminTabsTriggerCn}>
                  {t("tab_repair_dashboard")}
                </TabsTrigger>
                <TabsTrigger value="list" className={adminTabsTriggerCn}>
                  {t("tab_repair_list")}
                </TabsTrigger>
                <TabsTrigger value="process" className={adminTabsTriggerCn}>
                  {t("tab_repair_process")}
                </TabsTrigger>
                <TabsTrigger value="new" className={adminTabsTriggerCn}>
                  {t("tab_repair_new")}
                </TabsTrigger>
              </TabsList>
          </AdminTabsBarWithHelp>

          <TabsContent value="dash" className={cn(adminTabsContentCn, "space-y-4")}>
            <div className="flex flex-wrap gap-2">
              <Input type="date" value={listStart} onChange={(e) => setListStart(e.target.value)} className="h-9 w-[140px] text-xs" />
              <Input type="date" value={listEnd} onChange={(e) => setListEnd(e.target.value)} className="h-9 w-[140px] text-xs" />
              <Select value={listStore} onValueChange={setListStore}>
                <SelectTrigger className="h-9 w-[200px] text-xs">
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
              <Button type="button" variant="secondary" size="sm" className="h-9" onClick={() => loadList()} disabled={listLoading}>
                {t("repair_btn_load")}
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                { label: t("repair_kpi_recv"), value: stats.recv, className: "border-amber-500/40" },
                { label: t("repair_kpi_prog"), value: stats.prog, className: "border-blue-500/40" },
                { label: t("repair_kpi_done"), value: stats.done, className: "border-emerald-500/40" },
                { label: t("repair_kpi_urgent"), value: stats.urgentOpen, className: "border-red-500/40" },
                {
                  label: t("repair_kpi_avg_days"),
                  value: stats.avgDays > 0 ? stats.avgDays.toFixed(1) : "—",
                  className: "border-slate-500/40",
                },
              ].map((k) => (
                <Card key={k.label} className={`border-l-4 ${k.className}`}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                    <p className="text-2xl font-bold tabular-nums">{k.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardContent className="pt-4">
                  <h3 className="mb-2 text-sm font-semibold">{t("repair_chart_by_status")}</h3>
                  <ChartContainer config={statusChartConfig} className="h-[240px] w-full aspect-auto">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.statusChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#2563eb" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <h3 className="mb-2 text-sm font-semibold">{t("repair_chart_by_category")}</h3>
                  <ChartContainer config={catChartConfig} className="h-[240px] w-full aspect-auto">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Pie
                          data={stats.catChart}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={88}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {stats.catChart.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="process" className={cn(adminTabsContentCn, "space-y-4")}>
            <div className="flex flex-wrap gap-2">
              <Input type="date" value={listStart} onChange={(e) => setListStart(e.target.value)} className="h-9 w-[140px] text-xs" />
              <Input type="date" value={listEnd} onChange={(e) => setListEnd(e.target.value)} className="h-9 w-[140px] text-xs" />
              <Select value={listStore} onValueChange={setListStore}>
                <SelectTrigger className="h-9 w-[200px] text-xs">
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
            </div>
            <StoreRepairsProcessTab
              tickets={listData}
              ticketsLoading={listLoading}
              onRefreshTickets={() => void loadList()}
              writerName={writerName}
              focusTicketId={processFocusTicketId}
              onFocusTicketConsumed={clearProcessFocus}
            />
          </TabsContent>

          <TabsContent value="list" className={cn(adminTabsContentCn, "space-y-4")}>
            <div className="flex flex-wrap gap-2 items-center">
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
                <SelectTrigger className="h-9 w-[130px] text-xs">
                  <SelectValue placeholder={t("all")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("all")}</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.v} value={s.v}>
                      {t(s.k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={listCategory} onValueChange={setListCategory}>
                <SelectTrigger className="h-9 w-[150px] text-xs">
                  <SelectValue placeholder={t("all")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("all")}</SelectItem>
                  {CATEGORIES.map((s) => (
                    <SelectItem key={s.v} value={s.v}>
                      {t(s.k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative flex-1 min-w-[160px] max-w-sm">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 pl-8 text-xs"
                  placeholder={t("repair_search_placeholder")}
                  value={listQ}
                  onChange={(e) => setListQ(e.target.value)}
                />
              </div>
              <Button type="button" variant="secondary" size="sm" className="h-9" onClick={() => loadList()} disabled={listLoading}>
                {t("repair_btn_load")}
              </Button>
            </div>
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">{t("repair_col_ticket")}</th>
                      <th className="px-3 py-2 text-left font-medium">{t("repair_col_store")}</th>
                      <th className="px-3 py-2 text-left font-medium">{t("repair_col_title")}</th>
                      <th className="px-3 py-2 text-left font-medium">{t("repair_col_status")}</th>
                      <th className="px-3 py-2 text-left font-medium">{t("repair_col_priority")}</th>
                      <th className="px-3 py-2 text-left font-medium">{t("repair_col_reported")}</th>
                      <th className="px-3 py-2 text-left font-medium">{t("repair_col_lead")}</th>
                      <th className="px-3 py-2 text-center font-medium">{t("photo")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listLoading ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                          {t("loading")}
                        </td>
                      </tr>
                    ) : listData.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                          —
                        </td>
                      </tr>
                    ) : (
                      listData.map((row) => {
                        const stale = row.status === "접수" && daysSinceReportedBangkok(row.reportedAt) >= 3
                        return (
                          <tr
                            key={row.id}
                            className={`border-b cursor-pointer hover:bg-muted/40 ${stale ? "bg-amber-500/10" : ""}`}
                            onClick={() => goToProcessWithTicket(row)}
                          >
                            <td className="px-3 py-2 font-mono">{row.ticketNumber}</td>
                            <td className="px-3 py-2">{row.store}</td>
                            <td className="px-3 py-2 max-w-[200px] truncate" title={row.title || undefined}>
                              {translateTitle(row.title || "")}
                            </td>
                            <td className="px-3 py-2">{t(labelSt(row.status))}</td>
                            <td className="px-3 py-2">{t(labelPri(row.priority))}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {row.reportedAt ? row.reportedAt.slice(0, 16).replace("T", " ") : "—"}
                              {stale ? (
                                <span className="ml-1 text-amber-700 dark:text-amber-400">
                                  ({daysSinceReportedBangkok(row.reportedAt)} {t("repair_stale_days")})
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2">{leadTimeLabel(row, t)}</td>
                            <td
                              className="px-3 py-2 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {row.photoUrls?.length ? (
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center gap-0.5 rounded-md p-1 text-primary hover:bg-muted"
                                  title={t("repair_list_photo_view")}
                                  onClick={() => {
                                    const u = row.photoUrls![0]
                                    if (u) setPhotoPreview(u)
                                  }}
                                >
                                  <ImageIcon className="h-4 w-4" />
                                  {row.photoUrls.length > 1 ? (
                                    <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                                      +{row.photoUrls.length - 1}
                                    </span>
                                  ) : null}
                                </button>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                title={t("repair_list_full_edit")}
                                aria-label={t("repair_list_full_edit")}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openEdit(row)
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="new" className={adminTabsContentCn}>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("store")}</label>
                    <Select value={form.store || undefined} onValueChange={(v) => setForm((f) => ({ ...f, store: v }))}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder={t("store")} />
                      </SelectTrigger>
                      <SelectContent>
                        {stores.filter((s) => s && s !== "All").map((st) => (
                          <SelectItem key={st} value={st}>
                            {st}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("complaint_writer")}</label>
                    <Input value={form.reporter} readOnly className="h-9 text-xs bg-muted" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("repair_field_category")}</label>
                    <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c.v} value={c.v}>
                            {t(c.k)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("repair_field_priority")}</label>
                    <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((c) => (
                          <SelectItem key={c.v} value={c.v}>
                            {t(c.k)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1">{t("repair_field_area")}</label>
                  <Input
                    value={form.area}
                    onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1">{t("repair_field_title")}</label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    className="h-9 text-xs"
                  />
                  {form.title.trim() ? (
                    <div className="mt-1 rounded border border-dashed border-border/80 bg-muted/25 px-2 py-1 text-[11px]">
                      <span className="font-medium text-muted-foreground">{t("repair_translate_preview")}</span>
                      {newTitleTrans.pending ? (
                        <p className="mt-0.5 text-muted-foreground">{t("repair_translate_loading")}</p>
                      ) : newTitleTrans.translated && newTitleTrans.translated !== form.title.trim() ? (
                        <p className="mt-0.5 text-foreground/90">{newTitleTrans.translated}</p>
                      ) : (
                        <p className="mt-0.5 text-muted-foreground">—</p>
                      )}
                    </div>
                  ) : null}
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1">{t("repair_field_description")}</label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    rows={3}
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1">{t("repair_field_photos")}</label>
                  <p className="text-[11px] text-muted-foreground mb-2">{t("repair_photo_hint")}</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,video/mp4,video/quicktime,video/webm,video/3gpp"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void handleUploadFiles(e.target.files, "form")
                      e.target.value = ""
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => fileRef.current?.click()}>
                    {t("repair_photo_add")}
                  </Button>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {form.photoUrls.map((url) => (
                      <div key={url} className="relative h-16 w-16 rounded border overflow-hidden group">
                        <button
                          type="button"
                          className="absolute top-0 right-0 z-10 bg-background/80 p-0.5 rounded-bl"
                          onClick={() => setForm((f) => ({ ...f, photoUrls: f.photoUrls.filter((u) => u !== url) }))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <button type="button" onClick={() => setPhotoPreview(url)} className="block h-full w-full">
                          <StoreRepairMediaThumb url={url} className="h-full w-full object-cover" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => void handleSaveNew()} disabled={saveLoading}>
                    <Save className="h-3.5 w-3.5 mr-1" />
                    {t("repair_btn_save")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={resetForm}>
                    {t("repair_btn_new")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("repair_detail_title")}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3 text-xs">
              <p className="font-mono text-muted-foreground">{editItem.ticketNumber}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">{t("store")}</label>
                  <Input value={editItem.store} onChange={(e) => setEditItem({ ...editItem, store: e.target.value })} className="h-8" />
                </div>
                <div>
                  <label className="font-semibold block mb-1">{t("repair_field_status")}</label>
                  <Select value={editItem.status} onValueChange={(v) => setEditItem({ ...editItem, status: v })}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s.v} value={s.v}>
                          {t(s.k)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">{t("repair_field_category")}</label>
                  <Select value={editItem.category} onValueChange={(v) => setEditItem({ ...editItem, category: v })}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.v} value={c.v}>
                          {t(c.k)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="font-semibold block mb-1">{t("repair_field_priority")}</label>
                  <Select value={editItem.priority} onValueChange={(v) => setEditItem({ ...editItem, priority: v })}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((c) => (
                        <SelectItem key={c.v} value={c.v}>
                          {t(c.k)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="font-semibold block mb-1">{t("repair_field_title")}</label>
                <Input value={editItem.title} onChange={(e) => setEditItem({ ...editItem, title: e.target.value })} className="h-8" />
                {editItem.title.trim() ? (
                  <div className="mt-1 rounded border border-dashed border-border/80 bg-muted/25 px-2 py-1 text-[11px]">
                    <span className="font-medium text-muted-foreground">{t("repair_translate_preview")}</span>
                    {editTitleTrans.pending ? (
                      <p className="mt-0.5 text-muted-foreground">{t("repair_translate_loading")}</p>
                    ) : editTitleTrans.translated && editTitleTrans.translated !== editItem.title.trim() ? (
                      <p className="mt-0.5 text-foreground/90">{editTitleTrans.translated}</p>
                    ) : (
                      <p className="mt-0.5 text-muted-foreground">—</p>
                    )}
                  </div>
                ) : null}
              </div>
              <div>
                <label className="font-semibold block mb-1">{t("repair_field_description")}</label>
                <Textarea
                  value={editItem.description}
                  onChange={(e) => setEditItem({ ...editItem, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">{t("repair_field_handler")}</label>
                <Input
                  value={editItem.handler}
                  onChange={(e) => setEditItem({ ...editItem, handler: e.target.value })}
                  className="h-8"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">{t("repair_field_resolution")}</label>
                <Textarea
                  value={editItem.resolutionNote}
                  onChange={(e) => setEditItem({ ...editItem, resolutionNote: e.target.value })}
                  rows={2}
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">{t("repair_field_vendor")}</label>
                <Input
                  value={editItem.vendorName}
                  onChange={(e) => setEditItem({ ...editItem, vendorName: e.target.value })}
                  className="h-8"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">{t("repair_field_photos")}</label>
                <input
                  ref={fileRefDialog}
                  type="file"
                  accept="image/*,video/mp4,video/quicktime,video/webm,video/3gpp"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void handleUploadFiles(e.target.files, "dialog")
                    e.target.value = ""
                  }}
                />
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs mb-2" onClick={() => fileRefDialog.current?.click()}>
                  {t("repair_photo_add")}
                </Button>
                <div className="flex flex-wrap gap-2">
                  {editItem.photoUrls?.map((url) => (
                    <div key={url} className="relative h-14 w-14 rounded border overflow-hidden">
                      <button
                        type="button"
                        className="absolute top-0 right-0 z-10 bg-background/80 p-0.5"
                        onClick={() =>
                          setEditItem({
                            ...editItem,
                            photoUrls: editItem.photoUrls.filter((u) => u !== url),
                          })
                        }
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => setPhotoPreview(url)} className="block h-full w-full">
                        <StoreRepairMediaThumb url={url} className="h-full w-full object-cover" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-muted-foreground">
                {t("repair_col_lead")}: {leadTimeLabel(editItem, t)}
              </p>
              <Button type="button" className="w-full" onClick={() => void handleSaveEdit()} disabled={saveLoading}>
                {t("repair_btn_save")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!photoPreview} onOpenChange={() => setPhotoPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("photo")}</DialogTitle>
          </DialogHeader>
          {photoPreview &&
            (isStoreRepairVideoUrl(photoPreview) ? (
              <video src={photoPreview} controls className="max-h-[70vh] w-full rounded-md" playsInline />
            ) : (
              <ImageViewerWithRotate src={photoPreview} alt="" />
            ))}
        </DialogContent>
      </Dialog>
    </div>
  )
}
