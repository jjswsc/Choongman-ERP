import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { formatSaasAmount, SAAS_PRICING_TONE, type SaasPricingTone } from "@/components/saas/saas-pricing-visual"

type Props = {
  wholesale: number
  margin: number
  retail: number
  currency?: string
  labels: { wholesale: string; margin: string; retail: string }
  size?: "sm" | "md"
  showBar?: boolean
  className?: string
}

function Pill({
  tone,
  label,
  amount,
  currency,
  size,
}: {
  tone: SaasPricingTone
  label: string
  amount: number
  currency: string
  size: "sm" | "md"
}) {
  const t = SAAS_PRICING_TONE[tone]
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 min-w-0 flex-1",
        t.pill,
        size === "sm" ? "px-2.5 py-1.5" : "px-3 py-2"
      )}
    >
      <p className={cn("truncate", t.label, size === "sm" ? "text-[10px] font-semibold uppercase tracking-wide" : "text-xs font-semibold uppercase tracking-wide")}>
        {label}
      </p>
      <p className={cn(t.value, size === "sm" ? "text-base" : "text-lg leading-tight mt-0.5")}>
        {formatSaasAmount(amount)}
        <span className={cn("ml-1 font-normal opacity-80", size === "sm" ? "text-[10px]" : "text-xs")}>{currency}</span>
      </p>
    </div>
  )
}

export function SaasPricingBreakdownVisual({
  wholesale,
  margin,
  retail,
  currency = "THB",
  labels,
  size = "md",
  showBar = true,
  className,
}: Props) {
  const total = Math.max(retail, wholesale + margin, 1)
  const wPct = Math.max(0, Math.min(100, (wholesale / total) * 100))
  const mPct = Math.max(0, Math.min(100 - wPct, (margin / total) * 100))
  const rPct = Math.max(0, 100 - wPct - mPct)

  return (
    <div className={cn("space-y-3", className)}>
      {showBar ? (
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/80 ring-1 ring-border/60">
          {wPct > 0 ? (
            <div
              className={cn(SAAS_PRICING_TONE.wholesale.bar, "transition-all")}
              style={{ width: `${wPct}%` }}
              title={`${labels.wholesale} ${formatSaasAmount(wholesale)}`}
            />
          ) : null}
          {mPct > 0 ? (
            <div
              className={cn(SAAS_PRICING_TONE.margin.bar, "transition-all")}
              style={{ width: `${mPct}%` }}
              title={`${labels.margin} ${formatSaasAmount(margin)}`}
            />
          ) : null}
          {rPct > 0 && retail > wholesale + margin ? (
            <div
              className={cn(SAAS_PRICING_TONE.retail.bar, "transition-all opacity-40")}
              style={{ width: `${rPct}%` }}
            />
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Pill tone="wholesale" label={labels.wholesale} amount={wholesale} currency={currency} size={size} />
        <Pill tone="margin" label={labels.margin} amount={margin} currency={currency} size={size} />
        <Pill tone="retail" label={labels.retail} amount={retail} currency={currency} size={size} />
      </div>
    </div>
  )
}

export function SaasPricingColumnHead({ tone, children, className }: { tone: SaasPricingTone; children: ReactNode; className?: string }) {
  const t = SAAS_PRICING_TONE[tone]
  return (
    <span className={cn("inline-flex items-center justify-end gap-1.5", t.head, className)}>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", t.bar)} aria-hidden />
      {children}
    </span>
  )
}
