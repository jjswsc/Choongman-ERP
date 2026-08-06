import { cn } from "@/lib/utils"

/** Soft row tint by expense plan status (desktop table / mobile card). */
export function expensePlanRowToneClass(status: string | undefined | null): string {
  const s = String(status || "").toLowerCase()
  if (s === "paid" || s === "partial") {
    return "bg-emerald-50/80 dark:bg-emerald-950/30"
  }
  if (s === "approved") {
    return "bg-sky-50/70 dark:bg-sky-950/25"
  }
  if (s === "rejected") {
    return "bg-rose-50/60 dark:bg-rose-950/25"
  }
  if (s === "planned") {
    return "bg-amber-50/50 dark:bg-amber-950/20"
  }
  return ""
}

export function expensePlanRowAccentClass(status: string | undefined | null): string {
  const s = String(status || "").toLowerCase()
  if (s === "paid" || s === "partial") return "border-l-[3px] border-l-emerald-500"
  if (s === "approved") return "border-l-[3px] border-l-sky-500"
  if (s === "rejected") return "border-l-[3px] border-l-rose-500"
  if (s === "planned") return "border-l-[3px] border-l-amber-500"
  return "border-l-[3px] border-l-transparent"
}

export function isExpensePlanSettled(status: string | undefined | null, remainingAmount?: number): boolean {
  const s = String(status || "").toLowerCase()
  if (s === "paid") return true
  if (s === "partial" && (remainingAmount || 0) <= 0) return true
  return false
}

export function expensePlanStickyCellClass(status: string | undefined | null): string {
  return cn(
    "sticky right-0 z-[1] border-l border-border/60 px-0.5 py-2 align-middle backdrop-blur-sm",
    expensePlanRowToneClass(status) || "bg-card"
  )
}
