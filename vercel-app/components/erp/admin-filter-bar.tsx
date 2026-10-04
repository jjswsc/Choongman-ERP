"use client"

import { cn } from "@/lib/utils"
import { usePointerCoarse } from "@/hooks/use-pointer-coarse"

type AdminFilterBarProps = {
  children: React.ReactNode
  className?: string
}

/** 매장 관리 등 관리자 화면 공통 필터 영역 */
export function AdminFilterBar({ children, className }: AdminFilterBarProps) {
  const pointerCoarse = usePointerCoarse()
  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3 sm:gap-3 sm:p-4",
        pointerCoarse && "[&_button]:min-h-10 [&_input]:min-h-10 [&_button[role=combobox]]:min-h-10",
        className
      )}
    >
      {children}
    </div>
  )
}

type AdminFilterFieldProps = {
  label: string
  children: React.ReactNode
  className?: string
}

export function AdminFilterField({ label, children, className }: AdminFilterFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
