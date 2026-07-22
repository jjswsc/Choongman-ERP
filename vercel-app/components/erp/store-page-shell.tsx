"use client"

import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type StorePageShellProps = {
  icon: LucideIcon
  title: string
  subtitle?: string
  maxWidthClass?: string
  children: React.ReactNode
  className?: string
}

export function StorePageShell({
  icon: Icon,
  title,
  subtitle,
  maxWidthClass = "max-w-7xl",
  children,
  className,
}: StorePageShellProps) {
  return (
    <div className={cn("flex-1 overflow-auto", className)}>
      <div className={cn("mx-auto space-y-4 px-3 py-4 sm:px-6 sm:py-6 lg:px-8", maxWidthClass)}>
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">{title}</h1>
            {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
