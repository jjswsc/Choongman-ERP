"use client"

import { useState, useEffect, useCallback } from "react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Save, Image } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import {
  getLoginData,
  getComplaintLogList,
  saveComplaintLog,
  updateComplaintLog,
  type ComplaintLogItem,
} from "@/lib/api-client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
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
  photoUrl: "",
  remark: "",
})

export function AdminComplaints() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const [tab, setTab] = useState<"input" | "list">("input")
  const [stores, setStores] = useState<string[]>([])
  const [editId, setEditId] = useState<string>("")

  const [form, setForm] = useState<Record<string, string>>(emptyForm())
  const [saveLoading, setSaveLoading] = useState(false)

  const [listStart, setListStart] = useState(todayStr())
  const [listEnd, setListEnd] = useState(todayStr())
  const [listStore, setListStore] = useState("All")
  const [listVisitPath, setListVisitPath] = useState("__all__")
  const [listType, setListType] = useState("__all__")
  const [listStatus, setListStatus] = useState("__all__")
  const [listData, setListData] = useState<ComplaintLogItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)

  const writerName = auth?.user || auth?.store || ""

  useEffect(() => {
    getLoginData().then((r) => {
      const keys = Object.keys(r.users || {}).filter(Boolean).sort()
      setStores(["All", ...keys])
      if (keys.length && !form.store) setForm((f) => ({ ...f, store: keys[0], writer: writerName }))
    })
  }, [])

  useEffect(() => {
    setForm((f) => ({ ...f, writer: writerName }))
  }, [writerName])

  const loadList = useCallback(async () => {
    setListLoading(true)
    try {
      const list = await getComplaintLogList({
        startStr: listStart || undefined,
        endStr: listEnd || undefined,
        store: listStore && listStore !== "All" ? listStore : undefined,
        visitPath: listVisitPath && listVisitPath !== "__all__" ? listVisitPath : undefined,
        typeFilter: listType && listType !== "__all__" ? listType : undefined,
        statusFilter: listStatus && listStatus !== "__all__" ? listStatus : undefined,
      })
      setListData(list || [])
    } catch {
      setListData([])
    } finally {
      setListLoading(false)
    }
  }, [listStart, listEnd, listStore, listVisitPath, listType, listStatus])

  const resetForm = useCallback(() => {
    setEditId("")
    setForm(emptyForm())
    setForm((f) => ({ ...f, writer: writerName }))
  }, [writerName])

  const openDetail = useCallback((item: ComplaintLogItem) => {
    const id = String(item.row ?? item.id ?? "")
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
      photoUrl: item.photoUrl || "",
      remark: item.remark || "",
    })
    setEditId(id)
    setTab("input")
  }, [writerName])

  const handleSave = async () => {
    if (!form.store) {
      alert(t("store_load_hint"))
      return
    }
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
        photoUrl: form.photoUrl,
        remark: form.remark,
      }
      if (editId) {
        const res = await updateComplaintLog(editId, data)
        if (res.success) {
          alert(res.message || t("store_check_updated"))
          resetForm()
          loadList()
        } else {
          alert(res.message || "수정 실패")
        }
      } else {
        const res = await saveComplaintLog(data)
        if (res.success) {
          alert(res.message || t("store_check_saved"))
          resetForm()
          loadList()
        } else {
          alert(res.message || "저장 실패")
        }
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 실패")
    } finally {
      setSaveLoading(false)
    }
  }

  const showPlatform = form.visitPath === "배달"

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-4">
          <h1 className="text-xl font-bold tracking-tight">{t("adminComplaints")}</h1>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "input" | "list")}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="input">{t("tab_complaint_input")}</TabsTrigger>
            <TabsTrigger value="list">{t("tab_complaint_list")}</TabsTrigger>
          </TabsList>

          <TabsContent value="input" className="mt-4">
            <Card>
              <CardContent className="pt-6 space-y-4">
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
                    <Select value={form.store} onValueChange={(v) => setForm((f) => ({ ...f, store: v }))}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder={t("store")} />
                      </SelectTrigger>
                      <SelectContent>
                        {stores.filter((s) => s !== "All").map((st) => (
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
                  <label className="text-xs font-semibold block mb-1">{t("complaint_action")}</label>
                  <Textarea value={form.action} onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))} rows={2} className="text-xs" placeholder={t("complaint_ph_action")} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("complaint_photo")}</label>
                    <Input value={form.photoUrl} onChange={(e) => setForm((f) => ({ ...f, photoUrl: e.target.value }))} className="h-9 text-xs" placeholder={t("complaint_ph_photo")} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("store_remark")}</label>
                    <Input value={form.remark} onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))} className="h-9 text-xs" />
                  </div>
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

          <TabsContent value="list" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-end gap-2 mb-4">
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("visit_start_date")}</label>
                    <Input type="date" value={listStart} onChange={(e) => setListStart(e.target.value)} className="h-9 w-[130px] text-xs" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("visit_end_date")}</label>
                    <Input type="date" value={listEnd} onChange={(e) => setListEnd(e.target.value)} className="h-9 w-[130px] text-xs" />
                  </div>
                  <Select value={listStore} onValueChange={setListStore}>
                    <SelectTrigger className="h-9 w-[110px] text-xs">
                      <SelectValue placeholder={t("store")} />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map((st) => (
                        <SelectItem key={st} value={st}>{st === "All" ? t("all") : st}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Button className="h-9 font-medium" onClick={loadList} disabled={listLoading}>
                    <Search className="mr-1.5 h-3.5 w-3.5" />
                    {listLoading ? t("loading") : t("search")}
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-2 text-center font-medium">{t("label_date")}</th>
                        <th className="p-2 text-center font-medium">{t("store")}</th>
                        <th className="p-2 text-center font-medium">{t("complaint_col_customer")}</th>
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
                          <td colSpan={10} className="p-6 text-center text-muted-foreground">{t("loading")}</td>
                        </tr>
                      ) : listData.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-6 text-center text-muted-foreground">{t("complaint_query_please")}</td>
                        </tr>
                      ) : (
                        listData.map((item, i) => (
                          <tr key={i} className="border-b border-border/60 hover:bg-muted/30">
                            <td className="p-2 text-center">{item.date}</td>
                            <td className="p-2 text-center">{item.store}</td>
                            <td className="p-2 text-center">{item.customer || "-"}</td>
                            <td className="p-2 text-center">{item.visitPath || "-"}</td>
                            <td className="p-2 text-center">{item.type || "-"}</td>
                            <td className="p-2 text-left max-w-[160px] truncate" title={item.title}>{item.title || "-"}</td>
                            <td className="p-2 text-center">{item.severity || "-"}</td>
                            <td className="p-2 text-center">{item.status || "-"}</td>
                            <td className="p-2 text-center">
                              {item.photoUrl ? (
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setPhotoPreviewUrl(item.photoUrl || null)} title={t("photo")}>
                                  <Image className="h-4 w-4" />
                                </Button>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="p-2 text-center">
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openDetail(item)}>
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
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("photo")}</DialogTitle>
            </DialogHeader>
            {photoPreviewUrl && (
              <div className="overflow-hidden rounded-md">
                <img src={photoPreviewUrl} alt={t("photo")} className="w-full h-auto max-h-[70vh] object-contain" />
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
