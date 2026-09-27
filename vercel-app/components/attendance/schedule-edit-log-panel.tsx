"use client"

import * as React from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getScheduleEditLog,
  type ScheduleEditChange,
} from "@/lib/api-client"
import { normalizeEmployeeCodeForMatch, normalizeEmployeeNameForGradeMatch } from "@/lib/employee-display-name"
import { storesMatchForGradeLookup } from "@/lib/grade-store-key-variants"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ADMIN_DIALOG_SCROLL_CN } from "@/lib/admin-ui-standards"
import { cn } from "@/lib/utils"

export function formatScheduleEditStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const date = d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }).slice(5).replace("-", "/")
  const time = d.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  return `${date} ${time}`
}

export function useScheduleEditChanges(store: string, monday: string, enabled: boolean) {
  const [changes, setChanges] = React.useState<ScheduleEditChange[]>([])
  const [tick, setTick] = React.useState(0)
  const reload = React.useCallback(() => setTick((n) => n + 1), [])

  React.useEffect(() => {
    if (!enabled || !store || !monday) {
      setChanges([])
      return
    }
    let cancelled = false
    getScheduleEditLog({ store, monday })
      .then((rows) => {
        if (!cancelled) setChanges(rows)
      })
      .catch(() => {
        if (!cancelled) setChanges([])
      })
    return () => {
      cancelled = true
    }
  }, [store, monday, enabled, tick])

  return { changes, reload }
}

function normName(name: string): string {
  return normalizeEmployeeNameForGradeMatch(name).trim().toLowerCase()
}

export function changesForPerson(
  changes: ScheduleEditChange[],
  person: { employeeId?: number; employeeCode?: string; names?: string[]; store?: string }
): ScheduleEditChange[] {
  const id = person.employeeId && person.employeeId > 0 ? person.employeeId : 0
  const code = normalizeEmployeeCodeForMatch(person.employeeCode || "").toLowerCase()
  const names = (person.names || []).map(normName).filter(Boolean)
  const store = String(person.store || "").trim().toLowerCase()
  return changes.filter((c) => {
    if (store && c.storeName && !storesMatchForGradeLookup(store, c.storeName)) return false
    if (id > 0 && c.employeeId === id) return true
    if (code && normalizeEmployeeCodeForMatch(c.employeeCode).toLowerCase() === code) return true
    const cn = normName(c.employeeName)
    return !!cn && names.includes(cn)
  })
}

function latestOf(rows: ScheduleEditChange[]): ScheduleEditChange | null {
  let best: ScheduleEditChange | null = null
  for (const row of rows) {
    if (!best || row.createdAt > best.createdAt) best = row
  }
  return best
}

const FIELD_KEY: Record<string, string> = {
  plan_in: "schedule_edit_field_plan_in",
  plan_out: "schedule_edit_field_plan_out",
  break_start: "schedule_edit_field_break_start",
  break_end: "schedule_edit_field_break_end",
  area: "schedule_edit_field_area",
  plan_in_prev_day: "schedule_edit_field_prev_day",
  shift: "schedule_edit_field_shift",
}

function fieldLabel(t: (k: string) => string, field: string): string {
  const key = FIELD_KEY[field]
  return key ? t(key) : field
}

function valueLabel(t: (k: string) => string, field: string, value: string): string {
  if (field === "shift") {
    if (!value) return t("schedule_edit_change_removed")
    return value
  }
  if (field === "plan_in_prev_day") return value === "1" ? t("schedule_edit_yes") : t("schedule_edit_no")
  return value || "-"
}

export function ScheduleWeekEditLine({ changes }: { changes: ScheduleEditChange[] }) {
  const { lang } = useLang()
  const t = useT(lang)
  const latest = latestOf(changes)
  return (
    <p className="print:hidden text-[11px] text-muted-foreground">
      {latest
        ? t("schedule_edit_week_last")
            .replace("{name}", latest.actorName || "-")
            .replace("{time}", formatScheduleEditStamp(latest.createdAt))
        : t("schedule_edit_week_empty")}
    </p>
  )
}

export function SchedulePersonEditMark({
  changes,
  employeeId,
  employeeCode,
  names,
  store,
  className,
}: {
  changes: ScheduleEditChange[]
  employeeId?: number
  employeeCode?: string
  names: string[]
  store?: string
  className?: string
}) {
  const { lang } = useLang()
  const t = useT(lang)
  const [open, setOpen] = React.useState(false)
  const rows = changesForPerson(changes, { employeeId, employeeCode, names, store })
  const latest = latestOf(rows)
  if (!latest) return null
  const titleName = names[0] || latest.employeeName
  return (
    <>
      <span
        role="button"
        tabIndex={0}
        className={cn(
          "print:hidden block max-w-full truncate text-left text-[10px] leading-tight text-muted-foreground underline-offset-2 hover:underline",
          className
        )}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return
          e.stopPropagation()
          e.preventDefault()
          setOpen(true)
        }}
      >
        {t("schedule_edit_person_line")
          .replace("{name}", latest.actorName || "-")
          .replace("{time}", formatScheduleEditStamp(latest.createdAt))}
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={cn("max-w-md", ADMIN_DIALOG_SCROLL_CN)}>
          <DialogHeader>
            <DialogTitle>
              {titleName} · {t("schedule_edit_history")}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto text-sm">
            {rows
              .slice()
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
              .map((row) => (
                <div key={row.id} className="rounded border px-2 py-1.5">
                  <div className="text-[11px] text-muted-foreground">
                    {row.scheduleDate.slice(5).replace("-", "/")} · {row.actorName || "-"} ·{" "}
                    {formatScheduleEditStamp(row.createdAt)}
                  </div>
                  <div className="mt-0.5">
                    <span className="font-medium">{fieldLabel(t, row.fieldName)}</span>
                    {row.fieldName === "shift" && !row.beforeValue ? (
                      <span> {t("schedule_edit_change_added")} {row.afterValue}</span>
                    ) : row.fieldName === "shift" && !row.afterValue ? (
                      <span> {t("schedule_edit_change_removed")} {row.beforeValue}</span>
                    ) : (
                      <span>
                        {" "}
                        {valueLabel(t, row.fieldName, row.beforeValue)} → {valueLabel(t, row.fieldName, row.afterValue)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
