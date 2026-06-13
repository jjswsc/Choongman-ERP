/** SaaS 2-tier pricing — shared visual tokens (wholesale · margin · retail) */
export type SaasPricingTone = "wholesale" | "margin" | "retail"

export const SAAS_PRICING_TONE: Record<
  SaasPricingTone,
  { label: string; value: string; cell: string; pill: string; bar: string; head: string }
> = {
  wholesale: {
    label: "text-slate-600 dark:text-slate-400",
    value: "text-slate-800 dark:text-slate-100 font-semibold tabular-nums",
    cell: "text-right text-sm tabular-nums text-slate-700 dark:text-slate-300",
    pill: "border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100",
    bar: "bg-slate-400 dark:bg-slate-500",
    head: "text-slate-700 dark:text-slate-300 font-medium",
  },
  margin: {
    label: "text-emerald-700 dark:text-emerald-400",
    value: "text-emerald-700 dark:text-emerald-300 font-semibold tabular-nums",
    cell: "text-right text-sm tabular-nums text-emerald-700 dark:text-emerald-300 font-medium",
    pill: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
    bar: "bg-emerald-500 dark:bg-emerald-400",
    head: "text-emerald-700 dark:text-emerald-400 font-medium",
  },
  retail: {
    label: "text-violet-700 dark:text-violet-400",
    value: "text-violet-800 dark:text-violet-200 font-bold tabular-nums",
    cell: "text-right text-sm tabular-nums text-violet-800 dark:text-violet-200 font-semibold",
    pill: "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-100",
    bar: "bg-violet-500 dark:bg-violet-400",
    head: "text-violet-700 dark:text-violet-400 font-semibold",
  },
}

export function formatSaasAmount(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString()
}
