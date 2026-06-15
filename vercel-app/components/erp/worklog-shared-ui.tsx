"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  WORK_LOG_PRIORITIES,
  workLogPriorityChipClass,
  workLogPriorityTone,
  workLogProgressBarClass,
} from "@/lib/work-log-shared"
import type { WorkLogItem } from "@/lib/api-client"

export function WorklogProgressBar({
  value,
  onChange,
  disabled,
  className,
}: {
  value: number
  onChange?: (v: number) => void
  disabled?: boolean
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0))
  const interactive = Boolean(onChange) && !disabled
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "relative flex-1",
          interactive ? "h-8 touch-pan-x" : "h-2"
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", workLogProgressBarClass(pct))}
            style={{ width: `${pct}%` }}
          />
        </div>
        {interactive && (
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={pct}
            disabled={disabled}
            onChange={(e) => onChange!(Number(e.target.value))}
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            aria-label="progress"
          />
        )}
      </div>
      <span className="w-9 shrink-0 text-right text-xs font-bold tabular-nums text-foreground">{pct}%</span>
    </div>
  )
}

export function WorklogPriorityChip({ priority }: { priority?: string }) {
  const { lang } = useLang()
  const t = useT(lang)
  const tone = workLogPriorityTone(priority)
  const row = WORK_LOG_PRIORITIES.find((p) => p.value === priority)
  const label = row ? t(row.key) : priority || "-"
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold",
        workLogPriorityChipClass(tone)
      )}
    >
      {label}
    </span>
  )
}

export function WorklogKpiCard({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  tone?: "default" | "success" | "warning" | "primary"
}) {
  const valueClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "primary"
          ? "text-primary"
          : "text-foreground"
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      </div>
      <p className={cn("text-2xl font-extrabold tabular-nums", valueClass)}>{value}</p>
    </div>
  )
}

export function WorklogManagerFeedback({
  item,
  getTransComment,
  t,
}: {
  item: WorkLogItem
  getTransComment: (comment: string) => string
  t: (key: string) => string
}) {
  const confirmed = item.managerCheck === "승인"
  const rawComment = item.managerComment?.trim() || ""
  const isCarryOverMsg = rawComment.startsWith("⚡")
  const hasComment = !!rawComment && !isCarryOverMsg
  if (!confirmed && !hasComment && item.managerCheck !== "보류" && item.managerCheck !== "반려") {
    return null
  }
  return (
    <div className="mt-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs">
      {item.managerCheck === "보류" && (
        <span className="font-semibold text-warning">{t("workLogStatusHold")}</span>
      )}
      {item.managerCheck === "반려" && (
        <span className="font-semibold text-destructive">{t("statusRejected")}</span>
      )}
      {confirmed && (
        <span className="inline-flex items-center gap-1 font-semibold text-primary">
          ✓ {t("workLogReviewConfirmed")}
        </span>
      )}
      {hasComment && (
        <p className="mt-1 text-foreground">
          <span className="font-semibold text-muted-foreground">{t("workLogManagerFeedback")}:</span>{" "}
          {getTransComment(rawComment)}
        </p>
      )}
    </div>
  )
}
