"use client"

import type { LucideIcon } from "lucide-react"
import { HelpSumHowBlocks } from "@/components/erp/help-sum-how-blocks"
import { hrefToHelpSummaryKey } from "@/lib/admin-help-registry"
import { cn } from "@/lib/utils"

type SalesPageHeaderProps = {
  href: string
  title: string
  subtitle?: string
  icon: LucideIcon
  /** primary = 기본, emerald = 실시간 매출 */
  iconTone?: "primary" | "emerald"
  actions?: React.ReactNode
  showHelp?: boolean
  className?: string
}

export function SalesPageHeader({
  href,
  title,
  subtitle,
  icon: Icon,
  iconTone = "primary",
  actions,
  showHelp = true,
  className,
}: SalesPageHeaderProps) {
  const helpKey = hrefToHelpSummaryKey(href)
  const iconWrap =
    iconTone === "emerald" ? "bg-emerald-500/10" : "bg-primary/10"
  const iconColor =
    iconTone === "emerald"
      ? "text-emerald-700 dark:text-emerald-300"
      : "text-primary"

  return (
    <div className={cn("space-y-3 border-b border-border/60 pb-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                iconWrap
              )}
            >
              <Icon className={cn("h-4 w-4", iconColor)} aria-hidden />
            </div>
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          </div>
          {subtitle ? (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
          {showHelp ? (
            <HelpSumHowBlocks helpSumKey={helpKey} className="max-w-2xl" compact />
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </div>
  )
}
