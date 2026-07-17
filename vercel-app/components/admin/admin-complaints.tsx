"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert } from "@/lib/app-message"
import {
  isMemberPortalComplaint,
  resolveComplaintCustomerReplyForSave,
} from "@/lib/complaint-admin-customer-reply"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
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
import { Search, Save, Image as ImageIcon, MessageSquareWarning, X } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useAuth } from "@/lib/auth-context"
import { isManagerRole } from "@/lib/permissions"
import {
  useStoreList,
  getComplaintLogList,
  saveComplaintLog,
  updateComplaintLog,
  uploadComplaintPhoto,
  translateTexts,
  type ComplaintLogItem,
} from "@/lib/api-client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ImageViewerWithRotate } from "@/components/ui/image-viewer-with-rotate"
import { ADMIN_BTN_XS_CN, ADMIN_DIALOG_SCROLL_CN } from "@/lib/admin-ui-standards"
import { addBangkokCalendarDays, getBangkokTodayDateString } from "@/lib/bangkok-time"
import { StorePageShell } from "@/components/erp/store-page-shell"
import { ComplaintProcessTab } from "@/components/admin/complaint-process-tab"

const CHART_COLORS = ["#2563eb", "#059669", "#d97706", "#dc2626", "#8b5cf6", "#6b7280"]
const PERIOD_PRESETS = [7, 30, 90] as const

function todayStr() {
  return getBangkokTodayDateString()
}

function startDaysAgo(days: number, end = getBangkokTodayDateString()) {
  return addBangkokCalendarDays(end, -days)
}

function timeStr() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

const VISIT_PATHS = ["홀", "배달", "포장"]
const PLATFORMS = ["__none__", "Grab", "Lineman", "Shopee", "Robinhood", "기타"]
const TYPES = ["음식", "서비스", "환경/청결", "가격/결제", "기타"]
const SEVERITIES = ["경미", "보통", "심각"]
const STATUSES = ["접수", "조사중", "처리완료", "보류", "종료"]

const visitPathToKey: Record<string, string> = { "홀": "complaint_path_hall", "배달": "complaint_path_delivery", "포장": "complaint_path_takeout" }
const typeToKey: Record<string, string> = { "음식": "complaint_type_food", "서비스": "complaint_type_service", "환경/청결": "complaint_type_env", "가격/결제": "complaint_type_price", "기타": "complaint_type_etc" }
const severityToKey: Record<string, string> = { "경미": "complaint_sev_low", "보통": "complaint_sev_mid", "심각": "complaint_sev_high" }
const statusToKey: Record<string, string> = { "접수": "complaint_status_recv", "조사중": "complaint_status_inv", "처리완료": "complaint_status_done", "보류": "complaint_status_hold", "종료": "complaint_status_closed" }

const emptyForm = () => ({
  date: todayStr(),
  time: timeStr(),
  store: "",
  writer: "",
  customer: "",
  contact: "",
  visitPath: "홀",
  platform: "__none__",
  type: "음식",
  menu: "",
  title: "",
  content: "",
  severity: "경미",
  status: "접수",
  handler: "",
  doneDate: "",
  action: "",
  customerReply: "",
  photoUrl: "",
  remark: "",
})

export function AdminComplaints() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const fileRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<"dash" | "input" | "list" | "process">("dash")
  const [stores, setStores] = useState<string[]>([])
  const [editId, setEditId] = useState<string>("")

  const [form, setForm] = useState<Record<string, string>>(emptyForm())
  const [saveLoading, setSaveLoading] = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)

  const defaultEnd = getBangkokTodayDateString()
  const defaultStart = startDaysAgo(30, defaultEnd)

  const [listStart, setListStart] = useState(defaultStart)
  const [listEnd, setListEnd] = useState(defaultEnd)
  const [listStore, setListStore] = useState("All")
  const [listVisitPath, setListVisitPath] = useState("__all__")
  const [listType, setListType] = useState("__all__")
  const [listStatus, setListStatus] = useState("__all__")
  const [listSeverity, setListSeverity] = useState("__all__")
  const [listSourceChannel, setListSourceChannel] = useState("__all__")
  const [listQ, setListQ] = useState("")
  const [listQInput, setListQInput] = useState("")
  const [processOpenOnly, setProcessOpenOnly] = useState(true)
  const [listData, setListData] = useState<ComplaintLogItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [hasQueried, setHasQueried] = useState(false)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [viewMemberId, setViewMemberId] = useState<number | null>(null)
  const [viewSourceChannel, setViewSourceChannel] = useState("")
  const [transMap, setTransMap] = useState<Record<string, string>>({})

  const writerName = auth?.user || auth?.store || ""
  const isManager = isManagerRole(auth?.role || "")
  const isHQ = auth?.role === "director" || auth?.role === "secretary" || auth?.role === "officer"

  const { stores: storeList } = useStoreList()
  // 조회 탭: 매니저는 전 매장 조회 가능 (입력 탭은 stores 사용, 자기 매장만)
  const listStoresForFilter = isManager
    ? ["All", ...(storeList || []).filter((k) => k && String(k).trim()).sort()]
    : stores
  useEffect(() => {
    if (!auth?.store) return
    const keys = storeList.filter((k) => k && String(k).trim()).sort()
    let list: string[]
    if (isManager) {
      list = [auth.store]
      setForm((f) => ({ ...f, store: auth.store, writer: writerName }))
      // 조회 탭에서는 전 매장 조회 가능 → listStore는 "All" 유지
    } else {
      list = isHQ ? ["All", ...keys] : keys
      if (keys.length && !form.store) setForm((f) => ({ ...f, store: keys[0], writer: writerName }))
    }
    setStores(list)
  }, [auth?.store, auth?.role, isManager, isHQ, storeList])

  useEffect(() => {
    setForm((f) => ({ ...f, writer: writerName }))
  }, [writerName])

  useEffect(() => {
    if (lang === "ko") {
      setTransMap({})
      return
    }
    const texts = [...new Set(
      listData.flatMap((item) =>
        [item.customer, item.title, item.content, item.menu, item.action].filter((s): s is string => Boolean(s && String(s).trim()))
      )
    )]
    if (texts.length === 0) {
      setTransMap({})
      return
    }
    let cancelled = false
    translateTexts(texts, lang)
      .then((translated) => {
        if (cancelled) return
        const map: Record<string, string> = {}
        texts.forEach((txt, i) => { map[txt] = translated[i] ?? txt })
        setTransMap(map)
      })
      .catch(() => setTransMap({}))
    return () => { cancelled = true }
  }, [listData, lang])

  const getTrans = (text: string) => (text && transMap[text]) || text || ""
  const tr = (val: string | undefined, keyMap: Record<string, string>) =>
    val && keyMap[val] ? t(keyMap[val] as never) : (val || "-")

  const applyPeriodPreset = useCallback((days: number) => {
    const end = getBangkokTodayDateString()
    setListEnd(end)
    setListStart(startDaysAgo(days, end))
  }, [])

  const activePeriodDays = useMemo(() => {
    const today = getBangkokTodayDateString()
    if (!listStart || listEnd !== today) return null
    for (const days of PERIOD_PRESETS) {
      if (listStart === startDaysAgo(days, today)) return days
    }
    return null
  }, [listStart, listEnd])

  const loadList = useCallback(async () => {
    setListLoading(true)
    try {
      const processMode = tab === "process"
      const listMode = tab === "list"
      const dashMode = tab === "dash"
      const skipDate = processMode && processOpenOnly
      const list = await getComplaintLogList({
        startStr: skipDate ? undefined : listStart || undefined,
        endStr: skipDate ? undefined : listEnd || undefined,
        skipDate,
        openOnly: processMode && processOpenOnly ? true : undefined,
        store: listStore && listStore !== "All" ? listStore : undefined,
        visitPath: listMode && listVisitPath && listVisitPath !== "__all__" ? listVisitPath : undefined,
        typeFilter:
          (listMode || dashMode) && listType && listType !== "__all__" ? listType : undefined,
        statusFilter:
          processMode && processOpenOnly
            ? undefined
            : listMode && listStatus && listStatus !== "__all__"
              ? listStatus
              : undefined,
        severityFilter:
          (listMode || processMode) && listSeverity && listSeverity !== "__all__"
            ? listSeverity
            : undefined,
        sourceChannel: listMode
          ? listSourceChannel === "member_portal"
            ? "member_portal"
            : listSourceChannel === "admin"
              ? "admin"
              : listSourceChannel === "staff_manual"
                ? "__empty__"
                : undefined
          : undefined,
        q: (listMode || processMode) && listQ.trim() ? listQ.trim() : undefined,
      })
      setListData(list || [])
      setHasQueried(true)
    } catch {
      setListData([])
      setHasQueried(true)
    } finally {
      setListLoading(false)
    }
  }, [
    tab,
    processOpenOnly,
    listStart,
    listEnd,
    listStore,
    listVisitPath,
    listType,
    listStatus,
    listSeverity,
    listSourceChannel,
    listQ,
  ])

  const runSearch = useCallback(() => {
    const next = listQInput.trim()
    if (next === listQ) void loadList()
    else setListQ(next)
  }, [listQInput, listQ, loadList])

  useEffect(() => {
    if (tab === "list" || tab === "dash" || tab === "process") void loadList()
  }, [tab, loadList])

  const periodPresetButtons = (
    <div className="flex flex-wrap gap-1">
      {PERIOD_PRESETS.map((days) => (
        <Button
          key={days}
          type="button"
          variant={activePeriodDays === days ? "default" : "outline"}
          size="sm"
          className="h-8 px-2.5 text-xs"
          disabled={tab === "process" && processOpenOnly}
          onClick={() => applyPeriodPreset(days)}
        >
          {t(`complaint_period_${days}d` as never)}
        </Button>
      ))}
    </div>
  )

  const dateRangeInputs = (
    <>
      <div>
        <label className="text-xs font-semibold block mb-1">{t("visit_start_date")}</label>
        <Input
          type="date"
          value={listStart}
          onChange={(e) => setListStart(e.target.value)}
          className="h-9 w-[130px] text-xs"
          disabled={tab === "process" && processOpenOnly}
        />
      </div>
      <div>
        <label className="text-xs font-semibold block mb-1">{t("visit_end_date")}</label>
        <Input
          type="date"
          value={listEnd}
          onChange={(e) => setListEnd(e.target.value)}
          className="h-9 w-[130px] text-xs"
          disabled={tab === "process" && processOpenOnly}
        />
      </div>
    </>
  )

  const storeFilterSelect = (
    <Select value={listStore || "All"} onValueChange={setListStore}>
      <SelectTrigger className="h-9 w-[130px] text-xs">
        <SelectValue placeholder={t("store")} />
      </SelectTrigger>
      <SelectContent>
        {listStoresForFilter.filter((s) => s).map((st) => (
          <SelectItem key={st} value={st}>{st === "All" ? t("all") : st}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  const keywordInput = (
    <Input
      value={listQInput}
      onChange={(e) => setListQInput(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          runSearch()
        }
      }}
      className="h-9 w-[160px] text-xs"
      placeholder={t("complaint_search_keyword_ph")}
    />
  )

  const dashStats = useMemo(() => {
    const open = listData.filter((x) => x.status === "접수" || x.status === "조사중" || x.status === "보류").length
    const severe = listData.filter((x) => x.severity === "심각").length
    const food = listData.filter((x) => x.type === "음식").length
    const byType: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    for (const x of listData) {
      const ty = x.type || "기타"
      byType[ty] = (byType[ty] || 0) + 1
      const st = x.status || "접수"
      byStatus[st] = (byStatus[st] || 0) + 1
    }
    const typeChart = Object.entries(byType).map(([name, value]) => ({
      name: typeToKey[name] ? t(typeToKey[name] as never) : name,
      value,
    }))
    const statusChart = Object.entries(byStatus).map(([name, value]) => ({
      name: statusToKey[name] ? t(statusToKey[name] as never) : name,
      value,
    }))
    return { total: listData.length, open, severe, food, typeChart, statusChart }
  }, [listData, t])

  const typeChartConfig = useMemo(
    () => Object.fromEntries(dashStats.typeChart.map((d, i) => [d.name, { label: d.name, color: CHART_COLORS[i % CHART_COLORS.length] }])),
    [dashStats.typeChart]
  )
  const statusChartConfig = useMemo(
    () => Object.fromEntries(dashStats.statusChart.map((d, i) => [d.name, { label: d.name, color: CHART_COLORS[i % CHART_COLORS.length] }])),
    [dashStats.statusChart]
  )

  const handleUploadPhoto = async (files: FileList | null) => {
    if (!files?.length || !form.store) {
      if (!form.store) await appAlert(t("store_load_hint"))
      return
    }
    setUploadLoading(true)
    try {
      const file = files[0]
      const res = await uploadComplaintPhoto(form.store, file)
      if (res.success && res.url) {
        setForm((f) => ({ ...f, photoUrl: res.url! }))
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("msg_upload_fail"))
      }
    } finally {
      setUploadLoading(false)
    }
  }

  const resetForm = useCallback(() => {
    setEditId("")
    setViewMemberId(null)
    setViewSourceChannel("")
    setForm(emptyForm())
    setForm((f) => ({ ...f, writer: writerName }))
  }, [writerName])

  const openDetail = useCallback((item: ComplaintLogItem) => {
    const id = String(item.row ?? item.id ?? "")
    setViewMemberId(item.memberId != null ? Number(item.memberId) : null)
    setViewSourceChannel(String(item.sourceChannel || ""))
    setForm({
      date: item.date || "",
      time: item.time || "",
      store: item.store || "",
      writer: item.writer || writerName,
      customer: item.customer || "",
      contact: item.contact || "",
      visitPath: item.visitPath || "홀",
      platform: item.platform || "__none__",
      type: item.type || "음식",
      menu: item.menu || "",
      title: item.title || "",
      content: item.content || "",
      severity: item.severity || "경미",
      status: item.status || "접수",
      handler: item.handler || "",
      doneDate: item.doneDate || "",
      action: item.action || "",
      customerReply: item.customerReply || "",
      photoUrl: item.photoUrl || "",
      remark: item.remark || "",
    })
    setEditId(id)
    setTab("input")
  }, [writerName])

  const handleSave = async () => {
    if (!form.store) {
      await appAlert(t("store_load_hint"))
      return
    }
    const isMember = isMemberPortalComplaint(viewSourceChannel, viewMemberId)
    const customerReply = await resolveComplaintCustomerReplyForSave(
      form.customerReply,
      form.action,
      isMember,
      t
    )
    if (customerReply === null) return

    setSaveLoading(true)
    try {
      const data = {
        date: form.date,
        time: form.time,
        store: form.store,
        writer: form.writer,
        customer: form.customer,
        contact: form.contact,
        visitPath: form.visitPath,
        platform: form.platform === "__none__" ? "" : form.platform,
        type: form.type,
        menu: form.menu,
        title: form.title,
        content: form.content,
        severity: form.severity,
        status: form.status,
        handler: form.handler,
        doneDate: form.doneDate,
        action: form.action,
        customerReply,
        photoUrl: form.photoUrl,
        remark: form.remark,
      }
      if (editId) {
        const res = await updateComplaintLog(editId, data)
        if (res.success) {
          const hint =
            isMember && String(customerReply).trim()
              ? t("complaint_saved_member_reply_hint")
              : translateApiMessage(res.message, t) || t("store_check_updated")
          await appAlert(hint)
          resetForm()
          loadList()
        } else {
          await appAlert(translateApiMessage(res.message, t) || t("msg_modify_fail"))
        }
      } else {
        const res = await saveComplaintLog(data)
        if (res.success) {
          await appAlert(translateApiMessage(res.message, t) || t("store_check_saved"))
          resetForm()
          loadList()
        } else {
          await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail"))
        }
      }
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaveLoading(false)
    }
  }

  const showPlatform = form.visitPath === "배달"

  const severityBadge = (val: string | undefined) => {
    const v = val || ""
    const variant = v === "심각" ? "destructive" : v === "보통" ? "secondary" : "outline"
    return <Badge variant={variant}>{tr(v, severityToKey)}</Badge>
  }

  const statusBadge = (val: string | undefined) => {
    const v = val || ""
    const open = v === "접수" || v === "조사중"
    return (
      <Badge variant={open ? "default" : v === "처리완료" ? "secondary" : "outline"}>
        {tr(v, statusToKey)}
      </Badge>
    )
  }

  return (
    <StorePageShell icon={MessageSquareWarning} title={t("adminComplaints")} subtitle={t("complaint_page_sub")} maxWidthClass="max-w-6xl">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "dash" | "input" | "list" | "process")}
          className={adminTabsRootCn}
        >
          <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="dash" className={adminTabsTriggerCn}>
                  {t("tab_complaint_dashboard")}
                </TabsTrigger>
                <TabsTrigger value="input" className={adminTabsTriggerCn}>
                  {t("tab_complaint_input")}
                </TabsTrigger>
                <TabsTrigger value="list" className={adminTabsTriggerCn}>
                  {t("tab_complaint_list")}
                </TabsTrigger>
                <TabsTrigger value="process" className={adminTabsTriggerCn}>
                  {t("tab_complaint_process")}
                </TabsTrigger>
              </TabsList>
          </AdminTabsBarWithHelp>

          <TabsContent value="dash" className={cn(adminTabsContentCn, "space-y-4")}>
            <div className="flex flex-wrap items-end gap-2">
              {periodPresetButtons}
              {dateRangeInputs}
              {storeFilterSelect}
              <Select value={listType || "__all__"} onValueChange={setListType}>
                <SelectTrigger className="h-9 w-[110px] text-xs">
                  <SelectValue placeholder={t("complaint_type")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("all")}</SelectItem>
                  {TYPES.map((ty) => (
                    <SelectItem key={ty} value={ty}>{t("complaint_type_" + (ty === "음식" ? "food" : ty === "서비스" ? "service" : ty === "환경/청결" ? "env" : ty === "가격/결제" ? "price" : "etc"))}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button className="h-9 font-medium" onClick={runSearch} disabled={listLoading}>
                <Search className="mr-1.5 h-3.5 w-3.5" />
                {listLoading ? t("loading") : t("search")}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t("complaint_period_range_hint")}: {listStart} ~ {listEnd}
              {listData.length > 0 ? ` · ${listData.length}${t("visit_count_suffix")}` : ""}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: t("complaint_kpi_total"), value: dashStats.total, className: "border-slate-500/40" },
                { label: t("complaint_kpi_open"), value: dashStats.open, className: "border-amber-500/40" },
                { label: t("complaint_kpi_severe"), value: dashStats.severe, className: "border-red-500/40" },
                { label: t("complaint_kpi_food"), value: dashStats.food, className: "border-blue-500/40" },
              ].map((k) => (
                <Card key={k.label} className={`border-l-4 ${k.className}`}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                    <p className="text-2xl font-bold tabular-nums">{listLoading ? "…" : k.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardContent className="pt-4">
                  <h3 className="mb-2 text-sm font-semibold">{t("complaint_chart_by_type")}</h3>
                  <ChartContainer config={typeChartConfig} className="h-[220px] w-full aspect-auto">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dashStats.typeChart}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} width={28} tick={{ fontSize: 11 }} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#2563eb" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <h3 className="mb-2 text-sm font-semibold">{t("complaint_chart_by_status")}</h3>
                  <ChartContainer config={statusChartConfig} className="h-[220px] w-full aspect-auto">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Pie data={dashStats.statusChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {dashStats.statusChart.map((_, i) => (
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

          <TabsContent value="process" className={cn(adminTabsContentCn, "space-y-3")}>
            <div className="flex flex-wrap items-end gap-2">
              {periodPresetButtons}
              {dateRangeInputs}
              {storeFilterSelect}
              {keywordInput}
              <Select value={listSeverity || "__all__"} onValueChange={setListSeverity}>
                <SelectTrigger className="h-9 w-[100px] text-xs">
                  <SelectValue placeholder={t("complaint_severity")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("all")}</SelectItem>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>{t("complaint_sev_" + (s === "경미" ? "low" : s === "보통" ? "mid" : "high"))}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button className="h-9 font-medium" onClick={runSearch} disabled={listLoading}>
                <Search className="mr-1.5 h-3.5 w-3.5" />
                {listLoading ? t("loading") : t("search")}
              </Button>
            </div>
            {processOpenOnly ? (
              <p className="text-[11px] text-muted-foreground">{t("complaint_open_skip_date_hint")}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {t("complaint_period_range_hint")}: {listStart} ~ {listEnd}
              </p>
            )}
            <ComplaintProcessTab
              items={listData}
              loading={listLoading}
              writerName={writerName}
              getTrans={getTrans}
              openOnly={processOpenOnly}
              onOpenOnlyChange={setProcessOpenOnly}
              onSaved={() => void loadList()}
            />
          </TabsContent>

          <TabsContent value="input" className={adminTabsContentCn}>
            <Card>
              <CardContent className="pt-6 space-y-4">
                {editId && (viewSourceChannel === "member_portal" || viewMemberId) ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                    {viewSourceChannel === "member_portal" ? (
                      <Badge variant="secondary">{t("complaint_source_member_portal")}</Badge>
                    ) : null}
                    {viewMemberId ? (
                      <Link href={`/admin/members?memberId=${viewMemberId}`} className="font-medium text-primary underline-offset-2 hover:underline">
                        {t("complaint_member_link")} #{viewMemberId}
                      </Link>
                    ) : null}
                  </div>
                ) : null}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("label_date")}</label>
                    <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="h-9 text-xs" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("complaint_time")}</label>
                    <Input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} className="h-9 text-xs" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("store")}</label>
                    <Select value={form.store || undefined} onValueChange={(v) => setForm((f) => ({ ...f, store: v }))}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder={t("store")} />
                      </SelectTrigger>
                      <SelectContent>
                        {stores.filter((s) => s && s !== "All").map((st) => (
                          <SelectItem key={st} value={st}>{st}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("complaint_writer")}</label>
                    <Input value={form.writer} readOnly className="h-9 text-xs bg-muted" />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("complaint_customer")}</label>
                    <Input
                      value={form.customer}
                      onChange={(e) => setForm((f) => ({ ...f, customer: e.target.value }))}
                      className="h-9 text-xs"
                      placeholder={t("complaint_ph_customer")}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("complaint_contact")}</label>
                    <Input
                      value={form.contact}
                      onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                      className="h-9 text-xs"
                      placeholder={t("complaint_ph_contact")}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("complaint_visit_path")}</label>
                    <Select value={form.visitPath} onValueChange={(v) => setForm((f) => ({ ...f, visitPath: v }))}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VISIT_PATHS.map((p) => (
                          <SelectItem key={p} value={p}>{t(p === "홀" ? "complaint_path_hall" : p === "배달" ? "complaint_path_delivery" : "complaint_path_takeout")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {showPlatform && (
                    <div>
                      <label className="text-xs font-semibold block mb-1">{t("complaint_platform")}</label>
                      <Select value={form.platform || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, platform: v }))}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PLATFORMS.map((p) => (
                            <SelectItem key={p} value={p}>{p === "__none__" ? "-" : p === "기타" ? t("complaint_platform_etc") : p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("complaint_type")}</label>
                    <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPES.map((ty) => (
                          <SelectItem key={ty} value={ty}>{t("complaint_type_" + (ty === "음식" ? "food" : ty === "서비스" ? "service" : ty === "환경/청결" ? "env" : ty === "가격/결제" ? "price" : "etc"))}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("complaint_menu")}</label>
                    <Input value={form.menu} onChange={(e) => setForm((f) => ({ ...f, menu: e.target.value }))} className="h-9 text-xs" placeholder={t("complaint_ph_menu")} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold block mb-1">{t("complaint_title")}</label>
                    <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="h-9 text-xs" placeholder={t("complaint_ph_title")} />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">{t("complaint_content")}</label>
                  <Textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} rows={3} className="text-xs" placeholder={t("complaint_ph_content")} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("complaint_severity")}</label>
                    <Select value={form.severity} onValueChange={(v) => setForm((f) => ({ ...f, severity: v }))}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SEVERITIES.map((s) => (
                          <SelectItem key={s} value={s}>{t("complaint_sev_" + (s === "경미" ? "low" : s === "보통" ? "mid" : "high"))}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("complaint_status")}</label>
                    <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{t("complaint_status_" + (s === "접수" ? "recv" : s === "조사중" ? "inv" : s === "처리완료" ? "done" : s === "보류" ? "hold" : "closed"))}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("complaint_handler")}</label>
                    <Input value={form.handler} onChange={(e) => setForm((f) => ({ ...f, handler: e.target.value }))} className="h-9 text-xs" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("complaint_done_date")}</label>
                    <Input type="date" value={form.doneDate} onChange={(e) => setForm((f) => ({ ...f, doneDate: e.target.value }))} className="h-9 text-xs" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">{t("complaint_customer_reply")}</label>
                  <p className="text-[11px] text-muted-foreground mb-1">{t("complaint_customer_reply_hint")}</p>
                  <Textarea
                    value={form.customerReply}
                    onChange={(e) => setForm((f) => ({ ...f, customerReply: e.target.value }))}
                    rows={2}
                    className={cn(
                      "text-xs",
                      isMemberPortalComplaint(viewSourceChannel, viewMemberId) &&
                        !form.customerReply.trim() &&
                        "border-amber-400/80 bg-amber-50/40 focus-visible:ring-amber-400/50"
                    )}
                    placeholder={t("complaint_ph_customer_reply")}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">{t("complaint_action")}</label>
                  <p className="text-[11px] text-muted-foreground mb-1">{t("complaint_action_hint")}</p>
                  <Textarea value={form.action} onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))} rows={2} className="text-xs" placeholder={t("complaint_ph_action")} />
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">{t("complaint_photo")}</label>
                  <p className="text-[11px] text-muted-foreground mb-2">{t("complaint_photo_hint")}</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      void handleUploadPhoto(e.target.files)
                      e.target.value = ""
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={uploadLoading} onClick={() => fileRef.current?.click()}>
                      {uploadLoading ? t("loading") : t("complaint_photo_add")}
                    </Button>
                    {form.photoUrl ? (
                      <>
                        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setPhotoPreviewUrl(form.photoUrl)}>
                          <ImageIcon className="h-3.5 w-3.5 mr-1" />
                          {t("photo")}
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setForm((f) => ({ ...f, photoUrl: "" }))}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                  <Input value={form.photoUrl} onChange={(e) => setForm((f) => ({ ...f, photoUrl: e.target.value }))} className="h-9 text-xs mt-2" placeholder={t("complaint_ph_photo")} />
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">{t("store_remark")}</label>
                  <Input value={form.remark} onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))} className="h-9 text-xs" />
                </div>

                <div className="flex gap-2">
                  <Button className="h-9" onClick={handleSave} disabled={saveLoading}>
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    {saveLoading ? t("loading") : t("btn_save")}
                  </Button>
                  <Button variant="outline" className="h-9" onClick={resetForm}>
                    {t("complaint_btn_reset")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="list" className={adminTabsContentCn}>
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-end gap-2 mb-2">
                  {periodPresetButtons}
                  {dateRangeInputs}
                  {storeFilterSelect}
                  {keywordInput}
                  <Select value={listVisitPath || "__all__"} onValueChange={setListVisitPath}>
                    <SelectTrigger className="h-9 w-[100px] text-xs">
                      <SelectValue placeholder={t("complaint_visit_path")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{t("all")}</SelectItem>
                      {VISIT_PATHS.map((p) => (
                        <SelectItem key={p} value={p}>{t(p === "홀" ? "complaint_path_hall" : p === "배달" ? "complaint_path_delivery" : "complaint_path_takeout")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={listType || "__all__"} onValueChange={setListType}>
                    <SelectTrigger className="h-9 w-[100px] text-xs">
                      <SelectValue placeholder={t("complaint_type")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{t("all")}</SelectItem>
                      {TYPES.map((ty) => (
                        <SelectItem key={ty} value={ty}>{t("complaint_type_" + (ty === "음식" ? "food" : ty === "서비스" ? "service" : ty === "환경/청결" ? "env" : ty === "가격/결제" ? "price" : "etc"))}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={listSeverity || "__all__"} onValueChange={setListSeverity}>
                    <SelectTrigger className="h-9 w-[100px] text-xs">
                      <SelectValue placeholder={t("complaint_severity")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{t("all")}</SelectItem>
                      {SEVERITIES.map((s) => (
                        <SelectItem key={s} value={s}>{t("complaint_sev_" + (s === "경미" ? "low" : s === "보통" ? "mid" : "high"))}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={listStatus || "__all__"} onValueChange={setListStatus}>
                    <SelectTrigger className="h-9 w-[100px] text-xs">
                      <SelectValue placeholder={t("complaint_status")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{t("all")}</SelectItem>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{t("complaint_status_" + (s === "접수" ? "recv" : s === "조사중" ? "inv" : s === "처리완료" ? "done" : s === "보류" ? "hold" : "closed"))}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={listSourceChannel || "__all__"} onValueChange={setListSourceChannel}>
                    <SelectTrigger className="h-9 w-[110px] text-xs">
                      <SelectValue placeholder={t("complaint_source_channel")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{t("all")}</SelectItem>
                      <SelectItem value="member_portal">{t("complaint_source_member_portal")}</SelectItem>
                      <SelectItem value="admin">{t("complaint_source_admin")}</SelectItem>
                      <SelectItem value="staff_manual">{t("complaint_source_staff")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button className="h-9 font-medium" onClick={runSearch} disabled={listLoading}>
                    <Search className="mr-1.5 h-3.5 w-3.5" />
                    {listLoading ? t("loading") : t("search")}
                  </Button>
                </div>
                <p className="mb-4 text-[11px] text-muted-foreground">
                  {t("complaint_period_range_hint")}: {listStart} ~ {listEnd}
                  {hasQueried && !listLoading ? ` · ${listData.length}${t("visit_count_suffix")}` : ""}
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-2 text-center font-medium">{t("label_date")}</th>
                        <th className="p-2 text-center font-medium">{t("store")}</th>
                        <th className="p-2 text-center font-medium">{t("complaint_col_customer")}</th>
                        <th className="p-2 text-center font-medium">{t("complaint_source_channel")}</th>
                        <th className="p-2 text-center font-medium">{t("complaint_col_visit")}</th>
                        <th className="p-2 text-center font-medium">{t("complaint_type")}</th>
                        <th className="p-2 text-center font-medium">{t("complaint_title")}</th>
                        <th className="p-2 text-center font-medium">{t("complaint_severity")}</th>
                        <th className="p-2 text-center font-medium">{t("complaint_status")}</th>
                        <th className="p-2 text-center font-medium">{t("photo")}</th>
                        <th className="p-2 text-center font-medium">{t("complaint_btn_detail")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listLoading ? (
                        <tr>
                          <td colSpan={11} className="p-6 text-center text-muted-foreground">{t("loading")}</td>
                        </tr>
                      ) : listData.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="p-6 text-center text-muted-foreground">
                            {hasQueried ? t("complaint_no_results") : t("complaint_query_please")}
                          </td>
                        </tr>
                      ) : (
                        listData.map((item, i) => (
                          <tr key={i} className="border-b border-border/60 hover:bg-muted/30">
                            <td className="p-2 text-center">{item.date}</td>
                            <td className="p-2 text-center">{item.store}</td>
                            <td className="p-2 text-center">{getTrans(item.customer || "") || "-"}</td>
                            <td className="p-2 text-center">
                              {item.sourceChannel === "member_portal" ? (
                                <Badge variant="secondary" className="text-[10px]">{t("complaint_source_member_portal")}</Badge>
                              ) : item.sourceChannel === "admin" ? (
                                <Badge variant="outline" className="text-[10px]">{t("complaint_source_admin")}</Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="p-2 text-center">{tr(item.visitPath, visitPathToKey)}</td>
                            <td className="p-2 text-center">{tr(item.type, typeToKey)}</td>
                            <td className="p-2 text-left max-w-[160px] truncate" title={getTrans(item.title || "") || item.title}>{getTrans(item.title || "") || "-"}</td>
                            <td className="p-2 text-center">{severityBadge(item.severity)}</td>
                            <td className="p-2 text-center">{statusBadge(item.status)}</td>
                            <td className="p-2 text-center">
                              {item.photoUrl ? (
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setPhotoPreviewUrl(item.photoUrl || null)} title={t("photo")}>
                                  <ImageIcon className="h-4 w-4" aria-hidden />
                                </Button>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="p-2 text-center">
                              <Button variant="ghost" size="sm" className={`${ADMIN_BTN_XS_CN} text-xs`} onClick={() => openDetail(item)}>
                                {t("complaint_btn_detail")}
                              </Button>
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
        </Tabs>

        <Dialog open={!!photoPreviewUrl} onOpenChange={(open) => !open && setPhotoPreviewUrl(null)}>
          <DialogContent className={`max-w-2xl ${ADMIN_DIALOG_SCROLL_CN}`}>
            <DialogHeader>
              <DialogTitle>{t("photo")}</DialogTitle>
            </DialogHeader>
            {photoPreviewUrl && (
              <div className="overflow-hidden rounded-md">
                <ImageViewerWithRotate
                  src={photoPreviewUrl}
                  alt={t("photo")}
                  imgClassName="w-full h-auto max-h-[70vh] object-contain"
                  rotateLeftLabel={t("imageRotateLeft") || "반시계"}
                  rotateRightLabel={t("imageRotateRight") || "시계"}
                />
              </div>
            )}
          </DialogContent>
        </Dialog>
    </StorePageShell>
  )
}
