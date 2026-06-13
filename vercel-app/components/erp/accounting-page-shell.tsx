"use client"

import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type AccountingPageShellProps = {
  children: React.ReactNode
  icon?: LucideIcon
  title?: string
  subtitle?: string
  maxWidthClass?: string
  className?: string
  hideHeader?: boolean
}

/** 회계 섹션 공통 페이지 레이아웃 (허브·서브내비 없음) */
export function AccountingPageShell({
  children,
  icon: Icon,
  title,
  subtitle,
  maxWidthClass = "max-w-7xl",
  className,
  hideHeader = false,
}: AccountingPageShellProps) {
  return (
    <div className="flex-1 overflow-auto">
      <div className={cn("mx-auto px-4 py-6 sm:px-6 lg:px-8", maxWidthClass, className)}>
        {!hideHeader && title && Icon ? (
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
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
