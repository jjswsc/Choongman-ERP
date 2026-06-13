"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export type MarketingPageShellProps = {
  children: React.ReactNode
  /** 기본 max-w-6xl (캘린더·통합 레이아웃과 동일) */
  maxWidthClass?: string
  className?: string
}

export function MarketingPageShell({
  children,
  maxWidthClass = "max-w-6xl",
  className,
}: MarketingPageShellProps) {
  return (
    <div className="flex-1 overflow-auto">
      <div className={cn("relative mx-auto px-4 py-6 sm:px-6 lg:px-8", maxWidthClass, className)}>
        {children}
      </div>
    </div>
  )
}
