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
      <div className={cn("mx-auto px-4 py-6 sm:px-6 lg:px-8", maxWidthClass, className)}>
        {!hideHeader && title && Icon ? (
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
              {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
            </div>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  )
}
