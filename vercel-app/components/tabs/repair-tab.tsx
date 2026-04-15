"use client"
import { appAlert } from "@/lib/app-message"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import {
  getStoreRepairTicketList,
  saveStoreRepairTicket,
  uploadStoreRepairPhoto,
  type StoreRepairTicketItem,
} from "@/lib/api-client"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useTranslatedTextMap } from "@/lib/use-ui-translate"
import { ImageIcon, Save, X } from "lucide-react"
import { StoreRepairMediaThumb } from "@/components/store-repair-media-thumb"

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

export function RepairTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const fileRef = useRef<HTMLInputElement>(null)

  const [listEnd] = useState(() => getBangkokTodayDateString())
  const [listStart] = useState(() => {
    const end = getBangkokTodayDateString()
    const d = new Date(`${end}T12:00:00+07:00`)
    d.setDate(d.getDate() - 60)
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
  })
  const [recent, setRecent] = useState<StoreRepairTicketItem[]>([])
  const [loading, setLoading] = useState(false)

  const [category, setCategory] = useState("시설")
  const [priority, setPriority] = useState("보통")
  const [area, setArea] = useState("")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const store = auth?.store || ""
  const reporter = auth?.user || store

  const recentTitles = useMemo(() => recent.map((r) => r.title || ""), [recent])
  const translateTitle = useTranslatedTextMap(recentTitles, lang)

  const loadRecent = useCallback(async () => {
    if (!store) return
    setLoading(true)
    try {
      const rows = await getStoreRepairTicketList({
        startStr: listStart,
        endStr: listEnd,
        store,
      })
      const open = (rows || []).filter((x) => x.status !== "완료" && x.status !== "취소")
      const done = (rows || []).filter((x) => x.status === "완료")
      setRecent([...open.slice(0, 15), ...done.slice(0, 5)])
    } catch {
      setRecent([])
    } finally {
      setLoading(false)
    }
  }, [store, listStart, listEnd])

  useEffect(() => {
    void loadRecent()
  }, [loadRecent])

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length || !store) return
    const next: string[] = []
    for (let i = 0; i < files.length; i++) {
      const res = await uploadStoreRepairPhoto(store, files[i])
      if (res.success && res.url) next.push(res.url)
      else await appAlert(translateApiMessage(res.message, t) || t("msg_upload_fail"))
    }
    if (next.length) setPhotoUrls((u) => [...u, ...next])
  }

  const onSave = async () => {
    if (!store) return
    if (!title.trim()) {
      await appAlert(t("repair_field_title"))
      return
    }
    setSaving(true)
    try {
      const res = await saveStoreRepairTicket({
        store,
        reporter,
        category,
        priority,
        area,
        title,
        description,
        photoUrls,
        status: "접수",
      })
      if (res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("store_check_saved"))
        setArea("")
        setTitle("")
        setDescription("")
        setPhotoUrls([])
        void loadRecent()
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail"))
      }
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const labelSt = (v: string) => STATUSES.find((c) => c.v === v)?.k || "repair_st_recv"
  const labelPri = (v: string) => PRIORITIES.find((c) => c.v === v)?.k || "repair_pri_normal"

  return (
    <div className="space-y-4 px-3 py-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("tabRepair")}</CardTitle>
          <p className="text-xs text-muted-foreground font-normal">{t("repair_photo_hint")}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">{t("repair_field_category")}</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 mt-0.5 text-xs">
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
              <label className="text-[11px] font-medium text-muted-foreground">{t("repair_field_priority")}</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-9 mt-0.5 text-xs">
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
            <label className="text-[11px] font-medium text-muted-foreground">{t("repair_field_area")}</label>
            <Input value={area} onChange={(e) => setArea(e.target.value)} className="h-9 mt-0.5 text-xs" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">{t("repair_field_title")}</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 mt-0.5 text-xs" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">{t("repair_field_description")}</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="text-xs mt-0.5" />
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/mp4,video/quicktime,video/webm,video/3gpp"
              multiple
              className="hidden"
              onChange={(e) => {
                void onPickFiles(e.target.files)
                e.target.value = ""
              }}
            />
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs w-full" onClick={() => fileRef.current?.click()}>
              <ImageIcon className="h-3.5 w-3.5 mr-1" />
              {t("repair_photo_add")}
            </Button>
            {photoUrls.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {photoUrls.map((url) => (
                  <div key={url} className="relative h-14 w-14 rounded border overflow-hidden">
                    <button
                      type="button"
                      className="absolute top-0 right-0 z-10 bg-background/90 p-0.5"
                      onClick={() => setPhotoUrls((u) => u.filter((x) => x !== url))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <StoreRepairMediaThumb url={url} className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>
          <Button type="button" className="w-full" onClick={() => void onSave()} disabled={saving}>
            <Save className="h-4 w-4 mr-1" />
            {t("repair_btn_save")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("tab_repair_list")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="text-xs text-muted-foreground">{t("loading")}</p>
          ) : recent.length === 0 ? (
            <p className="text-xs text-muted-foreground">—</p>
          ) : (
            recent.map((r) => (
              <div key={r.id} className="rounded-md border border-border/80 p-2 text-xs space-y-0.5">
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">{r.ticketNumber}</span>
                  <span>{t(labelPri(r.priority))}</span>
                </div>
                <p className="font-medium line-clamp-2" title={r.title || undefined}>
                  {translateTitle(r.title || "")}
                </p>
                <div className="flex justify-between text-muted-foreground">
                  <span>{t(labelSt(r.status))}</span>
                  <span>{r.reportedAt ? r.reportedAt.slice(0, 10) : ""}</span>
                </div>
              </div>
            ))
          )}
          <Button type="button" variant="ghost" size="sm" className="w-full h-8 text-xs" onClick={() => void loadRecent()}>
            {t("repair_btn_load")}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
