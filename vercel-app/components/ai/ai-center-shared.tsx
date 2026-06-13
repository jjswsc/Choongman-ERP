"use client"

import * as React from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { AiAskPolicyMeta, AiScopeMeta } from "@/lib/ai-center-client"

const ALL_STORE = "All"

export function aiStatusBadgeClass(status: string) {
  if (status === "executed") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
  if (status === "failed") return "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
  if (status === "rejected") return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
  if (status === "pending_approval") return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
  return "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
}

export function prettyJson(v: unknown) {
  return JSON.stringify(v, null, 2)
}

function hasDatePolicyMeta(meta: AiScopeMeta | AiAskPolicyMeta): meta is AiAskPolicyMeta {
  return "isDateRangeClamped" in meta
}

export function AiPolicySummaryCard({
  t,
  meta,
  includeDatePolicy,
}: {
  t: (k: string) => string
  meta: AiScopeMeta | AiAskPolicyMeta | null
  includeDatePolicy?: boolean
}) {
  if (!meta) return null
  const showDate = Boolean(includeDatePolicy)
  const shouldShow = showDate && hasDatePolicyMeta(meta)
    ? meta.isStoreCoerced || meta.isDateRangeClamped
    : meta.isStoreCoerced
  if (!shouldShow) return null

  const hasDateMeta = showDate && hasDatePolicyMeta(meta)
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-50/60 p-3 text-xs text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
      <p className="font-medium">{t("aiCenterPolicyAppliedSummaryTitle")}</p>
      <p className="mt-1">
        {t("aiCenterPolicyAppliedStoreLine")} {meta.requestedStore || t("aiCenterPlaceholderAll")} →{" "}
        {meta.resolvedStore || t("aiCenterPlaceholderAll")}
      </p>
      {hasDateMeta && (
        <>
          <p>
            {t("aiCenterPolicyAppliedDateLine")} {(meta.requestedStart || "-")} ~ {(meta.requestedEnd || "-")} →{" "}
            {(meta.resolvedStart || "-")} ~ {(meta.resolvedEnd || "-")}
          </p>
          <p className="mt-1 text-[11px] opacity-90">
            {t("aiCenterPolicyAppliedLimitLine")} {meta.maxDateRangeDays}
            {t("aiCenterPolicyAppliedDaysSuffix")}
          </p>
        </>
      )}
    </div>
  )
}

export function AiCenterStoreSelect({
  value,
  onChange,
  stores,
  canSelectAll,
  allLabel,
  placeholder,
  className,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  stores: string[]
  canSelectAll: boolean
  allLabel: string
  placeholder?: string
  className?: string
  disabled?: boolean
}) {
  const effective = value || (canSelectAll ? ALL_STORE : stores[0] || "")
  return (
    <Select value={effective} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder || allLabel} />
      </SelectTrigger>
      <SelectContent>
        {canSelectAll ? <SelectItem value={ALL_STORE}>{allLabel}</SelectItem> : null}
        {stores.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export const AI_CENTER_ALL_STORE = ALL_STORE
