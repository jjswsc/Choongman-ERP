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

  const label =
    s === "approved"
      ? tt("att_approve", "Approve")
      : s === "rejected"
        ? tt("att_reject", "Reject")
        : s === "paid" || s === "partial"
          ? tt("expensePlanDoneShort", "Done")
          : tt("expensePlanStatusPlanned", "Planned")

  return (
    <span
      title={label}
      className={cn(
        "inline-flex h-7 w-[3.5rem] shrink-0 items-center justify-center rounded-md border text-center text-[10px] font-semibold leading-none tracking-tight shadow-xs",
        s === "approved" &&
          "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200",
        s === "rejected" &&
          "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
        (s === "paid" || s === "partial") &&
          "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
        s !== "approved" &&
          s !== "rejected" &&
          s !== "paid" &&
          s !== "partial" &&
          "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
      )}
    >
      <span className="block max-w-full truncate px-0.5">{label}</span>
    </span>
  )
}
