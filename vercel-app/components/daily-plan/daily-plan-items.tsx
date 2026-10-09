"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Camera,
  Car,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  Play,
  PlusCircle,
  RotateCcw,
  SkipForward,
  Wrench,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { appAlert, appPrompt } from "@/lib/app-message"
import { translateApiMessage } from "@/lib/translate-api-message"
import { cn } from "@/lib/utils"
import {
  updateDailyPlanItem,
  uploadStoreActionPhoto,
  type DailyPlan,
  type DailyPlanItem,
  type DailyPlanItemAction,
} from "@/lib/api-client"
import { getBangkokDateTimeString, getBangkokTodayDateString } from "@/lib/bangkok-time"
import { dailyPlanItemTitle, dailyPlanLabelers, minutesLabel } from "@/lib/daily-plan-i18n"
import {
  DAILY_PLAN_LATE_GRACE_MINUTES,
  computePlanTimeline,
  hmToMin,
  lateMinutes,
  minToHm,
} from "@/lib/daily-plan-timeline"
import { DailyPlanActionSheet } from "@/components/daily-plan/daily-plan-action-sheet"

type T = (k: string) => string

const STATUS_CN: Record<string, string> = {
  todo: "border-l-slate-300",
  doing: "border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20",
  done: "border-l-emerald-500 opacity-80",
  skipped: "border-l-amber-500 opacity-80",
}

const DOT_CN: Record<string, string> = {
  todo: "bg-background border-slate-400",
  doing: "bg-blue-500 border-blue-500",
  done: "bg-emerald-500 border-emerald-500",
  skipped: "bg-amber-500 border-amber-500",
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

/** 계획 종료가 퇴근보다 늦음 (자정 넘는 근무는 판정 안 함) */
function overShift(shiftIn: string, shiftOut: string, dayEnd: number): boolean {
  const out = hmToMin(shiftOut)
  const inn = hmToMin(shiftIn)
  if (out == null || (inn != null && out <= inn)) return false
  return dayEnd > out
}

function bangkokNowMin(): number {
  return hmToMin(getBangkokDateTimeString().slice(11, 16)) ?? 0
}

/** 일정 항목 연결 — 개선 과제 등록 화면용 분류 변환 */
export type DailyPlanLinkKind = "open" | "new_action"

export function DailyPlanItems(props: {
  plan: DailyPlan
  items: DailyPlanItem[]
  t: T
  travelMinutes?: number
  readOnly?: boolean
  onChanged: () => void
  onLink?: (item: DailyPlanItem, kind: DailyPlanLinkKind) => void
}) {
  const { plan, items, t, travelMinutes, readOnly, onChanged, onLink } = props
  const label = dailyPlanLabelers(t)
  const fileRef = useRef<HTMLInputElement>(null)
  const [photoTarget, setPhotoTarget] = useState<DailyPlanItem | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [actionId, setActionId] = useState<number | null>(null)
  const closed = plan.status === "closed"
  const editable = !readOnly && !closed
  const isToday = plan.plan_date === getBangkokTodayDateString()
  const [nowMin, setNowMin] = useState(bangkokNowMin)

  useEffect(() => {
    if (!isToday) return
    const id = window.setInterval(() => setNowMin(bangkokNowMin()), 60_000)
    return () => window.clearInterval(id)
  }, [isToday])

  const timeline = useMemo(
    () =>
      computePlanTimeline(
        items.map((i) => ({
          id: i.id,
          source: i.source,
          storeName: i.store_name,
          timeSlot: i.time_slot,
          estMinutes: i.est_minutes,
        })),
        { shiftIn: plan.shift_in, travelMinutes }
      ),
    [items, plan.shift_in, travelMinutes]
  )

  const showNow = isToday && !closed
  const nowIndex = showNow ? items.findIndex((i) => (timeline.slots.get(i.id)?.start ?? 0) > nowMin) : -1

  const run = async (item: DailyPlanItem, action: DailyPlanItemAction, extra: Record<string, unknown> = {}) => {
    setBusyId(item.id)
    try {
      const res = await updateDailyPlanItem({ action, itemId: item.id, ...extra })
      if (!res.success) {
        await appAlert(res.messageKey ? t(res.messageKey) : translateApiMessage(res.message, t) || t("dp_save_fail"))
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
        await appAlert(translateApiMessage(up.message, t) || t("dp_save_fail"))
        return
      }
      await run(item, "photo", { photoUrl: up.url })
    } finally {
      setBusyId(null)
      setPhotoTarget(null)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const nowLine = (
    <div className="flex items-center gap-2 py-0.5" aria-hidden>
      <span className="w-12 shrink-0 text-right text-[10px] font-semibold text-red-600 tabular-nums">
        {minToHm(nowMin)}
      </span>
      <div className="h-px flex-1 bg-red-500" />
      <span className="text-[10px] font-semibold text-red-600">{t("dp_now")}</span>
    </div>
  )

  return (
    <div className="space-y-1.5">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void onPhotoFile(e.target.files?.[0])}
      />
      {items.map((it, idx) => {
        const slot = timeline.slots.get(it.id)
        const late = isToday && !closed ? lateMinutes(slot, it.status, nowMin, DAILY_PLAN_LATE_GRACE_MINUTES) : 0
        const busy = busyId === it.id
        const photos = it.photo_urls || []
        const isVisit = it.source === "visit"
        const actionRef = it.source === "action" && /^\d+$/.test(it.ref_id) ? Number(it.ref_id) : null
        const canRegisterIssue =
          it.source === "routine" && it.link_type === "store_actions" && !!it.store_name && !!onLink
        return (
          <div key={it.id}>
            {idx === nowIndex ? nowLine : null}
            {isVisit && slot && slot.travel > 0 ? (
              <div className="flex items-center gap-2 py-0.5 text-[10px] text-muted-foreground">
                <span className="w-12 shrink-0" />
                <Car className="h-3 w-3" />
                <span>
                  {t("dp_travel")} {minutesLabel(slot.travel, t)}
                </span>
              </div>
            ) : null}
            <div className="flex gap-2">
              <div className="w-12 shrink-0 pt-2 text-right tabular-nums">
                {slot ? (
                  <>
                    <p
                      className={cn(
                        "text-xs font-semibold",
                        late > 0 && "text-red-600",
                        slot.pushed && late === 0 && "text-amber-600"
                      )}
                    >
                      {minToHm(slot.start)}
                    </p>
                    {slot.end > slot.start ? (
                      <p className="text-[10px] text-muted-foreground">{minToHm(slot.end)}</p>
                    ) : null}
                  </>
                ) : null}
              </div>
              <div className="relative flex flex-col items-center">
                <span className={cn("mt-2.5 h-2.5 w-2.5 rounded-full border-2", DOT_CN[it.status] || DOT_CN.todo)} />
                {idx < items.length - 1 ? <span className="w-px flex-1 bg-border" /> : null}
              </div>
              <div
                className={cn(
                  "mb-1 min-w-0 flex-1 rounded-md border border-l-4 p-2.5",
                  STATUS_CN[it.status] || STATUS_CN.todo,
                  isVisit && "bg-emerald-50/40 dark:bg-emerald-950/10",
                  late > 0 && "ring-1 ring-red-400"
                )}
              >
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  {it.source !== "routine" ? (
                    <span className={cn("rounded px-1.5 py-0.5", SOURCE_CN[it.source] || "bg-muted")}>
                      {label.source(it.source)}
                    </span>
                  ) : null}
                  {!isVisit ? <span>{label.category(it.category)}</span> : null}
                  {it.store_name && plan.role_scope !== "supervisor" ? <span>· {it.store_name}</span> : null}
                  {it.est_minutes > 0 ? <span>· {minutesLabel(it.est_minutes, t)}</span> : null}
                  {it.photo_required ? <span className="text-rose-600">· 📷 {t("dp_photo_required")}</span> : null}
                  {late > 0 ? (
                    <span className="font-semibold text-red-600">
                      · {t("dp_late_n").replace("{n}", minutesLabel(late, t))}
                    </span>
                  ) : null}
                  <span className="ml-auto font-medium">{label.itemStatus(it.status)}</span>
                </div>
                <p className={cn("mt-1 text-sm font-medium", it.status === "done" && "line-through decoration-1")}>
                  {isVisit ? `📍 ${t("dp_visit_title")} · ${it.title}` : dailyPlanItemTitle(it.title, t)}
                </p>
                {it.description ? (
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{it.description}</p>
                ) : null}
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
                {isVisit && it.status !== "done" ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">{t("dp_visit_auto_hint")}</p>
                ) : null}
                {actionRef && it.status !== "done" ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">{t("dp_action_auto_hint")}</p>
                ) : null}

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {editable && it.status === "todo" && !isVisit ? (
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => void run(it, "start")}>
                      <Play className="mr-1 h-3 w-3" />
                      {t("dp_btn_start")}
                    </Button>
                  ) : null}
                  {actionRef ? (
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setActionId(actionRef)}>
                      <Wrench className="mr-1 h-3 w-3" />
                      {t("dp_btn_handle_action")}
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
                  {canRegisterIssue && editable ? (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onLink?.(it, "new_action")}>
                      <PlusCircle className="mr-1 h-3 w-3" />
                      {t("dp_btn_new_action")}
                    </Button>
                  ) : null}
                  {onLink && !actionRef && it.link_type && it.link_type !== "none" ? (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onLink(it, "open")}>
                      <ExternalLink className="mr-1 h-3 w-3" />
                      {label.link(it.link_type)}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )
      })}
      {showNow && nowIndex === -1 && items.length > 0 ? nowLine : null}
      {items.length > 0 && timeline.dayEnd > timeline.dayStart ? (
        <p className="pl-14 text-[11px] text-muted-foreground">
          {t("dp_planned_end")} {minToHm(timeline.dayEnd)}
          {overShift(plan.shift_in, plan.shift_out, timeline.dayEnd) ? (
            <span className="ml-1 font-semibold text-red-600">· {t("dp_over_shift")}</span>
          ) : null}
        </p>
      ) : null}
      <DailyPlanActionSheet
        actionId={actionId}
        t={t}
        onClose={() => setActionId(null)}
        onChanged={() => {
          setActionId(null)
          onChanged()
        }}
      />
    </div>
  )
}
