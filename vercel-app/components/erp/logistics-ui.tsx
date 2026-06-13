"use client"

import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

export type LogisticsEmptyStateProps = {
  icon: LucideIcon
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function LogisticsEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: LogisticsEmptyStateProps) {
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

export function LogisticsTableSkeleton({
  rows = 6,
  cols = 5,
  className,
}: {
  rows?: number
  cols?: number
  className?: string
}) {
  return (
    <div className={cn("space-y-2 px-4 py-6", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          {Array.from({ length: cols }).map((__, j) => (
            <Skeleton
              key={j}
              className={cn("h-8", j === 0 ? "w-16" : j === cols - 1 ? "ml-auto w-20" : "flex-1")}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
