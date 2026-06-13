"use client"

import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type MarketingEmptyStateProps = {
  icon: LucideIcon
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function MarketingEmptyState({ icon: Icon, title, description, action, className }: MarketingEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-muted-foreground/25 bg-muted/20 px-6 py-14 text-center",
        className
      )}
    >
      <div className="rounded-full bg-muted/80 p-3">
        <Icon className="h-6 w-6 text-muted-foreground" aria-hidden />
      </div>
      <div className="max-w-md space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description != null ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action != null ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
