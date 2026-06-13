"use client"

import type { LucideIcon } from "lucide-react"
import { StoreSubnav } from "@/components/erp/store-subnav"
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
      <div className={cn("mx-auto space-y-4 px-4 py-6 sm:px-6 lg:px-8", maxWidthClass)}>
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
            {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        <StoreSubnav />
        {children}
      </div>
    </div>
  )
}
