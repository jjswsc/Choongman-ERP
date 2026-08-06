"use client"

import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export function ExpensePlanStatusBadge({
  status,
}: {
  status: "planned" | "approved" | "partial" | "paid" | "rejected" | string
}) {
  const { lang } = useLang()
  const t = useT(lang)
  const tt = (key: string, fallback: string) => {
    const v = t(key)
    return !v || v === key ? fallback : v
  }
  const s = String(status || "").toLowerCase()

  // Short labels so ko/th badges share one fixed width in the Status column.
  const label =
    s === "approved"
      ? tt("att_approved", "Approved")
      : s === "rejected"
        ? tt("att_rejected", "Rejected")
        : s === "paid" || s === "partial"
          ? tt("expensePlanStatusPaid", "Paid")
          : tt("expensePlanStatusPlanned", "Planned")

  return (
    <span
      title={label}
      className={cn(
        "inline-flex h-6 w-[5.25rem] shrink-0 items-center justify-center rounded-md border px-1 text-center text-[10px] font-semibold leading-none tracking-tight",
        s === "approved" && "border-primary/30 bg-primary/15 text-primary",
        s === "rejected" && "border-destructive/30 bg-destructive/10 text-destructive",
        (s === "paid" || s === "partial") &&
          "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
        s !== "approved" &&
          s !== "rejected" &&
          s !== "paid" &&
          s !== "partial" &&
          "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
      )}
    >
      <span className="block max-w-full truncate">{label}</span>
    </span>
  )
}
