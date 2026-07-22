"use client"

import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type HrPageShellProps = {
  children: React.ReactNode
  icon?: LucideIcon
  title?: string
  subtitle?: string
  maxWidthClass?: string
  className?: string
  hideHeader?: boolean
}

export function HrPageShell({
  children,
  icon: Icon,
  title,
  subtitle,
  maxWidthClass = "max-w-7xl",
  className,
  hideHeader = false,
}: HrPageShellProps) {
  return (
    <div className="flex-1 overflow-auto">
      <div className={cn("mx-auto px-3 py-4 sm:px-6 sm:py-6 lg:px-8", maxWidthClass, className)}>
        {!hideHeader && title && Icon ? (
          <div className="mb-4 flex items-center gap-3 sm:mb-6">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h1>
              {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{subtitle}</p> : null}
            </div>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  )
}
