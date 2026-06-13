import type { ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type SaasStatTone =
  | "default"
  | "wholesale"
  | "margin"
  | "retail"
  | "tenants"
  | "accent"
  | "success"
  | "warning"

const TONE: Record<
  SaasStatTone,
  { card: string; value: string; label: string; sub?: string }
> = {
  default: {
    card: "",
    value: "text-2xl font-semibold tracking-tight",
    label: "text-xs font-medium text-muted-foreground",
  },
  wholesale: {
    card: "border-slate-200/80 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:border-slate-800 dark:from-slate-950/40 dark:to-slate-900/20",
    value: "text-2xl font-semibold tracking-tight text-slate-800 dark:text-slate-100",
    label: "text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400",
  },
  margin: {
    card: "border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-emerald-100/40 dark:border-emerald-900 dark:from-emerald-950/40 dark:to-emerald-900/10",
    value: "text-2xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-300",
    label: "text-xs font-semibold uppercase tracking-wide text-emerald-700/90 dark:text-emerald-400",
  },
  retail: {
    card: "border-violet-200/80 bg-gradient-to-br from-violet-50 to-violet-100/40 dark:border-violet-900 dark:from-violet-950/40 dark:to-violet-900/10",
    value: "text-2xl font-bold tracking-tight text-violet-800 dark:text-violet-200",
    label: "text-xs font-semibold uppercase tracking-wide text-violet-700/90 dark:text-violet-400",
  },
  tenants: {
    card: "border-sky-200/80 bg-gradient-to-br from-sky-50 to-sky-100/40 dark:border-sky-900 dark:from-sky-950/40 dark:to-sky-900/10",
    value: "text-2xl font-semibold tracking-tight text-sky-800 dark:text-sky-200",
    label: "text-xs font-semibold uppercase tracking-wide text-sky-700/90 dark:text-sky-400",
  },
  accent: {
    card: "border-primary/25 bg-gradient-to-br from-primary/10 to-primary/5",
    value: "text-2xl font-bold tracking-tight text-primary",
    label: "text-xs font-semibold uppercase tracking-wide text-primary/80",
  },
  success: {
    card: "border-emerald-200/60 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20",
    value: "text-2xl font-semibold text-emerald-600 dark:text-emerald-400",
    label: "text-xs font-medium text-muted-foreground",
  },
  warning: {
    card: "border-amber-200/60 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20",
    value: "text-2xl font-semibold text-amber-600 dark:text-amber-400",
    label: "text-xs font-medium text-muted-foreground",
  },
}

type Props = {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: SaasStatTone
  className?: string
  compact?: boolean
}

export function SaasStatCard({ label, value, sub, tone = "default", className, compact }: Props) {
  const t = TONE[tone]
  return (
    <Card className={cn("shadow-sm", t.card, className)}>
      <CardContent className={cn(compact ? "p-3" : "p-4")}>
        <p className={t.label}>{label}</p>
        <p className={cn(t.value, compact && "text-xl")}>{value}</p>
        {sub ? <p className={cn("mt-1 text-xs text-muted-foreground", t.sub)}>{sub}</p> : null}
      </CardContent>
    </Card>
  )
}
