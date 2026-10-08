"use client"

import { useRef, useState } from "react"
import { Camera, CheckCircle2, Clock, ExternalLink, MessageSquare, Play, RotateCcw, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import { appAlert, appPrompt } from "@/lib/app-message"
import { cn } from "@/lib/utils"
import {
  updateDailyPlanItem,
  uploadStoreActionPhoto,
  type DailyPlan,
  type DailyPlanItem,
  type DailyPlanItemAction,
} from "@/lib/api-client"
import { dailyPlanLabelers, minutesLabel } from "@/lib/daily-plan-i18n"

type T = (k: string) => string

const STATUS_CN: Record<string, string> = {
  todo: "border-l-slate-300",
  doing: "border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20",
  done: "border-l-emerald-500 opacity-80",
  skipped: "border-l-amber-500 opacity-80",
}

const SOURCE_CN: Record<string, string> = {
  hq_task: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-100",
  carry: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-100",
  action: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-100",
  visit: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-100",
}

function hm(iso: string | null): string {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })
  } catch {
    return ""
  }
}

export function DailyPlanItems(props: {
  plan: DailyPlan
  items: DailyPlanItem[]
  t: T
  readOnly?: boolean
  onChanged: () => void
  onLink?: (item: DailyPlanItem) => void
}) {
  const { plan, items, t, readOnly, onChanged, onLink } = props
  const label = dailyPlanLabelers(t)
  const fileRef = useRef<HTMLInputElement>(null)
  const [photoTarget, setPhotoTarget] = useState<DailyPlanItem | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const closed = plan.status === "closed"
  const editable = !readOnly && !closed

  const run = async (item: DailyPlanItem, action: DailyPlanItemAction, extra: Record<string, unknown> = {}) => {
    setBusyId(item.id)
    try {
      const res = await updateDailyPlanItem({ action, itemId: item.id, ...extra })
      if (!res.success) {
        await appAlert(res.messageKey ? t(res.messageKey) : res.message || t("dp_save_fail"))
        return
      }
      onChanged()
    } finally {
      setBusyId(null)
    }
  }

  const onSkip = async (item: DailyPlanItem) => {
    const reason = await appPrompt(t("dp_skip_prompt"))
    if (reason == null) return
    if (!reason.trim()) {
      await appAlert(t("dp_err_reason_required"))
      return
    }
    await run(item, "skip", { skipReason: reason.trim() })
  }

  const onNote = async (item: DailyPlanItem) => {
    const note = await appPrompt(t("dp_note_prompt"), item.note || "")
    if (note == null) return
    await run(item, "note", { note })
  }

  const onPickPhoto = (item: DailyPlanItem) => {
    setPhotoTarget(item)
    fileRef.current?.click()
  }

  const onPhotoFile = async (file: File | undefined) => {
    const item = photoTarget
    if (!file || !item) return
    setBusyId(item.id)
    try {
      const up = await uploadStoreActionPhoto(item.store_name || plan.store_name || plan.employee_store, file)
      if (!up.success || !up.url) {
        await appAlert(up.message || t("dp_save_fail"))
        return
      }
      await run(item, "photo", { photoUrl: up.url })
    } finally {
      setBusyId(null)
      setPhotoTarget(null)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  let lastStore = ""
  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void onPhotoFile(e.target.files?.[0])}
      />
      {items.map((it) => {
        const storeHeader =
          plan.role_scope === "supervisor" && it.store_name && it.store_name !== lastStore && it.source === "visit"
        if (it.store_name) lastStore = it.store_name
        const busy = busyId === it.id
        const photos = it.photo_urls || []
        return (
          <div key={it.id}>
            {storeHeader ? (
              <p className="mt-3 text-xs font-semibold text-muted-foreground">📍 {it.store_name}</p>
            ) : null}
            <div className={cn("rounded-md border border-l-4 p-2.5", STATUS_CN[it.status] || STATUS_CN.todo)}>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                {it.time_slot ? (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-foreground">
                    <Clock className="h-3 w-3" />
                    {it.time_slot}
                  </span>
                ) : null}
                {it.source !== "routine" ? (
                  <span className={cn("rounded px-1.5 py-0.5", SOURCE_CN[it.source] || "bg-muted")}>
                    {label.source(it.source)}
                  </span>
                ) : null}
                <span>{label.category(it.category)}</span>
                {it.store_name && plan.role_scope !== "supervisor" ? <span>· {it.store_name}</span> : null}
                {it.est_minutes > 0 ? <span>· {minutesLabel(it.est_minutes, t)}</span> : null}
                {it.photo_required ? <span className="text-rose-600">· 📷 {t("dp_photo_required")}</span> : null}
                <span className="ml-auto font-medium">{label.itemStatus(it.status)}</span>
              </div>
              <p className={cn("mt-1 text-sm font-medium", it.status === "done" && "line-through decoration-1")}>
                {it.source === "visit" ? `${t("dp_visit_title")} · ${it.title}` : it.title}
              </p>
              {it.description ? <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{it.description}</p> : null}
              {it.status === "done" && it.actual_minutes != null ? (
                <p className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                  {hm(it.started_at)}–{hm(it.finished_at)} · {t("dp_actual")} {minutesLabel(it.actual_minutes, t)}
                </p>
              ) : it.status === "doing" && it.started_at ? (
                <p className="mt-0.5 text-[11px] text-blue-700 dark:text-blue-300">
                  {t("dp_started_at")} {hm(it.started_at)}
                </p>
              ) : null}
              {it.skip_reason ? (
                <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                  {t("dp_skip_reason")}: {it.skip_reason}
                </p>
              ) : null}
              {it.note ? <p className="mt-0.5 text-[11px]">📝 {it.note}</p> : null}
              {photos.length > 0 ? (
                <div className="mt-1 flex gap-1 overflow-x-auto">
                  {photos.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer">
                      <img src={u} alt="" className="h-12 w-12 rounded object-cover" />
                    </a>
                  ))}
                </div>
              ) : null}
              {it.source === "visit" && it.status !== "done" ? (
                <p className="mt-1 text-[11px] text-muted-foreground">{t("dp_visit_auto_hint")}</p>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-1.5">
                {editable && it.status === "todo" ? (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => void run(it, "start")}>
                    <Play className="mr-1 h-3 w-3" />
                    {t("dp_btn_start")}
                  </Button>
                ) : null}
                {editable && (it.status === "todo" || it.status === "doing") ? (
                  <>
                    <Button size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={() => void run(it, "done")}>
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      {t("dp_btn_done")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => void onSkip(it)}>
                      <SkipForward className="mr-1 h-3 w-3" />
                      {t("dp_btn_skip")}
                    </Button>
                  </>
                ) : null}
                {editable && (it.status === "done" || it.status === "skipped") ? (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => void run(it, "reopen")}>
                    <RotateCcw className="mr-1 h-3 w-3" />
                    {t("dp_btn_reopen")}
                  </Button>
                ) : null}
                {editable ? (
                  <>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => onPickPhoto(it)}>
                      <Camera className="mr-1 h-3 w-3" />
                      {t("dp_btn_photo")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => void onNote(it)}>
                      <MessageSquare className="mr-1 h-3 w-3" />
                      {t("dp_btn_note")}
                    </Button>
                  </>
                ) : null}
                {onLink && it.link_type && it.link_type !== "none" ? (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onLink(it)}>
                    <ExternalLink className="mr-1 h-3 w-3" />
                    {label.link(it.link_type)}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
